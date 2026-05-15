# 09 — CONTRATOS DETERMINÍSTICOS DE ENGENHARIA — GreenForge NEXUS v2.3

> **Status:** ✅ | **Versão:** 2.3 | **Data:** 2026-05-15
> **Propósito:** Eliminar toda ambiguidade de implementação remanescente.
> Cada seção responde à pergunta: **"O que acontece exatamente se X falhar neste ponto?"**
> Um engenheiro deve conseguir implementar qualquer componente abaixo sem fazer perguntas.
> **v2.3 adiciona:** §6 CPGLoopDetector (imunidade semântica) + §7 PreExecutionGuard (OCC + Epoch Fence)

---

## 1. LOOPDECTOR v2.2 — CONTRATO DE AST FINGERPRINTING

### 1.1 Taxonomia de Nós AST

O fingerprint AST é construído pela travessia da árvore sintática e **inclusão seletiva** de nós.
A regra é: incluímos **estrutura**, ignoramos **identidade**.

#### Nós INCLUÍDOS no Hash (estrutura semântica)
| Tipo de Nó AST | Motivo |
|---|---|
| `IfStatement` | Estrutura de controle — mudança aqui é mudança real |
| `ForStatement`, `WhileStatement`, `DoWhileStatement` | Loops — detecta loops de agente que adicionam loops de código |
| `TryStatement`, `CatchClause` | Tratamento de erro — estrutura crítica |
| `ReturnStatement` | Ponto de saída da função |
| `ThrowStatement` | Ponto de falha explícita |
| `BinaryExpression` (operador apenas, não operandos) | Ex: `+`, `===`, `&&` — preserva lógica, ignora valores |
| `CallExpression` (callee como string normalizada) | `foo()` → `CALL()` — detecta padrão de chamada, não nome |
| `AssignmentExpression` (operador apenas) | `=`, `+=`, `??=` — preserva estrutura de atribuição |
| `ClassDeclaration` (presença, não nome) | Detecta adição/remoção de classes |
| `FunctionDeclaration` / `ArrowFunctionExpression` (presença, não nome) | Detecta adição/remoção de funções |

#### Nós IGNORADOS no Hash (identidade variável)
| Tipo de Nó AST | Motivo do Ignore |
|---|---|
| `Identifier` | Nome de variável — bypass trivial via renomeação |
| `StringLiteral` | Conteúdo de string — bypass trivial |
| `NumericLiteral` | Valor numérico — bypass trivial |
| `Comment` (qualquer tipo) | Jamais afeta semântica |
| `TemplateLiteral` (conteúdo) | Bypass via interpolação |
| `ImportDeclaration` (specifier) | Nome do import pode mudar sem mudança de lógica |

#### Algoritmo de Normalização
```typescript
function normalizeASTNode(node: ASTNode): string {
  switch (node.type) {
    case 'BinaryExpression':
      return `BIN(${node.operator},${normalize(node.left)},${normalize(node.right)})`;
    case 'CallExpression':
      return `CALL(${node.arguments.length})`;  // preserva aridade, ignora nome
    case 'IfStatement':
      return `IF(${normalize(node.test)},${normalize(node.consequent)},${node.alternate ? normalize(node.alternate) : 'NULL'})`;
    case 'ReturnStatement':
      return `RET(${node.argument ? normalize(node.argument) : 'VOID'})`;
    case 'Identifier':
      return 'ID';  // qualquer identificador → mesmo token
    case 'StringLiteral':
    case 'NumericLiteral':
      return 'LIT';
    default:
      return node.type; // preserva o tipo, ignora conteúdo
  }
}
// O hash final é SHA-256 do resultado da normalização recursiva da raiz.
```

### 1.2 Regra de Transição: de LoopSignal para Escalada ao Árbitro

```
Janela de histórico: últimas 10 saídas do agente (por agentId).

Tier 1 (AST):
  - 2 hashes AST idênticos consecutivos → LoopSignal { isLoop: true, tier: 'AST' }
  - Ação imediata: pausa o agente, notifica o Árbitro com LoopSignal

Tier 2 (SimHash):
  - 3 hashes SimHash com similarity >= LOOP_DETECTOR_THRESHOLD consecutivos → LoopSignal
  - (threshold mais alto porque SimHash tem falsos positivos)
  - Ação imediata: igual ao Tier 1

Tier 3 (SHA-256 fallback):
  - 2 hashes SHA-256 idênticos consecutivos → LoopSignal
  - Nota: Tier 3 só detecta repetição exata; alertar o usuário que loops sutis
    podem não ser detectados (via badge "LoopDetector: Fallback Mode")

Protocolo de escalada:
  1. LoopDetector.detect() retorna LoopSignal { isLoop: true }
  2. DebateOrchestrator recebe o sinal e PAUSA o agente imediatamente
  3. Se round atual < maxRounds:
     → Árbitro recebe contexto + LoopSignal e pode forçar nova instrução (STEER)
  4. Se round == maxRounds:
     → Emite HITL_GATE { gateType: 'LOOP_DEADLOCK' }
     → Usuário decide: reiniciar com nova instrução ou encerrar sessão
  5. O LoopSignal é persistido no DebateRound.loopDetected (boolean + tier + similarity)
```

---

## 2. GATE HYDRATION — PROTOCOLO DE RECUPERAÇÃO OUTBOX

### 2.1 Schema Formal do OutboxEvent

```prisma
model OutboxEvent {
  id          String   @id @default(cuid())
  seq_id      Int      @default(autoincrement()) // Global, monotônico, único por DB
  epoch_id    BigInt   // Timestamp de boot do servidor em ms (Fencing Token)
  sessionId   String
  type        String   // Ex: 'HITL_GATE', 'AGENT_TOKEN', 'CONVERGENCE'
  payload     String   // JSON completo — incluindo ApprovalCardPayload inteiro
  emittedAt   DateTime @default(now())
  // NUNCA deletar OutboxEvent com HITL_GATE enquanto sessão estiver PENDING/IN_PROGRESS
  // GC só remove eventos com emittedAt < (now - SSE_EVENT_MAX_AGE_MS) E sessão COMPLETED/ABORTED
}
```

**Regra de serialização do `HITL_GATE`:**
O `payload` do `OutboxEvent` para eventos `HITL_GATE` DEVE conter o `ApprovalCardPayload` **completo e autossuficiente** — incluindo todos os `phases`, `redFlags`, `rationale` e `estimatedCost`. Nenhum campo pode ser uma referência a outro registro do banco. Razão: o cliente que reconecta deve conseguir renderizar o card apenas com o payload do Outbox, sem queries adicionais.

### 2.2 Protocolo de Reconexão com Idempotência

```
Cliente SSE desconecta no seq_id=42 (HITL_GATE emitido, usuário não viu).

Ao reconectar:
  1. Browser envia header: Last-Event-ID: 42

  2. Servidor executa:
     SELECT * FROM OutboxEvent
     WHERE sessionId = :sid
       AND seq_id > 42
       AND epoch_id = :CURRENT_EPOCH  ← ignora eventos de época anterior (pós-reboot)
     ORDER BY seq_id ASC

  3. Re-emite eventos missed em ordem. O HITL_GATE é re-emitido com o payload completo.

  4. Cliente recebe HITL_GATE novamente.
     → Frontend verifica: já existe card com este gateId na store? (Zustand/Redux)
     → Se SIM: ignora o re-emit (idempotência de renderização)
     → Se NÃO: renderiza normalmente

  5. Usuário aprova/rejeita. HITL_DECISION enviado via WebSocket.
     → Servidor verifica: gateId já está em resolvedGates?
     → Se SIM: responde 200 OK sem executar (idempotência de execução)
     → Se NÃO: processa e adiciona ao Set

Garantia: Um gate nunca é executado duas vezes.
Garantia: Um gate nunca é perdido mesmo após múltiplas reconexões.
```

### 2.3 Cenário de "Sincronização Zumbi" — Epoch Mismatch

```
Situação: Servidor reinicia. Novo epoch_id gerado. Cliente ainda tem epoch_id antigo.

1. Cliente tenta reconectar SSE → sucede (SSE é HTTP puro)
2. Cliente envia Last-Event-ID: 99 (da época anterior)
3. Servidor executa query com epoch_id = CURRENT_EPOCH (novo)
   → Nenhum evento encontrado com epoch_id antigo e seq_id > 99
   → Retorna array vazio

4. Servidor emite evento especial imediatamente após conexão:
   { type: 'EPOCH_CHANGE', payload: { newEpoch: CURRENT_EPOCH, previousEpoch: OLD_EPOCH } }

5. Cliente recebe EPOCH_CHANGE:
   → Exibe: "Servidor reiniciado. Recarregando estado..."
   → Executa GET /api/debate/:sessionId para rehidratar estado completo
   → Atualiza epoch_id local

6. Se sessão ainda está IN_PROGRESS no DB:
   → Cliente rehidrata timeline, gates pendentes, rounds
   → Se há HITL_GATE pendente no DB (status PENDING):
      → Servidor re-emite via SSE após reconexão

7. Se sessão foi ABORTED durante o reboot:
   → Cliente exibe: "Sessão encerrada durante reinicialização. Iniciar nova?"
```

---

## 3. MÁQUINA DE ESTADOS SAGA — ROLLBACK INVERSO

### 3.1 Estados Atômicos do Checkpoint

```
Estado da transação (persistido em prisma.Checkpoint.status):

PENDING_COMMIT
  → Criado antes de qualquer operação de filesystem ou DB
  → Contém: sessionId, files[], expectedHash (hash do worktree antes da mudança)
  → Se servidor reinicia aqui: boot reconcilia, descarta o checkpoint (nada foi alterado)

VFS_STASH_APPLIED
  → git stash push executado com sucesso no worktree
  → Stash ref salvo no Checkpoint.gitStashRef
  → Se servidor reinicia aqui: boot reconcilia via ROLLBACK_INVERSE (ver 3.2)

CODE_APPLIED
  → Mudanças de código aplicadas no worktree (sem merge no main ainda)
  → Se servidor reinicia aqui: boot reconcilia via ROLLBACK_INVERSE

DB_SUCCESS
  → Registro de MergeEvent criado no SQLite com sucesso
  → Se servidor reinicia aqui: merge foi registrado mas git merge pode não ter rodado
  → Boot reconcilia verificando se o commit existe no git log

FINALIZED
  → git merge --squash executado + commit criado no main
  → ResourceLease estendido por ROLLBACK_WINDOW_MIN
  → Estado terminal feliz — nenhuma reconciliação necessária
```

### 3.2 Protocolo de Rollback Inverso (por estado)

```typescript
// src/core/BootReconciler.ts
// Executado UMA VEZ no boot, antes de aceitar qualquer conexão.

async function reconcileOrphanedCheckpoints(): Promise<void> {
  const orphans = await prisma.checkpoint.findMany({
    where: { status: { notIn: ['FINALIZED', 'ROLLED_BACK'] } }
  });

  for (const checkpoint of orphans) {
    switch (checkpoint.status) {
      case 'PENDING_COMMIT':
        // Nada foi alterado. Apenas marcar como abandonado.
        await prisma.checkpoint.update({
          where: { id: checkpoint.id },
          data: { status: 'ROLLED_BACK', rollbackReason: 'CRASH_BEFORE_VFS' }
        });
        break;

      case 'VFS_STASH_APPLIED':
      case 'CODE_APPLIED':
        // git stash foi aplicado mas merge NÃO aconteceu.
        // Rollback: restaurar o stash (desfazer as mudanças no worktree).
        await git(checkpoint.worktreePath).stash(['pop', checkpoint.gitStashRef]);
        await prisma.checkpoint.update({
          where: { id: checkpoint.id },
          data: { status: 'ROLLED_BACK', rollbackReason: 'CRASH_DURING_APPLY' }
        });
        // Notificar via SSE quando cliente reconectar
        await prisma.outboxEvent.create({
          data: {
            sessionId: checkpoint.sessionId,
            type: 'ROLLBACK_EVENT',
            payload: JSON.stringify({
              checkpointId: checkpoint.id,
              failureType: 'SERVER_CRASH',
              diagnosis: { rollbackReason: 'Servidor reiniciou durante aplicação de código.' }
            }),
            epoch_id: CURRENT_EPOCH
          }
        });
        break;

      case 'DB_SUCCESS':
        // MergeEvent existe no DB mas git merge pode não ter executado.
        // Verificar: o commit existe no git log?
        const commitExists = await gitCommitExists(checkpoint.expectedCommitHash);
        if (!commitExists) {
          // git merge não rodou — reverter o MergeEvent do DB
          await prisma.mergeEvent.delete({ where: { checkpointId: checkpoint.id } });
          await prisma.checkpoint.update({
            where: { id: checkpoint.id },
            data: { status: 'ROLLED_BACK', rollbackReason: 'CRASH_BEFORE_GIT_MERGE' }
          });
        } else {
          // git merge rodou — estado é FINALIZED, apenas não foi marcado
          await prisma.checkpoint.update({
            where: { id: checkpoint.id },
            data: { status: 'FINALIZED', rollbackReason: null }
          });
        }
        break;
    }
  }
}
```

**Invariante garantida:** Após `reconcileOrphanedCheckpoints()` completar, o estado do filesystem e do DB são sempre consistentes. O servidor só aceita conexões após esta função completar sem erro.

---

## 4. GRAMÁTICA DE VALIDAÇÃO DA SHELL ALLOWLIST

### 4.1 Gramática Formal (BNF simplificado)

```
command       ::= simple_command | REJECTED
simple_command ::= binary subcommand? safe_args*

binary        ::= "git" | "npm" | "node" | "npx"
                  // Qualquer outro binário → REJECT imediato

subcommand    ::= git_sub | npm_sub
git_sub       ::= "status" | "diff" | "add" | "commit" | "checkout" | "branch"
                | "merge" | "rebase" | "stash" | "revert" | "log" | "show"
                  // "clone" | "config" | "push" | "fetch" | "remote" → REJECT
npm_sub       ::= "install" | "test" | "run" | "build" | "ci"
                  // "publish" | "pack" | "deprecate" → REJECT

safe_args     ::= safe_flag | safe_value
safe_flag     ::= // Flags que NÃO estão na blocklist abaixo
blocklist     ::= "--global" | "--prefix" | "--workspaces" | "--upload-pack"
               | "--receive-pack" | "--force" (apenas git push) | "--exec"
               | "--config" | "-c" | "--no-verify"

// PROIBIDO em qualquer posição:
pipe          ::= "|" | "||"   → REJECT
redirect      ::= ">" | ">>" | "<" → REJECT
chain         ::= ";" | "&&"   → REJECT
substitution  ::= "$(...)" | "`...`" → REJECT
env_inject    ::= /^[A-Z_]+=/ antes do binário → REJECT
               // Ex: "BASH_ENV=evil git status" → REJECT
```

### 4.2 Contratos por Binário

```typescript
// Contrato completo — cada entrada é auditável
const SHELL_CONTRACTS: Record<string, ShellContract> = {
  git: {
    allowedSubcommands: ['status','diff','add','commit','checkout','branch',
                         'merge','rebase','stash','revert','log','show'],
    blockedSubcommands: ['clone','config','push','fetch','remote','worktree',
                         'bisect','gc','fsck','filter-branch'],
    blockedFlags: ['--upload-pack','--receive-pack','--global','--exec','-c',
                   '--config','--no-verify'],
    // Regra especial: git push é bloqueado SEMPRE (nunca deve ser executado por agente)
    specialRules: [
      { subcommand: 'push', action: 'REJECT', reason: 'Agentes não podem fazer push remoto' },
      { subcommand: 'merge', blockedFlags: ['--strategy-option'], reason: 'Estratégias customizadas podem causar comportamento imprevisível' },
      { subcommand: 'rebase', blockedFlags: ['--exec'], reason: 'Execução de comandos durante rebase é proibida' },
    ]
  },
  npm: {
    allowedSubcommands: ['install','test','run','build','ci'],
    blockedSubcommands: ['publish','pack','deprecate','audit fix','link','unlink'],
    blockedFlags: ['--global','--prefix','--workspaces','--ignore-scripts=false'],
    // --ignore-scripts=false permitiria execução de lifecycle scripts arbitrários
    specialRules: [
      { subcommand: 'install', note: 'Sempre executa com --ignore-scripts por padrão interno' },
      { subcommand: 'run', allowedScripts: ['dev','build','test','lint','typecheck'],
        reason: 'Scripts não listados requerem HITL Gate de aprovação' }
    ]
  }
};
```

### 4.3 Tratamento de Variáveis de Ambiente Injetadas

```typescript
// Vetores de injeção via env vars — todos bloqueados no nível de spawn
const ENV_INJECTION_BLOCKLIST = [
  'BASH_ENV',    // Executado por bash ao iniciar
  'ENV',         // Equivalente em sh
  'PROMPT_COMMAND', // Executado antes de cada prompt
  'LD_PRELOAD',  // Injeta biblioteca compartilhada
  'LD_LIBRARY_PATH', // Modifica resolução de bibliotecas
  'IFS',         // Modifica separador de campos (bypass de parsing)
  'CDPATH',      // Modifica comportamento de cd
  'NODE_OPTIONS', // Pode injetar flags no runtime Node.js
  'NODE_PATH',   // Pode carregar módulos arbitrários
];

// O spawn do PTY NUNCA herda process.env diretamente.
// Apenas as variáveis da ENV_ALLOWLIST são repassadas:
const ENV_ALLOWLIST = ['PATH', 'HOME', 'USER', 'NODE_ENV', 'TERM', 'LANG', 'LC_ALL'];

function spawnSafePTY(command: string, cwd: string): pty.IPty {
  const safeEnv = Object.fromEntries(
    ENV_ALLOWLIST
      .filter(k => process.env[k] !== undefined)
      .map(k => [k, process.env[k]!])
  );
  // Valida o comando ANTES do spawn
  assertCommandAllowed(command); // lança SecurityError se inválido
  return pty.spawn('bash', ['-c', command], { cwd, env: safeEnv });
}
```

---

## 5. SSE RAF BUFFERING — REQUISITO ARQUITETURAL DE PERFORMANCE

### 5.1 O Problema

Durante debates de alta densidade (Propositor gerando 500+ tokens/s), o handler de eventos SSE no browser pode chamar `setState` do React centenas de vezes por segundo. Cada `setState` dispara um re-render. Resultado: **UI freeze** por 2-5s enquanto o debate está no pico.

### 5.2 Solução: RAF Batching como Requisito Arquitetural

```typescript
// Frontend: src/lib/SSEConsumer.ts
// O RAF Buffer é OBRIGATÓRIO — não é uma otimização opcional.

class RAFBufferedSSEConsumer {
  private pendingEvents: DebateEvent[] = [];
  private rafHandle: number | null = null;
  private readonly reorderBuffer: ClientReorderBuffer;

  constructor(private store: DebateStore) {
    this.reorderBuffer = new ClientReorderBuffer();
  }

  // Chamado diretamente pelo EventSource.onmessage — SEM setState aqui
  onRawEvent(rawData: string): void {
    const event = JSON.parse(rawData) as DebateEvent;
    // Passa pelo Reorder Buffer primeiro (ver seção de Gate Hydration)
    this.reorderBuffer.push(event, (orderedEvent) => {
      this.pendingEvents.push(orderedEvent);
      this.scheduleFlush();
    });
  }

  private scheduleFlush(): void {
    if (this.rafHandle !== null) return; // já agendado
    this.rafHandle = requestAnimationFrame(() => {
      this.flush();
      this.rafHandle = null;
    });
  }

  private flush(): void {
    if (this.pendingEvents.length === 0) return;

    const batch = [...this.pendingEvents];
    this.pendingEvents = [];

    // UM único setState com todos os eventos do frame
    // React 18 batching garante um único re-render
    this.store.applyEventBatch(batch);
  }
}
```

### 5.3 Contrato de Performance

| Métrica | Requisito | Como Medir |
|---|---|---|
| Frame rate durante streaming | ≥ 30 FPS | Chrome DevTools → Performance tab |
| setState calls/s (máximo) | ≤ 60/s (1 por frame) | React DevTools Profiler |
| Latência perceptível de token na UI | ≤ 33ms (1 frame a 30FPS) | `performance.now()` no handler vs. render |
| Tamanho máximo de batch por frame | ≤ 200 eventos | Se > 200: dividir em 2 frames |

### 5.4 Casos Especiais

```
Evento HITL_GATE no buffer:
  → NÃO pode ser atrasado pelo RAF. É L2 — precisa de atenção imediata.
  → Regra: eventos com type === 'HITL_GATE' ou type === 'SECURITY_VIOLATION'
    são REMOVIDOS do buffer e processados SINCRONICAMENTE (fora do RAF).
  → Implementação: no onRawEvent(), checar o tipo ANTES de enfileirar.

if (['HITL_GATE', 'SECURITY_VIOLATION', 'EPOCH_CHANGE'].includes(event.type)) {
  this.store.applyEventBatch([event]); // síncrono — não passa pelo RAF
  return;
}

Evento AGENT_TOKEN durante Gate aberto:
  → Token ainda é enfileirado normalmente (o editor está em readOnly mas o
    histórico de tokens pode ser visualizado na Timeline).
  → O RAF buffer continua funcionando normalmente durante gates.

SSE_EVENT_BUFFER_OVERFLOW (> 200 eventos em 1 frame):
  → Dividir em chunks de 100 e agendar frames adicionais:
  while (batch.length > 0) {
    const chunk = batch.splice(0, 100);
    this.store.applyEventBatch(chunk);
    if (batch.length > 0) await new Promise(r => requestAnimationFrame(r));
  }
```

---

## 6. CPGLoopDetector v2.3 — CONTRATO DE IMUNIDADE SEMÂNTICA

> **Problema que resolve:** O LoopDetector v2.2 (§1) usa AST fingerprinting + SimHash. Falha quando o agente muda paradigma mas mantém semântica (recursão→for→while→reduce). A v2.3 adiciona o **Execution Oracle** como camada primária.

### 6.1 Diagrama de Decisão — O Que Exatamente É um Loop?

```
Round N começa:
  1. git diff --name-only HEAD → lista de arquivos modificados
  2. Concatena conteúdo de todos os arquivos modificados → combinedSource
  3. Extrai CPGVector(combinedSource, testOutput):
     a. nodeTypeFreq: frequência de 13 tipos de nó AST (if, for, while, async, etc.)
     b. controlDepth: profundidade máxima de aninhamento de controle
     c. dataFlowEdges: (total de identificadores) - (total de declarações)
     d. sideEffectHash: SHA256(normalizeTestOutput(testOutput)).slice(0,20)
        onde normalizeTestOutput remove: timings (Xms), UUIDs, timestamps ISO
  4. Calcula worktreeHash = SHA256(combinedSource).slice(0,16)
  5. Appenda AgentSnapshot à history (máx. 12 = 2 × WINDOW_SIZE)

Se history.length < MIN_ROUNDS=3: return { isLoop: false }  // janela insuficiente

Pega recent = history.slice(-WINDOW_SIZE=6)

Critério 1 — INVARIANT_SIDE_EFFECTS (prioridade alta):
  Se todos os sideEffectHash em recent são iguais:
    → isLoop: true, type: 'INVARIANT_SIDE_EFFECTS'
    → O agente mudou código por N rounds mas testes passam/falham igual
    → Recomendação: injetar nova constraint ou mudar objetivo

Critério 2 — CPG_CYCLE (prioridade menor):
  Para len em [2, 3] (floor(6/2)=3):
    Para cada par (recent[i], recent[i+len]):
      similarity = computeCPGSimilarity(a, b)
                 = (oracle_score * 0.6) + (type_score * 0.3) + (depth_score * 0.1)
    Se todos os pares têm similarity >= SIMILARITY_THR=0.85:
      → isLoop: true, type: 'CPG_CYCLE', cycleLength: len
      → Ciclo de período len detectado — paradigm shift equivalente

Retorno: { isLoop: false } se nenhum critério ativo
```

### 6.2 Contratos por Cenário de Falha

| Cenário | Estado Detectado | Ação Obrigatória |
|---|---|---|
| Agente alterna recursão↔for por 6 rounds | `CPG_CYCLE { cycleLength: 2 }` | Parar agente, emitir `HITL_GATE { gateType: 'LOOP_DEADLOCK' }` |
| Agente muda nomes de vars + refatora mas testes não mudam | `INVARIANT_SIDE_EFFECTS { invariantHash: 'abc...' }` | Injetar nova constraint, resetar histórico do detector |
| Agente cria classe nova + muda paradigma completamente | `{ isLoop: false }` (sideEffectHash mudou) | Loop legítimo de progresso — continuar |
| Menos de 3 rounds executados | `{ isLoop: false }` (janela insuficiente) | Nunca detectar em janela insuficiente — evitar falso positivo |
| `git diff` vazio (agente não mudou nada) | `combinedSource = ''` → `sideEffectHash` é invariante | Detectado como `INVARIANT_SIDE_EFFECTS` na 4ª rodada |

### 6.3 Contrato de Instanciação

```typescript
// UMA instância por agentId — NUNCA compartilhar entre agentes
const detectors = new Map<string, CPGLoopDetector>();

function getOrCreateDetector(agentId: string): CPGLoopDetector {
  if (!detectors.has(agentId)) detectors.set(agentId, new CPGLoopDetector());
  return detectors.get(agentId)!;
}

// Ciclo de vida obrigatório:
// - Criar no início da sessão de debate
// - detector.reset() quando árbitro injeta nova instrução (STEER)
// - Destruir (deletar do Map) quando sessão FINALIZADA ou ABORTADA
```

### 6.4 Escalonamento — O Que Fazer com um LoopDiagnosis Positivo

```
1. CPGLoopDetector.detectLoop() → { isLoop: true, type, recommendation }
2. DebateOrchestrator.pauseAgent(agentId)
3. Se roundIndex < maxRounds:
   → Árbitro recebe: { round, loopDiagnosis, affectedFiles }
   → Árbitro pode emitir STEER com nova instrução
   → Se STEER: detector.reset() e continuar
4. Se roundIndex === maxRounds OU árbitro não consegue STEER:
   → Emitir HITL_GATE { gateType: 'LOOP_DEADLOCK', loopDiagnosis }
   → Persistir no DebateRound.loopDetected = true, .loopType, .loopCycleLength
   → Aguardar decisão humana
```

---

## 7. PreExecutionGuard v2.3 — CONTRATO DE EPOCH FENCE

> **Problema que resolve:** Na v2.2.1, a aprovação HITL usava apenas `resourceVersion` (OCC). Se o servidor reiniciava entre `issueCard()` e `submitApproval()`, o `resourceVersion` era resetado para 0 — o gate aprovava uma versão diferente do worktree que o usuário viu.
> **v2.3 adiciona:** `worktreeHash` via `git write-tree`, capturando o estado do filesystem. Qualquer mudança de 1 byte → `WORKTREE_DIVERGED`.

### 7.1 Diagrama de Sequência — Fluxo Completo de Aprovação

```
[Agente]         [PreExecutionGuard]    [SQLite]         [Git Worktree]
   |                    |                  |                    |
   |-- issueCard() ---->|                  |                    |
   |                    |-- SELECT WHERE id=agentId -->|        |
   |                    |<-- { currentVersion: 5 } ----|        |
   |                    |-- git write-tree ------------>|--------|
   |                    |<-- treeHash ------------------|        |
   |                    | (worktreeHash = SHA256(treeHash))      |
   |                    | (hmac = HMAC(secret, payload))         |
   |<-- ApprovalCard ---|                  |                    |
   |
   | [Card enviado ao usuário via SSE — usuário revisa]
   |
[Usuário]       [PreExecutionGuard]    [SQLite]         [Git Worktree]
   |                    |                  |                    |
   |-- submitApproval(card) -->|           |                    |
   |                    | Zod schema ✓     |                    |
   |                    | TTL check ✓      |                    |
   |                    | HMAC verify ✓    |                    |
   |                    |-- git write-tree ------------>|--------|
   |                    |<-- currentHash ---|            |       |
   |                    | currentHash === card.worktreeHash?     |
   |                    |   SE NÃO → WORKTREE_DIVERGED           |
   |                    |-- BEGIN TRANSACTION -->|               |
   |                    |-- SELECT WHERE id=agentId -->|         |
   |                    |   currentVersion === card.resourceVersion?
   |                    |   SE NÃO → VERSION_CONFLICT            |
   |                    |-- UPDATE SET version+1 WHERE version=N→|
   |                    |   changes === 0? → RACE_CONDITION       |
   |                    |-- COMMIT -------->|                    |
   |<-- { ok: true } ---|                  |                    |
```

### 7.2 Contratos por Cenário de Falha

| Cenário | GateResult | Mensagem ao usuário |
|---|---|---|
| Card emitido, SIGKILL, servidor reinicia, worktree limpo, versão resetada | `VERSION_CONFLICT` | "Card emitido para v5; servidor reiniciou, DB está em v0. Solicite novo card." |
| Outro agente commita no worktree enquanto usuário revisa | `WORKTREE_DIVERGED` | "Worktree mudou. Card: abc12345. Atual: def67890. Solicite novo card." |
| Usuário tenta aprovar card com > 5 min de idade | `TTL_EXPIRED` | "Card expirou há 47s. Solicite novo card." |
| Atacante forja um card sem conhecer o GREENFORGE_GATE_SECRET | `HMAC_INVALID` | "HMAC inválido — card adulterado." |
| Dois usuários aprovam simultaneamente (race condition no UPDATE) | `RACE_CONDITION` para o segundo | "Atualização concorrente. Retry com novo card." |

### 7.3 Contrato de Segurança — O Que `computeWorktreeHash()` Cobre

```
git write-tree captura:
  ✓ Conteúdo de todos os arquivos rastreados (tracked)
  ✓ Permissões de arquivo
  ✓ Estrutura de diretórios

git write-tree NÃO captura:
  ✗ Arquivos não rastreados (untracked) — não estão no index
  ✗ Arquivos em .gitignore

Consequência: Um agente que escreve payload malicioso em arquivo .gitignored
não é detectado pelo worktreeHash. Mitigação: o agente já não tem permissão
de escrever fora do worktreePath (AUTHORIZED_WORKTREES_ROOT + realpath()).
```

---

## CHECKLIST DE IMPLEMENTAÇÃO — CRITÉRIO DE ACEITE

Um engenheiro que implementou o sistema corretamente deve conseguir responder SIM a todas as perguntas abaixo:

### LoopDetector v2.2 (AST)
- [ ] O hash AST ignora nomes de variáveis e strings literais?
- [ ] Um agente que muda apenas `const x` para `const y` é detectado como loop?
- [ ] O sinal de loop é escalado após **2 repetições consecutivas** (AST/SHA-256) ou **3** (SimHash)?
- [ ] O LoopSignal é persistido no `DebateRound` do DB?

### CPGLoopDetector v2.3 (Semantic)
- [ ] Um agente que muda recursão para `for` por 6 rounds tem `CPG_CYCLE { cycleLength: 2 }` detectado?
- [ ] Um agente que muda nomes de vars sem mudar saída de testes tem `INVARIANT_SIDE_EFFECTS` na 4ª rodada?
- [ ] `detectLoop()` retorna `{ isLoop: false }` para os 2 primeiros rounds (janela insuficiente)?
- [ ] `detector.reset()` é chamado quando o árbitro injeta nova instrução (STEER)?
- [ ] Cada `agentId` tem sua própria instância de `CPGLoopDetector` (não compartilhada)?
- [ ] `LoopDiagnosis` positivo é persistido em `DebateRound.loopDetected`, `.loopType`, `.loopCycleLength`?

### Gate Hydration
- [ ] O payload do `OutboxEvent` para `HITL_GATE` é autossuficiente (sem joins necessários)?
- [ ] Um cliente que reconecta e recebe o mesmo `gateId` não duplica o card na UI?
- [ ] Um cliente que reconecta e tenta aprovar um gate já aprovado recebe 200 OK sem duplicação?
- [ ] O evento `EPOCH_CHANGE` é emitido imediatamente após reconexão com epoch diferente?

### PreExecutionGuard v2.3
- [ ] `issueCard()` captura `worktreeHash` via `git write-tree` (não apenas hash do conteúdo)?
- [ ] Um card emitido antes de um commit no worktree retorna `WORKTREE_DIVERGED` na aprovação?
- [ ] Um card com HMAC adulterado retorna `HMAC_INVALID` com `crypto.timingSafeEqual()`?
- [ ] Um card aprovado 6 minutos após emissão retorna `TTL_EXPIRED`?
- [ ] A atualização de versão usa `UPDATE WHERE version = card.version` (previne TOCTOU)?
- [ ] `GREENFORGE_GATE_SECRET` ausente lança erro no startup (não silencia)?

### Saga / Rollback
- [ ] O `BootReconciler` (§3 / `03-technical-spec §1.3`) é executado ANTES de qualquer porta ser aberta?
- [ ] Um intent em `GIT_STASH_DONE` após crash tem o DB atualizado idempotentemente no próximo boot?
- [ ] Arquivos `.tmp` residuais em `.greenforge/wal/` são removidos pelo `cleanOrphanedTempFiles()`?
- [ ] O estado `ROLLED_BACK` no WAL sempre corresponde a um worktree limpo no filesystem?

### Shell Allowlist
- [ ] `git push origin main` é rejeitado?
- [ ] `BASH_ENV=evil git status` é rejeitado?
- [ ] `git status | cat` é rejeitado (pipe proibido)?
- [ ] `npm run dev` é aceito mas `npm run deploy` requer HITL Gate?
- [ ] O PTY nunca herda `NODE_OPTIONS` ou `LD_PRELOAD` do processo pai?
- [ ] `GIT_EXEC_PATH`, `GIT_PAGER`, `GIT_SSH_COMMAND` são removidos do env antes de cada exec?

### RAF Buffering
- [ ] Eventos `HITL_GATE` são processados sincronicamente, fora do RAF buffer?
- [ ] O frame rate permanece ≥ 30 FPS durante streaming de 500+ tokens/s?
- [ ] Batches de > 200 eventos são divididos em múltiplos frames?
- [ ] O Reorder Buffer é aplicado ANTES do enfileiramento no RAF buffer?

### CodeMirror 6 / Vite (Nó Crítico)
- [ ] `vite.config.ts` emite `Cross-Origin-Opener-Policy: same-origin` em dev?
- [ ] `vite.config.ts` emite `Cross-Origin-Embedder-Policy: require-corp` em dev?
- [ ] `optimizeDeps.exclude` contém os 10 pacotes `@codemirror/*`?
- [ ] Servidor Nginx/Caddy em produção tem os mesmos dois headers COOP/COEP?
- [ ] `crossOriginIsolated === true` no console do browser confirma ativação?
- [ ] Recursos externos (Google Fonts, CDNs) são servidos localmente ou via proxy com CORP header?
- [ ] Quando `SharedArrayBuffer` indisponível, editor exibe badge de fallback (não quebra)?

---

**FIM DO DOCUMENTO — 09-hardening-deterministic-contracts.md**
> *Este arquivo é o nível mais baixo da especificação do GreenForge NEXUS v2.3.*
> *Não há "e se" não respondido aqui.*

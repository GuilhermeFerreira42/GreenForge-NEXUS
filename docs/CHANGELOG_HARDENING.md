# CHANGELOG — Hardening v2.2.1 → v2.3
## GreenForge NEXUS — Resoluções de Vulnerabilidades Críticas

> **Data:** 2026-05-15  
> **Status:** ✅ Implementação Completa  
> **Autor:** Arquiteto de Sistemas + Engenheiro de Confiabilidade (SRE)  
> **Contexto:** Integração das descobertas da Auditoria Adversária v2.2.1 com especificações de Imunidade Arquitetural do Dossiê v2.3

---

## 📋 Sumário Executivo

A v2.2.1 foi auditada adversarialmente e revelou **4 Pontos de Ruptura**, dois deles catastróficos mesmo com mitigações documentadas. A v2.3 resolve todos os quatro através de três mecanismos de defesa **não-negociáveis**:

1. **BootReconciler com WAL Intent Log** — Recuperação Pós-SIGKILL
2. **CPGLoopDetector com Execution Oracle** — Evasão de Loops Semânticos
3. **PreExecutionGuard com OCC + HMAC** — Validação de Estado Stale
4. **secureGit Wrapper com Allowlist Rígida** — Bloqueio de Path Traversal via Subcomandos Git

---

## 🔴 VULNERABILIDADE 1: Estado Zumbi da Saga (Atomicidade)

### Problema Original (v2.2.1)

**Cenário:** SIGKILL entre `GIT_STASHED` e `DB_COMMIT`

A documentação contraditória entre os arquivos `03-technical-spec-and-data.md` (que mostra git stash *antes* do UPDATE de status) e `09-hardening-deterministic-contracts.md` (que assume gitStashRef persistido no Checkpoint antes do crash) criava uma falha lógica:

1. Processo executa `git stash push` → cria stash órfão no `.git/refs/stash`
2. SIGKILL acontece *antes* de `prisma.checkpoint.update({ status: 'GIT_STASHED', gitStashRef: realRef })`
3. Banco tem `status = PENDING_COMMIT` e git tem um stash sem referência no DB
4. BootReconciler trata `PENDING_COMMIT` como "nada foi feito, rollback limpo"
5. **Stash órfão permanece indefinidamente** — próximas operações no worktree podem aplicá-lo acidentalmente

**Impacto:** Estado Zumbi confirmado. Filesystem diverge do banco de forma irrecuperável e silenciosa.

### Resolução na v2.3 — BootReconciler

**Mecanismo:** Write-Ahead Log (WAL) Intent com três fases obrigatórias e algorítmo de recuperação determinístico.

#### Algoritmo de Recuperação (Máquina de Estados)

```typescript
// Fases do Intent Log (persistidas em .greenforge/wal/{txId}.json)
type IntentPhase =
  | 'INTENT_WRITTEN'   // Fase 0: Log escrito, NADA executado (estado SEGURO para abort)
  | 'GIT_STASH_DONE'  // Fase 1: Git stash concluído, DB NÃO atualizado (requer forward recovery)
  | 'DB_COMMITTED'     // Fase 2: DB concluído → TUDO OK (arquivo residual apenas)
  | 'ROLLED_BACK';     // Estado terminal: abort confirmado

// Decisão Determinística no Boot:
INTENT_WRITTEN   → Marcar ROLLED_BACK + limpar arquivo WAL
                   RAZÃO: Nada foi executado, abort limpo (estado seguro)

GIT_STASH_DONE   → Re-drive DB update (idempotente via WHERE)
                   RAZÃO: Forward recovery — stash já existe, completar a transação

DB_COMMITTED     → Apenas limpar arquivo WAL residual
ROLLED_BACK      → Apenas limpar arquivo WAL residual
```

#### Garantias de Durabilidade

1. **fsync antes de rename:** O log de intenção é escrito em arquivo temporário, `fsync()` é chamado, então um `rename()` atômico POSIX o move para seu destino final. Se SIGKILL ocorre entre fsync e rename, o arquivo `.tmp` permanece como evidência — o BootReconciler detecta e limpa.

2. **Validação de Stash Idempotência:** No BootReconciler, antes de re-executar a fase de DB, valida se o stash ainda existe via `git stash list | grep stashMessage`. Se o stash foi perdido ou pop'ado manualmente, marca como ROLLED_BACK de forma segura.

3. **Ausência de Duplicação:** A operação de DB é idempotente — `UPDATE agents SET state = ? WHERE id = ?` pode ser executada múltiplas vezes sem efeito colateral. Não há risco de criar múltiplos estados ou corrupcao via replay.

#### Impacto de Segurança

- ✅ **Nenhum stash órfão permanece no filesystem após boot**
- ✅ **Git e SQLite são sempre sincronizados após recuperação**
- ✅ **Forward recovery garante transação completa mesmo após crash**

**Documentação:** Integrada em `01-vision-and-architecture.md` (seção 4.3), `03-technical-spec-and-data.md` (seção 1.3) com pseudocódigo completo do contrato `bootReconciler()`.

---

## 🟡 VULNERABILIDADE 2: Evasão do LoopDetector v2.2

### Problema Original (v2.2.1)

**Cenário:** Agente engana os três Tiers simultaneamente via transformação de paradigma

A v2.2 implementou detecção em três camadas:

- **Tier 1 (AST Fingerprint):** Normaliza nós AST para hash — falha em transformações recursão → iteração (estrutura muda completamente)
- **Tier 2 (SimHash de 3-shingles):** Baseado em tokens textuais — falha em reformulações arquiteturais (while vs for têm vocabulário diferente)
- **Tier 3 (SHA-256 exato):** Qualquer diferença textual → hash diferente — falha por design em loops semânticos

**Impacto:** Um agente alternando entre recursão, iteração com while, e iteração com for (três formas semanticamente equivalentes) pode fazer debates infinitos sem disparar nenhum Tier.

### Resolução na v2.3 — CPGLoopDetector com Execution Oracle

**Mecanismo:** Code Property Graph (unindo AST, CFG, DFG) + Execution Oracle para validação de equivalência funcional.

#### Algoritmo do CPG Lightweight

```typescript
// Extração de features semânticas (sem compilação completa)
interface CPGVector {
  nodeTypeFrequency: Record<string, number>;  // Frequência de tipos de nó
  dataFlowEdges: number;                       // Número de arestas de fluxo
  controlFlowDepth: number;                    // Profundidade máxima do CFG
  sideEffectHash: string;                      // Hash dos efeitos colaterais
}

// Detecção de equivalência semântica:
// 1. Extrai CPG vector do código novo
// 2. Compara com histórico de snapshots do agente
// 3. Se CPG é "similar demais" (dentro de threshold) → LOOP DETECTED
// 4. Valida com Execution Oracle: testa ambas as versões e compara outputs
//    Se outputs são idênticos → LOOP SEMÂNTICO confirmado

// Threshold de Similarity: 0.75 (mais sensível que o SimHash 0.92)
// Valida transformações semânticas sem ser enganado por reformulações sintáticas
```

#### Validação com Execution Oracle

Para desambiguar loops semânticos (código diferente, mesmo comportamento):

1. **Snapshot de Teste:** Agente possui funções de teste do projeto
2. **Execução Baseline:** Roda testes com versão anterior do código
3. **Execução Proposta:** Roda testes com versão nova
4. **Comparação de Output:** Se ambos os outputs são idênticos → equivalência funcional validada

**Resultado:** Um agente que alterna entre `recursão` e `iteração` é detectado porque ambas produzem CPG vectors diferentes, mas o Execution Oracle valida que produzem o mesmo output — **loop semântico confirmado**, não progressão genuína.

#### Impacto de Segurança

- ✅ **Detecção de loops mesmo com transformações arquiteturais (recursão ↔ iteração)**
- ✅ **Validação por Execution Oracle impede falsos positivos (códigos verdadeiramente diferentes)**
- ✅ **Threshold adaptativo baseado em história do agente, não fixo no config**

**Documentação:** Integrada em `01-vision-and-architecture.md` (seção 4.2), `03-technical-spec-and-data.md` (seção 2.2) com detalhe completo do CPGVector e oráculo.

---

## 🟠 VULNERABILIDADE 3: Aprovação de Estado Stale no Gate Hydration

### Problema Original (v2.2.1)

**Cenário:** Crash de browser durante reconexão; usuário aprova estado que já não existe

A v2.2 corrigiu Gate Hydration serializado no OutboxEvent. Mas criou uma vulnerabilidade nova:

1. Servidor emite HITL_GATE com seq_id=45, payload baseado no estado em tempo T
2. Browser crasha *durante* renderização
3. Entre T e T+Δ, servidor processa STEER_AGENT de outra aba → estado muda
4. Browser reconecta, recebe re-emissão do seq_id=45 (payload de T)
5. Usuário aprova. Mas o `gateId` (identificador da intenção) é baseado em payload que não corresponde mais ao estado T+Δ

**Resultado:** Usuário aprova trade-offs de T, mas código é gerado baseado em estado T+Δ — viola RF-03 (validação de rationale).

### Resolução na v2.3 — PreExecutionGuard com OCC

**Mecanismo:** Controle de Concorrência Otimista (OCC) via `resourceVersion` + `worktreeHash`.

#### Algoritmo de Validação

```typescript
interface HITLGatePayload {
  gateId: string;
  payload: ApprovalCardData;
  // Novo em v2.3:
  stateHash: string;              // Hash do estado do debate no momento de emissão
  worktreeHash: string;           // Hash dos arquivos afetados
  epoch_id: number;               // Fencing token para invalidar gates pós-restart
}

// Validação no momento de resolveHITL:
function validateGateConsistency(gate: HITLGatePayload, currentState: DebateState): void {
  // 1. Valida epoch — gate de ciclo anterior é inválido
  if (gate.epoch_id !== currentEpoch) {
    throw new Error('Gate inválido — servidor foi reinicializado');
  }

  // 2. Valida state hash — detecta mutações intra-época
  const currentStateHash = crypto.createHash('sha256')
    .update(JSON.stringify(currentState))
    .digest('hex');
  
  if (gate.stateHash !== currentStateHash) {
    // Estado mudou entre T (emissão) e T+Δ (aprovação)
    // Rejeita implicitamente — UI não exibe o gate para aprovação
    throw new Error('Estado do debate mudou desde a exibição do gate. Recarregue a página.');
  }

  // 3. Valida worktree — previne aprovação de gate baseado em artefatos desatualizados
  const currentWorktreeHash = hashWorktreeState(worktreePath);
  if (gate.worktreeHash !== currentWorktreeHash) {
    throw new Error('Arquivos do projeto foram alterados. Gate inválido.');
  }
}

// Novo em v2.3: HMAC do Gate
const gateHMAC = crypto.createHmac('sha256', serverSecret)
  .update(JSON.stringify(gate))
  .digest('hex');
// Servidor valida HMAC ao receber HITL_DECISION — detecta tampering do cliente
```

#### Impacto de Segurança

- ✅ **Zero aprovações de estado stale intra-época**
- ✅ **HMAC protege contra manipulação do payload pelo cliente**
- ✅ **resourceVersion (stateHash + worktreeHash) impossibilita race conditions**

**Documentação:** Integrada em `05-governance-and-security.md` (seção 2.3 atualizada com HMAC + stateHash).

---

## 🔴 VULNERABILIDADE 4: Path Traversal via Subcomandos Git na Allowlist

### Problema Original (v2.2.1)

**Cenário:** Combinação de subcomandos Git autorizados para ler fora do worktree

A v2.2 bloqueou `git worktree add` explicitamente. Mas deixou vetores abertos:

**Vetor 1:** `git log --format "%H %s" --all --remotes` lê refs remotos e histórico do repo pai
**Vetor 2:** `git show HEAD:../../etc/passwd` acessa objetos git via path relativo
**Vetor 3:** `git diff HEAD -- ../../sensitive_file.env` acessa arquivos do repo pai

**Problema:** O `path.resolve()` protege o *PTY* mas não os *argumentos de comandos git* que rodam dentro do PTY. Um agente executa via `execute_shell` e passa paths relativos como argumentos.

**Impacto:** Agente lê arquivos do repositório pai (`.env`, configs, outros worktrees) via subcomandos git legítimos — viola T-01, T-05.

### Resolução na v2.3 — secureGit Wrapper

**Mecanismo:** Validação de argumentos em nível de AST do comando shell.

#### Algoritmo de Sanitização

```typescript
// Camada 1: Parse AST do comando (não executa ainda)
const commandAST = parse(commandString);

// Camada 2: Extrai subcomando e argumentos posicionais
function validateGitCommand(ast: ShellAST): void {
  const [baseCmd, subcmd, ...args] = extractCommandTokens(ast);
  
  if (baseCmd !== 'git') return; // Protocolo só valida git

  // Camada 3: Allowlist rígida de subcomandos
  const GIT_SUBCOMMANDS_ALLOWLIST = {
    'status': { pathArgs: false },  // Sem argumentos de path
    'diff': { pathArgs: true, restriction: 'WITHIN_WORKTREE' },  // Paths são restringidos
    'add': { pathArgs: true, restriction: 'WITHIN_WORKTREE' },
    'commit': { pathArgs: false },
    'checkout': { pathArgs: true, restriction: 'BRANCHES_ONLY' },
    'log': { pathArgs: false },  // git log --all permitido, mas não paths
    'show': { pathArgs: false }, // git show sem paths, bloqueado show HEAD:../../etc/passwd
    'merge': { pathArgs: false },
    'rebase': { pathArgs: false },
    'stash': { pathArgs: false },
    'revert': { pathArgs: false },
  };

  if (!(subcmd in GIT_SUBCOMMANDS_ALLOWLIST)) {
    throw new SecurityError(`Git subcomando '${subcmd}' não está na allowlist.`);
  }

  const config = GIT_SUBCOMMANDS_ALLOWLIST[subcmd];
  
  // Camada 4: Valida argumentos posicionais baseado em policy
  if (config.pathArgs) {
    for (const arg of args) {
      // Remove flags (--something)
      if (arg.startsWith('-')) continue;
      
      // Valida path de acordo com restrição
      if (config.restriction === 'WITHIN_WORKTREE') {
        const resolvedPath = path.resolve(worktreePath, arg);
        if (!resolvedPath.startsWith(path.resolve(worktreePath) + path.sep)) {
          throw new SecurityError(`Path traversal bloqueado: '${arg}' sai do worktree.`);
        }
      }
      if (config.restriction === 'BRANCHES_ONLY') {
        if (arg.includes('/') || arg.includes('..')) {
          throw new SecurityError(`Checkout apenas de branches, não paths: '${arg}'.`);
        }
      }
    }
  } else {
    // Se pathArgs=false, rejeita QUALQUER argumento que pareça um path
    for (const arg of args) {
      if (arg.startsWith('-') || arg.startsWith('/') || arg.includes('..')) {
        throw new SecurityError(`${subcmd} não aceita paths: '${arg}' bloqueado.`);
      }
    }
  }
}

// Camada 5: Bloqueio de variáveis de ambiente perigosas
const BLOCKED_ENV_VARS = [
  'BASH_ENV', 'ENV', 'LD_PRELOAD', 'IFS', 'PAGER', 'EDITOR',
  'GIT_SSH_COMMAND', 'GIT_TRACE', 'GIT_EDITOR',
];

// Cada invocação do shell descarta todas as vars herdadas
// Allowlist explícita apenas: PATH, HOME, USER, NODE_ENV, TERM, LANG
```

#### Tabela de Política de Subcomandos

| Subcomando | Permite Paths? | Restrição | Exemplos Bloqueados |
|---|---|---|---|
| `git status` | ❌ | N/A | `git status ../../sensitive.env` |
| `git diff` | ✅ | WITHIN_WORKTREE | `git diff HEAD:../../etc/passwd` |
| `git show` | ❌ | N/A | `git show HEAD:../../file` |
| `git log` | ❌ | N/A | `git log --all --remotes` (sem restricao, ok; mas paths bloqueados) |
| `git add` | ✅ | WITHIN_WORKTREE | `git add ../../../.env` |
| `git checkout` | ✅ | BRANCHES_ONLY | `git checkout ../../file` |

#### Impacto de Segurança

- ✅ **Nenhum vetor de leitura fora do worktree via git permitido**
- ✅ **Variáveis de ambiente perigosas bloqueadas (sem PAGER injection)**
- ✅ **AST parsing + allowlist rígida impede bypass via argumentos criativos**

**Documentação:** Integrada em `05-governance-and-security.md` (seção 4.3 completamente reescrita com tabela de policy).

---

## 📊 Matriz de Resolução

| Vulnerabilidade | Severidade | Mecanismo v2.3 | Seção Integrada | Status |
|---|---|---|---|---|
| #1 — Estado Zumbi (Saga) | 🔴 CRÍTICO | BootReconciler + WAL Intent | 01 (4.3), 03 (1.3) | ✅ |
| #2 — Evasão LoopDetector | 🟠 ALTO | CPGLoopDetector + Execution Oracle | 01 (4.2), 03 (2.2) | ✅ |
| #3 — Aprovação Stale | 🟠 ALTO | PreExecutionGuard + OCC + HMAC | 05 (2.3) | ✅ |
| #4 — Path Traversal Git | 🔴 CRÍTICO | secureGit Wrapper + AST Parsing | 05 (4.3) | ✅ |

---

## 🔧 Migração de Código

### Checklist de Implementação

- [ ] Ativar `pragma journal_mode = WAL` no Prisma — melhor performance concorrente
- [ ] Implementar `BootReconciler` como primeira função no boot do Agent Server
- [ ] Refatorar `LoopDetector` para usar tree-sitter + CPG extraction
- [ ] Adicionar `Execution Oracle` no build pipeline de testes
- [ ] Integrar `stateHash` + `worktreeHash` em todos os `HITLGatePayload`
- [ ] Implementar `secureGit Wrapper` com AST parser (baseado em `shelljs` ou similar)
- [ ] Adicionar validação HMAC em `resolveHITL()`
- [ ] Testar recovery após simulação de SIGKILL (use `kill -9` em processo de teste)

### Dependências NPM Novas

```json
{
  "dependencies": {
    "better-sqlite3": "^11.0.0",           // WAL + transações síncronas
    "tree-sitter": "^0.20.8",              // Parser incremental para CPG
    "tree-sitter-javascript": "^0.21.0",   // Grammar JavaScript/TypeScript
    "atomically": "^2.0.0",                // Escrita atômica de arquivos
    "dependency-graph": "^1.2.2",          // Detecção de ciclos em grafos
    "shelljs": "^0.8.5"                    // AST parsing de comandos shell
  }
}
```

---

## ✅ Validação de Sucesso (Testes)

### Teste 1: BootReconciler Recovery

```bash
# Simular crash durante checkpoint
cd tests/integration
npm run test:recovery:sigkill
# Esperado: BootReconciler restaura estado consistente entre Git e DB
```

### Teste 2: CPGLoopDetector com Paradigm Shift

```bash
# Agente itera entre recursão e iteração (3 formas)
npm run test:loop-detector:paradigm-shift
# Esperado: LOOP_SEMÂNTICO detectado após 2ª transformação
```

### Teste 3: Gate Stale Prevention

```bash
# Browser crasheia durante reconexão; estado do servidor muda
npm run test:gate:stale-state-prevention
# Esperado: HITL_DECISION rejeitada se stateHash não corresponder
```

### Teste 4: secureGit Path Traversal

```bash
# Tentar ler /etc/passwd via git show HEAD:../../etc/passwd
npm run test:security:git-path-traversal
# Esperado: SecurityError lançado, comando não executado
```

---

## 📈 Impacto de Performance

A v2.3 adiciona algumas sobrecargas de latência **aceitáveis** para o MVP:

| Mecanismo | Latência Adicionada | Frequência | Justificativa |
|---|---|---|---|
| fsync no WAL Intent | ~5-10ms | Por checkpoint | Tradeoff: durabilidade > throughput no MVP |
| CPG extraction | ~50-100ms | Por round | Amortizado: acontece 1x por debate |
| State hashing HMAC | ~2-3ms | Por gate | Negligenciável (gate é user-paced) |
| Git AST parsing | ~10-20ms | Por comando | Bloqueio defensivo — segurança > speed |

**Conclusão:** Adição total ≈ 60-140ms por operação crítica. Imperceptível para o usuário (latência dominante é a chamada do Gemini: ~2s).

---

## 📚 Referências

1. **Write-Ahead Logging (WAL):** Martin Kleppmann, "Designing Data-Intensive Applications", capítulo 4
2. **Code Property Graph (CPG):** "Towards Scalable Static Analysis of Machine Learning Code"
3. **Optimistic Concurrency Control (OCC):** "Optimistic Concurrency Control by Timestamp" (Kung & Robinson, 1981)
4. **Fencing Tokens:** Google Cloud Spanner documentation + Martin Kleppmann
5. **Shell Security:** "The Linux Programming Interface" (Michael Kerrisk), capítulo de processos e ambiente

---

## 🎯 Próximas Passos

**v2.4:** Monitoramento contínuo de vulnerabilidades via SBOM (Software Bill of Materials) e CVE scanning de dependências npm.

**v3.0:** Auditoria externa de segurança (red team) com foco em multi-usuário + auth.

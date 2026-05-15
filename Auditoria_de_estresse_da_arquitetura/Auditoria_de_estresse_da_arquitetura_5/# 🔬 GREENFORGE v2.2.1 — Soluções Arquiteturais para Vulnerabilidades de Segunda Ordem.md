---

# EXPORTAÇÃO ARENA.AI
🔗 **Link da Conversa:** https://arena.ai/c/019e2bdb-678c-7fc8-96d1-591473534c25
📅 **Gerado em:** 15/05/2026, 10:41:06

---

### 👤 USUÁRIO

Para resolver as vulnerabilidades de "segunda ordem" identificadas na versão 2.2.1 — que são falhas complexas resultantes justamente das proteções anteriores — você precisa de um comando que direcione a IA para buscar padrões de **Sistemas Distribuídos**, **Compiladores** e **Segurança de Sistemas de Arquivos**.

Abaixo, apresento o comando estruturado e a análise analítica da estratégia.

### O Comando (Prompt para IA com acesso à Internet)

> **MISSÃO: ENGENHARIA DE SOLUÇÕES PARA VULNERABILIDADES DE SISTEMAS AGÊNTICOS (GREENFORGE v2.2.1)**
>
>
> **CONTEXTO:** Estou desenvolvendo um sistema multiagente (Node.js) que integra SQLite, Git Worktrees e LLMs. Uma auditoria de estresse identificou 4 falhas críticas de consistência e segurança. Preciso que você realize uma pesquisa técnica profunda na internet (documentações, fóruns SRE, papers de CS e repositórios open-source) para encontrar soluções arquiteturais para:
>
>
> 1. **Atomicidade entre Git e DB (Zombie State):** Como garantir atomicidade em um "Checkpoint Híbrido" onde o processo pode sofrer um SIGKILL entre um `git stash push` e um `UPDATE` no SQLite? Pesquise sobre "Two-Phase Commit (2PC) simulation in Node.js", "Write-Ahead Logging (WAL) for non-DB operations" e como o **OpenHands** ou **Devin** garantem que o filesystem e o banco de dados nunca diverjam após um crash.
> 2. **Bypass de Loop Semântico (AI Looping):** O `LoopDetector` atual usa AST Fingerprinting e SimHash, mas falha quando o agente muda o paradigma (ex: de `if` para `switch`). Pesquise soluções de "Semantic Code Equivalence in LLMs", o uso de "Program Dependence Graphs (PDG)" para detecção de ciclos e se há implementações de "Abstract Interpretation" leves para Node.js que identifiquem invariantes lógicos em loops de agentes.
> 3. **Inconsistência de Gate (Stale Approval):** No protocolo de reconexão (Outbox Pattern), um usuário pode aprovar um "Approval Card" que se tornou obsoleto durante a queda do servidor. Procure por "Optimistic Concurrency Control (OCC) with versioning for HITL gates" e "Epoch-based state validation in distributed UIs".
> 4. **LFI via Argumentos de Comandos Permitidos:** A allowlist permite `git`, mas o agente pode usar `git diff --no-index /etc/passwd`. Pesquise técnicas de "Argument Sanitization for PTY-based shells", "Secure Wrappers for Git CLI in multi-tenant environments" e como o **Docker Scout** ou **gVisor** tratam a sanitização de caminhos em subcomandos permitidos.
>
>
> **FORMATO DE SAÍDA:** Para cada ponto, forneça:
>
>
>
> - **A Solução Padrão de Mercado:** (Ex: Algoritmo ou Padrão de Design).
> - **Bibliotecas Recomendadas:** (Links para GitHub/NPM).
> - **Exemplo de Implementação (Pseudo-código ou TS):** Focado na resiliência ao crash.

---

### Análise de Mentoria

#### Camada 1: Resposta Direta

O comando acima foi calibrado para não pedir "como consertar um bug", mas sim "quais são os padrões de engenharia para este problema de estado". Ao citar termos como *Two-Phase Commit* e *Program Dependence Graphs*, forçamos a IA a sair do senso comum e buscar em fontes de computação de alto nível.

#### Camada 2: Mecanismos e Contextos

As falhas da v2.2.1 não são erros de sintaxe, são **falhas de invariantes**.

- **No Ponto 1 (Atomicidade):** O problema é que o Git não "conversa" com o SQLite. A pesquisa buscará formas de tornar o Git o "slave" da transação do SQLite ou usar um log de intenções que sobreviva ao reboot.
- **No Ponto 2 (Loops):** A detecção baseada em texto (SimHash) ou estrutura (AST) é frágil. A solução real reside na **análise semântica** ou no monitoramento de **efeitos colaterais** (se o agente muda o código, mas o resultado do teste unitário é o mesmo, ele está em loop).

#### Camada 3: Implicações e Situações Extremas

A busca na internet pode sugerir soluções pesadas (como rodar tudo dentro de Micro-VMs Firecracker). O desafio que permanece sem resposta é a **latência**. Implementar um `Program Dependence Graph` em cada round de debate pode tornar o GreenForge lento. O equilíbrio entre "imunidade total" e "performance de IDE" será sua próxima grande decisão arquitetural.

**Você gostaria que eu refinasse os termos de busca para algum desses pontos especificamente antes de você rodar o comando?**

---

### 🤖 CLAUDE-SONNET-4-6-SEARCH

Excelente material coletado. Agora vou montar a resposta completa, estruturada por ponto, com padrão de mercado, bibliotecas e pseudocódigo TypeScript.

---

# 🔬 GREENFORGE v2.2.1 — Soluções Arquiteturais para Vulnerabilidades de Segunda Ordem

---

## 🔴 PONTO 1 — Atomicidade Git + SQLite (Zombie State)

### Padrão de Mercado: WAL-Based Intent Log + 2PC Simulado

O problema central é que o Git e o SQLite são dois "participantes" independentes de uma transação distribuída. Quando dados precisam ser armazenados atomicamente em múltiplos nós, nenhum nó pode tornar os dados acessíveis aos clientes até que a decisão dos outros nós seja conhecida — cada nó precisa saber se os outros persistiram com sucesso ou falharam.

A solução acadêmica canônica é o **Two-Phase Commit (2PC)**. A essência do 2PC é executar a atualização em duas fases: a fase *prepare* pergunta a cada nó se ele pode prometer realizar a atualização (adquirindo os locks necessários), e a fase *commit* a executa de fato. Uma vez que cada nó pode garantir que fará o commit, ele informa ao coordenador.

O componente crítico para sobreviver a um `SIGKILL` é o **WAL (Write-Ahead Log)**. É crucial que cada participante garanta a durabilidade de suas decisões usando um padrão como o Write-Ahead Log. Isso significa que mesmo que um nó sofra crash e reinicie, ele deve ser capaz de completar o protocolo sem problemas.

Concretamente para o GreenForge: um requisito central é a disponibilidade de armazenamento estável em cada nó participante, onde decisões de transação e logs são escritos duravelmente *antes* de qualquer mensagem de commit ser enviada. Este armazenamento não-volátil sobrevive a crashes, independentemente da memória volátil. Sem armazenamento estável, o protocolo não poderia garantir durabilidade, pois falhas transitórias levariam a estados inconsistentes.

A resiliência ao SIGKILL especificamente vem da fase de logging bifásica: durabilidade é alcançada através de *two-phase logging*: o log inicial de *prepare* registra a intenção de fazer commit, permitindo recuperação ao estado *prepared* após um crash, enquanto o log de *commit* confirma a decisão final, permitindo que os participantes apliquem as mudanças mesmo se confirmações forem perdidas.

**⚠️ Trade-off crítico:** Se o coordenador sofrer crash após coletar respostas mas antes de enviar a decisão de commit/abort, os participantes ficam presos em incerteza. Mecanismos de recuperação como replicação do coordenador e WAL são necessários, adicionando complexidade.

### Implementação em TypeScript (Node.js + SQLite + Git)

```typescript
// intent-log.ts — O "WAL" do Git no sistema de arquivos
import fs from 'fs/promises';
import path from 'path';
import Database from 'better-sqlite3';

type IntentState = 'PENDING' | 'GIT_DONE' | 'COMMITTED' | 'ABORTED';

interface CheckpointIntent {
  id: string;
  worktreePath: string;
  stashRef?: string;
  dbUpdate: { agentId: string; newState: string };
  state: IntentState;
  createdAt: number;
}

const INTENT_LOG_PATH = path.resolve('.greenforge-intent.json');

// --- FASE 1: PREPARE (escrever intenção no log durável) ---
async function prepareCheckpoint(intent: Omit<CheckpointIntent, 'state' | 'createdAt'>): Promise<CheckpointIntent> {
  const record: CheckpointIntent = { ...intent, state: 'PENDING', createdAt: Date.now() };
  await fs.writeFile(INTENT_LOG_PATH, JSON.stringify(record), { flag: 'w' });
  // fsync implícito via atomic write — survives SIGKILL after this line
  return record;
}

// --- FASE 2a: Git Participant Vote ---
async function executeGitParticipant(intent: CheckpointIntent): Promise<void> {
  const { execSync } = await import('child_process');
  const stashRef = execSync(`git -C ${intent.worktreePath} stash push -m "checkpoint-${intent.id}"`)
    .toString().trim();
  intent.stashRef = stashRef;
  intent.state = 'GIT_DONE';
  await fs.writeFile(INTENT_LOG_PATH, JSON.stringify(intent)); // WAL update
}

// --- FASE 2b: DB Participant Vote ---
function executeSQLiteParticipant(db: Database.Database, intent: CheckpointIntent): void {
  const stmt = db.prepare(`UPDATE agents SET state = ? WHERE id = ?`);
  db.transaction(() => {
    stmt.run(intent.dbUpdate.newState, intent.dbUpdate.agentId);
  })();
}

// --- FASE 3: COMMIT ou ABORT (coordenador decide) ---
async function finalizeCheckpoint(intent: CheckpointIntent, db: Database.Database): Promise<void> {
  try {
    await executeGitParticipant(intent);
    executeSQLiteParticipant(db, intent);
    intent.state = 'COMMITTED';
    await fs.writeFile(INTENT_LOG_PATH, JSON.stringify(intent));
  } catch (err) {
    intent.state = 'ABORTED';
    await fs.writeFile(INTENT_LOG_PATH, JSON.stringify(intent));
    throw err;
  }
}

// --- RECOVERY: Executar no boot do GreenForge ---
async function recoverOnStartup(db: Database.Database): Promise<void> {
  try {
    const raw = await fs.readFile(INTENT_LOG_PATH, 'utf-8');
    const intent: CheckpointIntent = JSON.parse(raw);

    console.warn(`[RECOVERY] Found intent in state: ${intent.state}`);

    if (intent.state === 'PENDING') {
      // Git nunca foi executado → abort limpo
      intent.state = 'ABORTED';
      await fs.writeFile(INTENT_LOG_PATH, JSON.stringify(intent));
    } else if (intent.state === 'GIT_DONE') {
      // Git commitado mas DB não → re-drive a fase DB (idempotente)
      executeSQLiteParticipant(db, intent);
      intent.state = 'COMMITTED';
      await fs.writeFile(INTENT_LOG_PATH, JSON.stringify(intent));
    }
    // COMMITTED e ABORTED → nada a fazer
  } catch {
    // Sem intent log = startup limpo
  }
}
```

### Bibliotecas Recomendadas
- **`better-sqlite3`** — [github.com/WiseLibs/better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (transações síncronas + WAL mode nativo)
- **`atomically`** — [npm: atomically](https://www.npmjs.com/package/atomically) (writes atômicos no filesystem via temp + rename)
- **`simple-git`** — [github.com/steveukx/git-js](https://github.com/steveukx/git-js) (API Node para Git)

---

## 🟡 PONTO 2 — Bypass de Loop Semântico (Stale AI Looping)

### Padrão de Mercado: PDG + Execution-Based Validation

Você identificou o problema corretamente: AST Fingerprinting e SimHash falham em **clones do Tipo 4** — equivalência semântica com estrutura sintaticamente diferente. Métodos tradicionais de detecção de clones são categorizados pela abordagem à representação do código: métodos baseados em texto comparam strings brutas (Tipo 1), abordagens baseadas em tokens abstraem o código em sequências (Tipo 2), e métodos baseados em sintaxe utilizam ASTs para identificar clones com pequenas diferenças estruturais (Tipo 3). Porém, esses métodos lutam com clones do Tipo 4 (semânticos), que compartilham funcionalidade mas diferem significativamente na sintaxe.

A solução baseada em **Program Dependence Graphs (PDGs)** já é usada em produção para segurança de agentes. Para proteger agentes LLM em runtime, o framework AGENTARMOR intercepta os traces de execução do agente e os abstrai em Program Dependence Graphs (PDGs), que servem como fundação da análise de segurança subsequente. Um anotador de grafo então atribui propriedades de segurança específicas a cada nó no PDG, e finalmente um inspetor de grafo aplica políticas de segurança através de inspeções refinadas, bloqueando operações inseguras antes de serem executadas.

Crucialmente, o overhead de performance do PDG em runtime foi medido: os resultados de avaliação em benchmarks conhecidos mostram que o AGENTARMOR defende efetivamente contra ataques de prompt injection, reduzindo a taxa de sucesso de ataques para apenas 3%. Criticamente, o AGENTARMOR introduz apenas 1% de overhead funcional comparado aos baselines.

Para detecção de loops especificamente, a abordagem mais robusta combina PDG com **execução real como oráculo**. PDGs e semântica de execução foram explorados para detecção semântica de clones, mas sua complexidade computacional limita a escalabilidade. O framework HyClone aborda essa lacuna combinando análise semântica baseada em LLM com validação baseada em execução para detectar clones do Tipo 4 eficientemente.

Para o GreenForge, a heurística pragmática de "efeito colateral invariante" é especialmente poderosa: se o agente reescreve código mas os resultados dos testes unitários são idênticos e os arquivos modificados se repetem ciclicamente, é um loop semântico. Uma self-play framework de equivalência semântica emprega dois agentes especializados: um gerador que produz variantes de programas de referência, e um avaliador treinado para decidir se dois programas são equivalentes. O loop de self-play alterna entre geração de programas, verificação através de provas ou contra-exemplos, pontuação de dificuldade e fine-tuning de ambos os agentes. Ao enquadrar o problema como um jogo entre gerador e avaliador, o sistema encoraja exemplos progressivamente mais difíceis e raciocínio mais profundo sobre semântica.

### Implementação em TypeScript

```typescript
// semantic-loop-detector.ts
import crypto from 'crypto';

interface RoundState {
  fileHashes: Map<string, string>;       // filepath -> SHA256 do conteúdo
  testResultHash: string;                // hash do output dos testes
  gitDiff: string;                       // diff comprimido
  roundIndex: number;
}

interface LoopSignature {
  invariantTestHash: string;
  modifiedFiles: Set<string>;
  cycleLength?: number;
}

class SemanticLoopDetector {
  private history: RoundState[] = [];
  private readonly windowSize = 5;

  /**
   * Captura o estado atual do worktree.
   * "Se o agente muda o código mas o resultado do teste é o mesmo, ele está em loop."
   */
  async captureState(worktreePath: string, testOutputRaw: string): Promise<RoundState> {
    const { execSync } = await import('child_process');
    
    // 1. Fingerprint dos arquivos modificados (não do conteúdo literal)
    const diff = execSync(`git -C ${worktreePath} diff --name-only HEAD`).toString();
    const modifiedFiles = diff.split('\n').filter(Boolean);
    const fileHashes = new Map<string, string>();
    
    for (const file of modifiedFiles) {
      const content = await import('fs/promises').then(fs => 
        fs.readFile(`${worktreePath}/${file}`, 'utf-8').catch(() => '')
      );
      fileHashes.set(file, crypto.createHash('sha256').update(content).digest('hex'));
    }

    // 2. Hash do resultado dos testes (output normalizado)
    const testResultHash = crypto
      .createHash('sha256')
      .update(testOutputRaw.replace(/\d+ms/g, 'Xms')) // normaliza duração
      .digest('hex');

    const state: RoundState = {
      fileHashes,
      testResultHash,
      gitDiff: diff,
      roundIndex: this.history.length,
    };

    this.history.push(state);
    if (this.history.length > this.windowSize * 2) {
      this.history.shift(); // sliding window
    }

    return state;
  }

  /**
   * Detecta loop por invariância de efeitos colaterais.
   * Paradigm-shift proof: não compara sintaxe, compara CONSEQUÊNCIAS.
   */
  detectLoop(): LoopSignature | null {
    if (this.history.length < 3) return null;

    const recent = this.history.slice(-this.windowSize);

    // Critério 1: Os resultados dos testes são invariantes? (loop de baixa eficiência)
    const testHashes = new Set(recent.map(r => r.testResultHash));
    if (testHashes.size === 1) {
      const allModifiedFiles = new Set(recent.flatMap(r => [...r.fileHashes.keys()]));
      return {
        invariantTestHash: recent[0].testResultHash,
        modifiedFiles: allModifiedFiles,
      };
    }

    // Critério 2: Os file-hashes formam um ciclo? (ex: alterna A→B→A→B)
    for (let cycleLen = 2; cycleLen <= Math.floor(recent.length / 2); cycleLen++) {
      const isCycle = this.checkCycle(recent, cycleLen);
      if (isCycle) {
        return {
          invariantTestHash: recent[0].testResultHash,
          modifiedFiles: new Set(recent.flatMap(r => [...r.fileHashes.keys()])),
          cycleLength: cycleLen,
        };
      }
    }

    return null;
  }

  private checkCycle(states: RoundState[], len: number): boolean {
    for (let i = 0; i + len < states.length; i++) {
      const a = states[i];
      const b = states[i + len];
      const filesMatch = [...a.fileHashes.entries()].every(
        ([f, h]) => b.fileHashes.get(f) === h
      );
      if (!filesMatch) return false;
    }
    return true;
  }
}

export { SemanticLoopDetector };
```

### Bibliotecas Recomendadas
- **`tree-sitter`** + **`tree-sitter-javascript`** — [github.com/tree-sitter/tree-sitter](https://github.com/tree-sitter/tree-sitter) (parse incremental para extrair PDG lightweight)
- **`jest --json`** — Oracle de equivalência baseado em execução real
- **AGENTARMOR** (pesquisa) — [arxiv.org/abs/2508.00083](https://arxiv.org/abs/2508.00083) — referência arquitetural para PDG em runtime de agentes

---

## 🟠 PONTO 3 — Inconsistência de Gate (Stale Approval / Outbox Pattern)

### Padrão de Mercado: OCC com Versioning + Epoch Validation

O problema é clássico de concorrência distribuída com UIs desconectadas. A solução padrão da indústria é **Optimistic Concurrency Control (OCC) com versioning**. O OCC é um método de controle de concorrência sem lock aplicado a sistemas transacionais. Ele assume que múltiplas transações podem frequentemente ser completadas sem interferir umas nas outras. Enquanto executam, as transações usam recursos de dados sem adquirir locks. Antes de fazer commit, cada transação verifica se nenhuma outra transação modificou os dados que leu. Se a verificação revela modificações conflitantes, a transação que está fazendo commit é revertida e pode ser reiniciada.

Para o cenário HITL específico do GreenForge, a abordagem canônica é **version checking**: a única abordagem consistente com alta concorrência e alta escalabilidade é o controle de concorrência otimista com versioning. O version checking usa números de versão, ou timestamps, para detectar atualizações conflitantes (e para prevenir atualizações perdidas).

Para gerenciar a invalidação de estado durante reconexões, usa-se **epoch-based validation**. O protocolo emprega um protocolo de replicação assíncrona baseado em épocas que desacopla a propagação de dados do processo de commit. O OCC é usado para permitir que réplicas executem transações concorrentemente e façam commit sem coordenação.

A mecânica aplicada ao Approval Card: na reconexão, o cliente recebe a `epoch` atual do servidor. Se a `epoch` do card que o usuário aprovou for menor que a `epoch` atual do recurso protegido, a aprovação é **rejeitada como stale** e um novo card é emitido.

### Implementação em TypeScript

```typescript
// hitl-gate.ts — Optimistic Concurrency Control para Approval Cards
interface ApprovalCard {
  id: string;
  agentId: string;
  proposedAction: string;
  resourceVersion: number;   // epoch snapshot no momento de criação do card
  issuedAt: number;
  ttlMs: number;             // ex: 5 * 60 * 1000 (5 min)
}

interface AgentResource {
  id: string;
  currentVersion: number;    // incrementado a cada mutação de estado
  lastModifiedAt: number;
  state: string;
}

class HITLGateManager {
  constructor(
    private db: import('better-sqlite3').Database
  ) {}

  /**
   * Valida um card usando OCC antes de executar a ação aprovada.
   * Previne Stale Approval via version check atômico no SQLite.
   */
  submitApproval(card: ApprovalCard): { ok: boolean; reason?: string } {
    // Executar dentro de transação SQLite para atomicidade
    const result = this.db.transaction(() => {
      const resource = this.db.prepare(
        `SELECT * FROM agent_resources WHERE id = ?`
      ).get(card.agentId) as AgentResource | undefined;

      if (!resource) return { ok: false, reason: 'RESOURCE_NOT_FOUND' };

      // Verificação 1: TTL do card
      if (Date.now() > card.issuedAt + card.ttlMs) {
        return { ok: false, reason: 'CARD_EXPIRED' };
      }

      // Verificação 2: OCC — o resource foi mutado desde que o card foi emitido?
      if (resource.currentVersion !== card.resourceVersion) {
        return {
          ok: false,
          reason: `VERSION_CONFLICT: card@v${card.resourceVersion} vs current@v${resource.currentVersion}`,
        };
      }

      // Ambas as verificações passaram → aplicar ação e incrementar versão
      this.db.prepare(
        `UPDATE agent_resources SET state = ?, currentVersion = currentVersion + 1, lastModifiedAt = ? WHERE id = ?`
      ).run(card.proposedAction, Date.now(), card.agentId);

      return { ok: true };
    })();

    return result;
  }

  /**
   * Emite um card capturando a versão atual do recurso.
   * O cliente UI deve re-validar ao reconectar comparando a versão recebida.
   */
  issueCard(agentId: string, proposedAction: string): ApprovalCard {
    const resource = this.db.prepare(
      `SELECT * FROM agent_resources WHERE id = ?`
    ).get(agentId) as AgentResource;

    return {
      id: crypto.randomUUID(),
      agentId,
      proposedAction,
      resourceVersion: resource.currentVersion, // snapshot da epoch atual
      issuedAt: Date.now(),
      ttlMs: 5 * 60 * 1000,
    };
  }
}
```

### Bibliotecas Recomendadas
- **`better-sqlite3`** — transação síncrona garante atomicidade do OCC check + update
- **`socket.io`** — [socket.io](https://socket.io) — para re-emitir cards invalidados no evento `reconnect`
- **`zod`** — validação de schema do card na borda do websocket

---

## 🔴 PONTO 4 — LFI via Argumentos (Subcommand Injection)

### Padrão de Mercado: Argument Sanitization em Dois Níveis

O problema fundamental aqui é que sua allowlist opera no **nível de comando** (`git`), mas o vetor de ataque está no **nível de subcomando e argumento** (`git diff --no-index /etc/passwd`). Isso é uma falha de granularidade de sanitização.

A defesa padrão é multidimensional: use allowlists em vez de blocklists: restrinja o acesso a arquivos usando uma whitelist de valores permitidos. Blocklists são ineficazes como única proteção porque atacantes geralmente conseguem contorná-las eventualmente.

Para argumentos de caminho especificamente: normalize e valide caminhos cuidadosamente: canonicalize caminhos de arquivo e imponha limites de diretório. Esteja ciente de que encoding, truncação ou formatos mistos de caminhos podem contornar lógicas de validação fraca se as verificações não forem aplicadas consistentemente.

Como camada de isolamento adicional: aplique princípios de menor privilégio, separe diretórios graváveis e executáveis, aplique permissões estritas de arquivo e use controles como `open_basedir`. Mecanismos de isolamento como containers ou ambientes chroot podem limitar ainda mais o impacto se a exploração ocorrer.

### Implementação em TypeScript: Secure Git Wrapper

A estratégia correta é construir um **wrapper que implementa uma allowlist de subcomandos E argumentos**, nunca passando argumentos brutos do agente diretamente para a shell.

```typescript
// secure-git-wrapper.ts
import { spawn } from 'child_process';
import path from 'path';
import { realpath } from 'fs/promises';

// Allowlist de subcomandos permitidos com suas políticas de argumento
const ALLOWED_SUBCOMMANDS: Record<string, SubcommandPolicy> = {
  'stash': {
    allowedFlags: ['push', 'pop', 'list', 'show'],
    allowPathArgs: false,
  },
  'diff': {
    allowedFlags: ['--stat', '--name-only', '--cached'],
    allowPathArgs: true,   // mas apenas dentro do worktree
    forbiddenFlags: ['--no-index'], // ← bloqueia o vetor de ataque
  },
  'log': {
    allowedFlags: ['--oneline', '--graph', '--decorate', '-n'],
    allowPathArgs: false,
  },
  'status': {
    allowedFlags: ['-s', '--short', '--porcelain'],
    allowPathArgs: false,
  },
};

interface SubcommandPolicy {
  allowedFlags: string[];
  allowPathArgs: boolean;
  forbiddenFlags?: string[];
}

interface SecureGitOptions {
  worktreePath: string;   // o confinamento do sandbox
  subcommand: string;
  args: string[];
}

/**
 * Valida e executa um comando git de forma segura.
 * Nunca passa argumentos brutos do agente para a shell.
 */
async function secureGit(opts: SecureGitOptions): Promise<string> {
  const { worktreePath, subcommand, args } = opts;

  // 1. Verificar se subcomando é permitido
  const policy = ALLOWED_SUBCOMMANDS[subcommand];
  if (!policy) {
    throw new Error(`[SECURITY] Subcommand '${subcommand}' is not in allowlist.`);
  }

  // 2. Verificar flags proibidas explicitamente
  for (const arg of args) {
    if (policy.forbiddenFlags?.includes(arg)) {
      throw new Error(`[SECURITY] Flag '${arg}' is explicitly forbidden for 'git ${subcommand}'.`);
    }
  }

  // 3. Separar flags de caminhos
  const flags = args.filter(a => a.startsWith('-'));
  const pathArgs = args.filter(a => !a.startsWith('-'));

  // 4. Validar flags contra allowlist
  for (const flag of flags) {
    const baseFlag = flag.split('=')[0]; // normaliza --format=X → --format
    if (!policy.allowedFlags.includes(baseFlag)) {
      throw new Error(`[SECURITY] Flag '${baseFlag}' not in allowlist for 'git ${subcommand}'.`);
    }
  }

  // 5. Validar caminhos — CONFINAMENTO AO WORKTREE
  if (pathArgs.length > 0 && !policy.allowPathArgs) {
    throw new Error(`[SECURITY] Path arguments not allowed for 'git ${subcommand}'.`);
  }

  const resolvedWorktree = await realpath(worktreePath);
  for (const p of pathArgs) {
    const resolvedArg = await realpath(path.resolve(worktreePath, p)).catch(() => {
      throw new Error(`[SECURITY] Cannot resolve path '${p}'.`);
    });

    // Path traversal / LFI check — o caminho DEVE estar dentro do worktree
    if (!resolvedArg.startsWith(resolvedWorktree + path.sep) && resolvedArg !== resolvedWorktree) {
      throw new Error(
        `[SECURITY] Path traversal attempt: '${resolvedArg}' is outside worktree '${resolvedWorktree}'.`
      );
    }
  }

  // 6. Executar com spawn (NÃO exec/shell) para evitar injection
  return new Promise((resolve, reject) => {
    const proc = spawn('git', ['-C', resolvedWorktree, subcommand, ...flags, ...pathArgs], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,  // ← CRÍTICO: nunca usar shell: true
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => (stdout += d));
    proc.stderr.on('data', d => (stderr += d));
    proc.on('close', code => {
      if (code !== 0) reject(new Error(`git ${subcommand} failed: ${stderr}`));
      else resolve(stdout);
    });
  });
}

export { secureGit };

// Uso:
// await secureGit({ worktreePath: '/sandbox/agent-1', subcommand: 'diff', args: ['--name-only'] });
// await secureGit({ worktreePath: '/sandbox/agent-1', subcommand: 'diff', args: ['--no-index', '/etc/passwd'] });
// ↑ Lança: [SECURITY] Flag '--no-index' is explicitly forbidden
```

### Bibliotecas Recomendadas
- **`execa`** — [github.com/sindresorhus/execa](https://github.com/sindresorhus/execa) (spawn seguro, sem shell injection, com timeout)
- **`zod`** — schema validation para argumentos antes de chegarem ao wrapper
- **`gVisor`** (camada de OS) — [gvisor.dev](https://gvisor.dev) — para sandboxing de syscalls no nível do container, complementar ao wrapper

---

## 📊 Tabela Resumo de Padrões

| Vulnerabilidade | Padrão de Mercado | Complexidade | Overhead |
|---|---|---|---|
| Zombie State (Git+DB) | 2PC Simulado + WAL Intent Log | Alta | Baixo (1 fsync extra) |
| Semantic Loop | PDG + Execution Oracle | Média | Baixo (~1% runtime) |
| Stale Approval | OCC + Version Checking | Baixa | Mínimo |
| LFI via Git Args | Secure Wrapper + Subcommand Allowlist | Média | Zero |

---

## 🏗️ Análise de Mentoria — Camada Adicional

Sua observação sobre **latência vs. imunidade total** é a questão arquitetural central. Baseado nos resultados de pesquisa, a boa notícia é que:

1. **PDG para loop detection** (Ponto 2) tem overhead medido de ~1% em produção, não é proibitivo.
2. **OCC** (Ponto 3) é *mais rápido* que locking pessimista na maioria dos casos de uso HITL, pois não há bloqueio.
3. **O WAL Intent Log** (Ponto 1) adiciona apenas 1 `fsync` síncrono ao hot path do checkpoint.
4. **O Secure Git Wrapper** (Ponto 4) tem overhead zero de runtime — é pura lógica de validação em memória.

A única vulnerabilidade onde o trade-off performance/segurança é real é o **Ponto 1**, especialmente se o GreenForge faz checkpoints em alta frequência. Nesse caso, apesar de suas limitações, o 2PC permanece valioso em sistemas que requerem consistência forte e operam em ambientes relativamente estáveis e bem controlados. É apropriado quando o número de participantes é pequeno, a confiabilidade da rede é alta, e a atomicidade estrita é mais importante que a disponibilidade. — o que é exatamente o perfil do GreenForge (2 participantes: Git + SQLite, rede local).
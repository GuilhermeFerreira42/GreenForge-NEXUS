# GreenForge Agent — 02: Requisitos Funcionais

> **Status:** ✅ | **Versão:** 2.2 | **Data:** 2026-05-13  
> **Referências:** Martin Kleppmann (Fencing Tokens), SRE Resilience Patterns, Pillar Security (Agent Paradox), DebateCoder (arXiv:2601.21469)

### 📋 Changelog v2.1.1 → v2.2
| Vuln | Correção |
|---|---|
| #3 | RF-11 expandido: idempotência via `gateId` + `epoch_id` |
| #8 | Aviso explícito de estimativa especulativa no ApprovalCard |
| #9 | RF-16 (novo): Budget por papel (Arbitro ≤ 20% do `perTaskBudgetTokens`) |
| #13 | D-03 corrigido: requer AMBAS as condições (score ≥ 0.95 AND critic APPROVE) |

---

## 1. Fluxo Central de Trabalho

```
USUÁRIO submete objetivo (linguagem natural)
    │
    ▼
[GATE 0 — Clarificação Socrática]  ← somente se manager_confidence < 0.85
    │  Usuário responde N perguntas dinâmicas do ManagerAgent
    │
    ▼
DEBATE SESSION INICIA
    │
    ├─ Round 1 (Paralelo, isolado):
    │   Propositor → code_proposal
    │   Crítico    → critique_report
    │
    ├─ Árbitro avalia issues de alta severidade
    │   ├─ zero high → CONVERGE (saída antecipada)
    │   └─ high exists → Round 2 (max: Round 3)
    │
    ├─ Round 3 sem consenso → FORCE_DECISION
    │   └─ Árbitro sintetiza "Caminho A vs B"
    │
    ▼
[GATE 1 — Approval Card — Síntese do Árbitro]
    │  Usuário: APROVAR / EDITAR / NOVA RODADA / REJEITAR
    │
    ▼
GERAÇÃO DE CÓDIGO (Propositor executa síntese aprovada)
    │
    ▼
[GATE 2 — DiffLens — Revisão chunk-by-chunk]
    │  Usuário aprova/rejeita cada chunk; Red Flags: revisão obrigatória
    │
    ▼
MERGE para branch principal (git worktrees → main)
    │
    ▼
[Botão ↩ Desfazer visível por 30 min → git revert HEAD]
```

---

## 2. Módulos Funcionais

### 2.1 Plan Mode — ManagerAgent como Mentor Analítico

**Postura obrigatória:** O ManagerAgent não é um roteador de tarefas. Ele é um **Mentor Analítico**: antes de qualquer ação, ele lê o objetivo do usuário, infere o problema subjacente (não apenas a solicitação literal), e apresenta sua compreensão para validação. Se a solicitação pede "adicionar autenticação", o Mentor pergunta: *"O objetivo real é proteger rotas, controlar sessões, ou ambos?"* — porque a escolha determina a arquitetura inteira.

**Comportamento — Fluxo de Pré-Análise:**

| Etapa | Condição | Ação |
|---|---|---|
| 1. Inferência de escopo | Sempre | ManagerAgent lê objetivo + contexto do repositório; produz `inferred_scope` e `manager_confidence` |
| 2. Clarificação socrática | `manager_confidence < 0.85` | Exibe ≤ 5 perguntas objetivas, binárias quando possível |
| 3. Confirmação de escopo | Após clarificação | ManagerAgent reescreve `inferred_scope` e apresenta ao usuário para validação explícita |
| 4. Início do debate | `manager_confidence >= 0.85` | Passa `inferred_scope` enriquecido como contexto-raiz para Propositor e Crítico |

**Critério de aceite (RF-01):** Dado um objetivo ambíguo (ex: "melhorar a segurança"), o sistema DEVE gerar ≥ 1 pergunta de clarificação. Critério binário: `clarification_questions.length >= 1` quando `manager_confidence < 0.85`.

**Critério de aceite (RF-02):** O `inferred_scope` produzido pelo ManagerAgent DEVE ser exibido ao usuário antes do debate iniciar, com opção de editar. Critério binário: Gate 0 exibe `inferred_scope` e aguarda confirmação do usuário.

```typescript
interface ManagerPreAnalysis {
  manager_confidence: number;          // 0.0–1.0
  clarification_questions?: string[];  // Presente apenas se confidence < 0.85
  inferred_scope: string;              // O que o sistema entendeu — deve ser confirmado pelo usuário
  underlying_question: string;         // A pergunta arquitetural raiz por trás do objetivo
  estimated_complexity: 'low' | 'medium' | 'high';
  architectural_implications: string[]; // Consequências da escolha antes do debate começar
}
```

---

### 2.2 Protocolo de Debate (Proposer → Critic → Judge)

#### Regras Invioláveis do Debate

| ID | Regra | Critério de Aceite |
|---|---|---|
| **D-01** | Round 1 é sempre paralelo — Propositor e Crítico não veem a resposta um do outro | `round.proposer.timestamp` e `round.critic.timestamp` diferem < 500ms do início do round |
| **D-02** | Máximo de 3 rounds por sessão | `DebateSession.rounds.length <= 3`; Round 4 nunca é criado |
| **D-03** | Confidence Gating: convergência requer AMBAS as condições | `proposer.confidence_score >= 0.95` **AND** `critic.verdict == 'APPROVE'` → status `CONVERGED`. **v2.2:** Apenas uma das condições NÃO é suficiente. O Crítico deve confirmar independentemente. |
| **D-04** | O Árbitro nunca escolhe um lado — executa Síntese Dialética (ver abaixo) | `arbiter_check.decision` nunca contém `"sided_with_proposer"` ou `"sided_with_critic"` |
| **D-05** | FORCE_DECISION após Round 3 sem consenso — sempre escala para o usuário | `round == 3 AND open_high_severity > 0` → `decision: 'FORCE_DECISION'`; HITL Gate obrigatório |
| **D-06** | Issues severity "high" bloqueiam convergência | `open_high_severity_issues > 0` → `decision` nunca é `'CONVERGE'` |
| **D-07** | Árbitro usa modelo Pro; debatedores usam Flash ou Flash-Lite | `judge.model` começa com `gemini-2.5-pro`; `proposer.model` e `critic.model` são Flash |
| **D-08** | Cada agente opera em worktree isolado | `worktreePath` distintos; O Árbitro (Judge) opera em um Worktree Efêmero/Read-Only (Zero-Trust). |
| **D-09** | Estado do debate é persistido antes de qualquer HITL Gate | `DebateSession.status` é `IN_PROGRESS` no DB antes do evento `HITL_GATE` ser emitido via SSE |
| **D-10** | Abort preserva estado para auditoria | Após `ABORT_AGENT`, `DebateSession.status == 'ABORTED'` e todos os rounds anteriores permanecem no DB |
| **D-11** | O Árbitro identifica a `underlying_question` antes de sintetizar | `arbiter_check.underlying_question` é campo obrigatório — nunca `null` ou vazio |
| **D-12** | Em FORCE_DECISION, o Árbitro expõe a tensão fundamental, não apenas opções | Payload contém `fundamental_tension` + `choosing_A_means` + `choosing_B_means` |

#### Síntese Dialética do Árbitro (D-04 e D-11)

O Árbitro não é um juiz de tribunal que escolhe o lado vencedor. É um **Sintetizador Dialético**: sua função é encontrar a tensão intelectual real por trás das posições em debate e produzir uma síntese que resolve essa tensão — não que declara um vencedor.

**Protocolo de 3 etapas (obrigatório):**

| Etapa | Pergunta que o Árbitro deve responder | Campo no output |
|---|---|---|
| **1. Identificação da tensão** | *"O que está realmente em disputa aqui — além dos sintomas técnicos?"* Ex: o debate RS256 vs HS256 não é sobre criptografia, é sobre **modelo de confiança distribuída**. | `underlying_question` |
| **2. Teste contra princípios** | *"Qual posição é mais consistente com os `constraints` do agente e os requisitos do projeto?"* | `principle_alignment` |
| **3. Síntese construtiva** | Produz uma posição que reconhece o ponto mais forte de cada lado e resolve a tensão — sem ser um meio-termo preguiçoso. | `synthesis` |

**Em FORCE_DECISION (D-12):** O Árbitro não apresenta "Caminho A ou B" como se fossem opções equivalentes. Apresenta:
- `fundamental_tension`: *"A tensão é entre velocidade de implementação e robustez de segurança."*
- `choosing_A_means`: *"Se você prioriza time-to-market, escolha HS256 e aceite a restrição de single-server."*
- `choosing_B_means`: *"Se você projeta para distribuição futura, escolha RS256 agora e pague o custo de setup."*

Isso transforma uma falha do sistema (debate sem consenso) em uma **ferramenta de decisão arquitetural** para o usuário.

#### Schema de Evento por Round

```typescript
interface DebateRound {
  round: number;
  proposer: {
    agent: string;
    confidence_score: number;   // 0.0–1.0
    code?: string;
    rationale: string;
    known_tradeoffs: string[];
  };
  critic: {
    agent: string;
    verdict: 'APPROVE' | 'REJECT' | 'CONDITIONAL';
    issues: DebateIssue[];
  };
  arbiter_check: {
    agent: string;
    open_high_severity_issues: number;
    decision: 'CONVERGE' | 'ESCALATE' | 'FORCE_DECISION';
    // Síntese Dialética (D-11 — sempre obrigatório)
    underlying_question: string;       // A tensão intelectual real por trás do debate
    principle_alignment: string;       // Qual posição é mais consistente com os constraints do projeto
    synthesis: string;                 // Posição construída — não um meio-termo, mas resolução da tensão
    notes?: string;
    final_synthesis?: string;
    // FORCE_DECISION (D-12 — obrigatório quando decision == 'FORCE_DECISION')
    fundamental_tension?: string;      // "A tensão é entre X e Y"
    choosing_A_means?: string;         // Consequências de escolher a proposta do Propositor
    choosing_B_means?: string;         // Consequências de escolher a posição do Crítico
  };

}

interface DebateIssue {
  issue_id: string;
  category: 'security' | 'performance' | 'maintainability' | 'correctness';
  description: string;
  severity: 'high' | 'medium' | 'low';
  suggested_fix: string;
}
```

---

### 2.3 HITL Gate 1 — Approval Card com Rationale em 3 Camadas

**Descrição:** Após a Síntese Dialética do Árbitro, o sistema pausa. O Approval Card não é apenas uma lista de tarefas — é um **documento de raciocínio** que expõe o *Porquê* em 3 camadas, permitindo que o usuário valide não apenas o *O Quê*, mas a lógica que levou até ali.

**Critério de aceite (RF-03):** O Approval Card DEVE exibir `underlying_question` e `rationale_layer_2` antes que o usuário possa clicar em `APROVAR`. Critério binário: botão `APROVAR` fica desabilitado até que o usuário expanda o Nível 2 (rationale).

#### Nível 1 — Executive Summary (sempre visível)

```
🟡 AGUARDANDO APROVAÇÃO — Sessão #gf-2026-001
Tarefa: "Implementar JWT Authentication Middleware"
Debate: Convergência em Round 2/3 ✅

🧠 Questão Arquitetural Resolvida:
   "Qual modelo de confiança se aplica a esta arquitetura?"
   → Resposta do Árbitro: RS256 com chaves assimétricas + Redis cache (15min TTL)

⚠️  1 RED FLAG detectado → ver Seção 3
Estimativa: ~850 tokens | ~2.1s | Risco: MÉDIO

[✅ APROVAR E GERAR CÓDIGO]  [✏️ EDITAR PLANO]
[🔄 MAIS UMA RODADA]         [❌ REJEITAR]
```

#### Nível 2 — Rationale em 3 Camadas (expansível — desbloqueio do botão APROVAR)

| Camada | Pergunta respondida | Exemplo |
|---|---|---|
| **Camada 1 — O Quê** | O que será construído e qual impacto esperado? | *"Middleware JWT com RS256. Protege todas as rotas autenticadas. Impacto: 0 rotas públicas afetadas."* |
| **Camada 2 — Por Quê esta abordagem** | Por que esta solução e não as alternativas consideradas no debate? | *"HS256 foi rejeitado porque o sistema tem 2+ serviços que precisam verificar tokens independentemente — chave simétrica criaria acoplamento de segredo."* |
| **Camada 3 — Trade-offs assumidos** | O que esta escolha sacrifica? Quando pode estar errada? | *"RS256 exige gerenciamento de par de chaves. Se o sistema nunca for distribuído, HS256 seria suficiente. Esta escolha assume crescimento horizontal."* |

#### Nível 3 — Plan Breakdown + Red Flags + Diffs (expansível por item)

- Lista de fases com arquivos e tags `[NOVO]` / `[EDITADO]` / `[DELETADO]`
- Red Flags com severidade e explicação do Árbitro sobre impacto específico
- Diffs inline ±3 linhas de contexto

**Payload do Approval Card:**
```typescript
interface ApprovalCardPayload {
  sessionId: string;
  task: string;
  executiveSummary: {
    debateResult: {
      convergenceRound: number;
      totalRounds: number;
      converged: boolean;
    };
    arbiterDecision: string;
    redFlagCount: number;
    // v2.2 — vuln #8: estimativa é especulativa — comunicar ao usuário
    estimatedTokens: number;
    estimatedTokensWarning: string; // Ex: "Estimativa com margem de erro de ±30%. Custo real após geração."
    riskLevel: 'low' | 'medium' | 'high';
    // v2.2: Se perTaskBudgetTokens < 30% disponível, exibir alerta antes da aprovação
    budgetWarning?: string; // Ex: "Atenção: budget restante pode ser insuficiente para a geração."
  };
  phases: ImplementationPhase[];
  redFlags: RedFlag[];
  estimatedCost: { tokens: number; timeSeconds: number };
}

interface ImplementationPhase {
  name: string;
  files: { path: string; action: 'create' | 'edit' | 'delete'; isRedFlag: boolean }[];
}

interface RedFlag {
  severity: 'critical' | 'high' | 'medium';
  category: string;
  file: string;
  arbiterExplanation: string;
}
```

---

### 2.4 HITL Gate 2 — DiffLens (Chunk-Based)

**Descrição:** Após a geração de código, o usuário revisa as mudanças por chunk de diff antes do merge.

**Comportamento:**
- Cada chunk exibe: linhas removidas (vermelho), linhas adicionadas (verde), ±3 linhas de contexto adjacente
- Ações por chunk: `[✅ Aceitar]` / `[❌ Rejeitar]` / `[✏️ Editar]`
- Barra de progresso: "N de M chunks aprovados"
- **Análise Estática de Diffs:** Se um chunk for rejeitado, o sistema realiza uma análise estática (AST) para detectar "Dependências Órfãs" (ex: importar uma função cujo chunk de definição foi rejeitado) e alerta o usuário antes de permitir o merge.
- Botão global `[Aceitar Todos os Chunks Restantes]` — disponível **apenas** se nenhum chunk tiver Red Flag de severidade CRÍTICO ou ALTO
- Chunks com Red Flag sempre requerem revisão individual

```typescript
interface ChunkDiff {
  chunkId: string;
  filePath: string;
  startLine: number;
  removedLines: string[];
  addedLines: string[];
  contextLines: { before: string[]; after: string[] }; // ±3 linhas
  isRedFlag: boolean;
  redFlagSeverity?: 'critical' | 'high' | 'medium';
  status: 'pending' | 'accepted' | 'rejected' | 'edited';
}
```

#### Regra Técnica Estrita: Análise AST de Dependências Órfãs em Chunks Rejeitados (v2.3)

> **Problema:** Quando o operador humano rejeita um chunk no Gate 2, ele pode estar rejeitando a *definição* de um símbolo (função, classe, constante) que outros chunks aprovados já *importam ou invocam*. O merge resultante quebraria o build sem aviso prévio.

**Protocolo obrigatório ao rejeitar um chunk:**

```typescript
// src/core/DiffLens/OrphanDetector.ts
// Executado SINCRONICAMENTE quando o usuário clica em [❌ Rejeitar] em qualquer ChunkDiff

export interface OrphanAnalysisResult {
  hasOrphans: boolean;
  orphans: Array<{
    symbol: string;          // Nome do símbolo: "parseJwtPayload", "AuthConfig", etc.
    definedInChunk: string;  // chunkId do chunk rejeitado
    referencedInChunks: string[]; // chunkIds dos chunks aprovados que usam o símbolo
    referencedInFiles: string[];  // Arquivos que importam o símbolo
  }>;
  blocksMerge: boolean;      // true se algum símbolo é usado em chunk APPROVED
}

export async function detectOrphanedDependencies(
  rejectedChunk: ChunkDiff,
  allChunks: ChunkDiff[],
  projectRoot: string
): Promise<OrphanAnalysisResult> {
  // 1. Parsear os addedLines do chunk rejeitado via tree-sitter
  //    para extrair todos os símbolos DEFINIDOS (FunctionDeclaration,
  //    ClassDeclaration, VariableDeclaration com export)
  const definedSymbols = await extractDefinedSymbols(rejectedChunk.addedLines);

  if (definedSymbols.length === 0) {
    return { hasOrphans: false, orphans: [], blocksMerge: false };
  }

  // 2. Para cada símbolo definido, buscar referências em:
  //    a) Chunks com status 'accepted' na sessão atual
  //    b) Arquivos existentes do projeto (search_codebase)
  const orphans: OrphanAnalysisResult['orphans'] = [];

  for (const symbol of definedSymbols) {
    const referencedInChunks = allChunks
      .filter(c => c.status === 'accepted' && chunkReferencesSymbol(c, symbol))
      .map(c => c.chunkId);

    const referencedInFiles = await searchSymbolInProject(symbol, projectRoot);

    if (referencedInChunks.length > 0 || referencedInFiles.length > 0) {
      orphans.push({ symbol, definedInChunk: rejectedChunk.chunkId, referencedInChunks, referencedInFiles });
    }
  }

  return {
    hasOrphans: orphans.length > 0,
    orphans,
    // O merge é BLOQUEADO se algum símbolo órfão é referenciado em chunk APPROVED
    // (garante que o build não quebrará)
    blocksMerge: orphans.some(o => o.referencedInChunks.length > 0),
  };
}
```

**Comportamento da UI ao detectar órfãos:**

```
Usuário clica [❌ Rejeitar] no chunk que define `parseJwtPayload()`

→ OrphanDetector.detectOrphanedDependencies() executa (< 500ms)

→ SE blocksMerge === true:
   Modal de bloqueio (não pode ser ignorado):
   ┌─────────────────────────────────────────────────────────────┐
   │  ⚠️  DEPENDÊNCIAS ÓRFÃS DETECTADAS — MERGE BLOQUEADO       │
   │  ─────────────────────────────────────────────────────────  │
   │  Ao rejeitar este chunk, os seguintes símbolos ficam        │
   │  indefinidos em chunks já aprovados:                        │
   │                                                             │
   │  • parseJwtPayload — usado em: chunk-03 (auth.ts:L22)      │
   │  • AuthConfig — importado em: chunk-07 (middleware.ts:L5)  │
   │                                                             │
   │  Ações disponíveis:                                         │
   │  [ Revisar Chunks Dependentes ]   [ Cancelar Rejeição ]     │
   │  [ Forçar Rejeição (quebrará o build) ]                     │
   └─────────────────────────────────────────────────────────────┘
   → Pipeline de merge TRAVADO até resolução

→ SE hasOrphans === true mas blocksMerge === false:
   Toast de aviso não-bloqueante (5s):
   "⚠ O símbolo 'parseJwtPayload' era usado em middleware.ts (arquivo existente).
    Certifique-se de que a definição ainda existe no projeto."
   → Merge permitido; responsabilidade é do operador
```

**Critério de aceite (RF-06 expandido):**
- `blocksMerge === true` → botão `[Confirmar Merge]` fica desabilitado até o operador resolver os órfãos
- O estado da análise AST é persistido no `ChunkDiff.status === 'rejected'` com campo `orphanAnalysis?: OrphanAnalysisResult`
- A análise é re-executada se o operador aceitar um chunk que estava marcado como dependente

---

### 2.5 Rollback Pós-Merge

**Descrição:** Após merge aprovado, o usuário tem uma janela de 30 minutos para desfazer a operação diretamente na UI.

**Comportamento:**
- Botão "↩ Desfazer Merge" aparece na Timeline Lateral por 30 minutos após o merge
- Após 30 minutos: movido para "Histórico de Ações" (sempre acessível)
- Clique no botão exibe confirmação: *"Isso irá reverter os arquivos da sessão #gf-xxx. Continuar?"*
- Mecanismo: `git revert HEAD` (não-destrutivo, preserva histórico)
- Após revert: evento SSE `MERGE_REVERTED` atualiza a Timeline

---

### 2.6 Timeline Lateral com Progressive Disclosure

**Descrição:** Painel lateral que exibe o progresso do debate em tempo real sem gerar "log fatigue".

**Camada 1 — Status passivo (sempre visível):**
```
● Agente debatendo arquitetura... (Rodada 2/3)
● Árbitro sintetizando veredito...
✅ Gate 1 aprovado — gerando código
✅ Merge concluído — [↩ Desfazer] (28 min)
```

**Camada 2 — Feed detalhado (on-demand via clique):**
- Balões de fala de cada agente com tokens em streaming via SSE (`AGENT_TOKEN`)
- Issues encontrados pelo Crítico com severity tag
- Veredito do Árbitro com trade-offs explícitos

---

### 2.7 Terminal Integrado

**Descrição:** Terminal full-duplex integrado à IDE, vinculado ao worktree do agente ativo.

**Funcionalidades:**
- **Full-duplex:** usuário digita comandos (stdin) e vê output em tempo real (stdout/stderr)
- **PTY real:** emula terminal completo com suporte a cores ANSI, barras de progresso, Ctrl+C
- **Vinculado ao worktree:** `cwd` inicial é o worktree do agente ativo na sessão
- **Resize dinâmico:** `TERMINAL_RESIZE` sincroniza com o tamanho da janela Xterm.js
- **Multi-sessão:** cada tab do terminal é uma sessão PTY independente

**Mensagens WebSocket:**
```typescript
// Cliente → Servidor
{ type: 'TERMINAL_INIT', worktreePath: string }
{ type: 'TERMINAL_INPUT', data: string }
{ type: 'TERMINAL_RESIZE', cols: number, rows: number }

// Servidor → Cliente
{ type: 'TERMINAL_OUTPUT', data: string }  // dados binários PTY
{ type: 'TERMINAL_EXIT', exitCode: number }
```

---

### 2.8 Histórico de Chat Persistido

**Descrição:** O contexto da conversa é preservado entre sessões da IDE.

**Comportamento:**
- Ao abrir a IDE: lista de `ChatSession` do projeto atual, ordenadas por `updatedAt`
- Usuário pode retomar qualquer sessão anterior
- O contexto da sessão (últimas N mensagens dentro do budget de 128k tokens) é passado ao ManagerAgent na task seguinte
- Sessões são vinculadas ao `projectPath` (caminho do repositório raiz)

---

### 2.9 Catálogo de Tools dos Agentes

Tools disponíveis para declaração no `AGENTS.md`. Cada ferramenta é registrada no `ToolRegistry` e resolvida pelo `AgentFactory` em runtime.

| Tool | Descrição | Permissão mínima |
|---|---|---|
| `read_file` | Lê conteúdo de arquivo do projeto | auto_edit |
| `write_file` | Escreve conteúdo em arquivo | manual |
| `list_directory` | Lista arquivos de um diretório | auto_edit |
| `search_codebase` | Busca por padrão em todos os arquivos | auto_edit |
| `run_linter` | Executa linter (ESLint, etc.) | auto_edit |
| `run_test` | Executa testes unitários | auto_edit |
| `vulnerability_scan` | Análise estática de segurança | auto_edit |
| `execute_shell` | Executa comando shell (SHELL_ALLOWLIST) | manual |
| `read_file_chunk` | Lê arquivo em chunks (> 400 linhas) | auto_edit |
| `list_project_structure` | Estrutura de diretórios até maxDepth | auto_edit |
| `git_diff` | Exibe diff de um arquivo | auto_edit |
| `git_log` | Histórico de commits | auto_edit |

---

### 2.10 Requisitos Funcionais e Regras Invioláveis

#### Requisitos Funcionais (RF)

| ID | Requisito | Critério de Aceite Verificável | Prioridade (MoSCoW) |
|---|---|---|---|
| **RF-01** | Clarificação socrática para objetivos ambíguos | `clarification_questions.length >= 1` quando `manager_confidence < 0.85` | Must |
| **RF-02** | `inferred_scope` confirmado pelo usuário antes do debate | Gate 0 exibe `inferred_scope`; botão "Confirmar" presente | Must |
| **RF-03** | Rationale em 3 camadas no Gate 1 antes de APROVAR | Botão APROVAR desabilitado até Nível 2 ser expandido | Must |
| **RF-04** | Árbitro produz `underlying_question` antes de sintetizar | `arbiter_check.underlying_question` nunca é `null` | Must |
| **RF-05** | FORCE_DECISION expõe tensão fundamental | Payload contém `fundamental_tension`, `choosing_A_means`, `choosing_B_means` | Must |
| **RF-06** | DiffLens aprova por chunk | `ChunkDiff.status` é gerenciado individualmente; Red Flags bloqueiam aceite global | Must |
| **RF-07** | Rollback via `git revert HEAD` com janela de 30 min | `MergeEvent.revertedAt` preenchido; histórico git preservado | Must |
| **RF-08** | Histórico de chat persistido entre sessões | `ChatSession` e `ChatMessage` no Prisma; contexto restaurado ao reabrir | Must |
| **RF-09** | Budget de 1M tokens requer gate de custo explícito | HITL Gate exibe estimativa de custo antes de chamar LLM com budget estendido | Must |
| **RF-10** | Agentes limitados a 3 tentativas de auto-correção | `AutoFixAttempt.attemptNumber <= 3`; escala ao usuário na 4ª falha | Must |
| **RF-11** | Idempotência de decisões HITL | `HITL_DECISION` deve conter `gateId` e `epoch_id`; decisões com `gateId` já processado são descartadas silenciosamente (log de Warning). Re-emissões por reconexão WS não causam execução duplicada. | Must |
| **RF-12** | Validação de Path Traversal no Terminal | Toda inicialização de PTY (`TERMINAL_INIT`) deve validar o path contra `AUTHORIZED_WORKTREES_ROOT` via `path.resolve`. Socket é desconectado em caso de violação. | Must |
| **RF-13** | Allowlist de sub-comandos Shell | Agentes só podem executar binários aprovados COM subcomandos e flags permitidas (ex: `git add` ok, `git config --global` bloqueado) | Must |
| **RF-14** | Orçamento de Tokens por Papel | Cada agente possui um `token_budget` individual definido no `AGENTS.md`; exaustão interrompe o agente e alerta o usuário | Must |
| **RF-15** | Checkpoint Híbrido Atômico | Snapshots de código (git stash) e estado do debate (SQLite) devem ser sincronizados via padrão Saga para evitar divergência pós-crash | Must |
| **RF-16** | Budget por Papel (v2.2 — vuln #9) | O Árbitro (modelo Pro) está limitado a no máximo 20% do `perTaskBudgetTokens`. O sistema verifica disponibilidade de budget antes de iniciar geração de código (pós-Gate 1). | Must |

#### Requisitos Não-Funcionais (RNF)

| ID | Categoria | Requisito | Métrica | Target |
|---|---|---|---|---|
| **RNF-01** | Performance | Primeiro token visível na UI | Latência SSE `AGENT_TOKEN` após start | ≤ 800ms |
| **RNF-02** | Performance | Debate Round 1 completo | Tempo total para ambos os agentes | ≤ 30s |
| **RNF-03** | Segurança | Segredos redatados em todos os outputs | `grep -r 'AIza\|sk-\|Bearer' logs/` | 0 ocorrências |
| **RNF-04** | Segurança | Worktree isolado por agente | `ls .greenforge/worktrees/` mostra N paths distintos para N agentes | Pass |
| **RNF-05** | Observabilidade | Toda chamada LLM registrada | `LLMCallLog` contém entrada para cada `streamGenerate()` | 100% coverage |
| **RNF-06** | Resiliência | Reconnect SSE sem perda de eventos | `Last-Event-ID` replica eventos perdidos ao reconectar | Pass |
| **RNF-07** | Compatibilidade | Node.js mínimo | `process.version >= 'v20.11.0'` verificado no `preflight` | Pass |

#### Regras de Segurança (verificáveis por auditoria)

| ID | Regra | Teste de Verificação |
|---|---|---|
| **S-01** | Nenhum arquivo fora do worktree pode ser modificado | `assertPathWithinProject()` lança exceção para qualquer path externo — teste unitário obrigatório |
| **S-02** | Segredos nunca em logs ou UI | Teste de integração: injetar `GEMINI_API_KEY=AIzaFAKE` e verificar `[REDACTED]` em todos os outputs |
| **S-03** | SHELL_ALLOWLIST restringe comandos | Teste: chamar `execute_shell('wget ...')` → `Error: Comando não permitido` |
| **S-04** | `execute_shell` requer `approval_mode=manual` | Teste: `APPROVAL_MODE=auto_edit` + `execute_shell` → gate de confirmação exibido |
| **S-05** | Rollback via `git revert` apenas (não `reset --hard`) | Inspeção: `git log` após rollback mostra commit de revert, não histórico apagado |
| **S-06** | Debate persistido antes de HITL Gate | Teste: matar processo após `HITL_GATE` SSE → DB contém sessão com status `IN_PROGRESS` |
| **S-07** | `manager_confidence` configurável via `AGENTS.md` | Teste: alterar `clarity_threshold: 0.5` → clarificação ativa para objetivos antes considerados claros |
| **S-08** | Budget 1M requer gate de custo | Teste: `contextBudget = 1_000_000` → evento `HITL_GATE` com `gateType: 'COST_APPROVAL'` antes de qualquer chamada LLM |
| **S-09** | Worktrees limpos após merge ou abort | Teste: completar sessão → `ls .greenforge/worktrees/` não contém o path da sessão encerrada |
| **S-10** | AutoFixLimiter ≤ 3 tentativas | Teste: forçar falha repetida → na 4ª tentativa, evento `HITL_GATE` com `gateType: 'MAX_RETRIES_REACHED'` |

# GreenForge Agent — 06: API e Extensibilidade

> **Status:** ✅ | **Versão:** 2.2 | **Data:** 2026-05-13  
> **Referências:** OpenAI AGENTS.md Standard (AAIF), CrewAI agents.yaml, ForgeCode agent.md, SKILL.md spec

### 📋 Changelog v2.1.1 → v2.2
| Vuln | Correção |
|---|---|
| #2 | Reorder Buffer: spec completa do protocolo client-side com timeout de 5s |
| #7 | Memory Leak: `onSessionTerminated()` remove eventLog e reorderBuffer |
| #17 | `STEER_AGENT`: contrato de efeito completo documentado |

---

## 1. Protocolo SSE — Eventos do Servidor

Endpoint: `GET /events/debate/:sessionId`  
Content-Type: `text/event-stream`  
Reconexão: automática via `Last-Event-ID` header (browser nativo)

**Prevenção de Memory Leak:** Cada conexão SSE deve obrigatoriamente atrelar um `AbortController` ao `req.signal.addEventListener('abort', cleanup)` para remover listeners do `EventLog` imediatamente após desconexão.

#### Contrato Técnico: AbortController Acoplado ao `req.signal` (v2.3)

```typescript
// src/transport/SSETransport.ts — Padrão obrigatório de prevenção de memory leak
export function handleSSEConnection(req: Request, res: Response): void {
  const connectionId = `sse-${req.params.sessionId}-${Date.now()}`;

  // Headers SSE obrigatórios
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Desabilita buffering em Nginx
  res.flushHeaders();

  // AbortController acoplado ao sinal de desconexão da request
  const controller = new AbortController();
  const { signal } = controller;

  GracefulShutdown.registerSSEClient({ id: connectionId, response: res });

  // CONTRATO CRÍTICO: req.signal dispara IMEDIATAMENTE no TCP RST/aba fechada
  // Não espera garbage collector — cleanup determinístico
  req.signal.addEventListener('abort', () => {
    controller.abort();
    eventLog.removeAllListenersForConnection(connectionId);
    GracefulShutdown.deregisterSSEClient({ id: connectionId, response: res });
  }, { once: true }); // { once: true } previne leak do próprio listener

  // Heartbeat a cada 15s para prevenir timeout de proxies
  const heartbeat = setInterval(() => {
    if (signal.aborted) { clearInterval(heartbeat); return; }
    try { res.write(': keep-alive\n\n'); } catch { clearInterval(heartbeat); }
  }, 15_000);

  // Subscrever eventos passando o AbortSignal para cancelamento automático
  eventLog.subscribe(req.params.sessionId, (event) => {
    if (signal.aborted) return;
    try {
      res.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
    } catch { controller.abort(); }
  }, { signal });
}

// TTL de segurança: cleanup automático de conexões zumbi após 24h
// Cobre casos onde req.signal falha (crash de processo, conexão irrecuperável)
const SSE_MAX_AGE_MS = parseInt(process.env['SSE_EVENT_MAX_AGE_MS'] ?? '86400000');
setInterval(() => {
  const now = Date.now();
  for (const [id, conn] of activeConnections) {
    if (now - parseInt(id.split('-').pop()!) > SSE_MAX_AGE_MS) conn.controller.abort();
  }
}, 60_000);
```

> **v2.2 — vuln #7:** Além do cleanup de listeners, o `EventLog` da sessão é completamente removido da memória quando a `DebateSession` atinge status `COMPLETED`, `ABORTED` ou `MERGED`. O `SSETransport.onSessionTerminated(sessionId)` DEVE ser chamado pelo `DebateOrchestrator` ao transitar para qualquer um desses estados. Um TTL de 24h (configurável via `SSE_EVENT_MAX_AGE_MS`) garante limpeza even se o callback for perdido.

### 1.1 Catálogo de Eventos

#### `AGENT_TOKEN`
Streaming token-a-token de um agente durante o debate.
```json
{
  "seq_id": 42,
  "epoch_id": 1704060000000,
  "type": "AGENT_TOKEN",
  "payload": {
    "agentId": "technical_proposer",
    "debateRole": "proposer",
    "round": 1,
    "token": " authentication",
    "isLast": false
  }
}
```

#### `DEBATE_STATUS`
Atualização de estado do debate (rodada, agente ativo, progresso).
```json
{
  "id": 43,
  "type": "DEBATE_STATUS",
  "payload": {
    "sessionId": "gf-2026-001",
    "currentRound": 2,
    "maxRounds": 3,
    "activeAgent": "quality_critic",
    "status": "IN_PROGRESS"
  }
}
```

#### `ISSUE_FOUND`
Issue detectado pelo Crítico durante análise.
```json
{
  "id": 44,
  "type": "ISSUE_FOUND",
  "payload": {
    "issueId": "sec-001",
    "agentId": "quality_critic",
    "category": "security",
    "severity": "high",
    "description": "HS256 usa chave simétrica — inadequado para sistemas distribuídos",
    "suggestedFix": "Usar RS256 com chaves assimétricas"
  }
}
```

#### `HITL_GATE`
Pausa para aprovação humana. Inclui payload completo do Approval Card.
```json
{
  "id": 45,
  "type": "HITL_GATE",
  "payload": {
    "gateId": "gate-1-gf-2026-001",
    "gateType": "SYNTHESIS_APPROVAL",
    "sessionId": "gf-2026-001",
    "approvalCard": { /* ApprovalCardPayload completo */ }
  }
}
```

#### `CONVERGENCE`
Debate encerrado com veredito do Árbitro.
```json
{
  "id": 46,
  "type": "CONVERGENCE",
  "payload": {
    "sessionId": "gf-2026-001",
    "approvedRound": 2,
    "terminatedBy": "zero_high_severity_issues",
    "synthesis": "Aceitar proposta do Round 2 com RS256 + Redis cache"
  }
}
```

#### `DEBATE_COMPLETE`
Sessão encerrada após merge aprovado.
```json
{
  "id": 47,
  "type": "DEBATE_COMPLETE",
  "payload": {
    "sessionId": "gf-2026-001",
    "filesChanged": 8,
    "mergeEventId": "merge-abc123",
    "totalTokens": 9300,
    "durationMs": 12400
  }
}
```

#### `ROLLBACK_EVENT` (Novo - Audit de Estresse)
Evento disparado quando verificações pós-aprovação falham e o estado é revertido.
```json
{
  "id": 49,
  "type": "ROLLBACK_EVENT",
  "payload": {
    "checkpointId": "ckpt-abc",
    "failureType": "TEST_FAILURE",
    "diagnosis": {
      "rollbackReason": "TEST_FAILURE",
      "newRoundInstruction": "O código falhou em jwtMiddleware.test.ts. Resolva o erro..."
    }
  },
  "_meta": {
    "seq": 105,
    "epoch_id": 1704060000000,
    "channel": "SSE",
    "serverTimestamp": 1704067200000
  }
}
```

#### `KEEP_ALIVE`
Heartbeat a cada 15s para prevenir timeout de proxies (comentário SSE).
```
: keep-alive
```

### 1.2 Estrutura de Metadados Globais

> **Regra de Sincronização:** Todo evento emitido (SSE ou WebSocket) deve incluir o objeto `_meta`.

```typescript
interface EventMetadata {
  seq: number;              // Sequence ID monotonicamente crescente
  epoch_id: number;         // Timestamp de boot (invalida buffers do cliente em restarts)
  channel: 'SSE' | 'WS';
  serverTimestamp: number;  // Timestamp Unix (ms)
  sessionId: string;
}
```

### 1.3 Protocolo de Reorder Buffer no Cliente (v2.2 — vuln #2)

O frontend SDK DEVE implementar um Reorder Buffer para lidar com eventos SSE fora de ordem:

```typescript
// Frontend: src/lib/ReorderBuffer.ts
const REORDER_TIMEOUT_MS = 5000; // Configurável, deve corresponder ao servidor

class ClientReorderBuffer {
  private pending: Map<number, DebateEvent> = new Map();
  private nextExpected = 0;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  push(event: DebateEvent, onReady: (e: DebateEvent) => void): void {
    this.pending.set(event.seq_id, event);
    this.flush(onReady);
    // Inicia timeout para o próximo seq_id esperado se ainda não chegou
    if (this.pending.size > 0 && !this.timeout) {
      this.timeout = setTimeout(() => {
        // Ação determinística: loga Warning, avança nextExpected, emite o que tem
        console.warn(`[ReorderBuffer] Timeout: seq_id=${this.nextExpected} não recebido. Descartando gap.`);
        this.nextExpected++;
        this.flush(onReady);
        this.timeout = null;
      }, REORDER_TIMEOUT_MS);
    }
  }

  private flush(onReady: (e: DebateEvent) => void): void {
    while (this.pending.has(this.nextExpected)) {
      const event = this.pending.get(this.nextExpected)!;
      this.pending.delete(this.nextExpected);
      this.nextExpected++;
      if (this.timeout) { clearTimeout(this.timeout); this.timeout = null; }
      onReady(event);
    }
  }
}
```

---

## 2. Protocolo WebSocket — Mensagens Bidirecionais

Servidor: Socket.IO na mesma porta 5174  
Namespace: `/` (default)  
Transport forçado: `websocket` (sem long-polling fallback)

### 2.1 Cliente → Servidor

| Evento | Payload | Descrição |
|---|---|---|
| `TERMINAL_INIT` | `{ worktreePath: string }` | Inicializa PTY no worktree do agente (path validado via `path.resolve`) |
| `TERMINAL_INPUT` | `string` | stdin do usuário para o PTY |
| `TERMINAL_RESIZE` | `{ cols: number, rows: number }` | Redimensiona a janela do terminal |
| `HITL_DECISION` | `HITLDecision` | Decisão de aprovação/rejeição do Gate (requer `epoch_id`; idempotente por `gateId`) |
| `ABORT_AGENT` | `{ agentId: string, sessionId: string }` | Interrompe agente em execução |
| `STEER_AGENT` | `{ agentId: string, instruction: string, epoch_id: number, sessionId: string }` | **v2.2 — Contrato de Efeito:** (a) só permitido ENTRE rounds (não durante streaming ativo); (b) servidor cria `Checkpoint` antes de aplicar; (c) instrução persistida no `DebateRound` para auditoria; (d) output parcial do round anterior descartado e marcado `STEERED`. |

#### Schema `HITLDecision`
```typescript
interface HITLDecision {
  gateId: string;
  sessionId: string;
  epoch_id: number;           // Fencing token (validado contra ServerEpoch no SQLite)
  decision: 'APPROVE' | 'REJECT' | 'NEW_ROUND' | 'EDIT';
  userNote?: string;
  approvedChunks?: string[];  // IDs de ChunkDiff aceitos no Gate 2 (DiffLens)
  rejectedChunks?: string[];  // IDs de ChunkDiff rejeitados
}
```

### 2.2 Servidor → Cliente

| Evento | Payload | Descrição |
|---|---|---|
| `TERMINAL_OUTPUT` | `string` | stdout/stderr do PTY (dados binários) |
| `TERMINAL_EXIT` | `{ exitCode: number }` | PTY encerrado |
| `AGENT_ABORTED` | `{ agentId, timestamp }` | Confirmação de abort |

---

## 3. API HTTP

### 3.1 Endpoints Principais

| Método | Path | Descrição |
|---|---|---|
| `GET` | `/health` | Health check de todos os componentes |
| `POST` | `/api/debate/start` | Inicia nova sessão de debate |
| `GET` | `/api/debate/:sessionId` | Retorna estado atual da sessão |
| `POST` | `/api/debate/:sessionId/abort` | Aborta sessão em andamento |
| `POST` | `/api/chat/sessions` | Cria nova ChatSession |
| `GET` | `/api/chat/sessions` | Lista ChatSessions do projeto |
| `GET` | `/api/chat/sessions/:id/messages` | Mensagens de uma ChatSession |
| `GET` | `/api/agents` | Lista agentes carregados do AGENTS.md |
| `POST` | `/api/agents/reload` | Hot reload do AGENTS.md |
| `GET` | `/api/tokens/usage` | Uso de tokens do dia |
| `POST` | `/api/gc` | Executa Garbage Collection |

### 3.2 POST /api/debate/start

```typescript
// Request body
interface DebateStartRequest {
  goal: string;               // Objetivo em linguagem natural
  chatSessionId?: string;     // Vincula ao histórico de chat
  approvalMode?: 'manual' | 'auto_edit' | 'yolo';
  maxRounds?: number;         // Override do MAX_DEBATE_ROUNDS
  contextBudget?: number;     // Override do CONTEXT_TOKEN_BUDGET
  skills?: string[];          // Skills adicionais (futuro)
}

// Response
interface DebateStartResponse {
  sessionId: string;
  sseUrl: string;             // /events/debate/:sessionId
  clarificationRequired: boolean;
  clarificationQuestions?: string[]; // Se manager_confidence < 0.85
  managerConfidence: number;
}
```

### 3.3 GET /health

```json
{
  "status": "healthy",
  "components": {
    "AgentFactory": true,
    "SSETransport": true,
    "WebSocketTransport": true,
    "PrismaClient": true,
    "GitWorktreeManager": true
  },
  "agentsLoaded": 3,
  "activeDebates": 1,
  "uptime": 3600
}
```

---

## 4. Schema do AGENTS.md

### 4.1 Filosofia

O `AGENTS.md` é o arquivo de configuração declarativa dos agentes. Segue o padrão aberto emergente (OpenAI AGENTS.md / AAIF), adotado por > 60.000 projetos open-source desde agosto de 2025, incluindo Amp, Codex, Cursor, Devin, Gemini CLI e GitHub Copilot.

**Estrutura:** YAML Frontmatter (metadados de máquina) + Markdown body (system prompt).

### 4.2 Campos Obrigatórios

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `string` | Identificador único no arquivo |
| `title` | `string` | Nome legível do agente |
| `role` | `string` | Persona descritiva |
| `debate_role` | `proposer\|critic\|judge\|observer` | Papel no protocolo de debate |
| `model` | `AgentModel` | Modelo LLM a usar |
| `enabled` | `boolean` | `false` = excluído sem deletar |

### 4.3 Campos Opcionais

| Campo | Tipo | Padrão | Descrição |
|---|---|---|---|
| `version` | `string` | `"1.0.0"` | Versão do agente |
| `temperature` | `number` | `0.7` | 0.0–1.0 |
| `max_tokens` | `number` | `4096` | Máximo de tokens na resposta |
| `tools` | `string[]` | `[]` | Nomes de tools do ToolRegistry |
| `constraints` | `string[]` | `[]` | Restrições em linguagem natural |
| `debate_config.responds_to` | `string[]` | `[]` | IDs de agentes cujo output este lê |
| `debate_config.output_schema` | `string` | — | Schema do output esperado |
| `debate_config.activation_trigger` | `string` | — | Condição declarativa via DSL Segura (eval é proibido) |
| `debate_config.convergence_trigger` | `string` | — | Critério de convergência (Judge) |
| `debate_config.clarity_threshold` | `number` | `0.85` | Threshold de confiança (Judge) |

### 4.4 Exemplo Completo

```markdown
<!--
  GREENFORGE AGENTS.md
  O AgentFactory escaneia este arquivo na inicialização.
  Para adicionar um agente: copie um bloco e edite.
  Para desativar: mude enabled para false.
-->

---
# ============================================================
# AGENTE 1: PROPOSITOR TÉCNICO (CORE — NÃO REMOVER)
# ============================================================
id: technical_proposer
version: "1.0.0"
enabled: true

title: "Technical Proposer"
role: "Engenheiro Sênior de Software"
debate_role: proposer

model: gemini-2.5-flash
temperature: 0.7
max_tokens: 4096

tools:
  - read_file
  - write_file
  - run_linter
  - search_codebase

constraints:
  - "NUNCA execute comandos destrutivos (rm, DROP, delete)"
  - "NUNCA exponha variáveis de ambiente em código gerado"

debate_config:
  responds_to: []
  output_schema: code_proposal
---

## 🟦 Technical Proposer — System Prompt

Você é um **Engenheiro Sênior de Software** com 10+ anos de experiência.
Sua função no GreenForge é **propor a implementação técnica mais eficiente**
para o requisito dado.

### Sua Missão
- Gere código funcional, testável e seguro
- Justifique cada decisão arquitetural com evidências técnicas
- Priorize: 1) Correção, 2) Segurança, 3) Performance, 4) Legibilidade

### Formato de Saída Obrigatório
```json
{
  "proposal_id": "<uuid>",
  "confidence_score": 0.0,
  "code": "<implementação>",
  "rationale": {
    "layer_1_what": "<o que será construído>",
    "layer_2_why": "<justificativa técnica e alternativas rejeitadas>",
    "layer_3_tradeoffs": "<consequências e limites da solução>"
  },
  "known_tradeoffs": ["<tradeoff 1>"]
}
```

---
# ============================================================
# AGENTE 2: CRÍTICO DE QUALIDADE (CORE — NÃO REMOVER)
# ============================================================
id: quality_critic
version: "1.0.0"
enabled: true

title: "Quality Critic"
role: "Engenheiro de Segurança e QA Sênior"
debate_role: critic

model: gemini-2.5-flash-lite
temperature: 0.3
max_tokens: 2048

tools:
  - read_file
  - vulnerability_scan
  - run_test
  - search_codebase

constraints:
  - "NUNCA aprove código com severity HIGH sem revisão explícita do Juiz"
  - "SEMPRE forneça suggested_fix para cada issue encontrado"

debate_config:
  responds_to: [technical_proposer]
  output_schema: critique_report
---

### 2.4 Stop Rule no Critic (NEXUS Part 3.2)

Se o Crítico encontrar uma ambiguidade insolúvel no `code_proposal` que impeça uma avaliação justa, ele **DEVE** acionar a Stop Rule.

```typescript
interface CritiqueReport {
  verdict: 'APPROVE' | 'REJECT' | 'CONDITIONAL' | 'AMBIGUITY_HALT';
  ambiguity_detected?: {
    question: string;            // A dúvida que impede o progresso
    impact: string;              // Por que esta dúvida é bloqueante
    suggested_options: string[]; // Caminhos possíveis para o usuário escolher
  };
  issues: DebateIssue[];
}
```

Quando `verdict == 'AMBIGUITY_HALT'`, o `DebateOrchestrator` pausa imediatamente o debate e emite um `HITL_GATE` especial do tipo `CRITIC_CLARIFICATION`.

---


---
# ============================================================
# AGENTE 3: ÁRBITRO SINTETIZADOR (CORE — NÃO REMOVER)
# ============================================================
id: debate_judge
version: "1.0.0"
enabled: true

title: "Debate Judge"
role: "Arquiteto de Software Principal"
debate_role: judge

model: gemini-2.5-pro
temperature: 0.2
max_tokens: 8192

tools:
  - read_file
  - search_codebase

constraints:
  - "NUNCA escolha um lado — sintetize a posição mais defensável"
  - "SEMPRE produza trade-offs explícitos na decisão final"

debate_config:
  responds_to: [technical_proposer, quality_critic]
  output_schema: synthesis_decision
  convergence_trigger: zero_high_severity_issues
  clarity_threshold: 0.85
---

## 🟨 Debate Judge — System Prompt

Você é um **Arquiteto de Software Principal** e **Mentor Analítico**.
Sua função **NÃO É** escolher um lado, mas executar uma **Síntese Dialética** que resolve a tensão intelectual entre as propostas.

### Protocolo de Síntese Dialética
1. **Identifique a Tensão Fundamental:** O que está realmente em disputa? (Ex: Velocidade vs. Segurança).
2. **Avalie contra Princípios:** Qual posição é mais coerente com a visão de longo prazo do projeto?
3. **Produza a Síntese:** Construa uma decisão que incorpore o insight mais forte de cada lado, resolvendo a tensão sem comprometer a integridade técnica.

### Glossário de Termos Estruturais
| Termo | Descrição |
|---|---|
| **Progressive Disclosure** | Padrão de UI que prioriza a síntese executiva, ocultando a densidade técnica sob demanda. |
| **Underlying Question** | A questão arquitetural raiz que motiva o debate, identificada pelo Árbitro. |
| **Fundamental Tension** | A disputa intelectual real (ex: Performance vs. Segurança) por trás de um impasse técnico. |
| **Dialetical Anchor** | O rastro imutável de "Quem decidiu o quê e por que", preservado durante compressões de contexto. |
| **Sequence Number / Epoch ID** | `seq_id` global (SQLite) para reordenar eventos via Reorder Buffer e `epoch_id` (fencing token) para invalidar decisões de sessões obsoletas. |
| **Checkpoint Híbrido** | Snapshot atômico de código (git stash) e memória (SQLite) criado via padrão Saga. |
| **Agent Diagnosis** | Relatório estruturado de falha enviado ao agente após rollback atômico. |

### Formato de Saída Obrigatório
```json
{
  "decision": "CONVERGE|ESCALATE|FORCE_DECISION",
  "underlying_question": "<a pergunta arquitetural raiz>",
  "fundamental_tension": "<descrição da disputa intelectual>",
  "synthesis": "<posição construída e justificada>",
  "principle_alignment": "<como a decisão se alinha aos constraints>",
  "approved_round": 0,
  "final_code_delta": "<mudanças aprovadas>"
}
```
```

---


## 5. Sistema de Extensão de Agentes

### 5.1 Adicionando um Novo Agente

Nenhum arquivo TypeScript precisa ser editado. Apenas adicione um bloco ao `AGENTS.md`:

```markdown
---
id: performance_optimizer
version: "1.0.0"
enabled: true

title: "Performance Optimizer"
role: "Engenheiro de Performance e Otimização"
debate_role: observer   # ← observers recebem contexto mas não votam

model: gemini-2.5-flash-lite
temperature: 0.2
max_tokens: 2048

tools:
  - read_file
  - search_codebase

constraints:
  - "APENAS comente em aspectos de performance"
  - "Use notação Big-O para todas as análises"

debate_config:
  responds_to: [technical_proposer]
  output_schema: performance_report
  # O uso de eval() ou string eval é bloqueado. DSL declarativa estrita.
  activation_trigger:
    condition: any
    rules:
      - field: task.context
        operator: contains
        value: "performance"
      - field: task.context
        operator: contains
        value: "scale"
---

## ⚡ Performance Optimizer — System Prompt

Você é um **Engenheiro de Performance** especializado em otimização de sistemas.
Ative apenas quando o contexto envolver performance ou escala.

Analise: complexidade algorítmica (Big-O), uso de memória, padrões de I/O, caching.
```

```typescript
// Hot reload sem reiniciar o servidor
await agentFactory.reload();
const perfAgent = agentFactory.getAgent('performance_optimizer');
// → Disponível imediatamente
```

### 5.2 ToolRegistry — Adicionando Tools

```typescript
// src/core/ToolRegistry.ts

ToolRegistry.getInstance().register({
  name: 'semgrep_scan',
  description: 'SAST security scan via semgrep CLI',
  execute: async (code: string) => {
    return execSync(`semgrep --config=auto --json ${code}`).toString();
  },
});

// No AGENTS.md do agente que quer usar:
// tools:
//   - semgrep_scan
```

---

## 6. Sistema de Hooks

Hooks permitem integrar o GreenForge com sistemas externos sem alterar o código core.

```typescript
// Pontos de hook disponíveis
type HookPoint =
  | 'debate:before-start'     // Antes do debate começar
  | 'debate:round-complete'   // Após cada round
  | 'debate:converged'        // Quando convergência é atingida
  | 'hitl:gate-presented'     // Quando HITL Gate é exibido ao usuário
  | 'hitl:decision-received'  // Quando usuário toma decisão
  | 'merge:before'            // Antes do merge
  | 'merge:after'             // Após merge bem-sucedido
  | 'merge:reverted'          // Após rollback
  | 'gc:completed';           // Após GC

// Exemplo: notificação no Slack após merge
hookRegistry.on('merge:after', async (event) => {
  // Governança NEXUS: Hooks são executados em sandbox isolada
  // e não têm permissão de escrita no sistema de arquivos core.
  await slackClient.send({
    channel: '#greenforge',
    text: `✅ Merge concluído: ${event.sessionId} — ${event.filesChanged} arquivos`,
  });
});
```

### 6.2 Governança de Hooks (NEXUS Part 4.5)

| Regra | Descrição | Verificação |
|---|---|---|
| **H-01** | Execução Isolada | Hooks rodam em processo filho com limites de recursos restritos | Teste: Hook tenta `fork()` → `Error` |
| **H-02** | Read-Only Access | Hooks recebem `eventPayload` imutável e não acessam o `RuntimeContainer` | Inspeção de código: HookRegistry não expõe o container |
| **H-03** | Timeout Estrito | Hooks têm timeout global de 5s; falha em 1 hook não interrompe o fluxo core | Teste: Hook lento é morto; log gerado |
| **H-04** | Audit Log Obrigatório | Toda execução de hook gera uma entrada no `AuditLog` com `actor="system:hook"` | `SELECT * FROM AuditLog WHERE entityType='Hook'` |

---


### 6.1 Configuração de Hooks

```bash
# Listar hooks configurados
greenforge hooks list

# Habilitar/desabilitar hook
greenforge hooks enable notify-slack
greenforge hooks disable notify-slack
greenforge hooks disable-all  # útil para debug
```

---

## 7. Integração MCP (Model Context Protocol)

O GreenForge suporta MCP servers locais como fonte de contexto adicional para os agentes.

```typescript
// Configuração em .greenforge/config.json
{
  "mcp": {
    "servers": [
      {
        "name": "filesystem",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
      },
      {
        "name": "github",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-github"],
        "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
      }
    ]
  }
}
```

Cada MCP server é iniciado como processo filho e expõe tools adicionais para os agentes via `ToolRegistry`.

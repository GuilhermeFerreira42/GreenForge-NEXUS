# GreenForge Agent — Documentação 2.1

> **Status:** ✅ | **Versão:** 2.1 | **Data:** 2026-05-12  
> **Arquitetura:** Web IDE Multi-Agente com Protocolo de Debate Adversarial e Resiliência Industrial

---

A v2.1 eleva o GreenForge da prototipagem para a confiabilidade industrial. Esta versão consolida as **Soluções de Auditoria de Estresse**, injetando camadas de resiliência em transporte, dados, IA e operações.

Esta documentação incorpora os resultados do segundo Red Team de estresse, resolvendo 17 pontos de ruptura determinísticos identificados em carga real.

---

## 🟦 Mapa Cognitivo — O Protocolo NEXUS

O GreenForge v2.0 é regido pelo **Protocolo NEXUS**, o "Sistema Operacional Cognitivo" que transforma agentes de simples executores em **Mentores Analíticos**.

### Pilares Intelectuais:
1.  **Profundidade Antes da Entrega:** Nenhuma proposta técnica é aceita sem a identificação da `underlying_question` (a pergunta arquitetural raiz).
2.  **Síntese Dialética:** O impasse entre agentes não é uma falha, mas uma oportunidade de desvelar a `fundamental_tension` do problema para o usuário.
3.  **Racional em 3 Camadas:** Toda aprovação exige a validação do *O Quê*, do *Por Quê* e dos *Trade-offs* assumidos.
4.  **Auditabilidade Determinística:** Cada decisão, debate e merge é rastreável via Timeline e persistido no SQLite para replay analítico.

---

## Estrutura dos Documentos

| Arquivo | Conteúdo | Audiência |
|---|---|---|
| [`01-vision-and-architecture.md`](./01-vision-and-architecture.md) | Visão, stack, Dual-Transport, decisões R-01…R-10 | Arquitetos, Tech Leads |
| [`02-functional-requirements.md`](./02-functional-requirements.md) | Protocolo de Debate, HITL Gates, Approval Card, DiffLens | Product, Devs |
| [`03-technical-spec-and-data.md`](./03-technical-spec-and-data.md) | Prisma schema, contratos TypeScript, AgentFactory, runtime | Backend Devs |
| [`04-operational-playbooks.md`](./04-operational-playbooks.md) | Runbooks, troubleshooting de debate, gc de worktrees | SRE, DevOps |
| [`05-governance-and-security.md`](./05-governance-and-security.md) | Approval Gate, rollback, redação de segredos, sandbox | Segurança |
| [`06-api-and-extensibility.md`](./06-api-and-extensibility.md) | Protocolo SSE/WebSocket, schema AGENTS.md, extensão | Integradores |
| [`07-ux-and-onboarding.md`](./07-ux-and-onboarding.md) | Layout da IDE, cookbooks, manual por perfil | Usuários |

---

## Decisões Arquiteturais Centrais

| Dimensão | v1.0 | v2.0 |
|---|---|---|
| Interface | CLI (Commander) | IDE Web — Bolt.diy UI (React/Vite) |
| Execução | WebContainers | Backend Node.js local (porta 5174) |
| Comunicação | SSE experimental | Dual-Transport: SSE + WebSocket (Socket.IO) |
| Orquestração | Manager→Implementer→Verifier (serial) | Proposer→Critic→Judge (debate adversarial) |
| Agentes | 3 hardcoded | N agentes via `AGENTS.md` (YAML + Markdown) |
| Isolamento | 1 worktree/workspace | 1 worktree/agente de debate |
| Contexto | 30k token budget fixo | 128k padrão; **RepoMap (ctags)** para RAG e **Anchored Iterative Summarization** |
| Resiliência | N/A | **LoopDetector** (AST Fingerprint/Cost) + **Rollback c/ Diagnóstico** |
| Sincronização | Sem garantias | **Sequence Numbers + Epoch ID** com Reorder Buffer (SSE + WS) |
| Histórico | Sem persistência de chat | ChatSession + ChatMessage no Prisma |
| Aprovação | Inquirer (CLI) | Approval Card chunk-based (3 níveis) via WebSocket |
| Rollback | Manual no terminal | **Auto-Rollback Pós-Aprovação** + Botão "↩ Desfazer" |
| Auth | N/A | Single-user localhost, sem auth no MVP |

---

## Stack Tecnológica

```
FRONTEND (Browser)
  React + Vite (Bolt.diy base) | Monaco Editor | Xterm.js | Socket.IO client

BACKEND (Node.js 20.11+ — porta 5174)
  TypeScript 5.3+ | Express | Socket.IO | node-pty | Prisma + SQLite (WAL)
  @google/generative-ai | js-yaml | p-retry

INFRAESTRUTURA
  Git ≥ 2.30 | Node.js ≥ 20.11 | Docker ≥ 20 (sandbox opcional) | SQLite ≥ 3.35
```

---

| Termo | Definição |
|---|---|
| **Debate Session** | Ciclo Proposer→Critic→Judge regido pela Síntese Dialética. |
| **HITL Gate** | Barreira de controle síncrona que exige intervenção humana para transição de estado. |
| **Approval Card** | Documento de raciocínio em 3 níveis (Executive Summary → Rationale → Diffs). |
| **DiffLens** | Motor de revisão granular chunk-based com detecção de Red Flags. |
| **Confidence Gating** | Mecanismo de encerramento antecipado baseado na convergência probabilística (≥ 95%). |
| **AGENTS.md** | Padrão declarativo (YAML+Markdown) para injeção de agentes no runtime. |
| **AgentFactory** | Componente responsável pelo parsing, validação e hot-reload de agentes. |
| **Dual-Transport** | Arquitetura de comunicação híbrida (SSE para streaming, WebSocket para HITL). |
| **Force Decision** | Escalada de decisão após exaustão dialética (max_rounds), expondo a tensão fundamental. |
| **Progressive Disclosure** | Padrão de UI que prioriza a síntese executiva, ocultando a densidade técnica sob demanda. |
| **Underlying Question** | A questão arquitetural raiz que motiva o debate, identificada pelo Árbitro. |
| **Fundamental Tension** | A disputa intelectual real (ex: Performance vs. Segurança) por trás de um impasse técnico. |
| **Dialetical Anchor** | O rastro imutável de "Quem decidiu o quê e por que", preservado durante compressões de contexto. |
| **Sequence Number / Epoch ID** | Protocolo de ordenação global via SQLite (`seq_id`) para reordenar eventos via Reorder Buffer e `epoch_id` (fencing token monotônico) para detectar reinicializações e garantir integridade entre sessões. |
| **Checkpoint Híbrido** | Padrão Saga (`PENDING -> GIT_STASHED -> COMMITTED`) que garante a atomicidade entre transações SQLite e snapshots do Git (stash), prevenindo estados divergentes pós-crash. |
| **Agent Diagnosis** | Relatório estruturado de falha enviado ao agente após rollback automático, incluindo logs de `npm test`, `eslint` e `tsc` para correção imediata. |
| **LoopDetector v2.1** | Detecção multinível: Tier 1 (AST Structural Fingerprint via TS-ESTree) e Tier 2 (SimHash de n-gramas) para fallback universal em ambientes sem TreeSitter nativo. |
| **Gate Hydration** | Protocolo de recuperação de Approval Cards via Outbox Pattern (SQLite), permitindo que o cliente re-sincronize payloads perdidos usando o header `Last-Event-ID`. |
| **AIS (Anchored Iterative Summarization)** | Gestão de contexto que preserva a "Âncora Dialética" (decisões críticas) enquanto comprime o histórico, prevenindo o Context Drift em sessões longas. |
| **Shell Allowlist** | Defesa em camadas com validação de path traversal (`path.resolve`), sanitização de ambiente e allowlist hierárquica de subcomandos Git/NPM via AST parser. |

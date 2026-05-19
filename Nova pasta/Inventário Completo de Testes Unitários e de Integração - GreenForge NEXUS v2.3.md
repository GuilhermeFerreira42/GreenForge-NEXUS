# Inventário Completo de Testes Unitários e de Integração - GreenForge NEXUS v2.3

Este documento apresenta um inventário exaustivo de testes unitários e de integração para o sistema GreenForge NEXUS v2.3, categorizado de acordo com as diretrizes fornecidas. Cada teste mapeia uma trava de segurança, máquina de estado ou detalhe de interface, com um identificador único, cenário de estresse e asserção esperada.

## 1. 🛡️ Suite de Segurança e Blindagem de Shell (secureGit)

| Identificador e Nome do Teste | Cenário/Estresse | Asserção Esperada |
|---|---|---|
| `SEC-SHL-001`: secureGit - Bloqueio de injeção de comando via flag maliciosa | Injetar a flag `--output` no argumento de um comando Git. | Espera-se que dispare `SecurityViolationException` e que o processo do Git não seja instanciado. |
| `SEC-SHL-002`: secureGit - Bloqueio de injeção de comando via comando arbitrário | Tentar executar um comando não permitido pela `SHELL_ALLOWLIST` (ex: `wget http://evil.com`). | Espera-se que dispare `Error: Comando não permitido` imediatamente. |
| `SEC-SHL-003`: secureGit - Mitigação de Path Traversal em `TERMINAL_INIT` | Fornecer um `worktreePath` fora do `AUTHORIZED_WORKTREES_ROOT` (ex: `/etc/passwd`). | Espera-se que `TERMINAL_INIT` emita `TERMINAL_ERROR` com código `PATH_TRAVERSAL` e desconecte o socket. |
| `SEC-SHL-004`: secureGit - Mitigação de Path Traversal em `write_file` | Agente tenta escrever em um arquivo fora do `worktreePath` autorizado (ex: `/etc/passwd`). | Espera-se que `assertPathWithinProject()` lance um `Error` antes de qualquer escrita. |
| `SEC-SHL-005`: secureGit - Expurgar variáveis de ambiente perigosas | Injetar `GIT_PAGER=malicious_binary` antes de um comando Git permitido (ex: `git log`). | Espera-se que `sanitizeEnv()` remova a variável `GIT_PAGER` e que `malicious_binary` nunca seja invocado. |
| `SEC-SHL-006`: secureGit - Isolamento de contexto entre worktrees | Agente Propositor tenta ler um arquivo do `worktreePath` do Agente Crítico. | Espera-se que `assertPathWithinProject()` lance uma exceção, impedindo o acesso. |
| `SEC-SHL-007`: secureGit - Validação de CVE-2025-68143/68144/68145 | Simular cenários de vulnerabilidades conhecidas relacionadas a `mcp-server-git`. | Espera-se que as mitigações implementadas (ex: `SHELL_ALLOWLIST`, `sanitizeEnv`) previnam a exploração. |
| `SEC-SHL-008`: secureGit - Validação de Environment Poisoning (CVE-2026-22708) | Simular injeção de variáveis de ambiente perigosas listadas em `DANGEROUS_ENV_VARS`. | Espera-se que `sanitizeEnv()` remova todas as variáveis de ambiente perigosas antes da execução do comando. |

## 2. 🌀 Suite de Resiliência de Infraestrutura (BootReconciler e Ciclo de Vida)

| Identificador e Nome do Teste | Cenário/Estresse | Asserção Esperada |
|---|---|---|
| `RES-INF-001`: BootReconciler - Recuperação de falha durante operação Git/DB | Simular um `SIGKILL` entre os estados `GIT_STASHED` e `DB_COMMITTED` da Saga de merge. | Espera-se que, no próximo boot, `bootReconciler()` detecte o estado inconsistente e reverta o stash, garantindo zero stashes órfãos. |
| `RES-INF-002`: Atomicidade de escrita em disco - `rename(2)` POSIX | Simular um `SIGKILL` durante a escrita de um `intent.json.tmp` e antes do `rename` para `intent.json`. | Espera-se que, no próximo boot, apenas o arquivo `.tmp` residual seja encontrado e limpo por `cleanOrphanedTempFiles()`, ou o arquivo `.json` completo esteja presente, nunca um estado intermediário. |
| `RES-INF-003`: Atomicidade de escrita em disco - `fsync()` | Simular uma falha de energia imediatamente após `fsync({txId}.json.tmp)` e antes do `rename`. | Espera-se que o conteúdo do arquivo temporário esteja totalmente gravado em disco, garantindo que o `rename` subsequente (se ocorrer) seja de um arquivo íntegro. |
| `RES-INF-004`: Ciclo de Vida - Desligamento ordenado em 8 estágios | Enviar um sinal `SIGTERM` ou `SIGINT` para o processo do servidor. | Espera-se que o `gracefulShutdown()` execute todos os 8 estágios na ordem correta, com os respectivos timeouts, e que o processo finalize com `process.exit(0)`. |
| `RES-INF-005`: Ciclo de Vida - `wal_checkpoint(FULL)` no desligamento | Enviar um sinal `SIGTERM` ou `SIGINT` para o processo do servidor. | Espera-se que o estágio 8 do `gracefulShutdown()` execute `registry.db.pragma('wal_checkpoint(FULL)')` com sucesso, garantindo que todas as transações pendentes no WAL sejam escritas no banco de dados principal antes do fechamento. |
| `RES-INF-006`: Configuração SQLite - `journal_mode = WAL` e `synchronous = NORMAL` | Verificar a configuração do banco de dados SQLite após a inicialização. | Espera-se que o `journal_mode` esteja configurado como `WAL` e `synchronous` como `NORMAL`, conforme especificado para balancear durabilidade e performance. |

## 3. 🔍 Suite de Lógica de Negócio e Análise AST (DiffLens)

| Identificador e Nome do Teste | Cenário/Estresse | Asserção Esperada |
|---|---|---|
| `LOG-AST-001`: Gate HITL - Aprovação de chunk | Usuário aceita um chunk de código no Gate 2 (DiffLens). | Espera-se que o `status` do `ChunkDiff` correspondente mude para `accepted` e que o chunk seja incluído no merge final. |
| `LOG-AST-002`: Gate HITL - Rejeição de chunk | Usuário rejeita um chunk de código no Gate 2 (DiffLens). | Espera-se que o `status` do `ChunkDiff` correspondente mude para `rejected` e que o chunk não seja incluído no merge final. |
| `LOG-AST-003`: Gate HITL - Análise AST de dependências órfãs | Usuário rejeita um chunk que define uma função ou variável, e outro chunk aceito depende dessa definição. | Espera-se que o sistema realize uma análise estática (AST) e alerte o usuário sobre a 
dependência órfã antes de permitir o merge. |
| `LOG-AST-004`: Gate HITL - Botão `Aceitar Todos os Chunks Restantes` | Tentar ativar o botão `[Aceitar Todos os Chunks Restantes]` quando há um chunk com Red Flag de severidade CRÍTICO ou ALTO. | Espera-se que o botão permaneça desabilitado. |
| `LOG-AST-005`: Gate HITL - `git merge --squash` e `git revert HEAD` | Aprovar um merge no Gate 2 e, em seguida, tentar reverter as mudanças usando o botão "↩ Desfazer". | Espera-se que o `git revert HEAD` reverta **todas** as mudanças da sessão (all-or-nothing), e que o `git log` contenha o commit de revert. |
| `LOG-AST-006`: CPG Loop Detector - Detecção de loop semântico | Agente reformula código (ex: recursão para iteração) que passa nos testes, mas forma um ciclo de comprimento N com similaridade CPG > 0.85. | Espera-se que o `CPGLoopDetector` identifique `CPG_CYCLE` e escale para um HITL Gate. |
| `LOG-AST-007`: CPG Loop Detector - Invariância de `sideEffectHash` | Agente reformula código que altera a estrutura sintática (AST layer) mas mantém o mesmo comportamento funcional (Execution Oracle). | Espera-se que o `sideEffectHash` permaneça o mesmo, indicando `INVARIANT_SIDE_EFFECTS` após `MIN_ROUNDS=3`. |

## 4. 🎨 Suite de Performance e Fidelidade de Interface (CodeMirror 6)

| Identificador e Nome do Teste | Cenário/Estresse | Asserção Esperada |
|---|---|---|
| `PERF-UI-001`: Headers HTTP de isolamento de origem (COOP e COEP) | Inspecionar os headers HTTP da resposta do servidor para a aplicação web. | Espera-se que os headers `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Embedder-Policy: require-corp` estejam presentes. |
| `PERF-UI-002`: Idempotência e performance do `WidgetType.eq()` | Simular um stream intenso de texto no editor CodeMirror 6, com múltiplas atualizações de decorações e widgets. | Espera-se que o método `eq()` da classe `WidgetType` previna re-renderizações desnecessárias no DOM, mantendo o foco do cursor e evitando loops de re-renderização. |
| `PERF-UI-003`: `agentTagDecorations` - Conflito de tags na mesma linha | Chamar `addAgentTag` com dois `agentId`s diferentes para o mesmo range de texto. | Espera-se que a linha receba ambas as classes CSS (`agent-technical_proposer agent-quality_critic`), exiba um gradiente de borda e um tooltip via `Decoration.widget()` explicando o conflito. |
| `PERF-UI-004`: `agentTagDecorations` - Limpeza de tags | Chamar `clearAgentTags` após a exibição de tags de agentes. | Espera-se que todas as decorações de tags de agentes sejam removidas da visualização do editor. |
| `PERF-UI-005`: `MultiTabEditor` - Preservação do foco do cursor | Abrir um arquivo no `MultiTabEditor`, posicionar o cursor em uma linha específica e, em seguida, alternar para outra aba e retornar. | Espera-se que o foco do cursor seja preservado na posição original ao retornar à aba. |
| `PERF-UI-006`: `MultiTabEditor` - Temas customizados | Aplicar um tema customizado (ex: `@codemirror/theme-one-dark`) ao editor CodeMirror 6. | Espera-se que o tema seja aplicado corretamente, alterando a aparência do editor conforme o esperado. |
| `PERF-UI-007`: `MultiTabEditor` - Modo `readOnly` durante Gates | Simular um Gate ativo, onde o editor deve estar em modo somente leitura. | Espera-se que o `EditorView.editable.of(!isReadOnly)` funcione corretamente, impedindo a edição do código. |
| `PERF-UI-008`: `MultiTabEditor` - Fontes de código e interface | Verificar as fontes aplicadas no editor de código e na interface geral. | Espera-se que a fonte de código seja `'JetBrains Mono', monospace` e a fonte da interface seja `'Inter', sans-serif`, com os tamanhos especificados. |

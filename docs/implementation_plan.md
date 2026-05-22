# Implementação — Arquitetura de Testes NEXUS v2.3 (Fase TDD Green: Suíte SEC)

## Contexto e Objetivo

Na fase anterior, configuramos o ambiente do Vitest e criamos os stubs para que a suíte de testes `secureGit.test.ts` (SEC-001 a SEC-010) falhasse de forma limpa nos assertions esperados. 

Agora, a missão é:
1. **Implementar o código de produção completo** em `src/lib/secure-git-wrapper.ts` de acordo com as especificações de governança (Seção 4.3 de `05-governance-and-security.md`) e os testes criados.
2. **Implementar os testes restantes** (`SEC-011` a `SEC-038`) no arquivo `tests/suites/sec-security/secureGit.test.ts` de acordo com os cenários e asserções descritos em `TEST_INVENTORY_GREENFORGE_v2.3.md`.
3. **Verificar a completude**: Garantir que todos os 38 testes da Suíte SEC rodem em paralelo de forma isolada (via Database-per-File e forks pool) e passem com 100% de sucesso.

---

## Proposta de Implementação do Código de Produção

### 1. `src/lib/secure-git-wrapper.ts`

Implementaremos as 7 camadas de segurança e blindagem de shell sem depender de pacotes nativos compiláveis (como C/C++ `tree-sitter`), garantindo imunidade total a erros de compilação em ambiente Windows:
- **Camada 0 (Zod Schema)**: Validação estrita dos inputs (`worktreePath`, `subcommand`, `args`) bloqueando null bytes e quebras de linha em tempo de parsing Zod.
- **Camada 1 (Realpath Resolution)**: Resolução de links simbólicos via `fs.promises.realpath` para impedir evasion via symlinks no worktree.
- **Camada 2 (Controle de Limites)**: Verificação do `maxArgs` permitido de acordo com a política do subcomando específico.
- **Camada 3 (Classificação e Validação de Flags/Paths/Refs)**: 
  - Classificação rigorosa de cada argumento.
  - Bloqueio de injeção de parâmetros (flags não permitidas em `allowedFlags` ou presentes em `forbiddenFlags`).
  - Bloqueio de format tokens perigosos contendo `exec:` ou `%(trailers...key)`.
  - Validação estrita de refs Git e caminhos de arquivos locais (garantindo que se situem **exclusivamente dentro do worktree** resolvido).
- **Camada 4 (Sanitização e Epuramento de Ambiente)**: Remoção sistemática de todas as 18+ variáveis de ambiente proibidas (como `BASH_ENV`, `LD_PRELOAD`, `GIT_PAGER`, `GIT_CONFIG_COUNT`).
- **Camada 5 (Execução Estrita sem Shell)**: Invocação do `execa` com `shell: false` (o padrão seguro do `execa`) e umask `0o077` (permissões extremamente restritivas rwx------).
- **Camada 6 (Bloqueador de AST e Operadores Shell)**: Scanner léxico robusto e determinístico em TypeScript puro para identificar operadores shell não permitidos (`|`, stand-alone `&`, `$()`, backticks, `<()`, `>()`) fora de strings cotadas, cobrindo `validateGitCommand()`.

---

## Proposta de Expansão dos Testes (SEC-011 a SEC-038)

Adicionaremos os seguintes testes a `tests/suites/sec-security/secureGit.test.ts`:

| ID | Cenário | Asserção Esperada |
|---|---|---|
| **SEC-011** | Path traversal simples: `../../etc/passwd` | Lança `SecurityError` com `'PATH_TRAVERSAL'` ou `'outside worktree'` |
| **SEC-012** | Path traversal via `git show HEAD:../../etc/passwd` | Lança `SecurityError` (classificação bloqueia show path args) |
| **SEC-013** | Path traversal via `git diff -- ../../.env` | Lança `SecurityError` com `'outside worktree'` |
| **SEC-014** | Path traversal via symlink no worktree | `realpath` resolve symlink antes da validação e bloqueia o escape |
| **SEC-015** | `git log --remotes` bloqueado | Lança `SecurityError` (regex `/^--remotes/` bloqueia) |
| **SEC-016** | Argumento com null byte (`file\0evil`) | Rejeitado no schema Zod com `'Null byte not allowed'` |
| **SEC-017** | Argumento com newline (`msg\nmalicious`) | Rejeitado no schema Zod com `'Newlines not allowed'` |
| **SEC-018** | Excesso de argumentos além do `maxArgs` | Lança `SecurityError` |
| **SEC-019** | `BASH_ENV` removida antes do exec | `execa` não herda a variável perigosa |
| **SEC-020** | `GIT_PAGER` removida antes do exec | `execa` não herda (bloqueia CVE-2017-8386) |
| **SEC-021** | `PAGER` fallback removida | `execa` não herda |
| **SEC-022** | `LD_PRELOAD` removida | `execa` não herda (bloqueia privesc) |
| **SEC-023** | `GIT_EXEC_PATH` removida | `execa` não herda (bloqueia hijack) |
| **SEC-024** | `GIT_CONFIG_COUNT` / variables removidas | `execa` não herda (bloqueia CVE-2023-29007) |
| **SEC-025** | `GIT_SSH_COMMAND` removida | `execa` não herda |
| **SEC-026** | `GIT_TRACE` e `GIT_TRACE2` removidas | `execa` não herda |
| **SEC-027** | `GIT_TERMINAL_PROMPT` forçada para `'0'` | Modo não-interativo garantido |
| **SEC-028** | Pipe shell bloqueado via AST | `validateGitCommand('git status \| nc ...') === false` |
| **SEC-029** | Command substitution bloqueada | `validateGitCommand('git add $(...)') === false` |
| **SEC-030** | Backtick expansion bloqueada | `validateGitCommand('git add \`...\` ') === false` |
| **SEC-031** | Process substitution bloqueada | `validateGitCommand('git diff <(...)') === false` |
| **SEC-032** | Background execution bloqueada | `validateGitCommand('git log &') === false` |
| **SEC-033** | `worktreePath` inexistente lança erro | `SecurityError` com `'Cannot resolve worktree'` |
| **SEC-034** | `worktreePath` vazio | Rejeitado pelo schema Zod |
| **SEC-035** | `redactSecrets()`: API key Gemini | Substitui por `[REDACTED]` |
| **SEC-036** | `redactSecrets()`: OpenAI key | Substitui por `[REDACTED]` |
| **SEC-037** | `assertPathWithinProject()` fora do worktree | Lança erro preventivo antes de qualquer escrita no FS |
| **SEC-038** | `AgentFactory` e integridade de hashes | Simularemos o comportamento integrando de forma compatível com a suíte SEC |

---

## Plano de Verificação

1. **Testes Unitários**:
   ```bash
   npx vitest run tests/suites/sec-security/secureGit.test.ts --reporter=verbose
   ```
   *Sucesso esperado*: **38/38 testes passando com 100% de sucesso**.
   
2. **Cobertura**:
   ```bash
   npx vitest run tests/suites/sec-security/secureGit.test.ts --coverage
   ```
   Garantir cobertura abrangente do arquivo `secure-git-wrapper.ts`.

---

## Arquivos Envolvidos

- `[MODIFY]` [secure-git-wrapper.ts](file:///c:/Users/Usuario/Desktop/GreenForge-NEXUS/src/lib/secure-git-wrapper.ts)
- `[MODIFY]` [secureGit.test.ts](file:///c:/Users/Usuario/Desktop/GreenForge-NEXUS/tests/suites/sec-security/secureGit.test.ts)

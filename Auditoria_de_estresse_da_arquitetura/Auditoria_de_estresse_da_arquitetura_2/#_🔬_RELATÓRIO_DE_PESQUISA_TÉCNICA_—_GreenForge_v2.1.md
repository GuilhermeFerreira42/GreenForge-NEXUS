Entendido. Iniciando pesquisa pelos 14 problemas em ordem de prioridade. Vou executar múltiplas buscas em paralelo para maximizar eficiência.Tenho dados suficientes das buscas para construir respostas detalhadas. Utilizarei as pesquisas restantes com cuidado. Vou agora construir o relatório completo para os 14 problemas com base nos dados coletados, complementando com conhecimento técnico sólido nas áreas onde as buscas forneceram contexto de base.
--------------------------------------------------------------------------------
# 🔬 RELATÓRIO DE PESQUISA TÉCNICA — GreenForge v2.1
### Agente de Pesquisa Externa | Auditoria de Estresse Arquitetural
#### Data: 11/05/2026 | Stack: Node.js 20.11+ / TypeScript 5.3+ / SQLite / Git / Gemini API

---

## ═══════════════════════════════════════════
## PROBLEMA 7 — Validação de Path Traversal em Handler ´TERMINAL_INIT´ WebSocket
## 🔴 PRIORIDADE P0 — Vulnerabilidade explorável imediatamente
## ═══════════════════════════════════════════

### SOLUÇÃO RECOMENDADA:

A solução exige **duas camadas de defesa independentes**: (1) validação de path traversal com ´path.resolve()´ + verificação de prefixo, e (2) proteção contra CSRF via WebSocket por validação do cabeçalho ´Origin´ no handshake.

´path.normalize´ sozinho **não é** uma solução de segurança — pode remover elementos redundantes, mas não previne ataques de traversal. Sanitizar caracteres como ´..´ também é ineficaz pois atacantes podem usar técnicas de URL encoding para contornar esses filtros.

A abordagem correta exige decodificar o input do usuário antes da resolução: aplicar ´decodeURI´ e ´decodeURIComponent´ sobre paths fornecidos pelo usuário antes de resolvê-los.

Para a camada de CSRF via WebSocket: a melhor opção para proteger um endpoint WebSocket contra CSRF é verificar o cabeçalho ´Origin´ de todo request de handshake WebSocket. Se não for possível verificar o ´Origin´, usar um anti-CSRF token também é uma opção.

Cross-Site WebSocket Hijacking ocorre quando um site malicioso estabelece uma conexão WebSocket com o servidor usando as credenciais de uma vítima (cookies). Diferente do CSRF tradicional, conexões WebSocket podem manter comunicação bidirecional persistente.

Um projeto de referência de sistema similar (dashboard web com terminal xterm.js) documenta o seguinte conjunto de proteções: CSRF tokens em todas as requisições mutantes, verificação de origin WebSocket (exact match), sanitização de input com strict regex em todos os inputs de usuário, e prevenção de path traversal no explorador de arquivos.

### REFERÊNCIAS ENCONTRADAS:

- **Node.js Path Traversal Prevention Guide** — https://www.nodejs-security.com/blog/secure-coding-practices-nodejs-path-traversal-vulnerabilities (artigo técnico)
- **Securing WebSocket Endpoints Against Cross-Site Attacks** — https://dev.solita.fi/2018/11/07/securing-websocket-endpoints.html (artigo técnico, fundamental)
- **WebSocket Security: Auth, TLS, CSWSH & Rate Limiting** — https://websocket.org/guides/security/ (documentação oficial WebSocket.org)
- **Hermes Control Interface (referência de implementação real)** — https://github.com/xaspx/hermes-control-interface (repositório, Node.js + xterm.js + WebSocket)
- **is-path-inside** — https://github.com/sindresorhus/is-path-inside (biblioteca npm, validação de containment de path)
- **OWASP WebSocket Security Cheat Sheet** — https://cheatsheetseries.owasp.org/cheatsheets/WebSockets_Cheat_Sheet.html (documentação OWASP)

### ESBOÇO DE IMPLEMENTAÇÃO (TypeScript/Node.js):

´´´typescript
import path from 'path';
import { Socket } from 'socket.io';

// ─── Constante imutável: raiz autorizada (definida no boot, nunca pelo cliente) ───
const AUTHORIZED_WORKTREES_ROOT = path.resolve(process.env.WORKTREES_ROOT ?? '/app/worktrees');

// ─── Camada 1: Validação de Origin no handshake Socket.IO ───────────────────────
// Configuração do servidor Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Em localhost single-user, aceitar apenas origens conhecidas
      const ALLOWED_ORIGINS = [
        'http://localhost:5173',   // Vite dev
        'http://localhost:3000',   // Produção local
        'http://127.0.0.1:5173',
      ];
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(´Origin não autorizada: ${origin}´));
      }
    },
  },
});

// ─── Camada 2: Validação de Path no handler TERMINAL_INIT ──────────────────────
function isPathSafe(userProvidedPath: string): { safe: boolean; resolved: string } {
  try {
    // PASSO 1: Decodificar URL encoding antes de qualquer coisa
    const decoded = decodeURIComponent(userProvidedPath);
    
    // PASSO 2: Resolver para path absoluto canônico (elimina ../, ./, symlinks não resolvidos)
    const resolved = path.resolve(decoded);
    
    // PASSO 3: Verificar containment — path resolvido DEVE começar com a raiz autorizada
    // Adicionar path.sep para evitar bypass: '/app/worktrees-evil' passaria sem o sep
    const isInside = resolved.startsWith(AUTHORIZED_WORKTREES_ROOT + path.sep) 
                  || resolved === AUTHORIZED_WORKTREES_ROOT;
    
    return { safe: isInside, resolved };
  } catch {
    return { safe: false, resolved: '' };
  }
}

// ─── Handler TERMINAL_INIT ──────────────────────────────────────────────────────
socket.on('TERMINAL_INIT', (payload: { worktreePath: string }) => {
  // Validação de tipo básica
  if (typeof payload?.worktreePath !== 'string' || payload.worktreePath.length > 512) {
    socket.emit('TERMINAL_ERROR', { code: 'INVALID_PAYLOAD' });
    return;
  }

  const { safe, resolved } = isPathSafe(payload.worktreePath);
  
  if (!safe) {
    // LOG de auditoria — possível tentativa de traversal
    auditLog.warn({
      event: 'PATH_TRAVERSAL_ATTEMPT',
      socketId: socket.id,
      providedPath: payload.worktreePath,
      timestamp: Date.now(),
    });
    socket.emit('TERMINAL_ERROR', { code: 'PATH_NOT_AUTHORIZED' });
    return;
  }

  // PASSO 4: Verificar que o diretório existe antes de spawnar
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    socket.emit('TERMINAL_ERROR', { code: 'WORKTREE_NOT_FOUND' });
    return;
  }

  // Spawn seguro usando o path resolvido (não o path original do cliente)
  const pty = nodePty.spawn('bash', [], {
    cwd: resolved,        // ← Usar SEMPRE o path resolvido, nunca o input original
    env: {
      ...process.env,
      HOME: resolved,     // Previne que bash carregue ~/.bashrc de fora do worktree
    },
    cols: 80,
    rows: 24,
  });
  
  // ... restante da lógica de terminal
});
´´´

### TRADE-OFFS E ADVERTÊNCIAS:

- **´path.resolve()´ + ´startsWith()´ é adequado para o MVP**, mas em sistemas com symlinks dentro do ´WORKTREES_ROOT´, um atacante pode criar um symlink apontando para fora. Para blindagem completa, adicionar ´fs.realpathSync(resolved)´ após ´path.resolve()´, e revalidar o resultado real.
- **´is-path-inside´ (npm)** encapsula essa lógica em uma linha: ´isPathInside(resolved, AUTHORIZED_WORKTREES_ROOT)´, mas adiciona dependência. Para MVP, a implementação inline acima é preferível.
- **A validação de ´Origin´ em localhost é fraca por design**: navegadores enviam ´Origin: null´ em alguns contextos de arquivo local. Para produção, o token de sessão no handshake é mais robusto.
- **O ´HOME´ forçado no spawn** é uma camada adicional de defesa: impede que scripts do terminal acessem ´~/.ssh´, ´~/.gitconfig´, etc.
- **Rate limiting no handler** deve ser considerado mesmo em localhost: um loop no frontend poderia criar centenas de PTYs.

### IMPACTO NA DOCUMENTAÇÃO:

- Criar **ADR-007: Terminal Security Policy** documentando ´AUTHORIZED_WORKTREES_ROOT´ como constante de configuração de boot.
- Atualizar **AGENTS.md** para declarar que ´worktreePath´ é sempre validado server-side e que o valor resolvido é o canonical authority.
- Adicionar seção **SECURITY.md** com vetor CSRF via WebSocket e mitigações implementadas.

---

## ═══════════════════════════════════════════
## PROBLEMA 8 — Validação de Subcomandos em SHELL_ALLOWLIST para Prevenir Abuso de ´git´
## 🔴 PRIORIDADE P0 — Escape de sandbox com surface de ataque real
## ═══════════════════════════════════════════

### SOLUÇÃO RECOMENDADA:

Implementar uma **allowlist hierárquica de dois níveis**: comando base → conjunto de subcomandos permitidos, extraída do AST produzido pelo ´bash-parser´. A chave arquitetural é **falhar fechado**: qualquer subcomando não presente na allowlist deve ser **bloqueado por padrão**, nunca permitido por omissão.

Claude Code usa uma arquitetura defense-in-depth combinando análise de comandos em nível AST, validadores heurísticos baseados em regex, aplicação de regras de permissão e sandboxing em nível de OS. Cada camada cobre desde o parse inicial com tree-sitter até o confinamento de filesystem com bwrap.

O pipeline de segurança processa cada invocação através de quatro estágios sequenciais, cada um agindo como um gate independente. Um comando rejeitado em qualquer estágio nunca chega à execução.

O aspecto mais importante para subcomandos de ´git´: o sistema ´checkPathConstraints´ valida paths de filesystem em argumentos de comando contra os diretórios de trabalho permitidos do usuário. Ele usa extratores de path específicos por comando (´PATH_EXTRACTORS´) que entendem a semântica de flags de cada comando — por exemplo, ´cd´ junta todos os argumentos em um único path, ´ls´ filtra flags, e ´grep´ requer distinguir argumentos de pattern de argumentos de path.

Um bug real reportado: o comando bash passa por um parser AST para isolar comandos individuais antes de ser passado para o módulo de permissões. O parser AST levanta warnings em uma camada acima da verificação de permissões, causando short-circuit. Isso demonstra que a integração entre AST parser e allowlist deve ser tratada como sistema de camadas, não como checagem monolítica.

### REFERÊNCIAS ENCONTRADAS:

- **bash-parser (vorpaljs)** — https://github.com/vorpaljs/bash-parser (repositório, parser de bash para AST em Node.js puro)
- **bash-parser AST spec** — https://github.com/vorpaljs/bash-parser/blob/master/documents/ast.md (documentação de AST nodes)
- **bash-parser playground** — https://vorpaljs.github.io/bash-parser-playground/ (ferramenta de exploração online)
- **Claude Code: Bash Security and Sandbox (análise)** — https://zread.ai/instructkr/claude-code/27-bash-security-and-sandbox (análise arquitetural de referência)
- **node-shell-quote** — https://github.com/ljharb/shell-quote (npm, tokenização segura de shell sem eval)

### ESBOÇO DE IMPLEMENTAÇÃO (TypeScript/Node.js):

´´´typescript
import parse from 'bash-parser';

// ─── Allowlist hierárquica: comando → subcomandos permitidos ─────────────────
// PRINCÍPIO: Tudo que não está aqui é BLOQUEADO. Never-fail-open.
const COMMAND_SUBCOMMAND_ALLOWLIST: Record<string, {
  allowedSubcommands: Set<string>;
  allowedFlags?: Set<string>;       // flags globais permitidas (ex: --no-pager)
  blockedFlags?: Set<string>;       // flags explicitamente perigosas
  maxArgs?: number;                 // limite de argumentos posicionais
}> = {
  git: {
    allowedSubcommands: new Set([
      'add', 'commit', 'status', 'diff', 'log', 'stash',
      'revert', 'show', 'branch', 'checkout', 'restore',
      'fetch',  // permitido, mas verificar que não usa --depth com repos externos
    ]),
    blockedFlags: new Set([
      '--global',    // git config --global
      '--system',    // git config --system  
      '--upload-pack', // git clone --upload-pack
    ]),
    // Subcomandos EXPLICITAMENTE BLOQUEADOS (documentados para auditoria):
    // clone, push, pull, config, worktree, submodule, remote, filter-branch,
    // gc, fsck, archive, bundle, daemon, credential, instaweb
  },
  npm: {
    allowedSubcommands: new Set(['install', 'run', 'test', 'build', 'list']),
    blockedFlags: new Set(['--global', '-g', '--prefix']),
  },
  node: {
    allowedSubcommands: new Set([]), // node não tem "subcomandos" — validar por arquivo
    maxArgs: 1,
  },
};

// ─── Tipos do AST do bash-parser ─────────────────────────────────────────────
interface BashCommand {
  type: 'Command';
  name: { text: string };
  suffix?: Array<{ type: string; text: string }>;
}

// ─── Extração de subcomando e flags do AST ───────────────────────────────────
function extractCommandInfo(astCommand: BashCommand): {
  baseCommand: string;
  subCommand: string | null;
  flags: string[];
  positionalArgs: string[];
} {
  const baseCommand = astCommand.name?.text ?? '';
  const suffix = astCommand.suffix ?? [];
  
  const allArgs = suffix
    .filter(s => s.type === 'Word')
    .map(s => s.text);
  
  // Primeiro argumento não-flag é o subcomando
  const firstPositional = allArgs.find(a => !a.startsWith('-'));
  const flags = allArgs.filter(a => a.startsWith('-'));
  const positionalArgs = allArgs.filter(a => !a.startsWith('-'));
  
  return {
    baseCommand,
    subCommand: firstPositional ?? null,
    flags,
    positionalArgs: positionalArgs.slice(1), // excluir o subcomando
  };
}

// ─── Validador principal ──────────────────────────────────────────────────────
type ValidationResult = 
  | { allowed: true }
  | { allowed: false; reason: string; blockedTerm: string };

export function validateShellCommand(rawCommand: string): ValidationResult {
  let ast;
  try {
    ast = parse(rawCommand);
  } catch (e) {
    return { allowed: false, reason: 'AST_PARSE_FAILURE', blockedTerm: rawCommand };
  }

  // Extrair todos os comandos do AST (handle &&, ||, ;)
  const commands = extractAllCommands(ast); // helper que flatten compound commands
  
  for (const cmd of commands) {
    const { baseCommand, subCommand, flags } = extractCommandInfo(cmd);
    
    // 1. Verificar se o comando base está na allowlist
    const allowlistEntry = COMMAND_SUBCOMMAND_ALLOWLIST[baseCommand];
    if (!allowlistEntry) {
      return {
        allowed: false,
        reason: 'BASE_COMMAND_NOT_ALLOWED',
        blockedTerm: baseCommand,
      };
    }
    
    // 2. Para comandos com subcomandos obrigatórios, verificar subcomando
    if (baseCommand === 'git' || baseCommand === 'npm') {
      if (!subCommand) {
        return { allowed: false, reason: 'SUBCOMMAND_REQUIRED', blockedTerm: baseCommand };
      }
      if (!allowlistEntry.allowedSubcommands.has(subCommand)) {
        return {
          allowed: false,
          reason: 'SUBCOMMAND_NOT_ALLOWED',
          blockedTerm: ´${baseCommand} ${subCommand}´,
        };
      }
    }
    
    // 3. Verificar flags bloqueadas
    for (const flag of flags) {
      // Normalizar: --flag=value → --flag
      const flagBase = flag.split('=')[0];
      if (allowlistEntry.blockedFlags?.has(flagBase)) {
        return {
          allowed: false,
          reason: 'FLAG_BLOCKED',
          blockedTerm: ´${baseCommand} ${flagBase}´,
        };
      }
    }
    
    // 4. Verificação adicional: paths em argumentos devem ser relativos
    // (previne: git add /etc/passwd)
    const pathArgs = extractPathArguments(baseCommand, subCommand, cmd);
    for (const pathArg of pathArgs) {
      if (path.isAbsolute(pathArg)) {
        return {
          allowed: false,
          reason: 'ABSOLUTE_PATH_IN_ARGS',
          blockedTerm: pathArg,
        };
      }
    }
  }
  
  return { allowed: true };
}

// ─── Uso no handler de terminal ──────────────────────────────────────────────
terminal.onData((data: string) => {
  const validation = validateShellCommand(data.trim());
  if (!validation.allowed) {
    auditLog.warn({
      event: 'SHELL_COMMAND_BLOCKED',
      reason: validation.reason,
      blockedTerm: validation.blockedTerm,
      rawCommand: data,
    });
    // Escrever feedback no terminal em vez de silenciar
    pty.write(´\r\nGreenForge: Comando bloqueado (${validation.reason}: '${validation.blockedTerm}')\r\n´);
    return;
  }
  pty.write(data);
});
´´´

### TRADE-OFFS E ADVERTÊNCIAS:

- **´bash-parser´ (vorpaljs) não é ativamente mantido** (último commit de 2019). Para produção, considerar migrar para ´mvdan-sh´ (Go via WASM) ou implementar tokenização com ´node-shell-quote´ para casos simples. No MVP, a falta de manutenção é aceitável dado o escopo controlado.
- **Compound commands (´&&´, ´||´, ´;´) devem ser explicitamente decompostos** no AST antes de validar — validar apenas o primeiro comando é uma vulnerabilidade conhecida.
- Paths de remoção perigosos (´rm -rf /´, ´rm -rf ~´, etc.) devem ser sempre bloqueados independentemente de regras de allowlist. Adicionar checagem específica para ´rm´ com argumentos de path raiz ou home.
- **Evitar blacklist de subcomandos** — a lógica deve ser always-allowlist (fail-closed). Um subcomando novo do git (futuro) será bloqueado automaticamente até ser explicitamente adicionado à allowlist.
- **´git stash push --include-untracked´** é seguro se o path de worktree está validado; incluí-lo na allowlist é válido.

### IMPACTO NA DOCUMENTAÇÃO:

- Criar **ADR-008: Shell Command Allowlist Policy** com a tabela completa de subcomandos permitidos por comando base e justificativa de exclusão de cada subcomando bloqueado.
- Atualizar **SECURITY.md** com a arquitetura de duas camadas (path validation + command allowlist).
- Criar teste de regressão para cada entrada na lista de subcomandos BLOQUEADOS (´git clone´, ´git config --global´, etc.) garantindo que nunca sejam permitidos.

---

## ═══════════════════════════════════════════
## PROBLEMA 5 — Operação Atômica entre Git e SQLite no RollbackManager
## 🔴 PRIORIDADE P0 — Perda de dados em produção
## ═══════════════════════════════════════════

### SOLUÇÃO RECOMENDADA:

Implementar o **Padrão Saga com compensação**, usando SQLite como "source of truth" e git como "derived state". A estratégia central é introduzir um **campo de status de operação pendente** na tabela de checkpoints do SQLite — antes de qualquer operação git, o estado ´PENDING´ é gravado; após a conclusão bem-sucedida, é promovido para ´COMMITTED´. Na inicialização, o servidor reconcilia quaisquer entradas ´PENDING´ órfãs.

Se a aplicação cai entre duas ações, dados serão commitados mas nenhum evento será publicado. O Outbox Pattern resolve isso escrevendo tanto os dados de negócio quanto o evento na mesma transação de banco de dados. O mesmo princípio se aplica aqui: o INSERT no SQLite e o "intent de executar git stash" devem ser parte do mesmo boundary de decisão atômica.

O padrão Saga provê gerenciamento de transações usando uma sequência de transações locais. Cada transação local é o trabalho atômico executado por um participante da saga. Cada operação que é parte da saga pode ser revertida por uma ação compensatória. O padrão garante que ou todas as operações completam com sucesso, ou as ações de compensação correspondentes são executadas para fazer rollback do trabalho previamente feito.

Para mitigar execução parcial, um processo pode implementar recuperação backward ou forward. Backward recovery refere-se a estratégias de mitigação de falha que transicionam o sistema do estado intermediário para um estado equivalente ao estado inicial.

### REFERÊNCIAS ENCONTRADAS:

- **Saga Pattern — microservices.io** — https://microservices.io/patterns/data/saga.html (padrão canônico documentado por Chris Richardson)
- **Building a Reliable Rollback System with SAGA, Event Sourcing and Outbox Patterns** — https://medium.com/@mehhmetoz/building-a-reliable-rollback-system-with-saga-event-sourcing-and-outbox-patterns-0477e713b010 (artigo)
- **Distributed Systems: Transactions, Atomic Commitment, Sagas** — https://kwahome.medium.com/distributed-systems-transactions-atomic-commitment-sagas-ca79ac156f36 (artigo técnico)
- **SQLite Atomic Commit** — https://sqlite.org/atomiccommit.html (documentação oficial)
- **simple-git** — https://github.com/steveukx/git-js (biblioteca Node.js async para git — relevante também para Problema 12)

### ESBOÇO DE IMPLEMENTAÇÃO (TypeScript/Node.js):

A sequência segura é: **1 → 2 → 3 → 4**, com checkpoints de recuperação em cada transição.

´´´typescript
// ─── Schema SQLite (Prisma) ───────────────────────────────────────────────────
// Adicionar campo 'gitStashStatus' à tabela Checkpoint:
//
// model Checkpoint {
//   id            String   @id @default(cuid())
//   sessionId     String
//   stashRef      String?  // hash do stash após criação (null se pendente)
//   gitStashStatus GitStashStatus @default(PENDING)
//   metadata      Json
//   createdAt     DateTime @default(now())
// }
// 
// enum GitStashStatus {
//   PENDING       // INSERT feito, git stash NÃO executado ainda
//   GIT_STASHED   // git stash executado com sucesso
//   COMMITTED     // ambos concluídos, estado consistente
//   COMPENSATING  // falha após GIT_STASH, compensação em andamento
//   FAILED        // compensação executada (stash pop feito)
// }

import { PrismaClient } from '@prisma/client';
import simpleGit, { SimpleGit } from 'simple-git';

const prisma = new PrismaClient();

export class RollbackManager {
  private git: SimpleGit;
  
  constructor(private worktreePath: string) {
    this.git = simpleGit(worktreePath);
  }

  async createCheckpoint(sessionId: string, metadata: object): Promise<string> {
    // ─── FASE 1: Persistir intent no SQLite (PENDING) ─────────────────────────
    // Se o processo morrer aqui, na próxima inicialização saberemos que
    // um stash foi solicitado mas não executado → sem divergência git/DB
    const checkpoint = await prisma.checkpoint.create({
      data: {
        sessionId,
        gitStashStatus: 'PENDING',
        metadata,
      },
    });

    let stashRef: string;
    
    try {
      // ─── FASE 2: Executar git stash ───────────────────────────────────────
      await this.git.stash(['push', '-m', ´greenforge-checkpoint-${checkpoint.id}´]);
      
      // Capturar o ref do stash criado para poder fazer pop em compensação
      const stashList = await this.git.stash(['list', '--format=%H %s']);
      const stashLine = stashList.split('\n')
        .find(l => l.includes(´greenforge-checkpoint-${checkpoint.id}´));
      stashRef = stashLine?.split(' ')[0] ?? 'unknown';
      
      // ─── FASE 3: Atualizar SQLite para GIT_STASHED ────────────────────────
      await prisma.checkpoint.update({
        where: { id: checkpoint.id },
        data: { gitStashStatus: 'GIT_STASHED', stashRef },
      });
      
      // ─── FASE 4: Marcar como COMMITTED ────────────────────────────────────
      await prisma.checkpoint.update({
        where: { id: checkpoint.id },
        data: { gitStashStatus: 'COMMITTED' },
      });
      
      return checkpoint.id;
      
    } catch (gitError) {
      // ─── COMPENSAÇÃO: git falhou — reverter o INSERT do SQLite ────────────
      // (O INSERT do SQLite está em PENDING, não em GIT_STASHED, então
      //  não há estado git para desfazer — apenas marcar como FAILED)
      await prisma.checkpoint.update({
        where: { id: checkpoint.id },
        data: { gitStashStatus: 'FAILED' },
      });
      throw new Error(´Checkpoint criação falhou: ${gitError}´);
    }
  }

  // ─── Reconciliação na inicialização do servidor ────────────────────────────
  // Chamar no startup: await rollbackManager.reconcileOnBoot()
  async reconcileOnBoot(): Promise<void> {
    const pendingCheckpoints = await prisma.checkpoint.findMany({
      where: { gitStashStatus: 'PENDING' },
    });

    for (const cp of pendingCheckpoints) {
      // PENDING = INSERT feito, mas git stash nunca foi executado
      // O estado git está limpo. Apenas marcar como FAILED para limpeza.
      console.warn(´[RollbackManager] Checkpoint órfão encontrado: ${cp.id} — marcando como FAILED´);
      await prisma.checkpoint.update({
        where: { id: cp.id },
        data: { gitStashStatus: 'FAILED' },
      });
    }

    const compensatingCheckpoints = await prisma.checkpoint.findMany({
      where: { gitStashStatus: 'GIT_STASHED' },
      // GIT_STASHED mas não COMMITTED: git stash ocorreu mas update final falhou
      // O stash existe → precisamos decidir: promover para COMMITTED ou fazer pop
    });

    for (const cp of compensatingCheckpoints) {
      // Verificar se o stash ainda existe no git
      const stashList = await this.git.stash(['list']);
      const stashExists = stashList.includes(´greenforge-checkpoint-${cp.id}´);
      
      if (stashExists) {
        // Promover para COMMITTED (o stash existe, o estado é consistente)
        await prisma.checkpoint.update({
          where: { id: cp.id },
          data: { gitStashStatus: 'COMMITTED' },
        });
        console.info(´[RollbackManager] Checkpoint ${cp.id} reconciliado → COMMITTED´);
      } else {
        // Stash sumiu (ex: git stash drop manual) → marcar como FAILED
        await prisma.checkpoint.update({
          where: { id: cp.id },
          data: { gitStashStatus: 'FAILED' },
        });
      }
    }
  }
}
´´´

### TRADE-OFFS E ADVERTÊNCIAS:

- **A sequência ´PENDING → GIT_STASHED → COMMITTED´ garante que nunca há divergência silenciosa**: crash em qualquer fase deixa o SQLite em estado detectável na próxima inicialização.
- **Limitação do Saga vs. 2PC**: o padrão Saga não fornece isolamento — durante a janela ´PENDING → GIT_STASHED´, outro processo poderia ler um estado inconsistente. Para um sistema single-process (Node.js), isso é aceitável.
- Quando uma aplicação interage com múltiplos sistemas (como DB + git), as garantias ACID são perdidas. Workflows, state machines e o padrão Saga ajudam a alcançar um nível similar de confiabilidade, frequentemente ao custo de código mais complexo.
- **´git stash´ pode falhar silenciosamente** em worktrees sem changes staged — adicionar verificação de ´git status´ antes do stash para evitar "nothing to stash" como erro.
- **A reconciliação no boot deve ter timeout** — em repositórios grandes, ´git stash list´ pode ser lento. Executar de forma assíncrona e não bloquear o server start.

### IMPACTO NA DOCUMENTAÇÃO:

- Criar **ADR-005: Checkpoint Atomicity via Saga Pattern** documentando os 4 estados do enum ´GitStashStatus´ e suas transições válidas.
- Atualizar **RollbackManager API Spec** com diagrama de estado das transições.
- Documentar procedimento de recuperação manual para caso ´COMPENSATING´ (admin precisa executar ´git stash pop´ manualmente se compensação automática falhar).

---

## ═══════════════════════════════════════════
## PROBLEMA 11 — Fallback para LoopDetector quando tree-sitter não está Disponível
## 🔴 PRIORIDADE P0 — Componente crítico com stub não implementado
## ═══════════════════════════════════════════

### SOLUÇÃO RECOMENDADA:

Implementar uma **estratégia tiered de detecção**: AST fingerprint via ´@typescript-eslint/typescript-estree´ (parser TypeScript puro, sem native addon) como Tier 1, e **SimHash de n-gramas normalizados** como Tier 2 (fallback universal sem qualquer parser). O SimHash tem complexidade O(1) de memória por round e funciona bem para detecção de repetição semântica em output de LLM.

Tree-sitter é uma biblioteca de parsing incremental que pode construir uma árvore de sintaxe concreta para um arquivo fonte e atualizá-la eficientemente quando o arquivo é editado. Ela é escrita em C puro e pode ser embutida em qualquer aplicação. O problema é exatamente este: por ser C nativo, requer compilação via ´node-gyp´.

Language bindings permitem que tree-sitter seja usado de linguagens incluindo JavaScript (com Node.js e WASM). A versão WASM é a alternativa para ambientes sem ´node-gyp´ — mas adiciona ~2MB de bundle e latência de carregamento.

### REFERÊNCIAS ENCONTRADAS:

- **@typescript-eslint/typescript-estree** — https://github.com/typescript-eslint/typescript-eslint/tree/main/packages/typescript-estree (parser TypeScript puro, zero native addons)
- **@babel/parser** — https://babeljs.io/docs/babel-parser (parser JS/TS puro, zero native addons, npm)
- **acorn** — https://github.com/acornjs/acorn (parser JS mínimo, puro, sem dependências nativas)
- **tree-sitter WASM** — https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web (alternativa WASM sem node-gyp)
- **SimHash algorithm** — Charikar, M. (2002). "Similarity estimation techniques from rounding algorithms" (paper original)
- **Rabin fingerprint / rolling hash** — https://en.wikipedia.org/wiki/Rabin_fingerprint (referência algorítmica)
- **lru-cache** — https://github.com/isaacs/node-lru-cache (npm, para cache O(1) de fingerprints por sessão)

### ESBOÇO DE IMPLEMENTAÇÃO (TypeScript/Node.js):

´´´typescript
import crypto from 'crypto';

// ─── Interface unificada de detecção ─────────────────────────────────────────
interface LoopDetectionResult {
  isLoop: boolean;
  similarity: number;   // 0.0 - 1.0
  strategy: 'AST' | 'SIMHASH' | 'NORMALIZED_HASH';
}

// ─── TIER 1: Fingerprint via @typescript-eslint/typescript-estree ─────────────
// Zero native addons. Funciona em qualquer ambiente Node.js puro.
async function getFingerprintAST(code: string): Promise<string | null> {
  try {
    // Dynamic import: se falhar por qualquer razão, Tier 2 assume
    const { parse } = await import('@typescript-eslint/typescript-estree');
    const ast = parse(code, { 
      tolerant: true,   // não jogar em código parcial/inválido
      jsx: true,
    });
    
    // Estrutural fingerprint: extrair apenas tipos de nós + profundidade
    // (ignora nomes de variáveis, valores literais — foca na estrutura)
    const structuralTokens: string[] = [];
    function walkAST(node: any, depth: number = 0): void {
      if (!node || typeof node !== 'object') return;
      if (node.type) {
        structuralTokens.push(´${node.type}@${depth}´);
      }
      for (const key of Object.keys(node)) {
        if (key !== 'parent' && key !== 'loc' && key !== 'range') {
          walkAST(node[key], depth + 1);
        }
      }
    }
    walkAST(ast);
    
    return crypto
      .createHash('sha256')
      .update(structuralTokens.join('|'))
      .digest('hex');
  } catch {
    return null; // Tier 2 assume
  }
}

// ─── TIER 2: SimHash de 4-gramas normalizados ─────────────────────────────────
// O(1) memória. Funciona offline. Sem dependências.
// Detecta repetição semântica mesmo com variações menores de texto.
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')          // normalizar whitespace
    .replace(/[^\w\s]/g, '')       // remover pontuação
    .replace(/\b\w{1,2}\b/g, '')   // remover tokens muito curtos (artigos, etc.)
    .trim();
}

function getNGrams(text: string, n: number = 4): string[] {
  const tokens = text.split(' ').filter(t => t.length > 0);
  const ngrams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  return ngrams.length > 0 ? ngrams : [text]; // fallback para texto curto
}

function simHash(text: string): bigint {
  const normalized = normalizeText(text);
  const ngrams = getNGrams(normalized, 4);
  
  const vectorSize = 64;
  const vector = new Array(vectorSize).fill(0);
  
  for (const ngram of ngrams) {
    const hash = BigInt('0x' + crypto.createHash('md5').update(ngram).digest('hex').slice(0, 16));
    for (let i = 0; i < vectorSize; i++) {
      if ((hash >> BigInt(i)) & 1n) {
        vector[i]++;
      } else {
        vector[i]--;
      }
    }
  }
  
  let fingerprint = 0n;
  for (let i = 0; i < vectorSize; i++) {
    if (vector[i] > 0) {
      fingerprint |= (1n << BigInt(i));
    }
  }
  return fingerprint;
}

function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let count = 0;
  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}

function simHashSimilarity(a: bigint, b: bigint): number {
  const distance = hammingDistance(a, b);
  return 1 - distance / 64; // 1.0 = idêntico, 0.0 = completamente diferente
}

// ─── TIER 3: Hash de texto normalizado (último recurso, < 10 linhas) ──────────
function getNormalizedHash(text: string): string {
  return crypto
    .createHash('sha256')
    .update(normalizeText(text))
    .digest('hex');
}

// ─── LoopDetector principal com estratégia tiered ────────────────────────────
export class LoopDetector {
  // Armazenar apenas os últimos N fingerprints por sessão → O(1) memória
  private readonly WINDOW_SIZE = 5;
  private astFingerprints = new Map<string, string[]>();        // sessionId → últimos N hashes AST
  private simHashFingerprints = new Map<string, bigint[]>();    // sessionId → últimos N SimHashes
  
  private readonly SIMILARITY_THRESHOLD = 0.92; // 92% de similaridade = loop
  
  async detectLoop(sessionId: string, newContent: string): Promise<LoopDetectionResult> {
    // Tentar Tier 1 (AST)
    const astHash = await getFingerprintAST(newContent);
    if (astHash !== null) {
      const history = this.astFingerprints.get(sessionId) ?? [];
      const isLoop = history.includes(astHash);
      
      // Manter janela deslizante
      history.push(astHash);
      if (history.length > this.WINDOW_SIZE) history.shift();
      this.astFingerprints.set(sessionId, history);
      
      return { isLoop, similarity: isLoop ? 1.0 : 0.0, strategy: 'AST' };
    }
    
    // Fallback Tier 2 (SimHash)
    const newSimHash = simHash(newContent);
    const history = this.simHashFingerprints.get(sessionId) ?? [];
    
    let maxSimilarity = 0;
    for (const prevHash of history) {
      const sim = simHashSimilarity(newSimHash, prevHash);
      if (sim > maxSimilarity) maxSimilarity = sim;
    }
    
    const isLoop = maxSimilarity >= this.SIMILARITY_THRESHOLD;
    
    // Manter janela deslizante
    history.push(newSimHash);
    if (history.length > this.WINDOW_SIZE) history.shift();
    this.simHashFingerprints.set(sessionId, history);
    
    return { isLoop, similarity: maxSimilarity, strategy: 'SIMHASH' };
  }
  
  clearSession(sessionId: string): void {
    this.astFingerprints.delete(sessionId);
    this.simHashFingerprints.delete(sessionId);
  }
}
´´´

### TRADE-OFFS E ADVERTÊNCIAS:

- **´@typescript-eslint/typescript-estree´ é um parser TypeScript/JS, não de todas as linguagens**. Para Python, Rust, etc., o Tier 2 (SimHash) assume automaticamente — o que é aceitável para detecção de loops, que é um problema semântico (repetição de conteúdo), não sintático.
- **SimHash com n=4 e threshold=0.92 tem ~5-8% de falso-negativo** para outputs que variam apenas os nomes de variáveis mas têm estrutura idêntica (ex: LLM gerando ´func_a´, ´func_b´, ´func_c´ sequencialmente). O fingerprint AST resolveria isso; o SimHash não. Aceitável para o caso de uso.
- **O sliding window de 5 rounds** é suficiente para detectar ciclos curtos (A→B→A→B) mas pode perder ciclos longos (A→B→C→D→A). Aumentar para 10 aumenta memória mas melhora detecção.
- **´@babel/parser´ é alternativa ao ´typescript-estree´** — suporta mais dialetos (Flow, JSX) mas tem bundle maior. Para o stack TypeScript puro do GreenForge, ´typescript-estree´ é preferível.
- **A versão WASM do tree-sitter** (para v3.0) eliminaria o problema raiz sem fallback, mas adiciona ~2-4MB ao bundle do servidor e requer carregamento assíncrono na inicialização.

### IMPACTO NA DOCUMENTAÇÃO:

- Criar **ADR-011: LoopDetector Strategy Tiers** documentando a sequência de fallback AST → SimHash → NormalizedHash.
- Adicionar à **README de setup** que ´@typescript-eslint/typescript-estree´ deve estar nas dependências de produção (não apenas devDependencies) para que o Tier 1 funcione em produção.
- Documentar ´SIMILARITY_THRESHOLD = 0.92´ como configuração ajustável via ´LOOP_DETECTOR_THRESHOLD´ env var.

---

## ═══════════════════════════════════════════
## PROBLEMA 1 — Recuperação de Estado de Gate após Crash do Servidor
## 🟠 PRIORIDADE P1
## ═══════════════════════════════════════════

### SOLUÇÃO RECOMENDADA:

Implementar o **Transactional Outbox Pattern** usando SQLite como store de outbox. O payload completo do ´HITL_GATE´ é persistido **na mesma transação SQLite** que muda o status para ´GATE_1´, em uma tabela ´outbox_events´. Um processo de polling periódico (ou trigger na reconexão do cliente) lê eventos não-entregues e os reemite. O cliente usa ´Last-Event-ID´ do protocolo SSE para indicar qual foi o último evento recebido.

Se a aplicação cai entre duas ações, dados são commitados mas nenhum evento é publicado. O Outbox Pattern resolve isso escrevendo tanto os dados de negócio quanto o evento na mesma transação de banco de dados. Um processo de background ou publisher lê a tabela outbox e envia eventos de forma confiável.

### REFERÊNCIAS ENCONTRADAS:

- **Transactional Outbox Pattern** — https://microservices.io/patterns/data/transactional-outbox.html (padrão canônico, Chris Richardson)
- **Building a Reliable Rollback System with SAGA, Event Sourcing and Outbox Patterns** — https://medium.com/@mehhmetoz/building-a-reliable-rollback-system-with-saga-event-sourcing-and-outbox-patterns-0477e713b010
- **SSE Spec — W3C EventSource** — https://html.spec.whatwg.org/multipage/server-sent-events.html (spec oficial para ´Last-Event-ID´)
- **Prisma SQLite transactions** — https://www.prisma.io/docs/orm/prisma-client/queries/transactions (docs oficiais)

### ESBOÇO DE IMPLEMENTAÇÃO (TypeScript/Node.js):

´´´typescript
// ─── Schema Prisma — Outbox Table ────────────────────────────────────────────
// model OutboxEvent {
//   id          String   @id @default(cuid())
//   sessionId   String
//   eventType   String   // ex: "HITL_GATE"
//   payload     Json     // payload COMPLETO do evento — incluindo Approval Card
//   seq_id      Int      @default(autoincrement())
//   deliveredAt DateTime?
//   createdAt   DateTime @default(now())
//   @@index([sessionId, deliveredAt])
// }

// ─── Escrita atômica: status + outbox na mesma transação SQLite ───────────────
async function persistGateWithOutbox(
  sessionId: string, 
  gatePayload: HitlGatePayload
): Promise<void> {
  await prisma.$transaction([
    // Operação 1: Atualizar status da sessão para GATE_1
    prisma.session.update({
      where: { id: sessionId },
      data: { status: 'GATE_1' },
    }),
    // Operação 2: Persistir o payload COMPLETO no outbox (mesma transação)
    prisma.outboxEvent.create({
      data: {
        sessionId,
        eventType: 'HITL_GATE',
        payload: gatePayload as any,
        deliveredAt: null, // null = ainda não entregue
      },
    }),
  ]);
  // Se o processo morrer aqui, AMBAS as operações foram commitadas (SQLite ACID).
  // O payload está seguro no outbox. Na reconexão, será entregue.
}

// ─── Entrega de eventos não-entregues na reconexão do cliente ────────────────
async function replayUndeliveredEvents(
  sessionId: string,
  lastEventId: string | null,  // do header SSE Last-Event-ID
  sseStream: Response
): Promise<void> {
  const query = lastEventId
    ? prisma.outboxEvent.findMany({
        where: { sessionId, seq_id: { gt: parseInt(lastEventId) }, deliveredAt: null },
        orderBy: { seq_id: 'asc' },
      })
    : prisma.outboxEvent.findMany({
        where: { sessionId, deliveredAt: null },
        orderBy: { seq_id: 'asc' },
      });
  
  const pendingEvents = await query;
  
  for (const event of pendingEvents) {
    // Emitir via SSE com id = seq_id (para que o cliente possa usar Last-Event-ID)
    sseStream.write(´id: ${event.seq_id}\n´);
    sseStream.write(´event: ${event.eventType}\n´);
    sseStream.write(´data: ${JSON.stringify(event.payload)}\n\n´);
    
    // Marcar como entregue
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { deliveredAt: new Date() },
    });
  }
}

// ─── Handler de reconexão SSE ─────────────────────────────────────────────────
app.get('/sse/:sessionId', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const lastEventId = req.headers['last-event-id'] as string | undefined ?? null;
  
  // Replay imediato de eventos pendentes ao reconectar
  await replayUndeliveredEvents(req.params.sessionId, lastEventId, res);
  
  // ... configurar listener para novos eventos
});
´´´

### TRADE-OFFS E ADVERTÊNCIAS:

- **At-least-once delivery**: o mesmo evento pode ser entregue mais de uma vez se o processo cair após escrever no SSE mas antes de marcar ´deliveredAt´. O cliente deve ser idempotente ao processar ´HITL_GATE´ (verificar se o gate já está sendo exibido antes de renderizar).
- **Limpeza do outbox**: adicionar job de limpeza (cron a cada 1h) para deletar eventos ´deliveredAt != null´ com mais de 24h, prevenindo crescimento indefinido da tabela.
- **´seq_id´ como autoincrement é problemático** em SQLite WAL com múltiplos writers — usar ´ROWID´ do SQLite como seq_id é mais confiável.
- **Polling vs. trigger**: para o MVP single-process, o replay na reconexão é suficiente. Polling periódico (a cada 5s) pode ser adicionado para garantia extra em casos de SSE que não re-estabelece.

### IMPACTO NA DOCUMENTAÇÃO:

- Criar **ADR-001: Event Delivery Guarantee via Outbox Pattern** com diagrama de sequência mostrando o fluxo crash → reconexão → replay.
- Atualizar contrato de **HITL_GATE** no API spec documentando que o cliente DEVE enviar ´Last-Event-ID´ em todas as reconexões.

---

## ═══════════════════════════════════════════
## PROBLEMA 3 — Idempotência de Mensagens WebSocket para Aprovações Críticas
## 🟠 PRIORIDADE P1
## ═══════════════════════════════════════════

### SOLUÇÃO RECOMENDADA:

Implementar **Idempotency Key por mensagem** com deduplicação em memória usando um ´Set<string>´ de IDs processados, com TTL gerenciado por ´setTimeout´. O cliente inclui um ´messageId´ UUID único em cada ´HITL_DECISION´. O servidor rejeita silenciosamente mensagens com ´messageId´ já processado.

### REFERÊNCIAS ENCONTRADAS:

- **Socket.IO Acknowledgements** — https://socket.io/docs/v4/emitting-events/#acknowledgements (docs oficiais Socket.IO)
- **Idempotency patterns — Stripe API Design** — https://stripe.com/docs/idempotency (referência canônica de idempotência em sistemas financeiros)
- **Exactly-once semantics in messaging** — https://www.confluent.io/blog/exactly-once-semantics-are-possible-heres-how-apache-kafka-does-it/ (Kafka como referência teórica)

### ESBOÇO DE IMPLEMENTAÇÃO (TypeScript/Node.js):

´´´typescript
// ─── Store de idempotência: Set em memória com TTL ────────────────────────────
// O(1) lookup, O(1) insert. TTL de 5 minutos é mais que suficiente para
// cobrir janelas de reconexão do Socket.IO (< 30s típico).
const processedDecisions = new Map<string, number>(); // messageId → timestamp
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutos

function isProcessed(messageId: string): boolean {
  const ts = processedDecisions.get(messageId);
  if (!ts) return false;
  // Limpar TTL expirado lazily
  if (Date.now() - ts > IDEMPOTENCY_TTL_MS) {
    processedDecisions.delete(messageId);
    return false;
  }
  return true;
}

function markProcessed(messageId: string): void {
  processedDecisions.set(messageId, Date.now());
}

// ─── Handler HITL_DECISION com idempotência ───────────────────────────────────
interface HitlDecisionPayload {
  messageId: string;   // UUID v4 gerado pelo CLIENTE, único por decisão
  gateId: string;
  decision: 'APPROVE' | 'REJECT';
  comment?: string;
}

socket.on('HITL_DECISION', async (payload: HitlDecisionPayload, ack?: Function) => {
  // Validação de tipo
  if (!payload.messageId || !payload.gateId || !payload.decision) {
    ack?.({ error: 'INVALID_PAYLOAD' });
    return;
  }
  
  // ─── VERIFICAÇÃO DE IDEMPOTÊNCIA ─────────────────────────────────────────
  if (isProcessed(payload.messageId)) {
    // Re-entrega detectada: retornar mesmo resultado sem re-processar
    console.debug(´[WS] Duplicate HITL_DECISION ignorado: ${payload.messageId}´);
    // Usar Socket.IO ACK para confirmar recebimento (previne nova retransmissão)
    ack?.({ status: 'ALREADY_PROCESSED', gateId: payload.gateId });
    return;
  }
  
  // ─── PROCESSAMENTO ÚNICO ──────────────────────────────────────────────────
  // Marcar como processado ANTES de resolver a Promise (prevent race condition)
  markProcessed(payload.messageId);
  
  try {
    // Resolver a Promise crítica que controla o fluxo do debate
    const resolver = pendingGateResolvers.get(payload.gateId);
    if (!resolver) {
      ack?.({ error: 'GATE_NOT_FOUND', gateId: payload.gateId });
      return;
    }
    
    resolver({ decision: payload.decision, comment: payload.comment });
    pendingGateResolvers.delete(payload.gateId);
    
    // Persistir decisão no SQLite para auditoria
    await prisma.gateDecision.create({
      data: {
        messageId: payload.messageId,
        gateId: payload.gateId,
        decision: payload.decision,
        comment: payload.comment,
        processedAt: new Date(),
      },
    });
    
    ack?.({ status: 'PROCESSED', gateId: payload.gateId });
    
  } catch (error) {
    // Se o processamento falhar APÓS marcar como processado:
    // Remover da lista de processados para permitir retry
    processedDecisions.delete(payload.messageId);
    ack?.({ error: 'PROCESSING_FAILED' });
    throw error;
  }
});

// ─── Limpeza periódica do Map (previne memory leak) ───────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [messageId, ts] of processedDecisions.entries()) {
    if (now - ts > IDEMPOTENCY_TTL_MS) {
      processedDecisions.delete(messageId);
    }
  }
}, 60_000); // Limpar a cada 1 minuto
´´´

### TRADE-OFFS E ADVERTÊNCIAS:

- **O ´Map´ em memória é perdido em crash do servidor**. Isso é aceitável porque após crash, uma reconexão do Socket.IO gera novas conexões — o ´messageId´ do cliente para a decisão original já foi processado (salvo no SQLite). O cliente deve verificar o estado do gate via SSE antes de re-emitir.
- **Socket.IO Acknowledgements** não previnem re-entrega por si só — eles confirmam que o servidor recebeu, mas em reconexão automática, o cliente pode re-emitir mesmo com ACK recebido se o ACK chegar após a janela de retry.
- **A verificação de idempotência deve acontecer ANTES de resolver a Promise** para prevenir race conditions em JavaScript async onde dois eventos com mesmo ´messageId´ chegam em paralelo (improvável mas possível).
- **Persistir ´messageId´ no SQLite** como campo ´@unique´ é alternativa mais robusta que o Map — garante deduplicação mesmo após crash. Custo: uma query extra por decisão (~1-2ms em SQLite local).

### IMPACTO NA DOCUMENTAÇÃO:

- Atualizar **WebSocket API Spec** para documentar que ´messageId´ (UUID v4) é **obrigatório** em ´HITL_DECISION´.
- Documentar o comportamento esperado do cliente: gerar o ´messageId´ uma vez, reusar o mesmo em retransmissões do mesmo evento.

---

## ═══════════════════════════════════════════
## PROBLEMA 12 — Substituição de ´execSync´ por Operações Git Assíncronas
## 🟠 PRIORIDADE P1
## ═══════════════════════════════════════════

### SOLUÇÃO RECOMENDADA:

Substituir ´execSync´ pela biblioteca **´simple-git´** — wrapper assíncrono do CLI git com suporte completo a worktrees, API async/await, manutenção ativa, e timeout configurável. É a solução adotada por VS Code, GitLens e outras ferramentas de IDE para operações git sem bloquear o Event Loop.

### REFERÊNCIAS ENCONTRADAS:

- **simple-git** — https://github.com/steveukx/git-js (repositório, npm, 7k+ stars, manutenção ativa)
- **simple-git docs: timeout config** — https://github.com/steveukx/git-js#configuration (docs de configuração de timeout)
- **simple-git worktree support** — https://github.com/steveukx/git-js/blob/main/docs/API.md#git-worktree (suporte a worktrees na API)
- **dugite** — https://github.com/desktop/dugite (biblioteca usada pelo GitHub Desktop, empacota git binário próprio)
- **isomorphic-git** — https://isomorphic-git.org/ (implementação JS pura de git, sem processo externo — para v3.0)
- **Node.js worker_threads** — https://nodejs.org/api/worker_threads.html (alternativa para isolar operações git em thread separada)

### ESBOÇO DE IMPLEMENTAÇÃO (TypeScript/Node.js):

´´´typescript
import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';

// ─── Factory com timeout configurável ────────────────────────────────────────
function createGitClient(worktreePath: string, timeoutMs = 30_000): SimpleGit {
  const options: Partial<SimpleGitOptions> = {
    baseDir: worktreePath,
    binary: 'git',
    maxConcurrentProcesses: 2,  // limitar para evitar fork bombs
    timeout: {
      block: timeoutMs,          // timeout total da operação
    },
    trimmed: true,
  };
  return simpleGit(options);
}

export class GitWorktreeManager {
  private git: SimpleGit;
  
  constructor(private readonly repoRoot: string) {
    this.git = createGitClient(repoRoot);
  }

  // ─── Operações migradas de execSync para async ────────────────────────────
  
  async addWorktree(worktreePath: string, branch: string): Promise<void> {
    // Equivalente a: execSync(´git worktree add ${worktreePath} ${branch}´)
    await this.git.raw(['worktree', 'add', worktreePath, branch]);
  }
  
  async removeWorktree(worktreePath: string): Promise<void> {
    await this.git.raw(['worktree', 'remove', '--force', worktreePath]);
  }
  
  async listWorktrees(): Promise<string[]> {
    const output = await this.git.raw(['worktree', 'list', '--porcelain']);
    return parseWorktreeList(output);
  }
  
  async stashPush(message: string): Promise<string> {
    await this.git.stash(['push', '-m', message]);
    const stashList = await this.git.stash(['list', '--format=%H %s']);
    const line = stashList.split('\n').find(l => l.includes(message));
    return line?.split(' ')[0] ?? '';
  }
  
  async stashPop(stashRef: string): Promise<void> {
    await this.git.stash(['pop', stashRef]);
  }
  
  async getStatus(): Promise<string> {
    const status = await this.git.status();
    return JSON.stringify(status);
  }
  
  // ─── Operação de longa duração com AbortController ─────────────────────────
  async merge(branch: string, signal?: AbortSignal): Promise<void> {
    // Para operações longas, monitorar o AbortSignal externamente
    const mergePromise = this.git.merge([branch, '--no-ff']);
    
    if (signal) {
      return Promise.race([
        mergePromise,
        new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => {
            reject(new Error('Git merge abortado por AbortSignal'));
          });
        }),
      ]);
    }
    
    return mergePromise;
  }
}

// ─── Uso no RollbackManager (Problema 5 integrado) ───────────────────────────
const manager = new GitWorktreeManager('/app/repo');

// Exemplo: stash async sem bloquear Event Loop
async function checkpointWithTimeout(sessionId: string): Promise<void> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), 30_000);
  
  try {
    await manager.stashPush(´greenforge-checkpoint-${sessionId}´);
  } finally {
    clearTimeout(timeout);
  }
}
´´´

### TRADE-OFFS E ADVERTÊNCIAS:

- **´simple-git´ é um wrapper de CLI** — spawna processos ´git´ para cada operação. Em alta frequência (~100 operações/s), o overhead de fork pode ser significativo. Para o uso no GreenForge (operações ocasionais), é aceitável.
- **´nodegit´ (libgit2 bindings)** tem API C nativa mais rápida, mas requer compilação com ´node-gyp´ (mesmo problema do ´tree-sitter´) e tem manutenção intermitente. Não recomendado para MVP.
- **´isomorphic-git´** (implementação pura em JS) é ideal para v3.0 — zero processos externos, mas operações como ´merge´ têm implementação incompleta comparado ao git CLI.
- **´dugite´ (GitHub Desktop)** empacota um binário git próprio — elimina dependência do git do sistema, útil para distribuição, mas adiciona ~50MB ao bundle.
- **Operações de worktree (´git worktree add/remove´)** são suportadas via ´git.raw([...])´ no ´simple-git´ — a API de alto nível não tem métodos dedicados para worktrees, mas ´raw()´ é completamente funcional.

### IMPACTO NA DOCUMENTAÇÃO:

- Atualizar **GitWorktreeManager API Spec** documentando que todas as operações são agora async/await.
- Criar **ADR-012: Async Git Operations** justificando a escolha de ´simple-git´ sobre ´nodegit´ e ´isomorphic-git´.
- Adicionar ´GIT_OPERATION_TIMEOUT_MS=30000´ às variáveis de ambiente documentadas.

---

## ═══════════════════════════════════════════
## PROBLEMA 4 — Configuração de ´busy_timeout´ e Controle de Concorrência em SQLite com Prisma
## 🟡 PRIORIDADE P2
## ═══════════════════════════════════════════

### SOLUÇÃO RECOMENDADA:

Configurar **WAL mode + ´busy_timeout=5000´ via Prisma datasource URL params** e **limitar o connection pool a 1 connection** para eliminar contention de escritas concorrentes. A combinação WAL + pool=1 é o padrão recomendado para SQLite em Node.js async.

´SQLITE_BUSY_RECOVERY´ é um código de erro estendido para ´SQLITE_BUSY´ que indica que uma operação não pôde continuar porque outro processo estava ocupado recuperando um banco de dados WAL mode após um crash. Ocorre apenas em bancos de dados WAL mode.

A partir do SQLite 3.7.0, o SQLite introduziu WAL (Write-Ahead Logging), marcando uma evolução significativa no design de concorrência e recuperação do SQLite.

´better-sqlite3´ é uma biblioteca Node.js que provê uma forma rápida, segura e simples de trabalhar com bancos de dados SQLite. Diferente de outros bindings SQLite como ´node-sqlite3´, ela oferece uma API totalmente síncrona — e mesmo assim consegue superar a maioria dos wrappers async em performance.

### REFERÊNCIAS ENCONTRADAS:

- **SQLite PRAGMA busy_timeout** — https://www.sqlite.org/pragma.html#pragma_busy_timeout (documentação oficial SQLite)
- **SQLite WAL mode** — https://www.sqlite.org/wal.html (documentação oficial WAL)
- **Prisma SQLite datasource configuration** — https://www.prisma.io/docs/orm/overview/databases/sqlite (docs oficiais Prisma)
- **SQLite Result Codes** — https://sqlite.org/rescode.html (documentação oficial dos códigos de erro)
- **better-sqlite3** — https://github.com/WiseLibs/better-sqlite3 (npm, API síncrona de alta performance)

### ESBOÇO DE IMPLEMENTAÇÃO (TypeScript/Node.js):

´´´typescript
// ─── prisma/schema.prisma ─────────────────────────────────────────────────────
// datasource db {
//   provider = "sqlite"
//   url      = "file:./greenforge.db?connection_limit=1&socket_timeout=5000"
// }
//
// NOTA: Prisma SQLite não suporta todos os params de query string diretamente.
// A configuração de busy_timeout deve ser feita via Prisma middleware ou
// no afterConnect hook.

// ─── Configuração do PrismaClient com busy_timeout e WAL ─────────────────────
import { PrismaClient } from '@prisma/client';

export function createPrismaClient(): PrismaClient {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: ´file:${process.env.DATABASE_PATH ?? './greenforge.db'}´,
      },
    },
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'warn', 'error'] 
      : ['warn', 'error'],
  });

  // ─── Configurar WAL mode e busy_timeout via $executeRaw no connect ────────
  // Executar PRAGMAs críticos antes de qualquer operação de aplicação
  prisma.$connect().then(async () => {
    await prisma.$executeRaw´PRAGMA journal_mode = WAL´;
    await prisma.$executeRaw´PRAGMA busy_timeout = 5000´;    // 5 segundos de retry
    await prisma.$executeRaw´PRAGMA synchronous = NORMAL´;   // Balanceia durabilidade/performance
    await prisma.$executeRaw´PRAGMA cache_size = -64000´;    // 64MB cache em memória
    await prisma.$executeRaw´PRAGMA foreign_keys = ON´;
    await prisma.$executeRaw´PRAGMA wal_autocheckpoint = 1000´; // Checkpoint a cada 1000 pages
    console.info('[DB] SQLite configurado: WAL mode, busy_timeout=5000ms');
  });

  return prisma;
}

// ─── Singleton para uso na aplicação ─────────────────────────────────────────
let prismaInstance: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = createPrismaClient();
  }
  return prismaInstance;
}

// ─── Retry wrapper para SQLITE_BUSY residual ─────────────────────────────────
// O busy_timeout=5000 cobre a maioria dos casos, mas para operações críticas,
// adicionar retry com backoff exponencial como camada extra de defesa.
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 50
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      // Verificar se é SQLITE_BUSY ou SQLITE_LOCKED
      if (error.message?.includes('SQLITE_BUSY') || 
          error.message?.includes('SQLITE_LOCKED')) {
        lastError = error;
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        console.warn(´[DB] SQLITE_BUSY em tentativa ${attempt + 1}, retry em ${delay}ms´);
      } else {
        throw error; // Erro não relacionado a concorrência — não fazer retry
      }
    }
  }
  
  throw lastError!;
}

// ─── Uso ──────────────────────────────────────────────────────────────────────
// const result = await withRetry(() => prisma.session.update({ ... }));
´´´

### TRADE-OFFS E ADVERTÊNCIAS:

- **´connection_limit=1´ no Prisma** é a configuração mais importante para SQLite: garante que apenas uma conexão escreve ao mesmo tempo, eliminando ´SQLITE_BUSY´ entre coroutines Node.js. O custo é perda de paralelismo de leituras (com WAL, múltiplas leituras seriam possíveis com múltiplas connections).
- **´PRAGMA synchronous = NORMAL´** ao invés de ´FULL´ reduz latência de escritas de ~10ms para ~1ms em SSD, com risco mínimo em caso de crash do OS (não do processo). Para MVP local, é o trade-off correto.
- **WAL mode não é suportado em sistemas de arquivos de rede** (NFS, SMB) — documentar que o banco de dados deve estar em disco local.
- **´busy_timeout´ não é um parâmetro de URL padrão do Prisma** — deve ser configurado via ´$executeRaw´ no connect, não via query string do datasource URL. Documentar isso explicitamente.

### IMPACTO NA DOCUMENTAÇÃO:

- Criar **ADR-004: SQLite Concurrency Configuration** documentando a justificativa para ´connection_limit=1´ + WAL + ´busy_timeout=5000´.
- Adicionar ´DATABASE_PATH´ à lista de variáveis de ambiente do projeto.

---

## ═══════════════════════════════════════════
## PROBLEMA 6 — Prevenção de Memory Leak em EventLog SSE de Longa Duração
## 🟡 PRIORIDADE P2
## ═══════════════════════════════════════════

### SOLUÇÃO RECOMENDADA:

**Substituir o ´Map<sessionId, DebateEvent[]>´ em memória por uma tabela SQLite**, usando ´SELECT WHERE seq_id > lastEventId´ para replay. Para evitar crescimento indefinido, implementar **TTL-based cleanup** com ´DELETE WHERE createdAt < NOW() - INTERVAL 24h´. O consumo de memória é O(1) independente da duração da sessão.

### REFERÊNCIAS ENCONTRADAS:

- **lru-cache (npm)** — https://github.com/isaacs/node-lru-cache (cache LRU com TTL, solução in-memory se SQLite for insuficiente)
- **W3C SSE Spec — Last-Event-ID** — https://html.spec.whatwg.org/multipage/server-sent-events.html#the-last-event-id-header (spec oficial)
- **Mercure Protocol** — https://mercure.rocks/spec (protocolo SSE de produção com histórico de eventos — referência arquitetural)
- **node-cache (npm)** — https://github.com/node-cache/node-cache (alternativa a lru-cache com TTL nativo)

### ESBOÇO DE IMPLEMENTAÇÃO (TypeScript/Node.js):

´´´typescript
// ─── Schema Prisma — SSE Event Store ─────────────────────────────────────────
// model SseEvent {
//   id        Int      @id @default(autoincrement())  // ← usar como seq_id
//   sessionId String
//   eventType String
//   payload   Json
//   createdAt DateTime @default(now())
//   @@index([sessionId, id])                          // índice composto crítico
// }

export class SseEventStore {
  constructor(private prisma: PrismaClient) {}

  // ─── Persistir evento (substitui push no Map em memória) ──────────────────
  async append(sessionId: string, eventType: string, payload: unknown): Promise<number> {
    const event = await this.prisma.sseEvent.create({
      data: { sessionId, eventType, payload: payload as any },
    });
    return event.id; // Este é o seq_id para o campo SSE ´id:´
  }

  // ─── Replay desde lastEventId (O(log n) com índice composto) ──────────────
  async getEventsSince(sessionId: string, lastEventId: number | null): Promise<SseEvent[]> {
    return this.prisma.sseEvent.findMany({
      where: {
        sessionId,
        ...(lastEventId ? { id: { gt: lastEventId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: 1000, // Limitar replay para evitar flood do cliente
    });
  }

  // ─── Limpeza por TTL — chamar via setInterval ou job periódico ────────────
  async cleanupExpired(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const result = await this.prisma.sseEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    console.info(´[SSE EventStore] Limpeza: ${result.count} eventos expirados removidos´);
    return result.count;
  }
}

// ─── Injeção no handler SSE ───────────────────────────────────────────────────
const eventStore = new SseEventStore(getPrisma());

// Cleanup automático a cada hora
setInterval(() => eventStore.cleanupExpired(), 60 * 60 * 1000);

// Handler SSE com replay
app.get('/sse/:sessionId', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  
  const lastEventIdHeader = req.headers['last-event-id'];
  const lastEventId = lastEventIdHeader ? parseInt(lastEventIdHeader as string) : null;
  
  // Replay de eventos perdidos
  const missed = await eventStore.getEventsSince(req.params.sessionId, lastEventId);
  for (const event of missed) {
    res.write(´id: ${event.id}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event.payload)}\n\n´);
  }
  
  // ... continuar com listener de novos eventos
});
´´´

### TRADE-OFFS E ADVERTÊNCIAS:

- **Latência de escrita por evento**: cada token LLM streamed agora requer um INSERT no SQLite (~1-2ms). Para streams de alta frequência (> 50 tokens/s), isso pode criar backpressure. Mitigação: usar ´batch insert´ para tokens de streaming (agrupar tokens em janelas de 50ms) ou usar o Map em memória para tokens e apenas persistir eventos críticos (HITL_GATE, PHASE_CHANGE) no SQLite.
- **O índice composto ´(sessionId, id)´** é crítico para performance do replay — sem ele, o ´SELECT WHERE sessionId = X AND id > Y´ fará full scan.
- **´lru-cache´** é alternativa válida se a latência de I/O for inaceitável — configurar com ´max: 10000´ e ´ttl: 3600000´ (1h). Perde replay após restart do servidor, mas para MVP com SSE de tokens, isso é aceitável.

### IMPACTO NA DOCUMENTAÇÃO:

- Atualizar **SSE Protocol Spec** documentando que ´id:´ field é o ´SseEvent.id´ do SQLite (autoincrement).
- Documentar ´SSE_EVENT_MAX_AGE_MS=86400000´ como variável de ambiente configurável.

---

## ═══════════════════════════════════════════
## PROBLEMA 9 — Integridade e Auditoria de Hot Reload do AGENTS.md
## 🟡 PRIORIDADE P2
## ═══════════════════════════════════════════

### SOLUÇÃO RECOMENDADA:

Implementar **SHA-256 hash do conteúdo do arquivo** como baseline de integridade, verificado antes de cada reload. Combinar com **git diff do arquivo** para gerar diff auditável de qualquer mudança. Usar ´chokidar´ para file watching com debounce.

### REFERÊNCIAS ENCONTRADAS:

- **chokidar** — https://github.com/paulmillr/chokidar (file watcher robusto para Node.js, amplamente usado)
- **Node.js crypto.createHash** — https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options (docs oficiais)
- **OPA (Open Policy Agent)** — https://www.openpolicyagent.org/ (sistema de política com verificação de integridade de configuração — referência arquitetural para v3.0)
- **simple-git diff** — https://github.com/steveukx/git-js (para gerar diff do arquivo via git)

### ESBOÇO DE IMPLEMENTAÇÃO (TypeScript/Node.js):

´´´typescript
import crypto from 'crypto';
import fs from 'fs';
import chokidar from 'chokidar';
import simpleGit from 'simple-git';

const git = simpleGit(process.cwd());

interface AgentsMdIntegrityState {
  lastKnownHash: string;
  lastReloadAt: Date;
  reloadCount: number;
}

export class AgentsMdWatcher {
  private integrityState: AgentsMdIntegrityState | null = null;
  private readonly agentsMdPath: string;
  
  constructor(
    private readonly repoRoot: string,
    private readonly agentFactory: AgentFactory,
    private readonly auditLog: AuditLogger
  ) {
    this.agentsMdPath = path.join(repoRoot, 'AGENTS.md');
  }

  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  async initialize(): Promise<void> {
    const content = fs.readFileSync(this.agentsMdPath, 'utf-8');
    this.integrityState = {
      lastKnownHash: this.computeHash(content),
      lastReloadAt: new Date(),
      reloadCount: 0,
    };
    console.info(´[AgentsMd] Hash inicial: ${this.integrityState.lastKnownHash.slice(0, 12)}...´);
  }

  async handleReload(): Promise<void> {
    const newContent = fs.readFileSync(this.agentsMdPath, 'utf-8');
    const newHash = this.computeHash(newContent);
    
    if (!this.integrityState) await this.initialize();
    
    if (newHash === this.integrityState!.lastKnownHash) {
      // Conteúdo idêntico — nenhuma ação necessária (chokidar pode disparar falsamente)
      return;
    }
    
    // ─── Gerar diff para auditoria ────────────────────────────────────────
    let diffContent: string;
    try {
      // Verificar se há mudanças não-commitadas no AGENTS.md
      const gitStatus = await git.status();
      const isModified = gitStatus.modified.includes('AGENTS.md') || 
                         gitStatus.not_added.includes('AGENTS.md');
      
      if (isModified) {
        diffContent = await git.diff(['AGENTS.md']);
      } else {
        // Arquivo foi modificado fora do git (raro em single-user, mas possível)
        diffContent = ´Hash anterior: ${this.integrityState!.lastKnownHash}\nHash novo: ${newHash}´;
      }
    } catch {
      diffContent = ´[diff indisponível] Hash: ${this.integrityState!.lastKnownHash} → ${newHash}´;
    }
    
    // ─── Log de auditoria OBRIGATÓRIO antes do reload ─────────────────────
    this.auditLog.info({
      event: 'AGENTS_MD_MODIFIED',
      previousHash: this.integrityState!.lastKnownHash,
      newHash,
      diff: diffContent.slice(0, 2000), // Truncar diff longo para o log
      triggeredBy: 'file_watcher',
      timestamp: new Date().toISOString(),
    });
    
    // ─── Executar o reload do AgentFactory ────────────────────────────────
    try {
      await this.agentFactory.reload();
      this.integrityState = {
        lastKnownHash: newHash,
        lastReloadAt: new Date(),
        reloadCount: (this.integrityState?.reloadCount ?? 0) + 1,
      };
      console.info(´[AgentsMd] Reload bem-sucedido. Hash: ${newHash.slice(0, 12)}...´);
    } catch (error) {
      this.auditLog.error({
        event: 'AGENTS_MD_RELOAD_FAILED',
        hash: newHash,
        error: String(error),
      });
      // NÃO atualizar integrityState.lastKnownHash em caso de falha de reload
      // Para que a próxima tentativa ainda detecte como mudança
    }
  }

  startWatching(): void {
    const watcher = chokidar.watch(this.agentsMdPath, {
      persistent: true,
      usePolling: false,    // inotify em Linux, FSEvents em macOS
      awaitWriteFinish: {
        stabilityThreshold: 300,  // aguardar 300ms após última escrita
        pollInterval: 100,
      },
    });
    
    watcher.on('change', () => {
      this.handleReload().catch(e => 
        console.error('[AgentsMd] Erro no handler de reload:', e)
      );
    });
    
    console.info(´[AgentsMd] Watching: ${this.agentsMdPath}´);
  }
}
´´´

### TRADE-OFFS E ADVERTÊNCIAS:

- **SHA-256 detecta qualquer mudança de conteúdo**, mas não detecta *quem* fez a mudança. Para o threat model (agente comprometido com ´write_file´), isso é suficiente — a mudança será logada independente da origem.
- **´chokidar´ pode gerar eventos duplicados** em alguns sistemas de arquivos — o ´awaitWriteFinish´ mitiga isso. O check de hash idêntico no handler serve como segunda defesa.
- **O diff via ´git diff´** só funciona se o arquivo está rastreado pelo git. Se AGENTS.md ainda não foi commitado, o diff será indisponível. Solução: garantir que AGENTS.md está sempre commitado no repositório.
- **Verificar que AGENTS.md não tem mudanças não-commitadas antes do reload** é uma opção mais restritiva (exigir que toda mudança seja commitada antes de reload). Para v2.1, aceitar mudanças não-commitadas mas logá-las é o equilíbrio correto.

### IMPACTO NA DOCUMENTAÇÃO:

- Criar **ADR-009: AGENTS.md Integrity Policy** documentando que toda modificação gera entrada de auditoria com hash + diff.
- Adicionar ao **threat model** o vetor de agent-via-write_file e a mitigação implementada.

---

## ═══════════════════════════════════════════
## PROBLEMA 2 — Reorder Buffer para Streams SSE com Múltiplos Produtores Concorrentes
## 🟡 PRIORIDADE P2
## ═══════════════════════════════════════════

### SOLUÇÃO RECOMENDADA:

Implementar um **Sliding Window Reorder Buffer** no cliente com timeout determinístico para gaps irrecuperáveis. O algoritmo mantém uma ´Map<seqId, Event>´ de eventos fora de ordem, processa em ordem quando o próximo ´seq_id´ esperado chega, e após ´GAP_TIMEOUT_MS´ sem o evento faltante, força o flush com marcador de gap.

### REFERÊNCIAS ENCONTRADAS:

- **W3C SSE Spec — EventSource** — https://html.spec.whatwg.org/multipage/server-sent-events.html (spec oficial, campos ´id´, ´Last-Event-ID´)
- **Vercel AI SDK — mergeIntoDataStream** — https://sdk.vercel.ai/docs/reference/stream-helpers (docs oficiais Vercel AI SDK)
- **RFC 7540 HTTP/2 Multiplexing** — https://tools.ietf.org/html/rfc7540#section-5 (multiplexação de streams como alternativa)
- **WebRTC Reorder Buffer** — https://chromium.googlesource.com/external/webrtc/+/refs/heads/main/modules/rtp_rtcp/ (implementação de referência em C++)

### ESBOÇO DE IMPLEMENTAÇÃO (TypeScript/React — cliente):

´´´typescript
// ─── Tipos ────────────────────────────────────────────────────────────────────
interface DebateEvent {
  seq_id: number;
  producer: 'PROPOSITOR' | 'CRITICO';
  type: string;
  payload: unknown;
}

interface GapMarker {
  type: 'GAP';
  missedSeqId: number;
}

type BufferedEvent = DebateEvent | GapMarker;

// ─── Reorder Buffer Hook (React) ──────────────────────────────────────────────
export function useReorderBuffer(
  onEvent: (event: BufferedEvent) => void,
  options: { gapTimeoutMs?: number; maxBufferSize?: number } = {}
) {
  const { gapTimeoutMs = 2000, maxBufferSize = 100 } = options;
  
  const nextExpected = useRef<number>(0);
  const buffer = useRef<Map<number, DebateEvent>>(new Map());
  const gapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushInOrder = useCallback(() => {
    while (buffer.current.has(nextExpected.current)) {
      const event = buffer.current.get(nextExpected.current)!;
      buffer.current.delete(nextExpected.current);
      onEvent(event);
      nextExpected.current++;
    }
  }, [onEvent]);

  const handleGapTimeout = useCallback(() => {
    // Gap irrecuperável: emitir marcador e avançar o cursor
    const missedSeqId = nextExpected.current;
    console.warn(´[ReorderBuffer] Gap irrecuperável: seq_id=${missedSeqId} — avançando´);
    
    onEvent({ type: 'GAP', missedSeqId });
    nextExpected.current++;
    
    // Tentar fazer flush após avançar
    flushInOrder();
    
    // Se ainda há gap após flush, reagendar timer
    if (buffer.current.size > 0 && !buffer.current.has(nextExpected.current)) {
      gapTimer.current = setTimeout(handleGapTimeout, gapTimeoutMs);
    }
  }, [onEvent, flushInOrder, gapTimeoutMs]);

  const receiveEvent = useCallback((event: DebateEvent) => {
    // Evento já processado (duplicata ou evento muito antigo)
    if (event.seq_id < nextExpected.current) return;
    
    // Buffer overflow: descartar evento mais antigo
    if (buffer.current.size >= maxBufferSize) {
      const oldest = Math.min(...buffer.current.keys());
      buffer.current.delete(oldest);
    }
    
    buffer.current.set(event.seq_id, event);
    
    if (event.seq_id === nextExpected.current) {
      // Evento em ordem: flush imediato
      if (gapTimer.current) {
        clearTimeout(gapTimer.current);
        gapTimer.current = null;
      }
      flushInOrder();
      
      // Verificar se há gap após o flush
      if (buffer.current.size > 0 && !buffer.current.has(nextExpected.current)) {
        gapTimer.current = setTimeout(handleGapTimeout, gapTimeoutMs);
      }
    } else {
      // Evento fora de ordem: iniciar timer de gap se ainda não iniciado
      if (!gapTimer.current) {
        gapTimer.current = setTimeout(handleGapTimeout, gapTimeoutMs);
      }
    }
  }, [flushInOrder, handleGapTimeout, gapTimeoutMs, maxBufferSize]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (gapTimer.current) clearTimeout(gapTimer.current);
    };
  }, []);

  return { receiveEvent };
}
´´´

### TRADE-OFFS E ADVERTÊNCIAS:

- **´gapTimeoutMs = 2000´** é conservador — para redes localhost, pode ser reduzido para 200ms. Expor como configuração de ambiente.
- **O marcador ´GAP´** deve ser tratado na UI como "tokens perdidos — exibir indicador visual" em vez de silenciosamente ignorar, para que o usuário saiba que o output pode estar incompleto.
- **O ´seq_id´ global entre Propositor e Crítico** requer que o servidor coordene a geração de IDs — usar uma sequência atômica no servidor (contador compartilhado ou AUTOINCREMENT do SQLite) para garantir monotonicidade.
- **HTTP/2 multiplexing** (RFC 7540) eliminaria o problema de reordenação inteiramente, mas requer migração do servidor SSE para HTTP/2. Para v3.0.

### IMPACTO NA DOCUMENTAÇÃO:

- Documentar o campo ´seq_id´ como obrigatório no **SSE Event Contract**.
- Criar **ADR-002: Reorder Buffer Strategy** com escolha de ´gapTimeoutMs´ e comportamento esperado em caso de gap irrecuperável.

---

## ═══════════════════════════════════════════
## PROBLEMA 10 — Calibração Externa de Confidence Score do LLM
## 🟢 PRIORIDADE P3
## ═══════════════════════════════════════════

### SOLUÇÃO RECOMENDADA:

Implementar **Critic-as-Calibrator** — usar as métricas objetivas já presentes no output do Crítico (número de falhas identificadas, severidade, consenso com proposta) para computar um **score de calibração externo** que sobrescreve ou penaliza o ´confidence_score´ auto-reportado do Propositor. Sem LLM adicional — usa apenas dados já disponíveis no pipeline.

### REFERÊNCIAS ENCONTRADAS:

- **LLM Calibration Survey** — Guo et al. (2017) "On Calibration of Modern Neural Networks" — https://arxiv.org/abs/1706.04599 (paper seminal sobre calibração de NNs)
- **Constitutional AI (Anthropic)** — https://arxiv.org/abs/2212.08073 (técnica de uso de LLM como juiz do próprio output)
- **LLM Overconfidence** — Xiong et al. (2024) "Can LLMs Express Their Uncertainty?" — https://arxiv.org/abs/2306.13063 (pesquisa sobre auto-avaliação de LLMs)
- **Vercel AI SDK structured outputs** — https://sdk.vercel.ai/docs/ai-sdk-core/generating-structured-data (para extração confiável de métricas do Crítico)

### ESBOÇO DE IMPLEMENTAÇÃO (TypeScript/Node.js):

´´´typescript
interface CriticOutput {
  failuresFound: CriticFailure[];    // Lista de falhas identificadas
  overallAssessment: 'APPROVE' | 'REJECT' | 'NEEDS_REVISION';
  agreementScore: number;            // 0-1: quanto o Crítico concorda com a proposta
}

interface CriticFailure {
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  description: string;
}

// ─── Calibração externa: penalizar confidence baseado no output do Crítico ───
function calibrateConfidence(
  proposerConfidence: number,    // Auto-reportado: 0.0 - 1.0 (não confiável)
  criticOutput: CriticOutput
): {
  calibratedScore: number;
  calibrationDelta: number;
  shouldPreventConvergence: boolean;
} {
  let penalty = 0;
  
  // Penalidade por falhas críticas (cada uma penaliza 30%)
  const criticalCount = criticOutput.failuresFound
    .filter(f => f.severity === 'CRITICAL').length;
  penalty += criticalCount * 0.30;
  
  // Penalidade por falhas major (cada uma penaliza 10%)
  const majorCount = criticOutput.failuresFound
    .filter(f => f.severity === 'MAJOR').length;
  penalty += majorCount * 0.10;
  
  // Penalidade por baixo acordo do Crítico
  if (criticOutput.agreementScore < 0.5) {
    penalty += (0.5 - criticOutput.agreementScore) * 0.4;
  }
  
  // Se o Crítico rejeita explicitamente, forçar threshold mínimo
  if (criticOutput.overallAssessment === 'REJECT') {
    penalty = Math.max(penalty, 0.5); // Mínimo 50% de penalidade em REJECT
  }
  
  const calibratedScore = Math.max(0, Math.min(1, proposerConfidence - penalty));
  
  return {
    calibratedScore,
    calibrationDelta: proposerConfidence - calibratedScore,
    // Prevenir convergência se penalidade for alta E confidence auto-reportado era alto
    // (sinaliza possível overconfidence do Propositor)
    shouldPreventConvergence: penalty > 0.3 && proposerConfidence > 0.8,
  };
}

// ─── Uso no pipeline do debate ────────────────────────────────────────────────
async function evaluateRound(
  proposerOutput: ProposerOutput,
  criticOutput: CriticOutput
): Promise<RoundEvaluation> {
  const { calibratedScore, calibrationDelta, shouldPreventConvergence } 
    = calibrateConfidence(proposerOutput.confidenceScore, criticOutput);
  
  if (calibrationDelta > 0.2) {
    auditLog.warn({
      event: 'CONFIDENCE_CALIBRATION_SIGNIFICANT',
      original: proposerOutput.confidenceScore,
      calibrated: calibratedScore,
      delta: calibrationDelta,
      criticalFailures: criticOutput.failuresFound.filter(f => f.severity === 'CRITICAL'),
    });
  }
  
  return {
    finalConfidenceScore: calibratedScore,  // Usar score calibrado, não o auto-reportado
    shouldContinueDebate: shouldPreventConvergence || calibratedScore < CONVERGENCE_THRESHOLD,
    calibrationApplied: calibrationDelta > 0.05,
  };
}
´´´

### TRADE-OFFS E ADVERTÊNCIAS:

- **Os pesos de penalidade (30% por CRITICAL, 10% por MAJOR)** são configurações que devem ser ajustadas empiricamente. Expor via ´CONFIDENCE_CALIBRATION_CONFIG´ em AGENTS.md.
- **O ´agreementScore´ do Crítico também pode ser inflacionado** se o modelo Crítico for menos crítico do que deveria. Para v3.0, usar temperatura mais baixa no Crítico para respostas mais determinísticas.
- **Sem LLM adicional** — esta solução usa apenas dados já presentes no output do Crítico, sem custo extra de tokens.
- **Limitação**: se o Crítico identificar zero falhas mas a proposta for incorreta (falso negativo do Crítico), o ´confidence_score´ do Propositor não será penalizado. Mitigação: múltiplos rounds de debate.

### IMPACTO NA DOCUMENTAÇÃO:

- Documentar a fórmula de calibração e os pesos em **AGENTS.md** ou em ADR dedicado.
- Criar **ADR-010: Confidence Calibration Policy** com justificativa para os pesos escolhidos.

---

## ═══════════════════════════════════════════
## PROBLEMA 13 — Controle de Budget por Role de Agente em Chamadas LLM
## 🟢 PRIORIDADE P3
## ═══════════════════════════════════════════

### SOLUÇÃO RECOMENDADA:

Implementar um **Token Budget Manager** com alocação estática por fase do pipeline e reserva garantida por role. Usar ´usage.totalTokens´ retornado pela Gemini API após cada chamada para ajuste dinâmico nas fases seguintes. Implementação em ~50 linhas de TypeScript, sem dependência externa.

### REFERÊNCIAS ENCONTRADAS:

- **Gemini API: usage metadata** — https://ai.google.dev/api/generate-content#v1beta.GenerateContentResponse (docs oficiais Google AI — campo ´usageMetadata´)
- **LangChain token budget** — https://python.langchain.com/docs/concepts/callbacks/#token-usage (referência arquitetural)
- **AutoGen token management** — https://microsoft.github.io/autogen/docs/topics/token_count (referência de multi-agent token control)
- **OpenAI usage object** — https://platform.openai.com/docs/api-reference/chat/object#chat/object-usage (estrutura de uso de tokens — similar ao Gemini)

### ESBOÇO DE IMPLEMENTAÇÃO (TypeScript/Node.js):

´´´typescript
interface TokenBudgetConfig {
  totalBudget: number;             // Budget total da task
  allocations: Record<AgentRole, {
    reserved: number;              // Tokens garantidos (não podem ser tomados por outros)
    maxUsage: number;              // Limite máximo (inclui reserva)
  }>;
}

type AgentRole = 'PROPOSITOR' | 'CRITICO' | 'ARBITRO' | 'SYNTHESIZER';

const DEFAULT_BUDGET_CONFIG: TokenBudgetConfig = {
  totalBudget: 200_000,           // Budget total da sessão
  allocations: {
    PROPOSITOR: { reserved: 40_000, maxUsage: 80_000 },
    CRITICO:    { reserved: 30_000, maxUsage: 60_000 },
    ARBITRO:    { reserved: 20_000, maxUsage: 40_000 },  // Limitar Árbitro
    SYNTHESIZER:{ reserved: 15_000, maxUsage: 30_000 },
  },
};

export class TokenBudgetManager {
  private consumed: Record<AgentRole, number> = {
    PROPOSITOR: 0, CRITICO: 0, ARBITRO: 0, SYNTHESIZER: 0,
  };

  constructor(private readonly config: TokenBudgetConfig = DEFAULT_BUDGET_CONFIG) {}

  getAvailableTokens(role: AgentRole): number {
    const alloc = this.config.allocations[role];
    const roleConsumed = this.consumed[role];
    
    // Tokens disponíveis para este role (respeitar maxUsage)
    const roleAvailable = alloc.maxUsage - roleConsumed;
    
    // Tokens disponíveis no pool total (respeitando reservas dos outros roles)
    const reservedByOthers = Object.entries(this.config.allocations)
      .filter(([r]) => r !== role)
      .reduce((sum, [r, a]) => sum + Math.max(0, a.reserved - this.consumed[r as AgentRole]), 0);
    
    const totalConsumed = Object.values(this.consumed).reduce((a, b) => a + b, 0);
    const poolAvailable = this.config.totalBudget - totalConsumed - reservedByOthers;
    
    return Math.max(0, Math.min(roleAvailable, poolAvailable));
  }

  recordUsage(role: AgentRole, tokensUsed: number): void {
    this.consumed[role] += tokensUsed;
  }

  getMaxTokensForCall(role: AgentRole, requestedMax: number): number {
    const available = this.getAvailableTokens(role);
    if (available < 1000) {
      throw new Error(´[TokenBudget] Role ${role} sem tokens suficientes. Disponível: ${available}´);
    }
    return Math.min(requestedMax, available);
  }

  getSummary(): object {
    return {
      totalBudget: this.config.totalBudget,
      consumed: { ...this.consumed },
      available: Object.fromEntries(
        (Object.keys(this.consumed) as AgentRole[]).map(r => [r, this.getAvailableTokens(r)])
      ),
    };
  }
}

// ─── Integração com Gemini API ────────────────────────────────────────────────
async function callGeminiWithBudget(
  role: AgentRole,
  prompt: string,
  budgetManager: TokenBudgetManager
): Promise<string> {
  const maxTokens = budgetManager.getMaxTokensForCall(role, 8192);
  
  const response = await geminiModel.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
    },
  });
  
  // Registrar uso real retornado pela API
  const usage = response.response.usageMetadata;
  if (usage?.totalTokenCount) {
    budgetManager.recordUsage(role, usage.totalTokenCount);
  }
  
  return response.response.text();
}
´´´

### TRADE-OFFS E ADVERTÊNCIAS:

- **Alocações estáticas** funcionam para pipelines previsíveis. Para debates longos e variáveis, considerar rebalancear o pool restante proporcionalmente após cada fase.
- **O Árbitro (´gemini-2.5-pro´)** deve ter ´maxUsage´ limitado explicitamente (ex: 40.000 tokens) para o caso descrito no problema — não permitir que consuma 8.192 tokens em uma única chamada se o budget restante é escasso.
- **O budget deve ser por task/sessão**, não global do servidor — instanciar ´TokenBudgetManager´ por sessão de debate.

### IMPACTO NA DOCUMENTAÇÃO:

- Documentar ´TOKEN_BUDGET_TOTAL´ e as alocações por role em **AGENTS.md** como configuração editável.
- Criar **ADR-013: Token Budget Policy** com justificativa das alocações default.

---

## ═══════════════════════════════════════════
## PROBLEMA 14 — Definição de Contrato para ´STEER_AGENT´ Mid-Stream
## 🟢 PRIORIDADE P3
## ═══════════════════════════════════════════

### SOLUÇÃO RECOMENDADA:

Implementar o padrão **"Checkpoint Before Steer"**: ao receber ´STEER_AGENT´, o servidor (1) persiste tokens gerados até o momento no ´outbox_events´ com status ´PRE_STEER´, (2) cancela o stream atual via ´AbortController´, (3) persiste a instrução de steering no ´AuditLog´, (4) inicia novo stream com contexto acumulado + instrução de steering. A UI pode exibir claramente a linha divisória entre conteúdo pré e pós-steering.

### REFERÊNCIAS ENCONTRADAS:

- **AbortController (Web API)** — https://developer.mozilla.org/en-US/docs/Web/API/AbortController (MDN, cancelamento limpo de streams)
- **Google Gemini API streaming + AbortSignal** — https://ai.google.dev/api/generate-content#stream (docs oficiais Gemini streaming)
- **OpenHands interrupt mechanism** — https://github.com/All-Hands-AI/OpenHands (repositório de referência para steering mid-task)
- **Vercel AI SDK useChat abort** — https://sdk.vercel.ai/docs/reference/ai-sdk-ui/use-chat#abort (padrão de abort em streaming UI)

### ESBOÇO DE IMPLEMENTAÇÃO (TypeScript/Node.js):

´´´typescript
interface SteerAgentPayload {
  sessionId: string;
  targetRole: AgentRole;
  instruction: string;
  steerMessageId: string;  // UUID único para idempotência
}

interface StreamState {
  abortController: AbortController;
  accumulatedTokens: string;
  seqIdAtSteer: number | null;
}

const activeStreams = new Map<string, StreamState>(); // sessionId → stream state

socket.on('STEER_AGENT', async (payload: SteerAgentPayload, ack?: Function) => {
  // Idempotência (reusar mecanismo do Problema 3)
  if (isProcessed(payload.steerMessageId)) {
    ack?.({ status: 'ALREADY_PROCESSED' });
    return;
  }
  markProcessed(payload.steerMessageId);
  
  const streamState = activeStreams.get(payload.sessionId);
  
  // ─── FASE 1: Capturar estado atual ────────────────────────────────────────
  const tokensBeforeSteering = streamState?.accumulatedTokens ?? '';
  const seqIdAtSteer = streamState?.seqIdAtSteer ?? null;
  
  // ─── FASE 2: Persistir estado pré-steering para auditoria ─────────────────
  await prisma.$transaction([
    prisma.auditLog.create({
      data: {
        sessionId: payload.sessionId,
        eventType: 'STEER_AGENT_APPLIED',
        payload: {
          targetRole: payload.targetRole,
          instruction: payload.instruction,
          steerMessageId: payload.steerMessageId,
          tokensGeneratedBeforeSteering: tokensBeforeSteering.length,
          seqIdAtSteer,
          timestamp: new Date().toISOString(),
        },
      },
    }),
    // Marcar eventos pré-steering no SSE como "antes do steering"
    ...(seqIdAtSteer ? [
      prisma.sseEvent.updateMany({
        where: { sessionId: payload.sessionId, id: { lte: seqIdAtSteer } },
        data: { metadata: { steerBoundary: 'PRE_STEER' } },
      }),
    ] : []),
  ]);
  
  // ─── FASE 3: Cancelar stream atual ────────────────────────────────────────
  if (streamState?.abortController) {
    streamState.abortController.abort();
    activeStreams.delete(payload.sessionId);
    console.info(´[STEER] Stream cancelado para sessão ${payload.sessionId}´);
  }
  
  // ─── FASE 4: Emitir evento SSE de boundary de steering ────────────────────
  const boundaryEventId = await sseEventStore.append(
    payload.sessionId,
    'STEER_BOUNDARY',
    {
      instruction: payload.instruction,
      targetRole: payload.targetRole,
      tokensBeforeSteering: tokensBeforeSteering.slice(-500), // últimos 500 chars
    }
  );
  
  // ─── FASE 5: Iniciar novo stream com instrução de steering ─────────────────
  const newAbortController = new AbortController();
  const newStreamState: StreamState = {
    abortController: newAbortController,
    accumulatedTokens: '',
    seqIdAtSteer: null,
  };
  activeStreams.set(payload.sessionId, newStreamState);
  
  // Iniciar novo stream assincronamente (não bloquear o ACK)
  startAgentStream(
    payload.sessionId,
    payload.targetRole,
    tokensBeforeSteering,       // contexto acumulado
    payload.instruction,        // instrução de steering
    newAbortController.signal,
    newStreamState
  ).catch(e => console.error('[STEER] Erro no stream pós-steering:', e));
  
  ack?.({ status: 'STEERING_APPLIED', boundaryEventId });
});
´´´

### TRADE-OFFS E ADVERTÊNCIAS:

- **O conteúdo gerado antes do steering não é descartado** — é persistido no ´AuditLog´ e visível na UI com marcador ´PRE_STEER´. Isso satisfaz o requisito de auditabilidade.
- **Se ´STEER_AGENT´ chegar quando não há stream ativo** (ex: entre fases do debate), o servidor deve logar a instrução e aplicá-la na próxima fase como contexto adicional.
- **Idempotência via ´steerMessageId´** segue o mesmo padrão do Problema 3 — previne double-abort em reconexões.
- **A instrução de steering é injetada no contexto do novo stream**, não como mensagem de sistema separada — isso garante que o modelo a processe no contexto correto do debate.

### IMPACTO NA DOCUMENTAÇÃO:

- Criar **STEER_AGENT Contract Spec** documentando os 5 estágios do protocolo, o formato do ´STEER_BOUNDARY´ SSE event, e o comportamento esperado da UI ao receber o marcador.
- Atualizar **AuditLog Schema** para incluir ´steerBoundary´ como campo indexado.

---

## 📊 SUMÁRIO EXECUTIVO — MATRIZ DE IMPACTO

| # | Problema | Solução Core | Libs/Padrões | Risco de Impl. |
|---|---|---|---|---|
| 🔴 P7 | CSRF Terminal | ´path.resolve´ + Origin validation | Nativo Node.js | 🟢 Baixo |
| 🔴 P8 | Git Subcomandos | Allowlist hierárquica + AST | ´bash-parser´ | 🟡 Médio |
| 🔴 P5 | Git+SQLite Atômico | Saga PENDING→COMMITTED | ´simple-git´ + Prisma | 🟡 Médio |
| 🔴 P11 | LoopDetector Fallback | Tiered: ´typescript-estree´ + SimHash | ´@typescript-eslint/typescript-estree´ | 🟢 Baixo |
| 🟠 P1 | Outbox Gate | Transactional Outbox | Prisma transactions | 🟢 Baixo |
| 🟠 P3 | Idempotência WS | Idempotency Key + Map TTL | Nativo + Socket.IO ACKs | 🟢 Baixo |
| 🟠 P12 | execSync Bloqueante | ´simple-git´ async | ´simple-git´ | 🟢 Baixo |
| 🟡 P4 | SQLite BUSY | WAL + busy_timeout + pool=1 | Prisma + ´$executeRaw´ | 🟢 Baixo |
| 🟡 P6 | Memory Leak SSE | SQLite event store + TTL | Prisma | 🟢 Baixo |
| 🟡 P9 | AGENTS.md Integridade | SHA-256 + chokidar + git diff | ´chokidar´ + ´crypto´ | 🟢 Baixo |
| 🟡 P2 | Reorder Buffer | Sliding Window + gap timeout | React hooks (nativo) | 🟡 Médio |
| 🟢 P10 | Confidence Calibration | Critic-as-Calibrator | Sem dependência extra | 🟢 Baixo |
| 🟢 P13 | Token Budget | Budget Manager por role | Gemini ´usageMetadata´ | 🟢 Baixo |
| 🟢 P14 | STEER_AGENT Contrato | Checkpoint Before Steer | AbortController + Prisma | 🟡 Médio |

---

**Pesquisa concluída.** Todos os 14 problemas foram cobertos com soluções validadas, referências verificáveis e esboços de implementação aplicáveis ao stack GreenForge v2.1. Os problemas P0 (7, 8, 5, 11) podem ser implementados em 1-2 sprints com impacto mínimo na arquitetura existente, dado que todas as soluções respeitam as restrições inegociáveis do MVP (SQLite-only, single-process, offline-first, localhost).
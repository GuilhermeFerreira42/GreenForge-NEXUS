Com base em toda a pesquisa realizada, apresento abaixo a documentação técnica completa para os cinco problemas arquiteturais, estruturada conforme solicitado e ordenada por prioridade crítica.
---

# 🔬 Relatório de Pesquisa: Soluções para Vulnerabilidades Arquiteturais — GreenForge NEXUS v2.0

---

## PROBLEMA 4 — Bypass da SHELL_ALLOWLIST via Argumentos e Ambiente Herdado

### Solução Recomendada

A solução primária é uma **defesa em três camadas independentes**: (1) substituição de ´bash-parser´ + validação de ´Command.name´ por execução parametrizada sem shell, (2) sanitização explícita do ambiente via allowlist antes do spawn do PTY, e (3) validação de argumentos por allowlist por comando. A abordagem de allowlist pura de binários é estruturalmente insuficiente para agentes porque, como demonstrado por pesquisa recente, "os controles de segurança atuais da indústria são insuficientes porque são baseados em sanitização de conteúdo e não em isolamento de execução — sanitização funciona no mundo de exploração web, mas no mundo de aplicações de coding baseadas em IA o problema se torna muito mais complexo."

O caso da CVE-2026-22708 (Cursor) ilustra o vetor exato: a técnica explora como IDEs agênticos lidam com comandos shell built-in, permitindo bypass de sandbox via ´export´, ´typeset´ e ´declare´ para manipular silenciosamente variáveis de ambiente que envenenam o comportamento de ferramentas legítimas, convertendo comandos aprovados como ´git branch´ em vetores de execução arbitrária.

**Camada 1 — Eliminar ´child_process.exec´ do caminho do agente:**

´child_process.exec´ tem um nome enganoso — é um interpretador bash, não um lançador de programa. Isso significa que todos os metacaracteres shell podem ter efeitos devastadores se o comando incluir input do usuário. A alternativa correta é usar ´spawn´ ou ´execFile´ onde o programa alvo é o primeiro argumento para ´execve´, o que significa que o usuário não pode executar subcomandos no shell, porque ´/bin/ls´ não sabe o que fazer com backticks, pipes ou ´;´.

A distinção crítica para seu caso é que usar ´spawn´ ou ´execFile´ nem sempre é seguro — por exemplo, executar ´/bin/find´ com ´spawn´ passando input do usuário diretamente ainda pode levar à tomada total do sistema, pois o comando ´find´ possui opções que permitem leitura/escrita arbitrária de arquivos. Portanto, a validação de argumentos por comando é essencial.

**Camada 2 — Sanitização de ambiente (vetor ´BASH_ENV´/´ENV´):**

Ao executar comandos shell em modo PTY, o ´process.env´ completo é passado ao processo filho, permitindo que comandos como ´env´ e ´printenv´ extraiam todas as variáveis de ambiente incluindo as sensíveis. A solução é usar uma **allowlist de ambiente**, não uma blocklist:

Nem todas as variáveis de ambiente são documentadas, e mesmo as que são podem mudar e adicionar variáveis perigosas. Portanto, a única solução real é selecionar as que você precisa e descartar o restante.

As variáveis de shell perigosas incluem ´BASH_ENV´, ´ENV´, ´SHELLOPTS´ e ´PS4´: o Bash usa o valor da variável ´PS4´ como prefixo para comandos em modo trace. O modo trace pode ser ativado colocando a string ´"xtrace"´ na variável ´SHELLOPTS´ antes do bash ser iniciado. Um usuário malicioso com acesso a um script shell pode usar esse recurso para executar comandos arbitrários para cada linha do script.

**Camada 3 — Validação de argumentos por comando (vetor ´npm --prefix´):**

Não incluir argumentos de comando em uma string de comando; usar parametrização em vez disso. Por exemplo: usar ´spawn("/path/to/myCommand", ["myArg1", inputValue])´ ao invés de ´spawn("bash", ["-c", "myCommand myArg1 " + inputValue])´. Para comandos como ´npm´, é necessário uma allowlist de flags permitidas, conforme estabelece a guideline: se você precisa permitir opções controladas pelo usuário, examine extensivamente as opções do comando, determine quais são seguras, e coloque apenas essas em whitelist.

### Implementação de Referência

- **´execa´** (npm) — https://github.com/sindresorhus/execa — execução parametrizada com controle de ambiente
- **´eslint-plugin-security´** — https://github.com/eslint-community/eslint-plugin-security — detecção estática de ´child_process.exec´ com input variável
- **Semgrep ruleset para JS command injection** — https://semgrep.dev/docs/cheat-sheets/javascript-command-injection
- **Pillar Security CVE-2026-22708** — https://www.pillar.security/blog/the-agent-security-paradox-when-trusted-commands-in-cursor-become-attack-vectors

### Código/Pseudocódigo Sugerido

´´´typescript
// ============================================================
// Camada 1: Allowlist de comandos + argflag por binário
// ============================================================
const COMMAND_RULES: Record<string, {
  allowedFlags: RegExp[];
  blockedFlags: RegExp[];
}> = {
  'npm': {
    // Bloqueia --prefix, --global, --workspaces
    blockedFlags: [/^--prefix/, /^-g$/, /^--global/, /^--workspaces/],
    allowedFlags: [/^(install|run|test|build|ci)$/, /^--save/, /^--save-dev/],
  },
  'git': {
    blockedFlags: [/^--upload-pack/, /^--receive-pack/],
    allowedFlags: [/^(status|log|diff|add|commit|checkout|branch|merge|rebase|stash)$/],
  },
};

function assertCommandAllowed(command: string, args: string[]): void {
  const rules = COMMAND_RULES[command];
  if (!rules) throw new SecurityError(´Command '${command}' not in SHELL_ALLOWLIST´);

  for (const arg of args) {
    for (const blocked of rules.blockedFlags) {
      if (blocked.test(arg)) {
        throw new SecurityError(
          ´Argument '${arg}' blocked for command '${command}' (argument injection vector)´
        );
      }
    }
  }
}

// ============================================================
// Camada 2: Ambiente sanitizado — allowlist, não blocklist
// ============================================================
const ENV_ALLOWLIST = new Set([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'TERM', 'LANG', 'LC_ALL',
  'NODE_ENV', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL',
]);

// Variáveis de injeção de shell que NUNCA devem ser herdadas
const SHELL_INJECTION_VARS = [
  'BASH_ENV', 'ENV', 'CDPATH', 'PROMPT_COMMAND',
  'SHELLOPTS', 'PS4', 'IFS', 'BASH_FUNC_*',
  'LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES',
];

function buildSanitizedEnv(extraVars?: Record<string, string>): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = {};

  // Abordagem allowlist: só passa o que foi explicitamente permitido
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key] !== undefined) {
      sanitized[key] = process.env[key];
    }
  }

  // Força remoção explícita de vetores de injeção mesmo se presentes
  for (const dangerous of SHELL_INJECTION_VARS) {
    delete sanitized[dangerous];
  }

  // Adiciona PATH explícito e seguro
  sanitized['PATH'] = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';

  return { ...sanitized, ...extraVars };
}

// ============================================================
// Camada 3: Spawn sem shell, com env sanitizado
// ============================================================
import { spawn } from 'node-pty'; // ou node:child_process

async function spawnAgentPTY(
  command: string,
  args: string[],
  cwd: string
): Promise<IPty> {
  // Validação de comando e argumentos ANTES do spawn
  assertCommandAllowed(command, args);

  const env = buildSanitizedEnv({
    TERM: 'xterm-256color',
    // Variáveis específicas do contexto do agente
  });

  return spawn(command, args, {
    cwd,
    env,
    // Nunca usar shell: true com input do agente
  });
}
´´´

### Trade-offs

- **´env -i´ vs allowlist TypeScript**: ´env -i´ (flag ´--ignore-environment´) é mais robusto pois opera a nível de ´execve´, mas não é diretamente acessível via ´node-pty´. A allowlist em TypeScript pode ser bypassada por variáveis definidas *dentro* da sessão PTY após o spawn — isso não é coberto.
- **Allowlist de argumentos não cobre redirecionamentos**: um agente que escreve ´npm run build > /etc/cron.d/evil´ usa redirecionamento do shell, não um argumento do binário. O bypass via here-strings (´<<<´) não é capturado por ´bash-parser´ em todos os casos.
- **Isolamento real exige sandbox**: a abordagem correta para lidar com esse problema é permitir execução completa de comandos a todos os agentes em um ambiente isolado ou sandbox e descontinuar o uso de allowlists completamente. Para o ambiente local sem infraestrutura adicional, considerar ´landlock´ via binding nativo (ver seção de isolamento abaixo).
- **´ShellCheck´ como validação secundária**: pode ser integrado como linter estático antes de executar scripts gerados pelo agente, mas não protege contra execução interativa.

### Fontes
- https://www.pillar.security/blog/the-agent-security-paradox-when-trusted-commands-in-cursor-become-attack-vectors
- https://github.com/eslint-community/eslint-plugin-security/blob/main/docs/avoid-command-injection-node.md
- https://semgrep.dev/docs/cheat-sheets/javascript-command-injection
- https://www.sudo.ws/security/advisories/bash_env/
- https://tldp.org/HOWTO/Secure-Programs-HOWTO/environment-variables.html
- https://www.nodejs-security.com/blog/secure-javascript-coding-practices-against-command-injection-vulnerabilities

---

## PROBLEMA 2 — Estado Zumbi em Gate Hydration Pós-Restart (Epoch ID)

### Solução Recomendada

O padrão correto é o **Fencing Token com validação server-side**, aplicado diretamente ao ´resolveHITL´. A referência canônica é o artigo de Martin Kleppmann: a solução proposta por Kleppmann é que o serviço de lock forneça a cada cliente que adquire um lock um "fencing token", que é simplesmente um contador monotonicamente crescente, que o cliente submete ao recurso compartilhado, e o recurso compartilhado rejeita uma requisição de um cliente com um contador menor que o último visto.

Adaptando para o contexto HITL sem Redis: o ´epoch_id´ deve ser um **inteiro monotônico persistido em SQLite**, não ´Date.now()´. O servidor persiste o ´epoch_id´ ao inicializar, e cada ´gateId´ é criado contendo o ´epoch_id´ da época em que foi gerado. Ao receber uma decisão de aprovação, o servidor compara o ´epoch_id´ do gate com o ´epoch_id´ atual.

Um fencing token, quando passado ao recurso protegido, permite que o recurso rejeite operações de um holder de lock stale expirado. Sem isso, um cliente com um lock expirado ainda pode escrever no recurso compartilhado se o recurso não verificar a validade do token.

Para o padrão de "uma aprovação chega depois que o worker morreu", o padrão da indústria em sistemas de workflow como Temporal e AWS Step Functions é o **waitForTaskToken**: o worker registra um token opaco antes de pausar, e qualquer decisão que chega com um token inválido é rejeitada com erro explícito. A diferença-chave é que você deve implementar fencing tokens — isso é especialmente importante para processos que podem levar tempo significativo e se aplica a qualquer sistema de locking distribuído. Estender o lifetime dos locks também é uma opção, mas não assuma que um lock será retido enquanto o processo que o adquiriu estiver vivo.

### Implementação de Referência

- **Martin Kleppmann — "How to do distributed locking"** — https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
- **Redis docs — Fencing Tokens** — https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/
- **Temporal.io ´waitForTaskToken´** — https://docs.temporal.io/activities (padrão de atividades assíncronas com token)

### Código/Pseudocódigo Sugerido

´´´typescript
// ============================================================
// Schema SQLite (Prisma) — epoch como inteiro monotônico
// ============================================================
// model ServerEpoch {
//   id        Int @id @default(1)  // singleton row
//   epochSeq  Int @default(0)      // incrementa a cada boot
// }
//
// model HITLGate {
//   id          String   @id
//   epochSeq    Int      // epoch em que o gate foi criado
//   status      String   // 'pending' | 'approved' | 'rejected' | 'stale'
//   createdAt   DateTime
//   resolvedAt  DateTime?
//   decision    String?
// }

// ============================================================
// Boot do servidor: incrementa epoch no SQLite atomicamente
// ============================================================
async function bootEpoch(prisma: PrismaClient): Promise<number> {
  const result = await prisma.$transaction(async (tx) => {
    // Upsert garante que a linha existe e o seq é incrementado atomicamente
    await tx.serverEpoch.upsert({
      where: { id: 1 },
      create: { id: 1, epochSeq: 1 },
      update: { epochSeq: { increment: 1 } },
    });
    return tx.serverEpoch.findUniqueOrThrow({ where: { id: 1 } });
  });

  console.log(´[EPOCH] Server boot: epochSeq=${result.epochSeq}´);
  return result.epochSeq;
}

// Singleton: epoch atual carregado no boot e mantido em memória
let CURRENT_EPOCH_SEQ: number;

// ============================================================
// Criação de gate: embute epochSeq no registro
// ============================================================
async function createHITLGate(
  prisma: PrismaClient,
  gateId: string,
  metadata: object
): Promise<void> {
  await prisma.hITLGate.create({
    data: {
      id: gateId,
      epochSeq: CURRENT_EPOCH_SEQ, // fencing token
      status: 'pending',
      createdAt: new Date(),
    },
  });
}

// ============================================================
// Resolução: rejeita decisões de epochs anteriores
// ============================================================
async function resolveHITL(
  prisma: PrismaClient,
  gateId: string,
  decision: 'approved' | 'rejected',
  clientEpochSeq: number // enviado pelo cliente no payload
): Promise<void> {
  // Verificação 1: fencing token de epoch
  if (clientEpochSeq !== CURRENT_EPOCH_SEQ) {
    throw new StaleEpochError(
      ´Gate decision rejected: client epoch ${clientEpochSeq} ´ +
      ´!= server epoch ${CURRENT_EPOCH_SEQ}. ´ +
      ´Gate ${gateId} belongs to a previous server lifecycle.´
    );
  }

  // Verificação 2: gate existe e pertence à epoch atual
  const gate = await prisma.hITLGate.findUnique({ where: { id: gateId } });

  if (!gate) {
    throw new GateNotFoundError(´Gate ${gateId} not found in current epoch´);
  }

  if (gate.epochSeq !== CURRENT_EPOCH_SEQ) {
    // Marca como stale para auditoria antes de rejeitar
    await prisma.hITLGate.update({
      where: { id: gateId },
      data: { status: 'stale' },
    });
    throw new StaleEpochError(
      ´Gate ${gateId} was created in epoch ${gate.epochSeq}, ´ +
      ´current epoch is ${CURRENT_EPOCH_SEQ}´
    );
  }

  if (gate.status !== 'pending') {
    throw new GateAlreadyResolvedError(´Gate ${gateId} is already ${gate.status}´);
  }

  // Verificação 3: idempotency — operação atômica
  const updated = await prisma.hITLGate.updateMany({
    where: { id: gateId, status: 'pending', epochSeq: CURRENT_EPOCH_SEQ },
    data: { status: decision, decision, resolvedAt: new Date() },
  });

  if (updated.count === 0) {
    throw new ConcurrentResolutionError(
      ´Gate ${gateId} was resolved concurrently by another request´
    );
  }
}

// ============================================================
// Cliente: ao reidratar do IndexedDB, verifica epoch
// ============================================================
// O cliente armazena { gateId, epochSeq } no IndexedDB.
// Ao reconectar, recebe o epochSeq atual via SSE 'epoch' event.
// Se epochSeq local != epochSeq do servidor:
//   → Descarta o Approval Card, exibe "Sessão expirada"
//   → Remove gateId do IndexedDB
´´´

### Trade-offs

- **´Date.now()´ vs sequência monotônica**: ´Date.now()´ não é monotônico em reinicializações rápidas ou em sistemas com clock skew. o algoritmo Redlock faz suposições perigosas sobre timing e clocks do sistema, e viola propriedades de segurança se essas suposições não forem atendidas. Um inteiro auto-incrementado em SQLite é estritamente monotônico.
- **O cliente precisa receber o ´epochSeq´ atual**: requer que o evento SSE de conexão inicial inclua ´{ type: 'epoch', epochSeq: N }´. Se o SSE reconectar após um restart, o cliente deve comparar o ´epochSeq´ recebido com o armazenado.
- **Gates "orphaned" de epochs anteriores**: gates com ´status: 'pending'´ de epochs anteriores devem ser marcados como ´stale´ na inicialização do servidor. Um migration job no boot (´UPDATE hiTLGate SET status='stale' WHERE epochSeq < $current AND status='pending'´) resolve isso.
- **Não previne race conditions de dupla aprovação**: a verificação ´updateMany´ com condição ´status='pending'´ é a fence contra isso, mas requer que o SQLite esteja configurado com ´journal_mode=WAL´.

### Fontes
- https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
- https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/
- https://leapcell.io/blog/implementing-distributed-locks-with-redis-delving-into-setnx-redlock-and-their-controversies

---

## PROBLEMA 3 — Lock de Worktree sem TTL (Exaustão de Armazenamento)

### Solução Recomendada

O padrão **"dead man's switch" com arquivo de lease** é a solução primária para o ambiente sem infraestrutura adicional. O mecanismo: ao criar um worktree, escreve-se um arquivo ´.nexus-lease.json´ na raiz do worktree (não o ´git worktree lock´ nativo) contendo ´{ pid, epochSeq, expiresAt, worktreePath }´. Um GC periódico (´setInterval´) verifica todos os arquivos de lease e remove worktrees cujo ´expiresAt´ passou ou cujo PID já não existe no sistema.

**Por que não usar ´git worktree lock´ nativo para TTL?**

´git worktree lock´ existe para proteger worktrees em dispositivos portáteis ou compartilhamentos de rede que nem sempre estão montados, para prevenir que seus arquivos administrativos sejam removidos automaticamente. Isso também previne que sejam movidos ou deletados. Opcionalmente, especifica-se uma razão para o lock com ´--reason´. Não existe opção nativa de TTL — o lock persiste até ´git worktree unlock´ ser chamado explicitamente.

O problema é documentado em produção: o lock de worktree sobrevive à terminação do subagente, então ´git worktree remove --force´ recusa a remoção até que a sessão externa saia — mas o erro é suprimido, o orquestrador prossegue como se a limpeza tivesse sucedido, e o worktree bloqueado stale acumula em disco entre sessões.

O padrão de lease tem precedente em sistemas de locking distribuído: locks tradicionais persistem até serem liberados. Se o holder morre ou a rede se comporta mal, você tem deadlock por negligência. Locks baseados em lease adicionam um TTL (time to live): adquire → faz trabalho → renova enquanto vivo → expira se não renovado.

### Implementação de Referência

- **Git worktree docs** — https://git-scm.com/docs/git-worktree
- **Lease-based locks pattern** — https://medium.com/@Modexa/7-lease-based-locks-that-dont-deadlock-d6de4a0562c9
- **´proper-lockfile´** (npm) — https://github.com/moxystudio/node-proper-lockfile — lock de arquivo com stale detection via PID

### Código/Pseudocódigo Sugerido

´´´typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

interface WorktreeLease {
  worktreePath: string;
  pid: number;
  epochSeq: number;
  createdAt: string;       // ISO
  expiresAt: string;       // ISO — renovado a cada heartbeat
  rollbackWindowMs: number; // ex: 30 * 60 * 1000
}

const LEASE_FILENAME = '.nexus-lease.json';
const LEASE_TTL_MS = 35 * 60 * 1000;    // 35min (5min de buffer sobre os 30min de rollback)
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // renova a cada 1min

// ============================================================
// Criar worktree com lease (NÃO usa git worktree lock)
// ============================================================
async function createWorktreeWithLease(
  worktreePath: string,
  branch: string,
  epochSeq: number
): Promise<() => void> {
  // 1. Cria o worktree
  execSync(´git worktree add "${worktreePath}" "${branch}"´, { stdio: 'pipe' });

  // 2. Escreve o arquivo de lease (SEM git worktree lock)
  const lease: WorktreeLease = {
    worktreePath,
    pid: process.pid,
    epochSeq,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + LEASE_TTL_MS).toISOString(),
    rollbackWindowMs: 30 * 60 * 1000,
  };

  await fs.writeFile(
    path.join(worktreePath, LEASE_FILENAME),
    JSON.stringify(lease, null, 2),
    'utf-8'
  );

  // 3. Inicia heartbeat — renova expiresAt periodicamente
  const heartbeat = setInterval(async () => {
    try {
      const current = JSON.parse(
        await fs.readFile(path.join(worktreePath, LEASE_FILENAME), 'utf-8')
      ) as WorktreeLease;
      current.expiresAt = new Date(Date.now() + LEASE_TTL_MS).toISOString();
      await fs.writeFile(
        path.join(worktreePath, LEASE_FILENAME),
        JSON.stringify(current, null, 2)
      );
    } catch {
      // Se falhar, o GC vai expirar o lease naturalmente
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Retorna função de cleanup explícito
  return () => {
    clearInterval(heartbeat);
  };
}

// ============================================================
// GC de worktrees — roda periodicamente (ex: a cada 5min)
// ============================================================
async function gcStaleWorktrees(repoRoot: string): Promise<void> {
  const worktreeListRaw = execSync('git worktree list --porcelain', {
    cwd: repoRoot,
    encoding: 'utf-8',
  });

  // Parseia a lista de worktrees
  const worktrees = parseWorktreeList(worktreeListRaw); // implementação auxiliar

  for (const wt of worktrees) {
    const leasePath = path.join(wt.path, LEASE_FILENAME);

    try {
      const leaseContent = await fs.readFile(leasePath, 'utf-8');
      const lease: WorktreeLease = JSON.parse(leaseContent);

      const isExpired = new Date(lease.expiresAt) < new Date();
      const isPidDead = !isPidAlive(lease.pid); // verifica /proc/<pid>

      if (isExpired || isPidDead) {
        console.log(´[GC] Removing stale worktree: ${wt.path} (expired=${isExpired}, pidDead=${isPidDead})´);

        // Remove o arquivo de lease primeiro
        await fs.unlink(leasePath).catch(() => {});

        // Desfaz git worktree lock se existir (precaução)
        execSync(´git worktree unlock "${wt.path}"´, { cwd: repoRoot, stdio: 'pipe' }).catch?.(() => {});

        // Remove o worktree (--force necessário se worktree está sujo)
        execSync(´git worktree remove "${wt.path}" --force´, {
          cwd: repoRoot,
          stdio: 'pipe',
        });
      }
    } catch {
      // Sem arquivo de lease: worktree não foi criado pelo NEXUS ou já foi removido
    }
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // sinal 0 não mata, apenas verifica existência
    return true;
  } catch {
    return false;
  }
}
´´´

### Trade-offs

- **Arquivo de lease não é atômico no filesystem**: escritas de heartbeat podem ser interrompidas no meio. Usar ´writeFile´ com um arquivo temporário + ´rename´ atômico mitiga isso.
- **PID reuse**: em sistemas de alta frequência de processos, um novo processo pode receber o mesmo PID antes do GC rodar. Combinar PID + ´epochSeq´ + ´createdAt´ reduz drasticamente o risco.
- **O GC deve rodar no processo pai (orquestrador)**, não nos workers — se o orquestrador também morrer, o GC não roda. Considerar um script de startup separado (´nexus-gc.ts´) invocado pelo sistema operacional (cron, systemd timer) para bootstrap recovery.
- acumulação silenciosa de disco: worktrees stale persistem entre sessões, consumindo espaço em disco (cada worktree é uma cópia completa da working tree).

### Fontes
- https://git-scm.com/docs/git-worktree
- https://medium.com/@Modexa/7-lease-based-locks-that-dont-deadlock-d6de4a0562c9
- https://github.com/gsd-build/get-shit-done/issues/2431

---

## PROBLEMA 1 — Bypass de Loop Semântico no AST Fingerprinting

### Solução Recomendada

Uma **estratégia em dois níveis** com custo incremental: **Nível 1** é a normalização de AST para uma forma canônica antes do hashing (baixo custo computacional, cobre ~70% dos casos); **Nível 2** é um fallback por embedding de código para detecção de clones Tipo-4 (semânticos puros), ativado apenas quando o Nível 1 não detecta loop mas outras heurísticas indicam repetição.

Métodos de detecção de clone são classificados como lexicais, sintáticos, ou semânticos, sendo a categoria semântica a mais difícil de modelar. Métodos tradicionais são efetivos para correspondências exatas ou quase-exatas, enquanto modelos neurais oferecem melhor recall ao identificar código funcionalmente similar apesar de variação estrutural.

Para o **Nível 1 (normalização de AST)**, a abordagem é transformar o código antes do hashing usando Babel como normalizador. A ideia é reescrever constructs equivalentes para uma forma padrão:
- ´a ? b : c´ → ´if (a) { result = b; } else { result = c; }´
- ´a ?? b´ → ´a !== null && a !== undefined ? a : b´
- ´a?.b´ → ´a != null ? a.b : undefined´

Isso reduz o espaço de formas estruturais distintas para o mesmo código antes do hashing com ´tree-sitter´.

Para o **Nível 2 (embeddings)**, CodeBERT usa tokens de texto puro, enquanto GraphCodeBERT e UniXCoder incluem elementos estruturais, o que ajuda quando a similaridade superficial é insuficiente. Para o ambiente local sem serviços externos, modelos pequenos são frequentemente melhores quando os limites de hardware são rígidos ou a latência baixa é essencial.

Aider usa Tree-Sitter-based RepoMap com PageRank para seleção de contexto, e sua abordagem para o RepoMap é relevante: antes de cada chamada ao LLM, o aider calcula quais símbolos e arquivos são mais relevantes para os arquivos sendo editados e inclui uma visão geral estrutural compacta no prompt.

### Implementação de Referência

- **´@babel/traverse´ + ´@babel/types´** — normalização de AST: https://babeljs.io/docs/babel-traverse
- **´jscpd´** (detecção de clone Tipo-3) — https://github.com/kucherenko/jscpd
- **´codesim´** (ensemble de métodos incluindo CodeBERT) — https://github.com/jorge-martinez-gil/codesim
- **´aider´ repomap.py** (referência de implementação open source) — https://github.com/paul-gauthier/aider/blob/main/aider/repomap.py

### Código/Pseudocódigo Sugerido

´´´typescript
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { createHash } from 'node:crypto';

// ============================================================
// Nível 1: Normalização de AST para forma canônica
// ============================================================
function normalizeToCanonicalForm(code: string): string {
  let ast: t.File;
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
  } catch {
    return code; // fallback: retorna o código original se não parseable
  }

  traverse(ast, {
    // Normaliza operador ternário → if/else
    ConditionalExpression(path) {
      // a ? b : c  →  preserva como if-statement equivalente no hash
      // Para fins de hashing, substitui pelo hash de uma forma normal textual
    },

    // Normaliza nullish coalescing → ternário explícito
    LogicalExpression(path) {
      if (path.node.operator === '??') {
        // a ?? b  →  (a !== null && a !== undefined) ? a : b
        const { left, right } = path.node;
        path.replaceWith(
          t.conditionalExpression(
            t.logicalExpression(
              '&&',
              t.binaryExpression('!==', left, t.nullLiteral()),
              t.binaryExpression('!==', left, t.identifier('undefined'))
            ),
            left,
            right
          )
        );
      }
    },

    // Normaliza optional chaining → acesso condicional explícito
    OptionalMemberExpression(path) {
      // a?.b  →  a != null ? a.b : undefined
    },

    // Remove identificadores (substituindo por placeholders)
    Identifier(path) {
      if (!path.isReferenced()) return;
      // Substitui nomes de variáveis por placeholders canonicalizados
      // ex: mapeia o N-ésimo identificador único para 'var_N'
    },

    // Normaliza literals de string para placeholder
    StringLiteral(path) {
      path.node.value = '__STR__';
    },

    NumericLiteral(path) {
      path.node.value = 0;
    },
  });

  return generate(ast).code;
}

// ============================================================
// LoopDetector com normalização de dois níveis
// ============================================================
class EnhancedLoopDetector {
  private normalizedHashes: Map<string, number> = new Map(); // hash -> count
  private readonly LOOP_THRESHOLD = 2;

  detectLoop(code: string): { isLoop: boolean; similarity: number; method: string } {
    // Nível 1: hash da AST normalizada
    const normalized = normalizeToCanonicalForm(code);
    const hash = createHash('sha256').update(normalized).digest('hex');

    const count = (this.normalizedHashes.get(hash) ?? 0) + 1;
    this.normalizedHashes.set(hash, count);

    if (count >= this.LOOP_THRESHOLD) {
      return { isLoop: true, similarity: 1.0, method: 'ast-canonical' };
    }

    // Nível 2: fallback por embedding (ativado se count > 0 mas hash diferente)
    // Requer modelo local (ex: Gemini embedding via API local, ou
    // modelo ONNX como microsoft/codebert-base)
    if (count > 0) {
      const similarity = this.computeCodeSimilarity(code);
      if (similarity > 0.92) {
        return { isLoop: true, similarity, method: 'embedding-fallback' };
      }
    }

    return { isLoop: false, similarity: 0, method: 'none' };
  }

  private computeCodeSimilarity(_code: string): number {
    // Integração com Gemini embeddings (já disponível no stack):
    // const embedding = await gemini.embedContent(code);
    // Compara com embeddings anteriores via cosine similarity
    // Placeholder: retorna 0 (não implementado nesta iteração)
    return 0;
  }
}
´´´

### Trade-offs

- **Normalização Babel adiciona ~50-100ms por snippet**: para loops de debate com muitos rounds, isso pode ser proibitivo. Usar cache de normalização com hash do código original como chave.
- **Babel não cobre todos os padrões**: gerador de código ´async/await´ vs ´Promise.then()´, ´for...of´ vs ´Array.forEach()´, etc. requerem regras adicionais de normalização.
- CodeBERT pode detectar clones de código com alta precisão, porém seu desempenho em dados não vistos durante treinamento é reportado como menor. Para produção, GraphCodeBERT ou UniXCoder são mais robustos.
- **Embeddings via Gemini API quebram o requisito de "sem serviços externos"**: para o fallback local, considerar ´@xenova/transformers´ com modelo ONNX ´microsoft/unixcoder-base´ rodando no processo Node.js.

### Fontes
- https://aider.chat/2023/10/22/repomap.html
- https://github.com/jorge-martinez-gil/codesim
- https://arxiv.org/pdf/2506.10995 (avaliação de modelos de clone detection)
- https://ieeexplore.ieee.org/abstract/document/10479370

---

## PROBLEMA 5 — Drift de RepoMap entre Rounds de Debate

### Solução Recomendada

**Content-addressed caching com ´chokidar´ para invalidação incremental**, combinado com um hash SHA-256 do conteúdo de cada arquivo como chave de cache. O padrão é análogo ao ´ETag´ do HTTP: o agente recebe um contexto que inclui ´{ file: "src/auth.ts", contentHash: "abc123", signatures: [...] }´, e antes de aplicar código gerado, o servidor valida se ´contentHash´ ainda corresponde ao estado atual do arquivo.

Aider usa Tree-Sitter-based RepoMap com PageRank para seleção de contexto, e sua implementação em ´repomap.py´ (open source em https://github.com/paul-gauthier/aider) é a referência canônica. A análise profunda de ´aider/repomap.py´ (781 linhas), arquivos de query tree-sitter, e integração com as classes Coder revela que aider usa um sistema de tags que extrai ´@name.definition.X´ e ´@name.reference.X´ do tree-sitter para construir o grafo, e aplica PageRank para priorizar os símbolos mais relevantes ao contexto atual.

O padrão de busca semântica de código em tempo real com tree-sitter e vector embeddings permite indexar o codebase para busca semântica com atualizações incrementais — reprocessando apenas o que mudou, usando parsing nativo do tree-sitter.

### Implementação de Referência

- **´aider´ repomap.py** — https://github.com/paul-gauthier/aider/blob/main/aider/repomap.py
- **´chokidar´** — https://github.com/paulmillr/chokidar
- **CocoIndex — Real-Time Semantic Code Search** — https://pub.towardsai.net/building-real-time-semantic-code-search-with-tree-sitter-and-vector-embeddings-b9b1fc0a94f3

### Código/Pseudocódigo Sugerido

´´´typescript
import chokidar from 'chokidar';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

interface FileSignature {
  path: string;
  contentHash: string;  // SHA-256 do conteúdo bruto
  lastModified: number;
  symbols: SymbolEntry[];
}

interface SymbolEntry {
  name: string;
  kind: 'function' | 'class' | 'method' | 'interface' | 'type';
  signature: string;   // ex: "async function resolveHITL(gateId: string): Promise<void>"
  startLine: number;
}

// ============================================================
// Cache content-addressed: chave = contentHash
// ============================================================
class RepoMapCache {
  // Cache primário: path → FileSignature
  private byPath = new Map<string, FileSignature>();
  // Índice por hash (para verificação de drift)
  private byHash = new Map<string, FileSignature>();

  set(sig: FileSignature) {
    // Remove entrada antiga pelo mesmo path
    const old = this.byPath.get(sig.path);
    if (old) this.byHash.delete(old.contentHash);

    this.byPath.set(sig.path, sig);
    this.byHash.set(sig.contentHash, sig);
  }

  getByPath(path: string): FileSignature | undefined {
    return this.byPath.get(path);
  }

  /**
   * Verifica se o hash que o agente recebeu ainda é válido.
   * Análogo à validação de ETag em HTTP.
   */
  validateContentHash(filePath: string, expectedHash: string): boolean {
    const current = this.byPath.get(filePath);
    return current?.contentHash === expectedHash;
  }

  invalidate(filePath: string) {
    const sig = this.byPath.get(filePath);
    if (sig) {
      this.byHash.delete(sig.contentHash);
      this.byPath.delete(filePath);
    }
  }
}

// ============================================================
// Watcher incremental com chokidar
// ============================================================
class IncrementalRepoMap {
  private cache = new RepoMapCache();
  private parser: Parser;
  private watcher!: chokidar.FSWatcher;

  constructor(private repoRoot: string) {
    this.parser = new Parser();
    this.parser.setLanguage(TypeScript.typescript);
  }

  async initialize(): Promise<void> {
    // Indexação inicial
    await this.indexDirectory(this.repoRoot);

    // Watcher incremental — só eventos relevantes
    this.watcher = chokidar.watch(this.repoRoot, {
      ignored: [
        /node_modules/,
        /\.git/,
        /dist/,
        /coverage/,
        /\.nexus-lease\.json/,
      ],
      persistent: true,
      // Debounce: evita regeneração excessiva em saves rápidos
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 },
    });

    this.watcher.on('change', async (filePath) => {
      if (this.isRelevantFile(filePath)) {
        await this.reindexFile(filePath);
      }
    });

    this.watcher.on('add', async (filePath) => {
      if (this.isRelevantFile(filePath)) {
        await this.reindexFile(filePath);
      }
    });

    this.watcher.on('unlink', (filePath) => {
      this.cache.invalidate(filePath);
    });
  }

  private isRelevantFile(filePath: string): boolean {
    return /\.(ts|tsx|js|jsx)$/.test(filePath);
  }

  private async reindexFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const contentHash = createHash('sha256').update(content).digest('hex');

      // Evita re-parse se o conteúdo não mudou
      const existing = this.cache.getByPath(filePath);
      if (existing?.contentHash === contentHash) return;

      const symbols = this.extractSymbols(content, filePath);
      const stat = await fs.stat(filePath);

      this.cache.set({
        path: filePath,
        contentHash,
        lastModified: stat.mtimeMs,
        symbols,
      });
    } catch (err) {
      // Arquivo pode ter sido deletado entre o evento e o read
      this.cache.invalidate(filePath);
    }
  }

  private extractSymbols(content: string, _filePath: string): SymbolEntry[] {
    const tree = this.parser.parse(content);
    const symbols: SymbolEntry[] = [];

    // Traversal do tree-sitter para extrair assinaturas
    const extractNode = (node: Parser.SyntaxNode) => {
      if (node.type === 'function_declaration' || node.type === 'method_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          symbols.push({
            name: nameNode.text,
            kind: node.type === 'method_definition' ? 'method' : 'function',
            // Extrai apenas a assinatura (até a primeira chave)
            signature: content.slice(node.startIndex, node.startIndex + 200).split('{')[0].trim(),
            startLine: node.startPosition.row,
          });
        }
      }
      node.children.forEach(extractNode);
    };

    extractNode(tree.rootNode);
    return symbols;
  }

  /**
   * Constrói o contexto para o agente, incluindo contentHash por arquivo.
   * O agente DEVE enviar de volta os hashes ao propor código.
   */
  buildAgentContext(relevantFiles: string[]): AgentContext {
    return {
      files: relevantFiles.map(filePath => {
        const sig = this.cache.getByPath(filePath);
        if (!sig) return null;
        return {
          path: filePath,
          contentHash: sig.contentHash, // ETag do arquivo
          symbols: sig.symbols,
        };
      }).filter(Boolean),
    };
  }

  /**
   * Validação antes de aplicar código gerado pelo agente.
   * Rejeita se qualquer arquivo do contexto mudou desde que o agente o recebeu.
   */
  validateContextIntegrity(
    agentContextSnapshot: Array<{ path: string; contentHash: string }>
  ): { valid: boolean; stalePaths: string[] } {
    const stalePaths: string[] = [];

    for (const { path: filePath, contentHash } of agentContextSnapshot) {
      if (!this.cache.validateContentHash(filePath, contentHash)) {
        stalePaths.push(filePath);
      }
    }

    return {
      valid: stalePaths.length === 0,
      stalePaths,
    };
  }
}
´´´

### Trade-offs

- **´chokidar´ pode perder eventos em filesystems de rede ou containers**: em ambientes de CI/CD com volume mounts, usar ´usePolling: true´ com ´interval: 1000´ como fallback, mas com custo de CPU.
- **Regeneração de RepoMap completo a cada mudança é proibitiva**: a arquitetura incremental por arquivo resolve isso, mas requer que o índice de símbolos seja suficientemente granular. Se dois arquivos são interdependentes (ex: ´types.ts´ exporta um tipo usado em 50 arquivos), uma mudança em ´types.ts´ invalida todas as assinaturas que referenciam esses tipos.
- **O hash de conteúdo não detecta mudanças semânticas sem mudanças textuais**: um ´git rebase´ que reorganiza commits mas não muda o conteúdo dos arquivos não invalida o cache, o que é o comportamento correto.
- **O agente pode ignorar os hashes ao propor código**: a validação ´validateContextIntegrity´ deve ser um hard gate antes de qualquer ´applyEdit´, não apenas um warning.
- abordagens RAG atuais para código usam primariamente recuperação baseada em embedding, tratando código como texto. O trabalho emergente em recuperação estrutural via travessia de grafos ao longo de relacionamentos tipados é uma alternativa complementar — enquanto recuperação por embedding se destaca em similaridade semântica, recuperação estrutural se destaca em queries relacionais.

### Fontes
- https://aider.chat/2023/10/22/repomap.html
- https://aider.chat/docs/repomap.html
- https://pub.towardsai.net/building-real-time-semantic-code-search-with-tree-sitter-and-vector-embeddings-b9b1fc0a94f3
- https://arxiv.org/html/2603.27277v1
- https://github.com/NousResearch/hermes-agent/issues/535

---

## 📊 Matriz de Riscos Residuais

| Problema | Solução Proposta | Risco Residual | Mitigação Secundária |
|---|---|---|---|
| **P4 — Shell Bypass** | Allowlist env + args por binário + ´spawn´ sem shell | Redirecionamentos PTY pós-spawn; shell builtins | ´landlock´ syscall filtering; sandbox container |
| **P2 — Epoch Zombie** | Fencing token monotônico em SQLite | Race condition de dupla aprovação em <1ms | ´updateMany´ com condição atômica + WAL mode |
| **P3 — Lock Leak** | Lease file + heartbeat + GC periódico | Orquestrador também crashar antes do GC | Script de recovery no startup; cron externo |
| **P1 — Loop Semântico** | AST normalização Babel + embedding fallback | Padrões não cobertos pelo normalizador Babel | Heurística de similaridade de tokens (n-gramas) |
| **P5 — RepoMap Drift** | Content-addressed cache + ´chokidar´ + ETag gate | Interdependências entre arquivos não propagadas | Invalidação em cascata por grafo de importações |
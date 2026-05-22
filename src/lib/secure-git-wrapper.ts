/**
 * secure-git-wrapper.ts — GreenForge NEXUS v2.3
 * IMPLEMENTAÇÃO COMPLETA DE INFRAESTRUTURA
 *
 * Referência de implementação:
 *   05-governance-and-security.md § 4.3 — "Implementação Canônica Final: secure-git-wrapper.ts v2.3"
 *
 * CVEs cobertos:
 *   CVE-2026-3854  — GitHub RCE via push option injection
 *   CVE-2026-25763 — OpenProject git log --output= injection
 *   CVE-2025-68144 — mcp-server-git argument injection
 *   CVE-2023-29007 — Git arbitrary config injection via core.pager
 *   CVE-2017-8386  — git-shell pager bypass via less
 *   CVE-2026-22708 — Environment Poisoning (LD_PRELOAD/BASH_ENV)
 */

import { realpath } from 'node:fs/promises';
import path         from 'node:path';
import { execa }    from 'execa';
import { z }        from 'zod';

// ═══════════════════════════════════════════════════════════
// SEÇÃO 1: VARIÁVEIS DE AMBIENTE PERIGOSAS (27 entradas)
// ═══════════════════════════════════════════════════════════
export const FORBIDDEN_ENV_VARS: ReadonlySet<string> = new Set([
  // Pagers — vetores de escalada (CVE-2017-8386)
  'GIT_PAGER', 'PAGER', 'MANPAGER', 'LESS',

  // Executáveis externos — RCE direto
  'GIT_EDITOR', 'EDITOR', 'VISUAL',
  'GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_PROXY_COMMAND',
  'GIT_ASKPASS', 'SSH_ASKPASS',
  'GIT_EXTERNAL_DIFF',

  // Redirecionamento de paths de execução — sandbox escape
  'GIT_EXEC_PATH', 'GIT_TEMPLATE_DIR',

  // Injeção de configuração — CVE-2023-29007
  'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0',

  // Logging em paths arbitrários
  'GIT_TRACE', 'GIT_TRACE2', 'GIT_TRACE_PERFORMANCE', 'GIT_TRACE2_EVENT',

  // Autenticação e modo interativo
  'GIT_TERMINAL_PROMPT', 'GIT_CREDENTIAL_HELPER',

  // Injeção de shell/loader — CVE-2026-22708
  'BASH_ENV', 'ENV', 'LD_PRELOAD', 'LD_LIBRARY_PATH',
  'DYLD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES', 'IFS', 'CDPATH',
]);

// ═══════════════════════════════════════════════════════════
// SEÇÃO 2: POLÍTICA POR SUBCOMANDO (GIT_POLICY)
// ═══════════════════════════════════════════════════════════
export interface SubcommandPolicy {
  allowedFlags:   ReadonlySet<string>;
  forbiddenFlags: ReadonlySet<string>;
  allowPathArgs:  boolean;
  allowRefArgs:   boolean;
  maxArgs:        number;
}

export const GIT_POLICY: Readonly<Record<string, SubcommandPolicy>> = {
  'status': {
    allowedFlags:   new Set(['-s', '--short', '--porcelain', '--branch', '-b']),
    forbiddenFlags: new Set([]),
    allowPathArgs: false, allowRefArgs: false, maxArgs: 2,
  },
  'log': {
    allowedFlags:   new Set(['--oneline', '--graph', '--decorate', '--no-decorate', '-n', '--format', '--name-only', '--stat']),
    forbiddenFlags: new Set(['--output', '--exec', '--remotes']),         // CVE-2026-25763
    allowPathArgs: false, allowRefArgs: true, maxArgs: 5,
  },
  'diff': {
    allowedFlags:   new Set(['--stat', '--name-only', '--name-status', '--cached', '--staged', '--shortstat', '--']),
    forbiddenFlags: new Set(['--no-index', '--output', '--ext-diff', '--no-ext-diff', '--textconv', '--word-diff-regex']),
    allowPathArgs: true, allowRefArgs: true, maxArgs: 6,
  },
  'show': {
    allowedFlags:   new Set(['--stat', '--name-only', '--format']),
    forbiddenFlags: new Set(['--output', '--no-index']),
    allowPathArgs: false, allowRefArgs: true, maxArgs: 3,
  },
  'stash': {
    allowedFlags:   new Set(['push', 'pop', 'list', 'show', 'drop', '--include-untracked', '-m', '--message']),
    forbiddenFlags: new Set([]),
    allowPathArgs: false, allowRefArgs: false, maxArgs: 4,
  },
  'add': {
    allowedFlags:   new Set(['-p', '--patch', '--update', '-u', '--']),
    forbiddenFlags: new Set([]),
    allowPathArgs: true, allowRefArgs: false, maxArgs: 5,
  },
  'commit': {
    allowedFlags:   new Set(['-m', '--message', '--allow-empty', '--no-verify']),
    forbiddenFlags: new Set(['--template', '--cleanup=scissors']),
    allowPathArgs: false, allowRefArgs: false, maxArgs: 3,
  },
  'checkout': {
    allowedFlags:   new Set(['-b', '--detach', '--orphan']),
    forbiddenFlags: new Set([]),
    allowPathArgs: false, allowRefArgs: true, maxArgs: 3,
  },
  'rev-parse': {
    allowedFlags:   new Set(['--short', '--verify', '--show-toplevel', 'HEAD']),
    forbiddenFlags: new Set(['--absolute-git-dir', '--git-dir']),
    allowPathArgs: false, allowRefArgs: true, maxArgs: 2,
  },
  'write-tree': {
    allowedFlags:   new Set([]),
    forbiddenFlags: new Set([]),
    allowPathArgs: false, allowRefArgs: false, maxArgs: 0,
  },
};

// ═══════════════════════════════════════════════════════════
// SEÇÃO 3: SCHEMA ZOD + TIPOS PÚBLICOS
// ═══════════════════════════════════════════════════════════
const SecureGitSchema = z.object({
  worktreePath: z.string().min(1).max(512),
  subcommand: z.string().refine(
    (s) => s in GIT_POLICY,
    (s) => ({ message: `'${s}' not in allowlist. Allowed: ${Object.keys(GIT_POLICY).join(', ')}` }),
  ),
  args: z.array(
    z.string().min(0).max(512)
      .refine((s) => !s.includes('\0'),            'Null byte not allowed')
      .refine((s) => !s.includes('\n') && !s.includes('\r'), 'Newlines not allowed'),
  ).max(10),
});

export type SecureGitInput  = z.infer<typeof SecureGitSchema>;
export interface SecureGitOutput { stdout: string; stderr: string; exitCode: number }

// ═══════════════════════════════════════════════════════════
// SEÇÃO 4: CLASSE DE ERRO PÚBLICA
// ═══════════════════════════════════════════════════════════
export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

// ═══════════════════════════════════════════════════════════
// SEÇÃO 5: FUNÇÃO PRINCIPAL (secureGit)
// ═══════════════════════════════════════════════════════════
export async function secureGit(input: SecureGitInput): Promise<SecureGitOutput> {
  // Camada 0: Schema Zod
  const parsed = SecureGitSchema.safeParse(input);
  if (!parsed.success) {
    throw new SecurityError(`[INPUT] ${parsed.error.message}`);
  }

  const { worktreePath, subcommand, args } = parsed.data;
  const policy = GIT_POLICY[subcommand]!;

  // Camada 1: Resolução real do worktree (dereference de symlinks)
  const resolvedWorktree = await realpath(worktreePath).catch(() => {
    throw new SecurityError(`[PATH] Cannot resolve worktree: ${worktreePath}`);
  });

  // Camada 2: Validação do limite de argumentos
  if (args.length > policy.maxArgs) {
    throw new SecurityError(`[ARGS] Too many args for 'git ${subcommand}': ${args.length} > ${policy.maxArgs}`);
  }

  // Camada 3: Classificação e validação dos argumentos
  const safeFlags: string[] = [];
  const safePathArgs: string[] = [];
  const safeRefArgs: string[] = [];

  for (const arg of args) {
    if (arg.startsWith('-')) {
      await validateFlag(arg, subcommand, policy);
      safeFlags.push(arg);
    } else if (isGitRef(arg)) {
      if (!policy.allowRefArgs) {
        throw new SecurityError(`[REF] Ref args not allowed for 'git ${subcommand}': ${arg}`);
      }
      safeRefArgs.push(arg);
    } else {
      safePathArgs.push(await validateAndResolvePath(arg, resolvedWorktree, subcommand, policy));
    }
  }

  // Camada 4: Sanitização do environment (remove FORBIDDEN_ENV_VARS)
  const sanitizedEnv = buildSanitizedEnv();

  // Camada 5: Execução via execa (shell: false implícito)
  const finalArgs = ['-C', resolvedWorktree, subcommand, ...safeFlags, ...safeRefArgs, ...safePathArgs];
  const result = await execa('git', finalArgs, { env: sanitizedEnv, timeout: 30_000, reject: false });

  if (result.exitCode !== 0) {
    throw new Error(`[GIT] git ${subcommand} failed (exit ${result.exitCode}): ${result.stderr}`);
  }

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

// ═══════════════════════════════════════════════════════════
// SEÇÃO 6: FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════

function isGitRef(arg: string): boolean {
  const isPattern = /^[a-zA-Z0-9_\-./~^@{}:]+$/.test(arg) && !arg.includes('../') && !arg.includes('/../') && arg !== '..';
  if (!isPattern) return false;
  if (arg.includes('/')) {
    return /^(refs\/|origin\/|heads\/|remotes\/|tags\/)/.test(arg);
  }
  return true;
}

async function validateAndResolvePath(
  arg: string,
  resolvedWorktree: string,
  subcommand: string,
  policy: SubcommandPolicy,
): Promise<string> {
  if (!policy.allowPathArgs) {
    throw new SecurityError(`[PATH] Path args not allowed for 'git ${subcommand}': ${arg}`);
  }
  const resolved = await realpath(path.resolve(resolvedWorktree, arg)).catch(() => {
    throw new SecurityError(`[PATH] Cannot resolve: '${arg}'`);
  });
  const prefix = resolvedWorktree.endsWith(path.sep) ? resolvedWorktree : resolvedWorktree + path.sep;
  if (resolved !== resolvedWorktree && !resolved.startsWith(prefix)) {
    throw new SecurityError(`[PATH_TRAVERSAL] '${resolved}' is outside worktree '${resolvedWorktree}'`);
  }
  return resolved;
}

export async function validateFlag(
  arg: string,
  subcommand: string,
  policy: SubcommandPolicy,
): Promise<void> {
  const baseFlag = arg.split('=')[0]!;
  if (policy.forbiddenFlags.has(baseFlag) || policy.forbiddenFlags.has(arg)) {
    throw new SecurityError(`[FLAG] '${arg}' is forbidden for 'git ${subcommand}'. Known attack vector.`);
  }
  if (!policy.allowedFlags.has(baseFlag) && !policy.allowedFlags.has(arg)) {
    throw new SecurityError(`[FLAG] '${baseFlag}' not in allowlist for git ${subcommand}.`);
  }
  if (arg.includes('=')) {
    const value = arg.split('=').slice(1).join('=');
    if (/exec:|%(trailers.*key)/.test(value)) {
      throw new SecurityError(`[FLAG] Potentially dangerous format token in '${arg}'`);
    }
  }
}

export function buildSanitizedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const forbidden of FORBIDDEN_ENV_VARS) {
    delete env[forbidden];
  }
  // Força modo não-interativo e epura terminal
  env['GIT_TERMINAL_PROMPT'] = '0';
  env['GIT_ASKPASS']         = 'echo';
  env['TERM']                = 'dumb';
  return env;
}

export function assertPathWithinProject(targetPath: string, worktreePath: string): void {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedWorktree = path.resolve(worktreePath);
  const prefix = resolvedWorktree.endsWith(path.sep) ? resolvedWorktree : resolvedWorktree + path.sep;
  if (resolvedTarget !== resolvedWorktree && !resolvedTarget.startsWith(prefix)) {
    throw new Error(`[PATH_TRAVERSAL] Path '${resolvedTarget}' is outside worktree '${resolvedWorktree}'`);
  }
}

export function redactSecrets(text: string): string {
  let redacted = text;
  // Google/Gemini API keys
  redacted = redacted.replace(/AIzaSy[A-Za-z0-9\-_]{33}/g, '[REDACTED]');
  redacted = redacted.replace(/AIza[A-Za-z0-9\-_]{35}/g, '[REDACTED]');
  // OpenAI API keys
  redacted = redacted.replace(/sk-[A-Za-z0-9\-_]{20,60}/g, '[REDACTED]');
  return redacted;
}

function parseCommandString(cmdStr: string): string[] {
  const matches = cmdStr.match(/(?:[^\s"']+|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')+/g) || [];
  return matches.map((m) => {
    if ((m.startsWith('"') && m.endsWith('"')) || (m.startsWith("'") && m.endsWith("'"))) {
      return m.slice(1, -1);
    }
    return m;
  });
}

export function validateGitCommand(cmdStr: string, worktreePath: string): boolean {
  // Scanner léxico de operadores shell em TS puro (seguro, portable, zero dependências nativas)
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < cmdStr.length; i++) {
    const char = cmdStr[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '|') return false; // Pipelines proibidas
      if (char === '&') {
        if (cmdStr[i + 1] === '&') {
          i++; // && permitido
          continue;
        }
        return false; // Standalone & background execution proibido
      }
      if (char === '`') return false; // Backticks proibidos
      if (char === '$' && cmdStr[i + 1] === '(') return false; // $(...) proibido
      if ((char === '<' || char === '>') && cmdStr[i + 1] === '(') return false; // <(...) ou >(...) process substitution proibido
    }
  }

  try {
    const parts = parseCommandString(cmdStr);
    if (parts.length === 0) return false;

    // Apenas 'git' é permitido como binário
    let startIndex = 0;
    while (startIndex < parts.length && parts[startIndex]!.includes('=')) {
      startIndex++;
    }
    if (startIndex >= parts.length) return false;

    const binary = parts[startIndex];
    if (binary !== 'git') return false;

    const subcommand = parts[startIndex + 1];
    if (!subcommand) return false;

    const policy = GIT_POLICY[subcommand];
    if (!policy) return false;

    const args = parts.slice(startIndex + 2);
    if (args.length > policy.maxArgs) return false;

    for (const arg of args) {
      if (arg.startsWith('-')) {
        const baseFlag = arg.split('=')[0]!;
        if (policy.forbiddenFlags.has(baseFlag) || policy.forbiddenFlags.has(arg)) return false;
        if (!policy.allowedFlags.has(baseFlag) && !policy.allowedFlags.has(arg)) return false;
        if (arg.includes('=')) {
          const value = arg.split('=').slice(1).join('=');
          if (/exec:|%(trailers.*key)/.test(value)) return false;
        }
      } else if (isGitRef(arg)) {
        if (!policy.allowRefArgs) return false;
      } else {
        if (!policy.allowPathArgs) return false;
        const resolvedWT = path.resolve(worktreePath);
        const resolvedArg = path.resolve(resolvedWT, arg);
        const prefix = resolvedWT.endsWith(path.sep) ? resolvedWT : resolvedWT + path.sep;
        if (resolvedArg !== resolvedWT && !resolvedArg.startsWith(prefix)) {
          return false;
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}

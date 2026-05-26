import { realpath } from 'fs/promises';
import path         from 'path';
import { execa }    from 'execa';
import { z }        from 'zod';

const FORBIDDEN_ENV_VARS: ReadonlySet<string> = new Set([
  'GIT_PAGER', 'PAGER', 'MANPAGER',
  'LESS',
  'GIT_EDITOR', 'EDITOR', 'VISUAL',
  'GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_PROXY_COMMAND',
  'GIT_ASKPASS', 'SSH_ASKPASS',
  'GIT_EXTERNAL_DIFF',
  'GIT_EXEC_PATH',     
  'GIT_TEMPLATE_DIR', 
  'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0',
  'GIT_TRACE', 'GIT_TRACE2', 'GIT_TRACE_PERFORMANCE', 'GIT_TRACE2_EVENT',
  'GIT_TERMINAL_PROMPT', 'GIT_CREDENTIAL_HELPER',
]);

interface SubcommandPolicy {
  allowedFlags:   ReadonlySet<string>;
  forbiddenFlags: ReadonlySet<string>;
  allowPathArgs:  boolean;
  allowRefArgs:   boolean;
  maxArgs:        number;
}

const GIT_POLICY: Readonly<Record<string, SubcommandPolicy>> = {
  'status': {
    allowedFlags: new Set(['-s', '--short', '--porcelain', '--branch', '-b']),
    forbiddenFlags: new Set([]), allowPathArgs: false, allowRefArgs: false, maxArgs: 2,
  },
  'log': {
    allowedFlags: new Set(['--oneline', '--graph', '--decorate', '--no-decorate', '-n', '--format', '--name-only', '--stat']),
    forbiddenFlags: new Set(['--output', '--exec']),
    allowPathArgs: false, allowRefArgs: true, maxArgs: 5,
  },
  'diff': {
    allowedFlags: new Set(['--stat', '--name-only', '--name-status', '--cached', '--staged', '--shortstat']),
    forbiddenFlags: new Set(['--no-index', '--output', '--ext-diff', '--no-ext-diff', '--textconv', '--word-diff-regex']),
    allowPathArgs: true, allowRefArgs: true, maxArgs: 6,
  },
  'show': {
    allowedFlags: new Set(['--stat', '--name-only', '--format']),
    forbiddenFlags: new Set(['--output', '--no-index']),
    allowPathArgs: false, allowRefArgs: true, maxArgs: 3,
  },
  'stash': {
    allowedFlags: new Set(['push', 'pop', 'list', 'show', 'drop', '--include-untracked', '-m', '--message']),
    forbiddenFlags: new Set([]), allowPathArgs: false, allowRefArgs: false, maxArgs: 4,
  },
  'add': {
    allowedFlags: new Set(['-p', '--patch', '--update', '-u']),
    forbiddenFlags: new Set([]), allowPathArgs: true, allowRefArgs: false, maxArgs: 5,
  },
  'commit': {
    allowedFlags: new Set(['-m', '--message', '--allow-empty', '--no-verify']),
    forbiddenFlags: new Set(['--template', '--cleanup=scissors']),
    allowPathArgs: false, allowRefArgs: false, maxArgs: 3,
  },
  'checkout': {
    allowedFlags: new Set(['-b', '--detach', '--orphan']),
    forbiddenFlags: new Set([]), allowPathArgs: false, allowRefArgs: true, maxArgs: 3,
  },
  'rev-parse': {
    allowedFlags: new Set(['--short', '--verify', '--show-toplevel', 'HEAD']),
    forbiddenFlags: new Set(['--absolute-git-dir', '--git-dir']),
    allowPathArgs: false, allowRefArgs: true, maxArgs: 2,
  },
  'write-tree': {
    allowedFlags: new Set([]), forbiddenFlags: new Set([]),
    allowPathArgs: false, allowRefArgs: false, maxArgs: 0,
  },
};

const SecureGitSchema = z.object({
  worktreePath: z.string().min(1).max(512),
  subcommand: z.string().refine(
    (s: string) => Object.hasOwn(GIT_POLICY, s) || ['install', 'test', 'run', 'build', 'ci', 'ls', 'cd', 'pwd'].includes(s),
    { message: "Subcommand not in allowlist or NPM commands" }
  ),
  args: z.array(
    z.string().min(0).max(512)
      .refine(s => !s.includes('\0'), 'Null byte not allowed')
      .refine(s => !s.includes('\n') && !s.includes('\r'), 'Newlines not allowed')
  ).max(20),
});

export type SecureGitInput  = z.infer<typeof SecureGitSchema>;
export interface SecureGitOutput { stdout: string; stderr: string; exitCode: number }

export async function secureGit(input: SecureGitInput): Promise<SecureGitOutput> {
  const parsed = SecureGitSchema.safeParse(input);
  if (!parsed.success) throw new SecurityError(`[INPUT] ${parsed.error.message}`);

  const { worktreePath, subcommand, args } = parsed.data;

  const resolvedWorktree = await realpath(worktreePath).catch(() => {
    throw new SecurityError(`[PATH] Cannot resolve worktree: ${worktreePath}`);
  });

  const sanitizedEnv = buildSanitizedEnv();

  // Basic NPM handling, delegating full strict matching since it isn't in main policy object yet, 
  // but keeping it within shell wrapper flow
  if (['install', 'test', 'run', 'build', 'ci', 'ls', 'cd', 'pwd'].includes(subcommand)) {
     if (subcommand === 'cd') {
       return { stdout: `Resolved path: ${resolvedWorktree}`, stderr: '', exitCode: 0 };
     }
     if (['install', 'test', 'run', 'build', 'ci'].includes(subcommand)) {
       // rudimentary block for global and prefix
       for (const arg of args) {
           if (arg.includes('--global') || arg.includes('--prefix') || arg.includes('--workspaces')) {
               throw new SecurityError(`[NPM] Forbidden flag used: ${arg}`);
           }
       }
       const result = await execa('npm', [subcommand, ...args], { env: sanitizedEnv, timeout: 60_000, reject: false, cwd: resolvedWorktree });
       if (result.exitCode !== 0)
          throw new Error(`[NPM] npm ${subcommand} failed (exit ${result.exitCode}): ${result.stderr}`);
       return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
     } else {
       // ls or pwd
       const result = await execa(subcommand, args, { timeout: 10_000, reject: false, cwd: resolvedWorktree });
       if (result.exitCode !== 0)
          throw new Error(`[SHELL] ${subcommand} failed (exit ${result.exitCode}): ${result.stderr}`);
       return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
     }
  }

  const policy = GIT_POLICY[subcommand]!;

  if (args.length > policy.maxArgs)
    throw new SecurityError(`[ARGS] Too many args for 'git ${subcommand}': ${args.length} > ${policy.maxArgs}`);

  const safeFlags: string[] = [], safePathArgs: string[] = [], safeRefArgs: string[] = [];

  for (const arg of args) {
    if (arg.startsWith('-')) {
      await validateFlag(arg, subcommand, policy);
      safeFlags.push(arg);
    } else if (isGitRef(arg)) {
      if (!policy.allowRefArgs) throw new SecurityError(`[REF] Ref args not allowed for 'git ${subcommand}': ${arg}`);
      safeRefArgs.push(arg);
    } else {
      safePathArgs.push(await validateAndResolvePath(arg, resolvedWorktree, subcommand, policy));
    }
  }

  const finalArgs = ['-C', resolvedWorktree, subcommand, ...safeFlags, ...safeRefArgs, ...safePathArgs];
  
  const result = await execa('git', finalArgs, { env: sanitizedEnv, timeout: 30_000, reject: false });

  if (result.exitCode !== 0)
    throw new Error(`[GIT] git ${subcommand} failed (exit ${result.exitCode}): ${result.stderr}`);

  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
}

async function validateFlag(arg: string, subcommand: string, policy: SubcommandPolicy): Promise<void> {
  const baseFlag = arg.split('=')[0]!;
  if (policy.forbiddenFlags.has(baseFlag) || policy.forbiddenFlags.has(arg))
    throw new SecurityError(`[FLAG] '${arg}' is forbidden for 'git ${subcommand}'. Known attack vector.`);
  if (!policy.allowedFlags.has(baseFlag) && !policy.allowedFlags.has(arg))
    throw new SecurityError(`[FLAG] '${baseFlag}' not in allowlist for 'git ${subcommand}'.`);
  if (arg.includes('=')) {
    const value = arg.split('=').slice(1).join('=');
    if (/exec:|%(trailers.*key)/.test(value))
      throw new SecurityError(`[FLAG] Potentially dangerous format token in '${arg}'`);
  }
}

async function validateAndResolvePath(
  arg: string, resolvedWorktree: string, subcommand: string, policy: SubcommandPolicy
): Promise<string> {
  if (!policy.allowPathArgs) throw new SecurityError(`[PATH] Path args not allowed for 'git ${subcommand}': ${arg}`);
  const resolved = await realpath(path.resolve(resolvedWorktree, arg)).catch(() => {
    throw new SecurityError(`[PATH] Cannot resolve: '${arg}'`);
  });
  const prefix = resolvedWorktree.endsWith(path.sep) ? resolvedWorktree : resolvedWorktree + path.sep;
  if (resolved !== resolvedWorktree && !resolved.startsWith(prefix))
    throw new SecurityError(`[PATH_TRAVERSAL] '${resolved}' is outside worktree '${resolvedWorktree}'`);
  return resolved;
}

function isGitRef(arg: string): boolean {
  return /^[a-zA-Z0-9_\-./~^@{}:]+$/.test(arg) && !arg.includes('../') && !arg.includes('/../') && arg !== '..';
}

function buildSanitizedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const forbidden of FORBIDDEN_ENV_VARS) { delete env[forbidden]; }
  env['GIT_TERMINAL_PROMPT'] = '0';
  env['GIT_ASKPASS']         = 'echo';
  env['TERM']                = 'dumb';
  return env;
}

export class SecurityError extends Error {
  constructor(message: string) { super(message); this.name = 'SecurityError'; }
}

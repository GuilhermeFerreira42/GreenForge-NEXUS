/**
 * env-factory.ts — GreenForge NEXUS v2.3
 * Fábrica de fixtures de variáveis de ambiente para a Suíte SEC.
 *
 * Propósito:
 *   Prover instâncias limpas e controladas de `process.env` para testes que
 *   precisam simular injeção de variáveis de ambiente perigosas (ex: LD_PRELOAD,
 *   GIT_PAGER) sem vazar estado entre testes.
 *
 * Regras de uso (obrigatórias):
 *   1. NUNCA modificar `process.env` diretamente nos testes — use `withEnv()`.
 *   2. `makeCleanEnv()` retorna uma cópia do env SEM as variáveis da FORBIDDEN list.
 *   3. `withEnv()` é a única forma segura de injetar vars perigosas em um bloco.
 *
 * Referência: TEST_INVENTORY_GREENFORGE_v2.3.md, SEC-019 a SEC-027 (env poisoning)
 * CVE: CVE-2026-22708 (Environment Poisoning), CVE-2017-8386 (GIT_PAGER bypass)
 */

// ─── Lista canônica de variáveis perigosas (espelha FORBIDDEN_ENV_VARS do código de produção) ──
// Fonte: 05-governance-and-security.md, Seção 4.3 — secure-git-wrapper.ts v2.3
export const DANGEROUS_ENV_VARS: ReadonlyArray<string> = [
  // Pagers — vetores de escalada (CVE-2017-8386)
  'GIT_PAGER',
  'PAGER',
  'MANPAGER',
  'LESS',

  // Executáveis externos — RCE direto
  'GIT_EDITOR',
  'EDITOR',
  'VISUAL',
  'GIT_SSH',
  'GIT_SSH_COMMAND',
  'GIT_PROXY_COMMAND',
  'GIT_ASKPASS',
  'SSH_ASKPASS',
  'GIT_EXTERNAL_DIFF',

  // Redirecionamento de paths de execução — sandbox escape
  'GIT_EXEC_PATH',
  'GIT_TEMPLATE_DIR',

  // Injeção de configuração — CVE-2023-29007
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_KEY_0',
  'GIT_CONFIG_VALUE_0',

  // Logging em paths arbitrários
  'GIT_TRACE',
  'GIT_TRACE2',
  'GIT_TRACE_PERFORMANCE',
  'GIT_TRACE2_EVENT',

  // Autenticação e modo interativo
  'GIT_TERMINAL_PROMPT',
  'GIT_CREDENTIAL_HELPER',

  // Injeção de shell/loader — CVE-2026-22708
  'BASH_ENV',
  'ENV',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'IFS',
  'CDPATH',
];

// ─── Tipos ──────────────────────────────────────────────────────────────────

/** Subconjunto de variáveis de ambiente para injeção controlada em testes. */
export type EnvPatch = Partial<Record<string, string>>;

/** Snapshot do process.env antes de uma mutação. */
type EnvSnapshot = Record<string, string | undefined>;

// ─── Funções públicas ────────────────────────────────────────────────────────

/**
 * Retorna uma cópia do `process.env` atual com todas as variáveis da lista
 * `DANGEROUS_ENV_VARS` removidas.
 *
 * Uso típico: passar como parâmetro `env` ao verificar o que `buildSanitizedEnv()`
 * gerou, garantindo que o baseline do teste já está limpo.
 *
 * @example
 * const clean = makeCleanEnv();
 * expect(clean['GIT_PAGER']).toBeUndefined();
 */
export function makeCleanEnv(): NodeJS.ProcessEnv {
  const snapshot = { ...process.env };
  for (const key of DANGEROUS_ENV_VARS) {
    delete snapshot[key];
  }
  return snapshot;
}

/**
 * Executa `fn` com as variáveis de `patch` injetadas em `process.env`.
 * Restaura o estado original de `process.env` ao final, mesmo que `fn` lance.
 *
 * Seguro para uso em `beforeEach` / `afterEach` e dentro de blocos `it()`.
 *
 * @param patch  Variáveis a injetar (valores `undefined` deletam a key).
 * @param fn     Função a executar com o env modificado.
 *
 * @example
 * await withEnv({ GIT_PAGER: 'malicious_binary' }, async () => {
 *   await expect(secureGit({ ... })).resolves.toBeDefined();
 *   // buildSanitizedEnv() deve ter removido GIT_PAGER
 * });
 */
export async function withEnv<T>(patch: EnvPatch, fn: () => T | Promise<T>): Promise<T> {
  const snapshot = captureSnapshot(Object.keys(patch));
  applyPatch(patch);
  try {
    return await fn();
  } finally {
    restoreSnapshot(snapshot);
  }
}

/**
 * Versão síncrona de `withEnv` para casos onde `fn` não é async.
 *
 * @example
 * withEnvSync({ LD_PRELOAD: '/tmp/inject.so' }, () => {
 *   const env = buildSanitizedEnv();
 *   expect(env['LD_PRELOAD']).toBeUndefined();
 * });
 */
export function withEnvSync<T>(patch: EnvPatch, fn: () => T): T {
  const snapshot = captureSnapshot(Object.keys(patch));
  applyPatch(patch);
  try {
    return fn();
  } finally {
    restoreSnapshot(snapshot);
  }
}

/**
 * Injeta vars em `process.env` e retorna uma função de cleanup.
 * Útil para uso em `beforeEach` / `afterEach` do Vitest.
 *
 * @example
 * let cleanup: () => void;
 * beforeEach(() => { cleanup = injectEnv({ GIT_TRACE: '/tmp/leak.log' }); });
 * afterEach(() => cleanup());
 */
export function injectEnv(patch: EnvPatch): () => void {
  const snapshot = captureSnapshot(Object.keys(patch));
  applyPatch(patch);
  return () => restoreSnapshot(snapshot);
}

// ─── Utilitários internos ────────────────────────────────────────────────────

function captureSnapshot(keys: string[]): EnvSnapshot {
  const snapshot: EnvSnapshot = {};
  for (const key of keys) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function applyPatch(patch: EnvPatch): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function restoreSnapshot(snapshot: EnvSnapshot): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

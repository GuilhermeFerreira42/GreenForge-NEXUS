// vitest.config.ts — GreenForge NEXUS v2.3
// Configuração global do Vitest para a arquitetura de testes da Suíte NEXUS.
//
// Regras de ouro aplicadas aqui:
//   - pool: 'forks' → cada worker é um processo isolado (sem memória compartilhada)
//   - isolate: true  → módulos reimportados a cada arquivo de teste
//   - globals: true  → describe/it/expect/vi disponíveis sem import explícito
//   - Sem setup global de banco de dados (DB é criado por arquivo — ver regra #2)
//
// Nota ESM: package.json tem "type": "module", portanto este arquivo é carregado
//           como ES Module nativo. Plugins CJS (ex: vite-tsconfig-paths v5+) não
//           são necessários — os aliases são resolvidos diretamente aqui.

import { defineConfig } from 'vitest/config';
import { resolve }      from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@src':   resolve(__dirname, 'src'),
      '@tests': resolve(__dirname, 'tests'),
    },
  },

  test: {
    // ── Ambiente ─────────────────────────────────────────────────────────────
    environment: 'node',

    // ── Globals (describe, it, expect, vi sem import explícito) ──────────────
    globals: true,

    // ── Pool: forks garante isolamento real de processo por worker ────────────
    // Requisito arquitetural para o padrão Database-per-File (Regra de Ouro #2):
    // cada arquivo de teste corre em um processo filho separado, garantindo que
    // os arquivos .db efêmeros não colidam entre workers paralelos.
    pool: 'forks',
    poolOptions: {
      forks: {
        isolate: true,
      },
    },

    // ── Inclusão de arquivos de teste ─────────────────────────────────────────
    include: ['tests/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      'tests/**/helpers/**',   // helpers são importados pelos testes, não são testes
    ],

    // ── Timeouts ──────────────────────────────────────────────────────────────
    // 10s por teste — suficiente para testes de segurança síncronos.
    // Suítes RES (resiliência) podem sobrescrever via vi.setConfig() localmente.
    testTimeout:  10_000,
    hookTimeout:  10_000,

    // ── Coverage (provider: v8 — nativo ao Node.js, sem Babel) ───────────────
    coverage: {
      provider:          'v8',
      reporter:          ['text', 'lcov', 'html'],
      reportsDirectory:  './coverage',
      include:           ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/__mocks__/**',
        'tests/**',
      ],
      // Thresholds serão ativados quando o código de produção existir:
      // thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },

    // ── Reporters ─────────────────────────────────────────────────────────────
    reporters: ['verbose'],
  },
});

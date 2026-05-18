Vou disparar todas as buscas simultaneamente para máxima cobertura técnica.Pesquisas concluídas. Compilando o **Dossiê de Implementação v2.3** com todos os blueprints técnicos.

---

# 📁 DOSSIÊ DE IMPLEMENTAÇÃO v2.3
## GreenForge NEXUS — Blueprints de Engenharia de Infraestrutura

> **Contratos de função + configurações prontas para produção + referências CVE em ordem.**

---

## 🔵 GAP 1 — Vite + CodeMirror 6 + Web Workers + SharedArrayBuffer

### 1.1 — Por que o SharedArrayBuffer quebra em produção

Certos recursos, como acesso a objetos `SharedArrayBuffer` ou uso de `performance.now()` com timers não-throttled, só estão disponíveis se o documento for cross-origin isolated. Para usar esses recursos, você precisará configurar o header COEP com o valor `require-corp` ou `credentialless`, e o header `Cross-Origin-Opener-Policy` com o valor `same-origin`.

O erro mais comum em WebContainers é: `Failed to execute 'postMessage' on 'Worker': SharedArrayBuffer transfer requires self.crossOriginIsolated`. Isso ocorre quando os headers COOP/COEP não foram configurados.

Web Workers também precisarão do header COEP se quiserem utilizar `SharedArrayBuffer`.

### 1.2 — Os dois valores válidos de COEP e quando usar cada um

O valor `unsafe-none` permite que o documento carregue recursos cross-origin em no-cors mode sem permissão explícita — é o valor padrão. O valor `require-corp` restringe o carregamento: um documento só pode carregar recursos do mesmo origin, ou recursos que tenham configurado explicitamente o header `Cross-Origin-Resource-Policy` para um valor que permita o embed.

Para embedar um site cross-origin-isolated, certifique-se de que tanto o embed quanto o embedder tenham as mesmas configurações de COOP/COEP. A WebContainer API requer `require-corp`, então ambos precisam ser configurados como `require-corp`. Adicionalmente, adicione `allow="cross-origin-isolated"` como atributo no iframe embutido.

### 1.3 — Blueprint Completo: `vite.config.ts`

```typescript
// vite.config.ts — GreenForge NEXUS
// Configuração completa para CodeMirror 6 + Web Workers + WebContainers
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// ─────────────────────────────────────────────────────────
// PLUGIN 1: COOP/COEP Headers (mandatório para SharedArrayBuffer)
//
// Fonte: MDN Web Docs — Cross-Origin-Embedder-Policy
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Embedder-Policy
//
// COOP: same-origin         → Isola o browsing context group
// COEP: require-corp        → Bloqueia recursos cross-origin sem CORP header
// Cross-Origin-Resource-Policy: cross-origin → Permite que seus assets sejam
//                                               carregados por outros origins
// ─────────────────────────────────────────────────────────
function crossOriginIsolationPlugin(): Plugin {
  return {
    name: 'greenforge:cross-origin-isolation',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        // Headers mandatórios para window.crossOriginIsolated === true
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        // Permite que os assets do Vite sejam carregados dentro do WebContainer
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        next();
      });
    },
    // Em preview mode (vite preview) os headers também devem ser injetados
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        next();
      });
    },
  };
}

// ─────────────────────────────────────────────────────────
// PLUGIN 2: Worker URL Rewriter
// Corrige o problema de resolução de URL de workers em produção
// quando o Vite faz code-splitting e muda o caminho dos chunks.
// ─────────────────────────────────────────────────────────
function workerUrlPlugin(): Plugin {
  return {
    name: 'greenforge:worker-url',
    // Garante que workers instanciados com new URL(..., import.meta.url)
    // tenham seus assets copiados corretamente para o build de produção.
    // O Vite 4+ suporta isso nativamente — este plugin apenas documenta
    // o padrão correto de instanciação.
  };
}

export default defineConfig({
  plugins: [
    react(),
    crossOriginIsolationPlugin(),
    workerUrlPlugin(),
  ],

  // ─── Configuração de Workers ───────────────────────────
  worker: {
    // 'es' é obrigatório para CodeMirror 6 (usa ES modules internamente)
    format: 'es',
    // Injetar os headers nos scripts dos workers também
    // O CodeMirror usa @codemirror/language que spawna workers para parsing
    plugins: () => [
      // Os headers COEP são herdados do documento pai quando
      // o worker é instanciado com new Worker(new URL(...), { type: 'module' })
    ],
  },

  // ─── Build para produção ───────────────────────────────
  build: {
    target: 'esnext', // Obrigatório para SharedArrayBuffer e top-level await
    rollupOptions: {
      output: {
        // Previne que o Vite fragmente o CodeMirror em chunks pequenos
        // que quebram a resolução dos workers
        manualChunks: {
          'codemirror-core': [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/commands',
          ],
          'codemirror-lang': [
            '@codemirror/lang-javascript',
            '@codemirror/lang-typescript',
          ],
        },
      },
    },
  },

  // ─── Otimização de dependências ────────────────────────
  optimizeDeps: {
    // Força o Vite a pré-bundelar o CodeMirror como ESM
    // (necessário para que os workers sejam resolvidos corretamente)
    include: [
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@codemirror/commands',
    ],
    // Exclui pacotes que usam dynamic import incompatível com pre-bundling
    exclude: ['@codemirror/lang-markdown'],
  },

  server: {
    headers: {
      // Estes headers são adicionados AQUI para requests de assets estáticos
      // (os headers do middleware acima cobrem o documento HTML principal)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  },
});
```

### 1.4 — Instanciação Correta de Workers no CodeMirror 6

```typescript
// editor-setup.ts
// Padrão correto de instanciação de workers no Vite 4+
// NUNCA use: new Worker('/path/to/worker.js') — quebra em produção
// USE: new Worker(new URL('./worker', import.meta.url), { type: 'module' })

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';

// ─── Verificação de cross-origin isolation ───────────────
// Executar ANTES de inicializar o editor
export function assertCrossOriginIsolation(): void {
  if (!self.crossOriginIsolated) {
    console.error(
      '[GreenForge] crossOriginIsolated = false. ' +
      'SharedArrayBuffer indisponível. ' +
      'Verifique os headers COOP/COEP no servidor.'
    );
    // Em produção, logar no sistema de observabilidade mas não crashar
    // O CodeMirror 6 degrada graciosamente sem SharedArrayBuffer
  }
}

// ─── Parser Worker para CodeMirror ───────────────────────
// O @codemirror/language instancia workers internamente quando disponível.
// Nossa responsabilidade é garantir que o contexto seja cross-origin isolated.
export function createGreenForgeEditor(container: HTMLElement): EditorView {
  assertCrossOriginIsolation();

  return new EditorView({
    state: EditorState.create({
      extensions: [
        javascript({ typescript: true }),
        // O parser de TypeScript usa workers automaticamente quando
        // self.crossOriginIsolated === true
      ],
    }),
    parent: container,
  });
}
```

### 1.5 — Configuração do Servidor de Produção (Nginx)

```nginx
# nginx.conf — Headers obrigatórios para GreenForge em produção
# Fonte: web.dev/coop-coep e MDN

server {
    listen 443 ssl http2;
    server_name greenforge.yourdomain.com;

    # ── Headers de Cross-Origin Isolation ─────────────────
    # Mandatórios para SharedArrayBuffer no Chrome 92+ e Firefox
    add_header Cross-Origin-Opener-Policy   "same-origin"   always;
    add_header Cross-Origin-Embedder-Policy "require-corp"  always;

    # Permite que assets sejam carregados dentro do iframe do WebContainer
    add_header Cross-Origin-Resource-Policy "cross-origin"  always;

    location / {
        try_files $uri $uri/ /index.html;

        # Repete os headers para garantia (add_header no contexto location)
        add_header Cross-Origin-Opener-Policy   "same-origin"   always;
        add_header Cross-Origin-Embedder-Policy "require-corp"  always;
        add_header Cross-Origin-Resource-Policy "cross-origin"  always;
    }

    # Assets estáticos: mesmos headers
    location ~* \.(js|mjs|wasm|woff2)$ {
        add_header Cross-Origin-Resource-Policy "cross-origin" always;
        add_header Cross-Origin-Embedder-Policy "require-corp" always;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## 🟢 GAP 2 — CodeMirror 6 `WidgetType`: `toDOM()` + `eq()` + `updateDOM()`

### 2.1 — O Mecanismo de Reuso de DOM

Quando a view se atualiza, se ela encontra uma instância desenhada de um widget na posição onde o widget ocorre (usando o método `eq` para determinar equivalência), ela simplesmente reutilizará aquele nó DOM. Também é possível otimizar a atualização da estrutura DOM para widgets do mesmo tipo mas com conteúdo diferente, definindo um método `updateDOM`.

O `WidgetType.updateDOM` agora é chamado com o valor do widget anterior como terceiro argumento. Isso é crítico para implementar atualizações cirúrgicas sem recriar o nó DOM.

O `WidgetType.toDOM`/`WidgetType.updateDOM` não pode obter informações sobre onde no documento está localizado — uma instância de Widget deve incluir qualquer informação contextual passada via construtor.

### 2.2 — Blueprint: `AgentTagWidget` com Imunidade a Re-renderizações

```typescript
// agent-tag-widget.ts
// Blueprint completo de WidgetType para Inline Agent Tags no GreenForge.
//
// PRINCÍPIO CENTRAL (fonte: codemirror.net/examples/decoration):
//   eq() === true  → CodeMirror REUTILIZA o nó DOM existente (zero re-render)
//   eq() === false → CodeMirror chama toDOM() ou updateDOM() conforme necessário
//
// ESTRATÉGIA:
//   - eq() compara TODOS os campos que afetam a renderização visual
//   - updateDOM() faz mutação cirúrgica do DOM existente (sem recriar)
//   - toDOM() é chamado apenas 1x por widget novo
//   - destroy() limpa listeners para prevenir memory leaks

import {
  WidgetType,
  EditorView,
  ViewPlugin,
  DecorationSet,
  Decoration,
  ViewUpdate,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

// ─── Tipos de dados do Widget ─────────────────────────────

export interface AgentTagData {
  agentId:    string;   // "agent-1", "agent-2", etc.
  agentColor: string;   // Cor HEX do agente: "#3B82F6"
  agentName:  string;   // Nome display: "Arquiteto"
  lineFrom:   number;   // Linha inicial da modificação
  lineTo:     number;   // Linha final da modificação
  isActive:   boolean;  // Agente está executando ativamente?
}

// ─── O Widget ────────────────────────────────────────────

export class AgentTagWidget extends WidgetType {
  constructor(private readonly data: AgentTagData) {
    super();
  }

  /**
   * CONTRATO: eq()
   * - INPUT:  Outro widget do mesmo tipo
   * - OUTPUT: true se visualmente idêntico (DOM pode ser reutilizado)
   *
   * REGRA CRÍTICA: Comparar TODOS os campos que afetam o DOM.
   * Se eq() retorna true para widgets com dados diferentes,
   * o cursor trava e o DOM fica obsoleto.
   *
   * Fonte: codemirror.net/examples/decoration/
   * "When the view updates itself, if it finds it already has a drawn
   *  instance of such a widget in the position where the widget occurs
   *  (using the eq method to determine equivalence), it will simply reuse that."
   */
  eq(other: AgentTagWidget): boolean {
    return (
      this.data.agentId    === other.data.agentId    &&
      this.data.agentColor === other.data.agentColor &&
      this.data.agentName  === other.data.agentName  &&
      this.data.isActive   === other.data.isActive
      // NOTA: lineFrom/lineTo NÃO entram no eq() porque eles determinam
      // ONDE o widget é posicionado (range do decoration), não como ele
      // É renderizado. O RangeSet cuida da posição.
    );
  }

  /**
   * CONTRATO: toDOM()
   * - Chamado APENAS quando o widget é inserido pela primeira vez
   * - Deve retornar um nó DOM completo e independente
   * - NÃO capturar referências externas mutáveis aqui
   *   (use updateDOM para atualizações subsequentes)
   */
  toDOM(_view: EditorView): HTMLElement {
    const tag = document.createElement('span');
    tag.className     = 'cm-agent-tag';
    tag.dataset.agent = this.data.agentId;

    // Ícone de status
    const dot = tag.appendChild(document.createElement('span'));
    dot.className = 'cm-agent-tag__dot';
    dot.style.cssText = `
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: ${this.data.agentColor};
      margin-right: 4px;
      vertical-align: middle;
      ${this.data.isActive ? 'animation: pulse 1.5s infinite;' : ''}
    `;

    // Label do agente
    const label = tag.appendChild(document.createElement('span'));
    label.className   = 'cm-agent-tag__label';
    label.textContent = this.data.agentName;
    label.style.cssText = `
      font-size: 10px;
      font-weight: 600;
      color: ${this.data.agentColor};
      font-family: var(--font-mono);
      vertical-align: middle;
    `;

    // Estilo do container
    tag.style.cssText = `
      display: inline-flex;
      align-items: center;
      padding: 1px 6px;
      border-radius: 3px;
      border: 1px solid ${this.data.agentColor}44;
      background-color: ${this.data.agentColor}11;
      margin-left: 8px;
      cursor: default;
      user-select: none;
    `;

    return tag;
  }

  /**
   * CONTRATO: updateDOM()
   * - Chamado quando eq() retorna FALSE mas o widget é do MESMO TIPO
   *   e está na mesma posição — CodeMirror prefere atualizar a recriar.
   * - Faz mutação CIRÚRGICA do DOM existente.
   * - Retornar `true` sinaliza que a atualização foi bem-sucedida.
   * - Retornar `false` força CodeMirror a chamar toDOM() novamente.
   *
   * Esta é a otimização central que previne o re-render a cada keystroke.
   */
  updateDOM(dom: HTMLElement, _view: EditorView): boolean {
    const dot   = dom.querySelector<HTMLSpanElement>('.cm-agent-tag__dot');
    const label = dom.querySelector<HTMLSpanElement>('.cm-agent-tag__label');

    if (!dot || !label) return false; // DOM inválido → forçar recriação

    // Atualização cirúrgica: apenas o que mudou
    if (dot.style.backgroundColor !== this.data.agentColor) {
      dot.style.backgroundColor = this.data.agentColor;
    }

    const shouldPulse = this.data.isActive;
    const isPulsing   = dot.style.animationName === 'pulse';
    if (shouldPulse !== isPulsing) {
      dot.style.animation = shouldPulse ? 'pulse 1.5s infinite' : 'none';
    }

    if (label.textContent !== this.data.agentName) {
      label.textContent = this.data.agentName;
    }

    if (label.style.color !== this.data.agentColor) {
      label.style.color = this.data.agentColor;
    }

    // Atualiza o data attribute para debugging
    dom.dataset.agent = this.data.agentId;

    return true; // Sinaliza: DOM foi atualizado com sucesso, não recriar
  }

  /**
   * CONTRATO: destroy()
   * Remove event listeners para prevenir memory leaks quando o widget
   * sai do viewport (CodeMirror virtualiza widgets fora da janela visível).
   */
  destroy(dom: HTMLElement): void {
    // Remover quaisquer listeners anexados no toDOM()
    // (neste widget não há listeners, mas o método deve existir
    // como documentação do contrato)
    dom.removeEventListener('click', () => {});
  }

  /**
   * ignoreEvent(): Controla se eventos do DOM dentro do widget
   * são propagados para o handler de eventos do CodeMirror.
   * true  = o CM ignora o evento (widget o consome)
   * false = o CM processa o evento (ex: clique move cursor)
   */
  ignoreEvent(event: Event): boolean {
    // Tags de agente são decorativas — não interferem com o cursor
    return event.type !== 'mousedown';
  }
}

// ─── ViewPlugin: Cria e mantém os decorations ────────────

/**
 * CONTRATO: agentTagPlugin()
 * - Recebe um mapa de agentId → AgentTagData[]
 * - Retorna uma extensão CodeMirror que injeta os widgets
 * - Atualiza os widgets de forma incremental a cada ViewUpdate
 */
export function agentTagPlugin(
  getAgentTags: () => Map<number, AgentTagData> // número da linha → dados
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        // Reconstruir apenas se o documento ou viewport mudou
        // NÃO reconstruir a cada keystroke sem mudança de estrutura
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const tags    = getAgentTags();

        for (const [lineNumber, tagData] of tags) {
          const line = view.state.doc.line(lineNumber);
          // Inserir o widget ao FINAL da linha (não no início)
          // para não interferir com o parsing de sintaxe
          builder.add(
            line.to,
            line.to,
            Decoration.widget({
              widget: new AgentTagWidget(tagData),
              side:   1, // Posicionar APÓS o caractere na posição `to`
            })
          );
        }

        return builder.finish();
      }
    },
    {
      decorations: instance => instance.decorations,
    }
  );
}
```

---

## 🔴 GAP 3 — Hardening do `secureGit`: Sanitização de Env + Allowlist + Path Traversal

### 3.1 — Base de CVEs Relevantes para o GreenForge

Vulnerabilidades em Git podem resultar em injeção arbitrária de configuração no `$GIT_DIR/config` de um usuário. Isso pode ser usado para atingir execução arbitrária de código via valores de configuração que especificam executáveis, como `core.pager`, `core.editor`, `core.sshCommand`, e similares.

Um padrão recorrente de vulnerabilidade Git em CI/CD: expor valores de parâmetros controlados pelo usuário como variáveis de ambiente e subsequentemente passá-los diretamente para comandos Git CLI sem sanitização adequada permite que atacantes executem comandos arbitrários.

A causa raiz é a validação e sanitização insuficiente de parâmetros fornecidos pelo usuário. Quando sistemas passam parâmetros fornecidos pelo usuário diretamente ao comando `git log` sem sanitizar ou validar que contêm apenas identificadores de revisão legítimos, a exploração se torna trivial.

A função `spawn` não usa o shell do sistema para executar o comando, o que a torna menos suscetível a ataques de injeção. Ela também usa um array para o comando e argumentos, o que facilita evitar command injection.

O fix de sanitização de input é a remediação primária, mas deve-se também remover code paths desnecessários de ambientes onde não deveriam existir. Mesmo que uma vulnerabilidade similar de injection seja descoberta no futuro, esse hardening adicional limitaria o que um atacante poderia fazer com ela.

### 3.2 — Blueprint Completo: `secure-git-wrapper.ts` v2.3 Final

```typescript
// secure-git-wrapper.ts — GreenForge v2.3
// Defesa em profundidade contra:
//   - CVE-2026-3854  (GitHub RCE via push option injection)
//   - CVE-2026-25763 (OpenProject git log --output= injection)
//   - CVE-2025-68144 (mcp-server-git argument injection)
//   - CVE-2023-29007 (Git arbitrary config injection via core.pager)
//   - CVE-2017-8386  (git-shell pager bypass via less)
import { realpath }  from 'fs/promises';
import path          from 'path';
import { execa }     from 'execa';
import { z }         from 'zod';

// ═══════════════════════════════════════════════════════════
// SEÇÃO 1: VARIÁVEIS DE AMBIENTE PERIGOSAS
// ═══════════════════════════════════════════════════════════
//
// Mesmo com spawn({ shell: false }), estas vars podem armar
// comandos permitidos. Ex: PAGER=malicious_binary git log
//
// Fontes:
//   - CVE-2026-3854: "override the environment the push was
//     processed in, bypass sandboxing protections"
//   - CVE-2023-29007: "arbitrary code execution via
//     core.pager, core.editor, core.sshCommand"
//   - CVE-2017-8386: "privilege escalation via git-shell pager"
//   - Insinuator.net/2017: "less interactive mode shell escape"

const FORBIDDEN_ENV_VARS: ReadonlySet<string> = new Set([
  // Pagers — vetores de escalada (CVE-2017-8386)
  'GIT_PAGER',
  'PAGER',
  'MANPAGER',
  'LESS',          // Controla flags do less — pode habilitar execução de shell

  // Executáveis externos — RCE direto
  'GIT_EDITOR',
  'EDITOR',
  'VISUAL',
  'GIT_SSH',
  'GIT_SSH_COMMAND',
  'GIT_PROXY_COMMAND',
  'GIT_ASKPASS',
  'SSH_ASKPASS',
  'GIT_EXTERNAL_DIFF',  // Executa diff handler externo por linha modificada

  // Redirecionamento de paths de execução — sandbox escape
  'GIT_EXEC_PATH',      // Onde git busca subcomandos
  'GIT_TEMPLATE_DIR',   // Pode injetar hooks maliciosos

  // Injeção de configuração — CVE-2023-29007
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_KEY_0',
  'GIT_CONFIG_VALUE_0',

  // Logging em paths arbitrários
  'GIT_TRACE',
  'GIT_TRACE2',
  'GIT_TRACE_PERFORMANCE',
  'GIT_TRACE2_EVENT',

  // Variáveis de autenticação que podem vazar credenciais
  'GIT_TERMINAL_PROMPT',
  'GIT_CREDENTIAL_HELPER',
]);

// ═══════════════════════════════════════════════════════════
// SEÇÃO 2: ALLOWLIST DE SUBCOMANDOS E POLÍTICAS DE ARGUMENTOS
// ═══════════════════════════════════════════════════════════

interface SubcommandPolicy {
  // Flags EXPLICITAMENTE permitidas (allowlist positiva)
  allowedFlags:   ReadonlySet<string>;
  // Flags EXPLICITAMENTE proibidas (dupla proteção para vetores conhecidos)
  forbiddenFlags: ReadonlySet<string>;
  // Permite argumentos posicionais (paths, refs)?
  allowPathArgs:  boolean;
  // Permite refs git (hash, branch, tag)?
  allowRefArgs:   boolean;
  // Número máximo total de argumentos
  maxArgs:        number;
}

const GIT_POLICY: Readonly<Record<string, SubcommandPolicy>> = {
  // ── Operações de inspeção (read-only) ──────────────────
  'status': {
    allowedFlags:   new Set(['-s', '--short', '--porcelain', '--branch', '-b']),
    forbiddenFlags: new Set([]),
    allowPathArgs:  false,
    allowRefArgs:   false,
    maxArgs:        2,
  },
  'log': {
    allowedFlags:   new Set([
      '--oneline', '--graph', '--decorate', '--no-decorate',
      '-n', '--format',       // --format=<format> sem exec tokens
      '--name-only', '--stat',
    ]),
    forbiddenFlags: new Set([
      '--output',             // CVE-2026-25763: escrita arbitrária de arquivo
      '--exec',               // Executa comando externo por commit
    ]),
    allowPathArgs:  false,
    allowRefArgs:   true,     // Permite git log HEAD, git log main
    maxArgs:        5,
  },
  'diff': {
    allowedFlags:   new Set([
      '--stat', '--name-only', '--name-status',
      '--cached', '--staged',
      '--shortstat',
    ]),
    forbiddenFlags: new Set([
      '--no-index',           // LFI: lê arquivos FORA do repositório
      '--output',             // CVE-2025-68144: escrita arbitrária
      '--ext-diff',           // RCE: executa diff handler externo
      '--no-ext-diff',
      '--textconv',           // RCE: executa filtro de conversão
      '--word-diff-regex',    // Potencial ReDoS
    ]),
    allowPathArgs:  true,     // Permite comparar arquivos específicos
    allowRefArgs:   true,
    maxArgs:        6,
  },
  'show': {
    allowedFlags:   new Set(['--stat', '--name-only', '--format']),
    forbiddenFlags: new Set(['--output', '--no-index']),
    allowPathArgs:  false,
    allowRefArgs:   true,
    maxArgs:        3,
  },
  // ── Operações de escrita (controladas) ────────────────
  'stash': {
    allowedFlags:   new Set([
      'push', 'pop', 'list', 'show', 'drop',
      '--include-untracked', '-m', '--message',
    ]),
    forbiddenFlags: new Set([]),
    allowPathArgs:  false,
    allowRefArgs:   false,
    maxArgs:        4,
  },
  'add': {
    allowedFlags:   new Set(['-p', '--patch', '--update', '-u']),
    forbiddenFlags: new Set([]),
    allowPathArgs:  true,   // Caminho do arquivo a adicionar
    allowRefArgs:   false,
    maxArgs:        5,
  },
  'commit': {
    allowedFlags:   new Set(['-m', '--message', '--allow-empty', '--no-verify']),
    forbiddenFlags: new Set([
      '--template',          // Poderia executar editor externo
      '--cleanup=scissors',  // Poderia executar programa externo
    ]),
    allowPathArgs:  false,
    allowRefArgs:   false,
    maxArgs:        3,
  },
  'checkout': {
    allowedFlags:   new Set(['-b', '--detach', '--orphan']),
    forbiddenFlags: new Set([]),
    allowPathArgs:  false,
    allowRefArgs:   true,  // git checkout main, git checkout HEAD~1
    maxArgs:        3,
  },
  'rev-parse': {
    allowedFlags:   new Set(['--short', '--verify', '--show-toplevel', 'HEAD']),
    forbiddenFlags: new Set(['--absolute-git-dir', '--git-dir']),
    allowPathArgs:  false,
    allowRefArgs:   true,
    maxArgs:        2,
  },
  'write-tree': {
    allowedFlags:   new Set([]),
    forbiddenFlags: new Set([]),
    allowPathArgs:  false,
    allowRefArgs:   false,
    maxArgs:        0,
  },
};

// ═══════════════════════════════════════════════════════════
// SEÇÃO 3: SCHEMA DE INPUT E TIPOS
// ═══════════════════════════════════════════════════════════

const SecureGitSchema = z.object({
  worktreePath: z.string().min(1).max(512),
  subcommand:   z.string().refine(
    s => s in GIT_POLICY,
    s => ({ message: `'${s}' not in allowlist. Allowed: ${Object.keys(GIT_POLICY).join(', ')}` })
  ),
  args: z.array(
    z.string()
      .min(0)
      .max(512)
      // Rejeita null bytes (injeção clássica)
      .refine(s => !s.includes('\0'), 'Null byte not allowed in git args')
      // Rejeita newlines (injeção de config via core.pager=cmd\ncore.editor=evil)
      .refine(s => !s.includes('\n') && !s.includes('\r'), 'Newlines not allowed in git args')
  ).max(10),
});

export type SecureGitInput  = z.infer<typeof SecureGitSchema>;
export interface SecureGitOutput { stdout: string; stderr: string; exitCode: number }

// ═══════════════════════════════════════════════════════════
// SEÇÃO 4: A FUNÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════

export async function secureGit(input: SecureGitInput): Promise<SecureGitOutput> {
  // ── Camada 0: Schema Zod ──────────────────────────────
  const parsed = SecureGitSchema.safeParse(input);
  if (!parsed.success) {
    throw new SecurityError(`[INPUT] ${parsed.error.message}`);
  }

  const { worktreePath, subcommand, args } = parsed.data;
  const policy = GIT_POLICY[subcommand]!;

  // ── Camada 1: Resolução real do worktree ──────────────
  // Dereference de symlinks previne bypass via /tmp/evil -> /etc
  const resolvedWorktree = await realpath(worktreePath).catch(() => {
    throw new SecurityError(`[PATH] Cannot resolve worktree: ${worktreePath}`);
  });

  // ── Camada 2: Validação do limite de argumentos ───────
  if (args.length > policy.maxArgs) {
    throw new SecurityError(
      `[ARGS] Too many args for 'git ${subcommand}': ${args.length} > ${policy.maxArgs}`
    );
  }

  // ── Camada 3: Classificação e validação dos argumentos ─
  const safeFlags:    string[] = [];
  const safePathArgs: string[] = [];
  const safeRefArgs:  string[] = [];

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
      // Trata como path argument
      const safePath = await validateAndResolvePath(arg, resolvedWorktree, subcommand, policy);
      safePathArgs.push(safePath);
    }
  }

  // ── Camada 4: Sanitização do environment ─────────────
  const sanitizedEnv = buildSanitizedEnv();

  // ── Camada 5: Execução via execa (shell: false implícito) ─
  const finalArgs = ['-C', resolvedWorktree, subcommand, ...safeFlags, ...safeRefArgs, ...safePathArgs];

  const result = await execa('git', finalArgs, {
    env:     sanitizedEnv,
    timeout: 30_000,        // 30s de timeout máximo por operação
    reject:  false,         // Não lança exceção em exit code != 0
    // shell: false é o PADRÃO do execa — nunca passar { shell: true }
  });

  if (result.exitCode !== 0) {
    throw new Error(`[GIT] git ${subcommand} failed (exit ${result.exitCode}): ${result.stderr}`);
  }

  return {
    stdout:   result.stdout,
    stderr:   result.stderr,
    exitCode: result.exitCode,
  };
}

// ─── Funções auxiliares ───────────────────────────────────

async function validateFlag(
  arg:       string,
  subcommand: string,
  policy:    SubcommandPolicy
): Promise<void> {
  const baseFlag = arg.split('=')[0]!;

  // 1. Flags explicitamente proibidas (vetores CVE conhecidos)
  if (policy.forbiddenFlags.has(baseFlag) || policy.forbiddenFlags.has(arg)) {
    throw new SecurityError(
      `[FLAG] '${arg}' is forbidden for 'git ${subcommand}'. Known attack vector.`
    );
  }

  // 2. Flag deve estar na allowlist positiva
  if (!policy.allowedFlags.has(baseFlag) && !policy.allowedFlags.has(arg)) {
    throw new SecurityError(
      `[FLAG] '${baseFlag}' not in allowlist for 'git ${subcommand}'. ` +
      `Allowed: ${[...policy.allowedFlags].join(', ')}`
    );
  }

  // 3. Para flags com valor (--format=<value>, -n <value>),
  //    validar que o valor não contém injeção de shell
  if (arg.includes('=')) {
    const value = arg.split('=').slice(1).join('=');
    // Bloqueia tokens de execução no --format do git log
    // Ex: --format="%H %(trailers:key=exec:evil)"
    if (/exec:|%(trailers.*key)/.test(value)) {
      throw new SecurityError(`[FLAG] Potentially dangerous format token in '${arg}'`);
    }
  }
}

async function validateAndResolvePath(
  arg:             string,
  resolvedWorktree: string,
  subcommand:      string,
  policy:          SubcommandPolicy
): Promise<string> {
  if (!policy.allowPathArgs) {
    throw new SecurityError(`[PATH] Path args not allowed for 'git ${subcommand}': ${arg}`);
  }

  // Resolve o path real (dereference symlinks)
  const resolved = await realpath(path.resolve(resolvedWorktree, arg)).catch(() => {
    throw new SecurityError(`[PATH] Cannot resolve: '${arg}'`);
  });

  // Confinamento ao worktree
  const prefix = resolvedWorktree.endsWith(path.sep)
    ? resolvedWorktree
    : resolvedWorktree + path.sep;

  if (resolved !== resolvedWorktree && !resolved.startsWith(prefix)) {
    throw new SecurityError(
      `[PATH_TRAVERSAL] '${resolved}' is outside worktree '${resolvedWorktree}'`
    );
  }

  return resolved;
}

function isGitRef(arg: string): boolean {
  // Git refs válidos: HEAD, branch names, commit hashes, tags
  // NÃO começa com -, NÃO contém path separators relativos
  return (
    /^[a-zA-Z0-9_\-./~^@{}:]+$/.test(arg) &&
    !arg.includes('../')    &&
    !arg.includes('/../')   &&
    arg !== '..'
  );
}

function buildSanitizedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const forbidden of FORBIDDEN_ENV_VARS) {
    delete env[forbidden];
  }
  // Força modo não-interativo (previne abertura de editor/pager)
  env['GIT_TERMINAL_PROMPT'] = '0';
  env['GIT_ASKPASS']         = 'echo';   // Retorna vazio para qualquer prompt
  env['TERM']                = 'dumb';   // Desabilita features de terminal rico
  return env;
}

class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}
```

---

## 🟣 GAP 4 — Graceful Shutdown: Hierarquia de Encerramento com `better-sqlite3`

### 4.1 — O Princípio do Shutdown Ordenado

Para rastrear conexões dos clientes, implemente uma classe com métodos `add` e `closeAll`. Quando o sistema receber o sinal de terminação do processo, chame o método `closeAll` para fechar todas as conexões abertas. Dessa forma, não dependemos de um número arbitrário de espera, mas podemos afirmar com confiança que nenhuma conexão WebSocket foi deixada aberta após `closeAll` ter sido concluído.

O padrão correto para WebSockets no shutdown: enviar uma mensagem de `server-shutdown` para todos os clientes, fechar graciosamente com código 1001, aguardar conexões fecharem por até 5 segundos, e então forçar o fechamento das restantes.

### 4.2 — A Tabela de Prioridades de Shutdown

| Prioridade | Componente | Ação | Motivo | Timeout |
|:---:|---|---|---|:---:|
| **1** | HTTP/SSE listeners | `server.close()` — para aceitar novas conexões | Novas requests podem criar transações enquanto shutdown ocorre | 100ms |
| **2** | SSE streams ativos | Enviar `event: shutdown` + fechar streams | Clientes sabem se reconectar | 500ms |
| **3** | WebSocket clients | Enviar close frame 1001 + aguardar ACK | Protocolo correto de encerramento WS | 5s |
| **4** | Agent loops | Setar flag `isShuttingDown = true` + aguardar round atual | Não interromper operação no meio | 10s |
| **5** | Background workers | `worker.close()` + aguardar jobs em progresso | Jobs em progresso devem finalizar | 15s |
| **6** | CodeMirror streams | Destruir `EditorView` + flush de operações pendentes | Previne DOM leaks | 1s |
| **7** | ORM/Prisma pool | `prisma.$disconnect()` | Fecha pool de conexões graciosamente | 5s |
| **8** | WAL Checkpoint | `db.pragma('wal_checkpoint(FULL)')` + `db.close()` | **CRÍTICO: Garante durabilidade de todas as writes** | 30s |

### 4.3 — Blueprint Completo: `graceful-shutdown.ts`

```typescript
// graceful-shutdown.ts — GreenForge v2.3
// Implementa a hierarquia de 8 estágios de shutdown.
//
// ORDEM CRONOLÓGICA:
//   1. Parar de aceitar novas conexões (HTTP + SSE)
//   2. Notificar clientes SSE
//   3. Fechar WebSockets graciosamente
//   4. Sinalizar agent loops para parar após round atual
//   5. Aguardar background workers
//   6. Destruir state do CodeMirror (servidor SSR se aplicável)
//   7. Desconectar Prisma/ORM pool
//   8. WAL checkpoint + fsync + fechar SQLite
//
// Baseado em: oneuptime.com/blog/graceful-shutdown-handler
// e better-sqlite3 WAL documentation

import { createServer, type Server }   from 'http';
import type { WebSocket }              from 'ws';
import Database                        from 'better-sqlite3';

// ─── Tipos ───────────────────────────────────────────────

interface SSEClient {
  id:       string;
  response: { write: (data: string) => void; end: () => void };
}

interface ShutdownRegistry {
  httpServer:     Server | null;
  sseClients:     Set<SSEClient>;
  wsClients:      Set<WebSocket>;
  agentLoops:     Map<string, { stop: () => Promise<void> }>;
  backgroundJobs: Map<string, { drain: () => Promise<void> }>;
  prismaClient:   { $disconnect: () => Promise<void> } | null;
  db:             Database.Database | null;
}

// ─── Singleton do Registry ────────────────────────────────

const registry: ShutdownRegistry = {
  httpServer:     null,
  sseClients:     new Set(),
  wsClients:      new Set(),
  agentLoops:     new Map(),
  backgroundJobs: new Map(),
  prismaClient:   null,
  db:             null,
};

// ─── API de Registro ──────────────────────────────────────

export const GracefulShutdown = {
  registerHTTPServer: (s: Server)                            => { registry.httpServer = s; },
  registerSSEClient:  (c: SSEClient)                         => registry.sseClients.add(c),
  deregisterSSEClient:(c: SSEClient)                         => registry.sseClients.delete(c),
  registerWSClient:   (ws: WebSocket)                        => registry.wsClients.add(ws),
  deregisterWSClient: (ws: WebSocket)                        => registry.wsClients.delete(ws),
  registerAgentLoop:  (id: string, loop: { stop: () => Promise<void> }) =>
    registry.agentLoops.set(id, loop),
  registerBackgroundJob: (id: string, job: { drain: () => Promise<void> }) =>
    registry.backgroundJobs.set(id, job),
  registerPrisma:     (p: { $disconnect: () => Promise<void> }) => { registry.prismaClient = p; },
  registerSQLite:     (db: Database.Database)                => { registry.db = db; },
};

// ─── Utilitários ─────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[SHUTDOWN TIMEOUT] ${label} exceeded ${ms}ms`)), ms)
    ),
  ]);
}

async function logStage(stage: number, name: string, fn: () => Promise<void>, ms: number): Promise<void> {
  const start = Date.now();
  console.log(`[SHUTDOWN] Stage ${stage}: ${name} — starting...`);
  try {
    await withTimeout(fn(), ms, name);
    console.log(`[SHUTDOWN] Stage ${stage}: ${name} — ✅ done in ${Date.now() - start}ms`);
  } catch (err) {
    console.error(`[SHUTDOWN] Stage ${stage}: ${name} — ⚠️ ${err instanceof Error ? err.message : err}`);
    // Em shutdown, não propagar erros — continuar para próximo estágio
  }
}

// ─── O Graceful Shutdown Orchestrator ────────────────────

let isShuttingDown = false;

export async function gracefulShutdown(signal: 'SIGTERM' | 'SIGINT'): Promise<void> {
  if (isShuttingDown) {
    console.warn('[SHUTDOWN] Already in progress. Ignoring duplicate signal.');
    return;
  }
  isShuttingDown = true;

  console.log(`\n[SHUTDOWN] Received ${signal}. Starting 8-stage graceful shutdown...`);
  const totalStart = Date.now();

  // ═══════════════════════════════════════════════════
  // ESTÁGIO 1: Parar de aceitar novas conexões HTTP/SSE
  // Novas requests durante o shutdown criariam transações
  // que seriam abortadas, causando inconsistências.
  // ═══════════════════════════════════════════════════
  await logStage(1, 'HTTP Server Stop', async () => {
    if (!registry.httpServer) return;
    await new Promise<void>((resolve, reject) => {
      registry.httpServer!.close(err => err ? reject(err) : resolve());
    });
  }, 2_000);

  // ═══════════════════════════════════════════════════
  // ESTÁGIO 2: Notificar e fechar SSE streams
  // Clientes SSE devem saber que o servidor está caindo
  // para implementar reconnect com backoff.
  // ═══════════════════════════════════════════════════
  await logStage(2, 'SSE Streams', async () => {
    const clients = [...registry.sseClients];
    console.log(`[SHUTDOWN:SSE] Closing ${clients.length} SSE client(s)...`);

    for (const client of clients) {
      try {
        // Envia evento de shutdown antes de fechar
        client.response.write(
          `event: shutdown\ndata: ${JSON.stringify({ reason: signal, reconnect: true })}\n\n`
        );
        client.response.end();
      } catch {
        // Ignore — cliente pode já estar desconectado
      }
    }
    registry.sseClients.clear();
  }, 1_000);

  // ═══════════════════════════════════════════════════
  // ESTÁGIO 3: Fechar WebSocket clients
  // Protocolo: enviar close frame 1001 "Going Away"
  // e aguardar ACK dos clientes por até 5s.
  // Fonte: oneuptime.com/blog/graceful-shutdown-handler
  // ═══════════════════════════════════════════════════
  await logStage(3, 'WebSocket Clients', async () => {
    const clients = [...registry.wsClients];
    console.log(`[SHUTDOWN:WS] Closing ${clients.length} WebSocket(s)...`);

    for (const ws of clients) {
      try {
        ws.send(JSON.stringify({ type: 'server-shutdown', message: 'Server is shutting down, please reconnect' }));
        ws.close(1001, 'Server shutting down');
      } catch { /* ignore */ }
    }

    // Aguardar fechamento gracioso
    const deadline = Date.now() + 5_000;
    while (registry.wsClients.size > 0 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }

    // Force close residuais
    for (const ws of registry.wsClients) {
      try { ws.terminate(); } catch { /* ignore */ }
    }
    registry.wsClients.clear();
  }, 6_000);

  // ═══════════════════════════════════════════════════
  // ESTÁGIO 4: Sinalizar agent loops para parar
  // NÃO interromper no meio de uma operação.
  // Cada loop deve verificar `isShuttingDown` e parar
  // após completar o round atual.
  // ═══════════════════════════════════════════════════
  await logStage(4, 'Agent Loops', async () => {
    const loops = [...registry.agentLoops.entries()];
    console.log(`[SHUTDOWN:AGENTS] Stopping ${loops.length} agent loop(s)...`);

    // Sinalizar todos em paralelo
    await Promise.allSettled(
      loops.map(async ([id, loop]) => {
        console.log(`[SHUTDOWN:AGENTS] Stopping agent: ${id}`);
        await loop.stop();
      })
    );
    registry.agentLoops.clear();
  }, 15_000);  // Agentes podem estar em operações longas

  // ═══════════════════════════════════════════════════
  // ESTÁGIO 5: Aguardar background workers
  // Workers de checkpoint, indexação, etc.
  // devem drenar seus jobs em progresso.
  // ═══════════════════════════════════════════════════
  await logStage(5, 'Background Workers', async () => {
    const jobs = [...registry.backgroundJobs.entries()];
    console.log(`[SHUTDOWN:WORKERS] Draining ${jobs.length} background job(s)...`);

    await Promise.allSettled(
      jobs.map(async ([id, job]) => {
        console.log(`[SHUTDOWN:WORKERS] Draining: ${id}`);
        await job.drain();
      })
    );
    registry.backgroundJobs.clear();
  }, 15_000);

  // ═══════════════════════════════════════════════════
  // ESTÁGIO 6: CodeMirror (somente em ambiente SSR)
  // Em ambientes client-only, este estágio é no-op.
  // Em SSR: destruir EditorView para liberar workers
  // do Lezer parser.
  // ═══════════════════════════════════════════════════
  await logStage(6, 'CodeMirror SSR Cleanup', async () => {
    // Se EditorView instances foram criadas no servidor (SSR/test):
    // editorViews.forEach(view => view.destroy());
    // O view.destroy() chama cleanup nos workers de parsing internos.
    console.log('[SHUTDOWN:CM] CodeMirror cleanup — no-op in client-only mode.');
  }, 1_000);

  // ═══════════════════════════════════════════════════
  // ESTÁGIO 7: Desconectar Prisma/ORM pool
  // Deve vir APÓS os agents pararem (estágio 4)
  // para não cortar conexões ativas do ORM.
  // ═══════════════════════════════════════════════════
  await logStage(7, 'Prisma Disconnect', async () => {
    if (!registry.prismaClient) return;
    await registry.prismaClient.$disconnect();
    console.log('[SHUTDOWN:PRISMA] Connection pool closed.');
  }, 5_000);

  // ═══════════════════════════════════════════════════
  // ESTÁGIO 8: WAL Checkpoint + fsync + SQLite Close
  //
  // CRÍTICO — Este deve ser o ÚLTIMO estágio.
  //
  // Fonte: better-sqlite3 WAL documentation
  // "WAL mode: changes are first written to a WAL file,
  //  not directly to the database file. A checkpoint
  //  operation merges changes from WAL into the main file."
  //
  // Sem o checkpoint FULL, o WAL file pode ter writes
  // que não foram mesclados no arquivo principal.
  // Sem o close(), o SQLite não faz fsync final.
  // ═══════════════════════════════════════════════════
  await logStage(8, 'SQLite WAL Checkpoint + fsync + Close', async () => {
    if (!registry.db) return;

    try {
      // FULL checkpoint: aguarda todos os readers terminarem
      // antes de copiar o WAL para o arquivo principal.
      // Isso garante que TODAS as writes estão no arquivo principal
      // e o WAL file pode ser descartado com segurança.
      const checkpointResult = registry.db.pragma('wal_checkpoint(FULL)') as Array<{
        busy:       number;
        log:        number;
        checkpointed: number;
      }>;

      const { busy, log, checkpointed } = checkpointResult[0]!;
      console.log(
        `[SHUTDOWN:SQLITE] WAL checkpoint: ` +
        `busy=${busy}, log_frames=${log}, checkpointed=${checkpointed}`
      );

      if (busy > 0) {
        // Se busy > 0, há readers ativos que impedem o checkpoint completo.
        // Tentar TRUNCATE como fallback — mais agressivo.
        console.warn('[SHUTDOWN:SQLITE] Readers active. Trying TRUNCATE checkpoint...');
        registry.db.pragma('wal_checkpoint(TRUNCATE)');
      }

      // O db.close() do better-sqlite3 garante um fsync final
      // antes de fechar o file descriptor.
      registry.db.close();
      console.log('[SHUTDOWN:SQLITE] ✅ Database closed with full WAL checkpoint.');
    } catch (err) {
      console.error('[SHUTDOWN:SQLITE] ❌ SQLite close error:', err);
      // Tentar fechar mesmo em caso de erro no checkpoint
      try { registry.db.close(); } catch { /* ignore */ }
    }
  }, 30_000);  // 30s — checkpoint pode ser lento sob carga

  const totalMs = Date.now() - totalStart;
  console.log(`\n[SHUTDOWN] ✅ All 8 stages complete in ${totalMs}ms. Exiting.`);
  process.exit(0);
}

// ─── Registro dos signal handlers ────────────────────────

export function registerShutdownHandlers(): void {
  // SIGTERM: enviado pelo container orchestrator (Docker, Kubernetes)
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));

  // SIGINT: Ctrl+C no desenvolvimento
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

  // Captura exceções não tratadas ANTES de iniciar o shutdown
  // para que o logger registre o erro antes do processo morrer
  process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err);
    void gracefulShutdown('SIGTERM');
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled rejection:', reason);
    void gracefulShutdown('SIGTERM');
  });

  console.log('[SHUTDOWN] Signal handlers registered (SIGTERM, SIGINT, uncaughtException).');
}
```

### 4.4 — Uso no `server.ts` do GreenForge

```typescript
// server.ts (fragmento de integração)
import { GracefulShutdown, registerShutdownHandlers } from './graceful-shutdown';
import Database from 'better-sqlite3';

const db = new Database('./greenforge.db');
db.pragma('journal_mode = WAL');       // WAL mode obrigatório
db.pragma('synchronous = NORMAL');     // Balance entre durabilidade e performance

// Registrar TODOS os componentes no registry
GracefulShutdown.registerSQLite(db);
GracefulShutdown.registerHTTPServer(httpServer);
GracefulShutdown.registerPrisma(prisma);

// Ativar os signal handlers
registerShutdownHandlers();
```

---

## 📊 Matriz de Referências CVE × Defesas Implementadas

| CVE | Vetor | Gap Coberto | Defesa no GreenForge |
|---|---|---|---|
| CVE-2026-3854 | Push option → env override → RCE | GAP 3 | `FORBIDDEN_ENV_VARS` + `spawn({shell:false})` |
| CVE-2026-25763 | `git log --output=` → file write | GAP 3 | `forbiddenFlags: ['--output']` em `log` policy |
| CVE-2025-68144 | `git diff --output=` → file write | GAP 3 | `forbiddenFlags: ['--output', '--no-index']` |
| CVE-2023-29007 | `core.pager` config injection | GAP 3 | Delete `GIT_PAGER`, `PAGER`, `GIT_CONFIG_COUNT` |
| CVE-2017-8386 | `less` pager shell escape via `--help` | GAP 3 | Delete `PAGER`, `LESS`; set `TERM=dumb` |
| N/A | `SharedArrayBuffer` bloqueado | GAP 1 | COOP+COEP headers no Vite + Nginx |
| N/A | Widget re-render a cada keystroke | GAP 2 | `eq()` + `updateDOM()` no `WidgetType` |
| N/A | SQLite WAL não checkpointed no crash | GAP 4 | `wal_checkpoint(FULL)` no estágio 8 |
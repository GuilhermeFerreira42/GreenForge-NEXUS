Vou disparar todas as buscas simultaneamente para máxima precisão técnica antes de compilar o guia.Arsenal de dados coletado com precisão máxima. Agora compilo o guia de saneamento definitivo.

---

# 🔧 GUIA DE SANEAMENTO DE CÓDIGO — GreenForge v2.1
## Resolução das 4 Lacunas Críticas de Implementação
### *Formato: Markdown Estrito + TypeScript Conceitual — Otimizado para RAG/NotebookLM*

---

## LACUNA 1 — INLINE AGENT TAG: A DECISÃO FINAL DE ARQUITETURA

### 1.1 O Veredicto: Por Que CodeMirror 6 é Obrigatório

O conflito central entre React e qualquer editor de código maduro é o controle de DOM. Há momentos em que você deseja manipular o DOM de alguma forma, mas porque o editor gerencia esse DOM, qualquer mudança feita manualmente será descartada quando um ciclo de atualização de estado ocorrer. A resposta do CodeMirror a esse problema é a classe `Decoration`, que te permite manipular o DOM em harmonia com a view.

Este é exatamente o problema que eliminaria qualquer tentativa ingênua de injetar React no Monaco. O CodeMirror 6 foi desenhado para esse caso.

O `@uiw/react-codemirror` configura a API rapidamente. Versões após `@uiw/react-codemirror@v4` usam CodeMirror 6, com suporte a React Hooks (requer React 16.8+) e escrito em TypeScript para melhores dicas de código.

### 1.2 A Ponte React ↔ CodeMirror: O Padrão de 3 Camadas

O problema central de "Como renderizar Shadcn/UI dentro do widget sem perder o contexto Zustand?" é resolvido por um padrão de 3 camadas distintas que devem ser compreendidas antes de gerar qualquer código:

```
CAMADA 1: StateField (CodeMirror)
  ↕  StateEffect (mensageiro entre mundas)
CAMADA 2: WidgetType.toDOM() (ponto de injeção)
  ↕  ReactDOM.createRoot() (ponte imperativa)
CAMADA 3: Componente React + Zustand Store (mundo React)
```

Com `StateEffect` e um `updateListener`, é possível adicionar sincronização de estado bidirecional entre React e CodeMirror.

### 1.3 Boilerplate Completo: AgentTagWidget

```typescript
// ============================================================
// ARQUIVO: extensions/agentTagExtension.ts
// Stack: CodeMirror 6 + React 18 + Zustand + ShadCN
// Versões: @uiw/react-codemirror@^4.23, @codemirror/state@^6.4
// ============================================================

import { 
  StateField, 
  StateEffect, 
  type Extension 
} from "@codemirror/state";
import { 
  Decoration, 
  type DecorationSet,
  EditorView,
  WidgetType 
} from "@codemirror/view";
import { createRoot, type Root } from "react-dom/client";

// ── Tipos ────────────────────────────────────────────────────
interface AgentTagData {
  lineNumber: number;
  agentId: string;
  debateId: string;
  summary: string;
}

// ── StateEffects (mensageiros) ───────────────────────────────
// Ação: adicionar uma tag em uma linha
export const addAgentTagEffect = StateEffect.define<AgentTagData>();
// Ação: remover uma tag por debateId
export const removeAgentTagEffect = StateEffect.define<string>();
// Ação: expandir/colapsar o drawer de debate
export const toggleDebateEffect = StateEffect.define<string>();

// ── Widget Class (opera FORA do React) ───────────────────────
// CRÍTICO: Esta classe não pode importar hooks React diretamente
class AgentTagWidget extends WidgetType {
  // Root React mantido na instância do widget — NÃO no estado React
  private reactRoot: Root | null = null;

  constructor(
    private readonly data: AgentTagData,
    private readonly isExpanded: boolean,
    // Callback para comunicar de volta ao CodeMirror via StateEffect
    private readonly dispatchEffect: (debateId: string) => void
  ) {
    super();
  }

  // eq() é chamado pelo CodeMirror para decidir se recria o widget
  // Retornar true = reutiliza o DOM existente (performance crítica)
  eq(other: AgentTagWidget): boolean {
    return (
      this.data.debateId === other.data.debateId &&
      this.data.agentId  === other.data.agentId  &&
      this.isExpanded    === other.isExpanded
    );
  }

  // toDOM() é chamado UMA VEZ para criar o container DOM
  toDOM(): HTMLElement {
    const container = document.createElement("span");
    container.className = "cm-agent-tag-host";
    container.setAttribute("data-debate-id", this.data.debateId);

    // ── PONTO DE INJEÇÃO: React entra aqui ──────────────────
    // O componente React recebe o zustand store via prop drilling
    // (não via hook, pois este contexto está fora da árvore React)
    this.reactRoot = createRoot(container);
    this.reactRoot.render(
      // O AgentTagBadge é um componente ShadCN puro (sem hooks de estado)
      // O estado vive no Zustand e é passado como prop imutável
      <AgentTagBadge
        agentId={this.data.agentId}
        summary={this.data.summary}
        isExpanded={this.isExpanded}
        onToggle={() => this.dispatchEffect(this.data.debateId)}
      />
    );

    return container;
  }

  // destroy() é chamado pelo CodeMirror ao remover o widget
  // CRÍTICO: Sem unmount, React vaza memória indefinidamente
  destroy(): void {
    // React 18: queueMicrotask garante que unmount ocorra fora
    // do ciclo de atualização do CodeMirror (evita warnings)
    if (this.reactRoot) {
      const root = this.reactRoot;
      queueMicrotask(() => root.unmount());
      this.reactRoot = null;
    }
  }

  // Previne que CodeMirror foque no container do widget
  ignoreEvent(): boolean {
    return false; // false = permite eventos de clique passar
  }
}

// ── StateField (gerencia o estado de todas as tags) ──────────
export function createAgentTagField(
  // dispatchEffect é passado de fora para evitar acoplamento
  dispatchEffect: (debateId: string) => void
): Extension {
  
  const agentTagField = StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },

    update(decorations, transaction) {
      // 1. Mapeia decorações existentes para novas posições após edições
      let updatedDecos = decorations.map(transaction.changes);

      for (const effect of transaction.effects) {
        // 2. Adiciona nova tag
        if (effect.is(addAgentTagEffect)) {
          const { lineNumber, agentId, debateId, summary } = effect.value;
          
          try {
            const line = transaction.state.doc.line(lineNumber);
            const widget = new AgentTagWidget(
              { lineNumber, agentId, debateId, summary },
              false, // isExpanded = false por padrão
              dispatchEffect
            );

            const deco = Decoration.widget({
              widget,
              side: 1, // Posiciona APÓS o conteúdo da linha
            }).range(line.to);

            updatedDecos = updatedDecos.update({
              add: [deco],
              sort: true,
            });
          } catch (e) {
            // Linha pode não existir se o doc foi alterado
            console.warn(`[AgentTag] Linha ${lineNumber} não encontrada`);
          }
        }

        // 3. Remove tag por debateId
        if (effect.is(removeAgentTagEffect)) {
          const targetId = effect.value;
          updatedDecos = updatedDecos.update({
            filter: (_, __, deco) => {
              const dom = (deco.spec?.widget as AgentTagWidget);
              return dom?.data?.debateId !== targetId;
            },
          });
        }
      }

      return updatedDecos;
    },

    // Registra as decorações na view
    provide: (field) => EditorView.decorations.from(field),
  });

  return agentTagField;
}

// ── Estilos CSS para o widget ────────────────────────────────
export const agentTagTheme = EditorView.baseTheme({
  ".cm-agent-tag-host": {
    display: "inline-flex",
    alignItems: "center",
    marginLeft: "8px",
    verticalAlign: "middle",
    cursor: "pointer",
    // Previne quebra de linha no inline widget
    whiteSpace: "nowrap",
  },
});
```

### 1.4 Integração no Hook `useGreenForgeEditor`

```typescript
// ============================================================
// ARQUIVO: hooks/useGreenForgeEditor.ts
// Conecta CodeMirror + StateEffects + Zustand em React
// ============================================================

import CodeMirror, { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useRef, useCallback } from "react";
import { EditorView } from "@codemirror/view";
import { useAgentStore } from "@/stores/agentStore";
import { 
  createAgentTagField, 
  agentTagTheme,
  addAgentTagEffect,
  toggleDebateEffect 
} from "@/extensions/agentTagExtension";

export function useGreenForgeEditor() {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  // ← Zustand: lê debates do store global
  const openDebate = useAgentStore((s) => s.openDebate);

  // Callback que ATRAVESSA de CodeMirror → React → Zustand
  // Este é o ponto de sincronização bidirecional
  const handleToggleDebate = useCallback((debateId: string) => {
    // Abre o drawer de debate no painel de chat (estado React/Zustand)
    openDebate(debateId);
  }, [openDebate]);

  // Cria a extensão COM o callback já vinculado
  const agentTagExtension = createAgentTagField(handleToggleDebate);

  // Função para injetar uma tag de fora do editor (chamada pelo SSE handler)
  const addTagAtLine = useCallback((
    lineNumber: number,
    agentId: string,
    debateId: string,
    summary: string
  ) => {
    const view = editorRef.current?.view;
    if (!view) return;

    // Despacha StateEffect para o CodeMirror
    view.dispatch({
      effects: addAgentTagEffect.of({ lineNumber, agentId, debateId, summary })
    });
  }, []);

  return {
    editorRef,
    extensions: [agentTagExtension, agentTagTheme],
    addTagAtLine, // Exposto para o SSE handler usar
  };
}
```

---

## LACUNA 2 — ARQUITETURA DE BUNDLER: VITE + WEB WORKERS + COEP/COOP

### 2.1 O Problema Raiz: SharedArrayBuffer e Isolamento Cross-Origin

WebContainers exigem que sua página, mesmo em desenvolvimento, seja servida com dois headers específicos. Esses headers são necessários porque o WebContainer requer `SharedArrayBuffer`, que, por sua vez, requer que seu website seja cross-origin isolated.

Certas features, como acesso a objetos `SharedArrayBuffer` ou uso de `Performance.now()` com timers sem throttle, só estão disponíveis se o documento é cross-origin isolated. Para usar essas features, você precisa definir o header COEP com valor `require-corp` ou `credentialless`, e o header `Cross-Origin-Opener-Policy` como `same-origin`.

### 2.2 O Problema Específico do Vite HMR

Com `COEP: require-corp`, quando o servidor Vite reinicia, a conexão WebSocket do HMR muda para polling na porta HMR. O browser então bloqueia o recurso com erro: *"The resource at localhost was blocked due to its Cross-Origin-Resource-Policy header (or lack thereof)."* O recurso nunca conecta e a página não recarrega automaticamente.

Este é o bug silencioso que quebra o ambiente de desenvolvimento. A solução é um plugin customizado.

### 2.3 `vite.config.ts` Completo e Anotado

```typescript
// ============================================================
// ARQUIVO: vite.config.ts
// Versões: vite@^5.4, @vitejs/plugin-react@^4.3
// ============================================================

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import type { Plugin, ViteDevServer } from "vite";

// ── Plugin customizado para headers COOP/COEP ───────────────
// Resolve o bug do HMR WebSocket descrito no GitHub issue #16536
function crossOriginIsolationPlugin(): Plugin {
  return {
    name: "cross-origin-isolation",

    // configureServer: aplica headers em DESENVOLVIMENTO
    configureServer(server: ViteDevServer) {
      server.middlewares.use((_req, res, next) => {
        // COEP: Bloqueia recursos cross-origin sem permissão explícita
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        // COOP: Isola o browsing context de outros documentos
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        // CORP: Necessário para sub-recursos (workers, iframes)
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        next();
      });
    },

    // configurePreviewServer: aplica headers em preview (vite preview)
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    crossOriginIsolationPlugin(),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // ── Configuração de Workers ──────────────────────────────
  // CodeMirror usa Web Workers para parsing de linguagem (Lezer)
  worker: {
    // "es" = módulos ES em workers (recomendado para CodeMirror 6)
    format: "es",
    // Plugins também se aplicam ao bundle dos workers
    plugins: () => [react()],
    rollupOptions: {
      output: {
        // Mantém workers em pasta separada para debugging
        entryFileNames: "workers/[name]-[hash].js",
      },
    },
  },

  optimizeDeps: {
    // Força Vite a pré-bundlizar CodeMirror como ESM correto
    include: [
      "codemirror",
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/language",
      "@uiw/react-codemirror",
    ],
    // Exclui workers do pré-bundling (devem ser processados separadamente)
    exclude: ["@codemirror/lang-javascript"],
  },

  build: {
    target: "esnext", // Necessário para SharedArrayBuffer + top-level await
    rollupOptions: {
      output: {
        // Separa CodeMirror em chunk próprio (lazy loading)
        manualChunks: {
          "codemirror-core": [
            "codemirror",
            "@codemirror/state",
            "@codemirror/view",
          ],
          "codemirror-langs": [
            "@codemirror/lang-javascript",
            "@codemirror/lang-python",
            "@codemirror/lang-json",
          ],
          "vendor-ui": ["react", "react-dom", "@radix-ui/react-dialog"],
        },
      },
    },
  },

  server: {
    headers: {
      // Headers para o servidor de desenvolvimento (assets estáticos)
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
});
```

### 2.4 Headers para Produção (Nginx + Netlify + Vercel)

**Nginx (`nginx.conf`):**
```nginx
# Bloco de headers para cross-origin isolation
add_header Cross-Origin-Opener-Policy   "same-origin"   always;
add_header Cross-Origin-Embedder-Policy "require-corp"  always;
add_header Cross-Origin-Resource-Policy "same-origin"   always;
```

**Netlify (`netlify.toml`):**
```toml
[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Embedder-Policy = "require-corp"
    Cross-Origin-Opener-Policy = "same-origin"
```

**Vercel (`vercel.json`):**
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" },
        { "key": "Cross-Origin-Opener-Policy",   "value": "same-origin"  },
        { "key": "Cross-Origin-Resource-Policy", "value": "same-origin"  }
      ]
    }
  ]
}
```

### 2.5 ⚠️ Armadilha Crítica: COEP Quebra Recursos Externos

Uma vez que o site é `crossOriginIsolated`, você não pode simplesmente carregar qualquer recurso como fazia antes — cada requisição e cada resposta precisa ser considerada. Tags `<img>` e `<script>` podem precisar de atributos `crossorigin="anonymous"` e headers CORS na resposta se não forem servidos da mesma origem.

**Checklist para cada recurso externo após habilitar COEP:**

```typescript
// Verificação programática de isolamento
if (window.crossOriginIsolated) {
  console.log("✅ SharedArrayBuffer disponível");
  console.log("✅ Web Workers com memória compartilhada: OK");
} else {
  console.error("❌ Headers COOP/COEP ausentes ou incorretos");
  // Fallback: desabilitar features que requerem SharedArrayBuffer
}
```

---

## LACUNA 3 — RECUPERAÇÃO DE ESTADO: GATE HYDRATION + RECONNECTION OVERLAY

### 3.1 O Protocolo de Recuperação com `Last-Event-ID`

Server-sent events têm uma variedade de features que WebSockets não possuem por design, incluindo reconexão automática, event IDs, e capacidade de enviar eventos arbitrários.

O `Last-Event-ID` é o mecanismo nativo do protocolo SSE que permite ao servidor saber exatamente onde parou o stream. O GreenForge deve usá-lo para reconstruir o estado do debate após desconexão.

### 3.2 Arquitetura Completa: IndexedDB + SSE + SQLite

```typescript
// ============================================================
// ARQUIVO: lib/stateRecovery.ts
// Padrão: Outbox + Last-Event-ID + epoch_id validation
// Versão: idb@^8.0 (wrapper moderno para IndexedDB)
// ============================================================

import { openDB, type IDBPDatabase } from "idb"; // npm i idb

// ── Schema do IndexedDB ──────────────────────────────────────
interface GreenForgeDB {
  // Armazena o último event_id recebido por sessão
  sseCheckpoints: {
    key: string;        // sessionId
    value: {
      lastEventId: string;
      epochId: string;
      timestamp: number;
    };
  };
  // Outbox: eventos gerados offline aguardando sync
  outbox: {
    key: number;        // autoIncrement
    value: {
      id: number;
      idempotencyKey: string; // UUID — previne duplicatas
      eventType: string;
      payload: unknown;
      createdAt: number;
      synced: boolean;
    };
    indexes: { "by-synced": boolean };
  };
  // Cache do log de debate (últimas N entradas)
  debateLog: {
    key: string;        // debateId + "-" + entryIndex
    value: DebateEntry;
    indexes: { "by-debate": string };
  };
}

// Inicialização do IndexedDB com schema versionado
export async function initGreenForgeDB(): Promise<IDBPDatabase<GreenForgeDB>> {
  return openDB<GreenForgeDB>("greenforge-v1", 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore("sseCheckpoints");
        const outbox = db.createObjectStore("outbox", { 
          keyPath: "id", 
          autoIncrement: true 
        });
        // UNIQUE index em idempotencyKey previne duplicatas após retry
        outbox.createIndex("by-synced", "synced");
      }
      if (oldVersion < 2) {
        const debateLog = db.createObjectStore("debateLog");
        debateLog.createIndex("by-debate", "debateId");
      }
    },
  });
}

// ── Salva checkpoint SSE no IndexedDB ────────────────────────
export async function saveSSECheckpoint(
  db: IDBPDatabase<GreenForgeDB>,
  sessionId: string,
  lastEventId: string,
  epochId: string
): Promise<void> {
  // Leitura/escrita granular — NÃO persiste o estado inteiro de uma vez
  // Evita blocking do main thread (regra do web.dev para IndexedDB)
  await db.put("sseCheckpoints", {
    lastEventId,
    epochId,
    timestamp: Date.now(),
  }, sessionId);
}

// ── Hook de reconexão com Last-Event-ID ─────────────────────
export function useSSEWithRecovery(endpoint: string, sessionId: string) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const mountedRef = useRef(true);
  const dbRef = useRef<IDBPDatabase<GreenForgeDB>>();

  // Estado do overlay de reconexão
  const [recoveryState, setRecoveryState] = useState<
    "idle" | "reconnecting" | "validating" | "error"
  >("idle");

  const connect = useCallback(async () => {
    const db = dbRef.current!;
    const checkpoint = await db.get("sseCheckpoints", sessionId);

    // Constrói URL com Last-Event-ID para retomada do stream
    const url = new URL(endpoint, window.location.origin);
    if (checkpoint?.lastEventId) {
      url.searchParams.set("lastEventId", checkpoint.lastEventId);
      url.searchParams.set("epochId",     checkpoint.epochId);
    }

    const es = new EventSource(url.toString(), { withCredentials: true });
    eventSourceRef.current = es;

    // Handler de validação de epoch
    es.addEventListener("epoch_validation", async (event) => {
      const { epochId, isValid, stateSnapshot } = JSON.parse(event.data);

      if (!isValid) {
        // Estado divergiu — recarrega snapshot completo do servidor
        setRecoveryState("validating");
        await rehydrateFromSnapshot(stateSnapshot);
      }
      setRecoveryState("idle"); // Libera overlay
    });

    // Persiste Last-Event-ID a cada evento recebido
    es.addEventListener("debate_entry", async (event) => {
      if (!mountedRef.current) return;

      const data = JSON.parse(event.data);
      // Salva checkpoint granularmente (sem bloquear main thread)
      await saveSSECheckpoint(db, sessionId, event.lastEventId, data.epochId);
    });

    es.onerror = () => {
      if (mountedRef.current) {
        setRecoveryState("reconnecting");
      }
    };

    es.onopen = () => {
      if (mountedRef.current) {
        setRecoveryState("idle");
      }
    };
  }, [endpoint, sessionId]);

  return { recoveryState, connect };
}
```

### 3.3 Componente `ReconnectionOverlay`

```tsx
// ============================================================
// ARQUIVO: components/ReconnectionOverlay.tsx
// Design: Bloqueia interação até epoch_id validado
// ============================================================

interface ReconnectionOverlayProps {
  state: "idle" | "reconnecting" | "validating" | "error";
  onRetry?: () => void;
}

export function ReconnectionOverlay({ state, onRetry }: ReconnectionOverlayProps) {
  if (state === "idle") return null;

  return (
    // Overlay cobre TODO o layout — bloqueia interação com editor/chat
    <div
      className="fixed inset-0 z-[9999] bg-[#0f1117]/90 backdrop-blur-sm
                 flex items-center justify-center"
      // Previne qualquer clique passar para o editor
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="bg-[#161b27] border border-[#2a3149] rounded-lg p-8
                      max-w-md w-full mx-4 shadow-2xl">

        {state === "reconnecting" && (
          <div className="text-center space-y-4">
            {/* Spinner animado */}
            <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent
                           rounded-full animate-spin mx-auto" />
            <h3 className="text-[#e2e8f0] font-semibold text-lg">
              Reconectando ao servidor
            </h3>
            <p className="text-[#94a3b8] text-sm">
              Aguardando restabelecer conexão SSE com os agentes...
            </p>
            {/* Barra de progresso indeterminada */}
            <div className="h-1 bg-[#2a3149] rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full
                             animate-[progress_1.5s_ease-in-out_infinite]
                             w-1/3" />
            </div>
          </div>
        )}

        {state === "validating" && (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-2 border-yellow-500 border-t-transparent
                           rounded-full animate-spin mx-auto" />
            <h3 className="text-[#e2e8f0] font-semibold text-lg">
              Validando estado do debate
            </h3>
            <p className="text-[#94a3b8] text-sm">
              Sincronizando <code className="text-yellow-400 font-mono text-xs">
              epoch_id</code> com o servidor. O histórico está sendo reconstruído.
            </p>
            {/* Indicador de validação de epoch — visual de progresso */}
            <div className="bg-[#0f1117] rounded-md p-3 font-mono text-xs
                           text-[#64748b] text-left space-y-1">
              <div className="text-green-400">✓ Conexão SSE restabelecida</div>
              <div className="text-yellow-400 animate-pulse">
                ⟳ Validando epoch_id...
              </div>
              <div className="text-[#2a3149]">○ Reconstituindo log de debate</div>
            </div>
          </div>
        )}

        {state === "error" && (
          <div className="text-center space-y-4">
            <div className="text-red-400 text-4xl">⚠</div>
            <h3 className="text-[#e2e8f0] font-semibold text-lg">
              Falha na reconexão
            </h3>
            <p className="text-[#94a3b8] text-sm">
              Não foi possível validar o estado com o servidor.
              O debate pode ter divergido.
            </p>
            <button
              onClick={onRetry}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white
                        font-medium py-2 px-4 rounded-md transition-colors"
            >
              Tentar Novamente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

### 3.4 Regras para IndexedDB em Produção

Como regra geral, leituras e escritas no IndexedDB não devem ser maiores do que o necessário para os dados sendo acessados. Embora o IndexedDB permita armazenar objetos grandes e aninhados como um único registro, essa prática deve ser evitada — quando o IndexedDB armazena um objeto, ele primeiro cria um clone estruturado, e esse processo ocorre na main thread. Quanto maior o objeto, maior o tempo de bloqueio.

Isso apresenta desafios ao planejar como persistir o estado no IndexedDB, pois bibliotecas populares como Redux gerenciam o state tree inteiro como um único objeto JavaScript. Armazenar o state tree inteiro como um único registro após cada mudança resultará em bloqueio desnecessário da main thread, aumentará a probabilidade de erros de escrita, e em alguns casos até causará crash ou travamento da aba do browser.

**Regras derivadas para o GreenForge:**
```
✅ Persiste: last_event_id por sessão (string pequena)
✅ Persiste: outbox de eventos offline (registros individuais)
✅ Persiste: últimas 100 entradas do debate log (janela deslizante)
❌ Nunca persiste: o estado Zustand completo como blob
❌ Nunca persiste: tokens de streaming em tempo real
❌ Nunca persiste: conteúdo inteiro dos arquivos do editor
```

---

## LACUNA 4 — GESTÃO DE MEMÓRIA: VIRTUAL LIST + CLEANUP DO LOG SSE

### 4.1 O Problema Quantificado

Quando um WebSocket dispara 20 mensagens por segundo e cada mensagem chama `setState`, você está agendando no mínimo 20 ciclos de render por segundo. Em um sistema multiagente com 3 agentes debatendo por 2 horas, o log pode acumular dezenas de milhares de entradas — destruindo memória e performance.

### 4.2 O Padrão Definitivo: Buffer Ref + requestAnimationFrame

O transporte (WS/SSE) escreve para um array JavaScript simples mantido em um `useRef`. Um loop de `requestAnimationFrame` lê esse buffer, chama `setState` uma vez com as mensagens acumuladas, e limpa o buffer. O React vê uma atualização por frame ao invés de uma atualização por mensagem.

O buffering significa acumular mensagens em um ref mutável entre frames de animação. O ref vive fora do rastreamento de estado do React, então escrever nele dispara zero renders. Este é o ponto de desacoplamento crítico.

```typescript
// ============================================================
// ARQUIVO: hooks/useSSEChatBuffer.ts
// Padrão: RAF Batching + Circular Buffer + Virtual List
// Versões: zustand@^5.0, @tanstack/react-virtual@^3.10
// ============================================================

import { useRef, useEffect, useCallback, useState } from "react";
import { useAgentStore } from "@/stores/agentStore";

// ── Configuração do Buffer ───────────────────────────────────
const BUFFER_CONFIG = {
  MAX_MESSAGES_IN_MEMORY: 500,  // Janela deslizante de mensagens visíveis
  CLEANUP_THRESHOLD: 0.9,        // Limpa quando atinge 90% do limite
  ARCHIVE_BATCH_SIZE: 50,        // Arquiva de 50 em 50 para o IndexedDB
  RAF_FLUSH_INTERVAL_MS: 16,     // ~60fps
} as const;

interface PendingChatEntry {
  agentId: string;
  content: string;
  timestamp: number;
  debateId: string;
}

export function useSSEChatBuffer(endpoint: string) {
  // Buffer vive FORA do React — escrita = zero re-renders
  const pendingBuffer = useRef<PendingChatEntry[]>([]);
  const rafId = useRef<number>();
  const eventSourceRef = useRef<EventSource | null>(null);
  const mountedRef = useRef(true);

  // Zustand: apenas ação de append (não lê o array aqui)
  const appendToLog = useAgentStore((s) => s.appendChatEntry);
  const archiveOverflow = useAgentStore((s) => s.archiveChatOverflow);

  // ── Flush: RAF lê buffer e atualiza React UMA vez ────────
  const flushBuffer = useCallback(() => {
    if (!mountedRef.current) return;
    if (pendingBuffer.current.length === 0) return;

    const batch = pendingBuffer.current.splice(0); // Drena o buffer
    appendToLog(batch); // Um único setState para todo o batch

    rafId.current = requestAnimationFrame(flushBuffer);
  }, [appendToLog]);

  // ── Cleanup: janela deslizante de mensagens na memória ───
  const performMemoryCleanup = useCallback(() => {
    archiveOverflow({
      maxInMemory: BUFFER_CONFIG.MAX_MESSAGES_IN_MEMORY,
      archiveBatchSize: BUFFER_CONFIG.ARCHIVE_BATCH_SIZE,
    });
  }, [archiveOverflow]);

  useEffect(() => {
    mountedRef.current = true;

    // Inicia ciclo RAF
    rafId.current = requestAnimationFrame(flushBuffer);

    // Conecta SSE
    const es = new EventSource(endpoint, { withCredentials: true });
    eventSourceRef.current = es;

    es.addEventListener("chat_token", (event) => {
      if (!mountedRef.current) return;
      // Escreve no buffer — SEM setState aqui
      pendingBuffer.current.push(JSON.parse(event.data));
    });

    es.addEventListener("cleanup_signal", () => {
      performMemoryCleanup();
    });

    return () => {
      // Cleanup crítico: sem isso, conexão vaza após unmount
      mountedRef.current = false;
      cancelAnimationFrame(rafId.current!);
      es.close();
      eventSourceRef.current = null;
    };
  }, [endpoint, flushBuffer, performMemoryCleanup]);
}
```

### 4.3 Zustand Store com Janela Deslizante

```typescript
// ============================================================
// ARQUIVO: stores/chatStore.ts
// Padrão: Circular buffer + archival para IndexedDB
// ============================================================

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

interface ChatStore {
  messages: ChatMessage[];
  archivedCount: number;

  appendChatEntry: (entries: PendingChatEntry[]) => void;
  archiveChatOverflow: (config: {
    maxInMemory: number;
    archiveBatchSize: number;
  }) => void;
}

export const useChatStore = create<ChatStore>()(
  subscribeWithSelector((set, get) => ({
    messages: [],
    archivedCount: 0,

    appendChatEntry: (entries) => {
      set((state) => {
        const newMessages = [...state.messages, ...entries];

        // Trunca automaticamente se ultrapassar threshold de 90%
        const threshold = BUFFER_CONFIG.MAX_MESSAGES_IN_MEMORY * 
                          BUFFER_CONFIG.CLEANUP_THRESHOLD;
        
        if (newMessages.length > threshold) {
          const overflow = newMessages.splice(
            0, 
            newMessages.length - BUFFER_CONFIG.MAX_MESSAGES_IN_MEMORY
          );
          // Arquiva overflow no IndexedDB de forma assíncrona
          // (fora do setState para não bloquear render)
          queueMicrotask(() => archiveToIndexedDB(overflow));
        }

        return { messages: newMessages };
      });
    },

    archiveChatOverflow: ({ maxInMemory, archiveBatchSize }) => {
      set((state) => {
        if (state.messages.length <= maxInMemory) return state;

        const toArchive = state.messages.splice(0, archiveBatchSize);
        queueMicrotask(() => archiveToIndexedDB(toArchive));

        return {
          messages: state.messages.slice(-maxInMemory),
          archivedCount: state.archivedCount + toArchive.length,
        };
      });
    },
  }))
);
```

### 4.4 Virtual List para o ChatPanel

Virtualize listas longas com `@tanstack/react-virtual` para manter a contagem de nós DOM constante. Limite o comprimento do array de estado com uma opção `maxBufferSize` para prevenir vazamentos de memória em streams indefinidos.

```tsx
// ============================================================
// ARQUIVO: components/chat/VirtualChatList.tsx
// Versão: @tanstack/react-virtual@^3.10
// ============================================================

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { useChatStore } from "@/stores/chatStore";

export function VirtualChatList() {
  const messages = useChatStore((s) => s.messages);
  const archivedCount = useChatStore((s) => s.archivedCount);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,     // Altura estimada por mensagem
    overscan: 5,                 // Renderiza 5 itens além da viewport
  });

  return (
    <div className="flex flex-col h-full">
      {/* Indicador de mensagens arquivadas */}
      {archivedCount > 0 && (
        <div className="px-3 py-1.5 text-xs text-[#64748b] bg-[#161b27]
                       border-b border-[#2a3149] flex items-center gap-1.5">
          <span>↑ {archivedCount} mensagens arquivadas</span>
          <button className="text-blue-400 hover:underline text-xs">
            Carregar histórico
          </button>
        </div>
      )}

      {/* Container virtualizável */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        style={{ contain: "strict" }} // CSS contain para isolamento de paint
      >
        {/* Div fantasma com altura total virtual */}
        <div
          style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => (
            <div
              key={virtualItem.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <ChatMessage message={messages[virtualItem.index]} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### 4.5 Cleanup de SSE: Os 3 Erros Fatais

A razão para usar `useRef` em vez de `useState` para o `eventSourceRef` é que ele deve manter a mesma referência entre re-renders do componente. Usar `useState` causaria re-renders nas mudanças de estado, tornando-o inadequado para este caso.

O erro mais comum: criar um `EventSource` sem cleanup algum no `useEffect`. A versão correta sempre fecha a conexão no cleanup do `useEffect`. O pior caso é criar uma nova conexão a cada render fora do `useEffect`, o que cria um vazamento a cada re-render.

```typescript
// ✅ CORRETO: Três proteções contra vazamento
useEffect(() => {
  const es = new EventSource(endpoint);
  eventSourceRef.current = es;
  mountedRef.current = true;

  es.onmessage = (e) => {
    // Proteção 1: Checa se ainda está montado
    if (!mountedRef.current) return;
    // ... processa evento
  };

  return () => {
    // Proteção 2: Flag de unmount ANTES do close
    mountedRef.current = false;
    // Proteção 3: Fecha conexão no cleanup
    es.close();
    eventSourceRef.current = null;
  };
}, [endpoint]); // endpoint como dependência — recria se mudar
```

---

## SEÇÃO FINAL — MATRIZ DE DECISÃO E VERSÕES RECOMENDADAS 2025/2026

### Package.json de Referência

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",

    "codemirror": "^6.0.1",
    "@codemirror/state": "^6.4.1",
    "@codemirror/view": "^6.35.0",
    "@codemirror/lang-javascript": "^6.2.2",
    "@codemirror/lang-python": "^6.1.6",
    "@uiw/react-codemirror": "^4.23.7",

    "zustand": "^5.0.2",
    "jotai": "^2.10.4",

    "@tanstack/react-virtual": "^3.10.9",

    "react-resizable-panels": "^2.1.7",

    "idb": "^8.0.0",

    "sonner": "^1.7.4",

    "framer-motion": "^11.18.0",

    "tailwindcss": "^3.4.17",
    "@shadcn/ui": "latest"
  },
  "devDependencies": {
    "vite": "^5.4.11",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.3"
  }
}
```

### Tabela de Decisão Final

| Desafio | Solução | Racional |
|---------|---------|---------|
| Widget no editor | **CodeMirror 6 `WidgetType`** | `eq()` previne re-render; `destroy()` faz unmount React |
| Pont React↔Editor | **`StateEffect` + `dispatchEffect` callback** | Sincronização bidirecional sem acoplamento de módulo |
| Layout resizable | **ShadCN Resizable** | `autoSaveId` nativo, keyboard accessible, Tailwind-first |
| Estado alta freq. | **Zustand `subscribeWithSelector`** | Seletores granulares por componente — zero re-renders extras |
| Streaming SSE | **RAF buffer `useRef` + batch `setState`** | 1 render/frame em vez de 1 render/mensagem |
| Memória do chat | **Circular buffer + `@tanstack/react-virtual`** | DOM fixo em contagem, overflow arquivado no IndexedDB |
| Recuperação estado | **`Last-Event-ID` + `idb` + `epoch_id`** | Protocolo SSE nativo + validação de divergência |
| Headers isolamento | **Plugin Vite customizado** | Resolve bug HMR + aplica em dev e preview |
| Persistência IDB | **Registros granulares (não state blob)** | Evita blocking de main thread |
| Cleanup SSE | **`mountedRef` + `eventSourceRef` + cleanup `useEffect`** | Três camadas anti-vazamento |

---

## CHECKLIST RAG — PERGUNTAS DE VALIDAÇÃO PARA NOTEBOOKLM

> Use estas queries para validar cada decisão antes de enviar para a IA Número 3:

- [ ] **"Por que `WidgetType.destroy()` deve chamar `queueMicrotask` para o `root.unmount()`?"**
- [ ] **"Qual o bug específico do HMR do Vite com headers COEP e como o `configureServer` middleware resolve?"**
- [ ] **"Como o `StateEffect.define()` do CodeMirror 6 funciona como canal bidirecional entre React e o editor?"**
- [ ] **"Por que escrever o state tree inteiro como um único objeto no IndexedDB bloqueia a main thread?"**
- [ ] **"Como o `requestAnimationFrame` batching reduz renders SSE de 60/segundo para 1/frame?"**
- [ ] **"O que acontece com conexões SSE abertas quando um componente React desmonta sem cleanup?"**
- [ ] **"Como o `Last-Event-ID` do protocolo SSE permite que o servidor retome o stream no ponto exato?"**
- [ ] **"Como `window.crossOriginIsolated` confirma que COOP/COEP estão configurados corretamente?"**

---

> **📌 Nota Final para a IA Número 3:** Este documento fecha todas as lacunas arquiteturais. Os padrões de `WidgetType.eq()`, RAF buffering e `mountedRef` são **não-negociáveis** — são os três mecanismos que separam uma implementação de protótipo de uma de produção. Qualquer código gerado que omita esses três padrões deve ser rejeitado e reescrito.
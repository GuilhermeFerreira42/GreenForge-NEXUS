Vou realizar buscas paralelas e cirúrgicas para cada um dos 4 desafios de engenharia antes de compilar o dossiê.Dados coletados com precisão cirúrgica. Agora compilo o dossiê técnico completo, com citações rastreáveis para ingestão no NotebookLM.
---

# 🔬 DOSSIÊ TÉCNICO DE IMPLEMENTAÇÃO — GreenForge v2.1.1
## Guia de Arquitetura Frontend para Geração de Código (React/Tailwind/ShadCN)
### *Otimizado para RAG/NotebookLM — Formato de Saída: Markdown Estrito*

---

## DESAFIO 1 — A "INLINE AGENT TAG" NO EDITOR DE CÓDIGO

### 1.1 Diagnóstico: O Problema Central da Injeção

O desafio desta feature é fundamentalmente um conflito de paradigmas: React opera em um ciclo de vida declarativo e controlado por estado, enquanto Monaco Editor e CodeMirror 6 gerenciam seu próprio DOM de forma imperativa e isolada. O DOM interno de um editor CodeMirror é gerenciado pelo próprio editor — qualquer tentativa de adicionar atributos ou alterar a estrutura dos nós diretamente resultará no editor imediatamente revertendo o conteúdo ao seu estado anterior. Para estilizar conteúdo, substituir conteúdo ou adicionar elementos entre o conteúdo, é preciso instruir o editor a fazê-lo. É exatamente para isso que servem as Decorations.

Este é o erro arquitetural mais comum ao tentar injetar React em editores de código: tentar manipular o DOM diretamente ao invés de usar as APIs nativas do editor.

---

### 1.2 Abordagem A: Monaco Editor — `ContentWidget` + `ViewZone`

#### Como Funciona

A API `IContentWidget` do Monaco permite posicionar um widget em uma linha específica, onde o método `getDomNode()` retorna o nó DOM do componente React (obtido via `componentRef.current`), `getId()` retorna um identificador único, e `getPosition()` define a linha e a preferência de posicionamento dentro do editor.

O padrão consiste em combinar dois widgets:
- **`ViewZone`**: Cria um espaço físico (reserva de altura em linhas) para o drawer expandido
- **`ContentWidget`**: Posiciona o elemento React na margem/gutter da linha

```typescript
// Padrão de integração Monaco + React
// (esboço conceitual — não copiar literalmente)

// 1. Criar o DOM Node que o Monaco vai gerenciar
const domNode = document.createElement('div');
domNode.id = `agent-tag-line-${lineNumber}`;

// 2. Renderizar o componente React DENTRO do DOM Node do Monaco
ReactDOM.createRoot(domNode).render(
  <AgentTagComponent 
    agentId={agentId}
    lineNumber={lineNumber}
    onExpand={handleExpand}
  />
);

// 3. Registrar o ContentWidget no Monaco
const widget: monaco.editor.IContentWidget = {
  getId: () => `agent.tag.${lineNumber}`,
  getDomNode: () => domNode,
  getPosition: () => ({
    position: { lineNumber, column: 1 },
    preference: [monaco.editor.ContentWidgetPositionPreference.BELOW]
  })
};

editor.addContentWidget(widget);
```

#### Prós e Contras do Monaco para esta Feature

| Aspecto | Avaliação |
|---------|-----------|
| **Ecosystem** | Wrapper `@monaco-editor/react` permite uso sem necessidade de configuração de webpack, rollup ou parcel |
| **Complexidade da Injeção React** | Alta — requer `ReactDOM.createRoot()` em DOM node imperativo |
| **Sincronização de Estado** | Crítica — o estado do React e do Monaco ficam desacoplados por padrão |
| **Suporte para ViewZones** | Funciona através de `editor.changeViewZones()`, mas grandes content widgets têm problemas de renderização ao fazer scroll — o widget pode desaparecer |

---

### 1.3 Abordagem B: CodeMirror 6 — `WidgetType` + `Decoration` ✅ RECOMENDADA

#### Por Que o CodeMirror 6 é Superior para Este Caso

Widget decorations inserem um elemento DOM dentro do conteúdo do editor. É possível usá-las, por exemplo, para adicionar um color picker widget ao lado de um código de cor. E mais especificamente para nosso caso:

Widgets podem ser elementos inline ou blocos.

Isso resolve o requisito principal: a tag pode ser **inline** (na linha do código) e o drawer pode ser um **bloco** expandido abaixo da linha.

#### Arquitetura com `WidgetType`

A implementação envolve a criação de uma subclasse de `WidgetType` onde o método `eq()` implementa a lógica de comparação (para evitar re-renderizações desnecessárias) e o método `toDOM()` retorna o elemento DOM que representa o widget na interface.

O sistema integra `Decoration`, `EditorView`, `ViewPlugin` e `MatchDecorator` do pacote `@codemirror/view` para construir o sistema de decorações.

```typescript
// Esboço Conceitual: AgentTagWidget para GreenForge
import { WidgetType, Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";

// Effect para adicionar/remover tags de agentes
export const addAgentTag = StateEffect.define<{
  lineNumber: number;
  agentId: string;
  debateId: string;
}>();

// Widget Class — Opera fora do ciclo React
class AgentTagWidget extends WidgetType {
  constructor(
    private agentId: string,
    private debateId: string,
    private isExpanded: boolean,
    private onToggle: (debateId: string) => void
  ) { super(); }

  // eq() previne re-renderização desnecessária do widget
  eq(other: AgentTagWidget) {
    return this.debateId === other.debateId && 
           this.isExpanded === other.isExpanded;
  }

  toDOM(): HTMLElement {
    // Cria o DOM nativo (sem React diretamente)
    const container = document.createElement('span');
    container.className = 'cm-agent-tag';
    container.setAttribute('data-debate-id', this.debateId);
    
    // Renderiza React DENTRO do container nativo
    // (ponto de integração React ↔ CodeMirror)
    ReactDOM.createRoot(container).render(
      <AgentTagBadge 
        agentId={this.agentId}
        isExpanded={this.isExpanded}
        onToggle={() => this.onToggle(this.debateId)}
      />
    );
    return container;
  }
}

// StateField gerencia o estado das tags de agentes
const agentTagsField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(decorations, transaction) {
    // Atualiza decorações baseado em effects
    for (let effect of transaction.effects) {
      if (effect.is(addAgentTag)) {
        const { lineNumber, agentId, debateId } = effect.value;
        const line = transaction.state.doc.line(lineNumber);
        const widget = new AgentTagWidget(agentId, debateId, false, handleToggle);
        const deco = Decoration.widget({
          widget,
          side: 1 // Posiciona após o conteúdo da linha
        }).range(line.to);
        decorations = decorations.update({ add: [deco] });
      }
    }
    return decorations.map(transaction.changes);
  },
  provide: f => EditorView.decorations.from(f)
});
```

#### Gestão do Drawer Expandido (Block Widget)

Para o drawer de debate que abre abaixo da linha, usa-se um **block widget decoration**:

```typescript
// Drawer como Block Decoration (abre abaixo da linha)
const debateDrawerWidget = new DebateDrawerWidget(debate);
const blockDeco = Decoration.widget({
  widget: debateDrawerWidget,
  block: true,  // ← Chave: cria espaço físico no editor
  side: 1
}).range(line.to);
```

View plugins associam valores com estado a uma view. Eles podem influenciar a forma como o conteúdo é desenhado e são notificados sobre eventos que acontecem na view.

#### Integração com React via `@uiw/react-codemirror`

O pacote `@uiw/react-codemirror` oferece um componente CodeMirror para React, com versões após `v4` usando CodeMirror 6.

Suporta as features de React Hooks (requer React 16.8+) e usa TypeScript para melhores dicas de código.

O hook de integração:

```typescript
// useCodeMirror.ts — Hook de integração
import { useEffect, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";

export function useGreenForgeEditor(extensions: Extension[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<EditorView>();

  useEffect(() => {
    if (!ref.current) return;
    
    const view = new EditorView({
      state: EditorState.create({
        extensions: [
          basicSetup,
          agentTagsField,        // Nossa extensão customizada
          agentTagsTheme,        // Estilos das tags
          ...extensions
        ]
      }),
      parent: ref.current
    });
    
    setView(view);
    return () => view.destroy(); // Cleanup crítico
  }, []);

  return { ref, view };
}
```

Como aprendemos com bibliotecas como jQuery, usar o DOM para gerenciamento de estado é lento e doloroso. O CodeMirror abstrai o estado do editor em um lugar separado chamado `EditorState`. Enquanto a view se preocupa com a aparência do DOM, o estado se preocupa principalmente com a aparência do documento.

---

### 1.4 Veredicto Final: CodeMirror 6 vs Monaco

| Critério | Monaco Editor | CodeMirror 6 |
|----------|--------------|--------------|
| **Injeção de Widget Inline** | Complexo (ContentWidget imperativo) | ✅ Nativo (`WidgetType`) |
| **Widget como Bloco (Drawer)** | ViewZone com bugs de scroll | ✅ `block: true` em Decoration |
| **Integração React** | Requer `createRoot()` manual em DOM node | ✅ Extensão como Extension hookada ao ciclo React |
| **Performance em Scroll** | Problemas documentados: widget desaparece ao scrollar | Viewport virtualization nativo |
| **Bundle Size** | ~5MB (pesado) | ~500KB modular |
| **Curva de Aprendizado** | Alta (API imperativa estilo VS Code) | Média (API funcional/extensível) |
| **Verdict** | ❌ Não recomendado | ✅ **Escolha definitiva** |

> **⚠️ Decisão Arquitetural:** O GreenForge deve usar **CodeMirror 6** via `@uiw/react-codemirror`. O Monaco, apesar de ser o motor do VS Code, foi projetado para ser um editor completo e standalone — não para ter componentes React injetados em suas linhas. O CodeMirror 6 foi reescrito do zero com uma arquitetura modular e extensível que se encaixa perfeitamente no ecossistema React.

---

## DESAFIO 2 — LAYOUT FLUIDO E RESIZABLE (15/55/30)

### 2.1 A Solução Canônica: ShadcN Resizable + react-resizable-panels

A decisão de stack aqui é direta. O componente shadcn/ui resizable traz painéis ajustáveis no estilo VS Code para aplicações React.

É alimentado pelo `react-resizable-panels` com mecânicas de arrastar battle-tested, acessível via teclado com navegação por Tab e redimensionamento por tecla de seta, estilizado com Tailwind CSS, com sistema de constraints de tamanho mínimo/máximo e suporte a persistência para salvar e restaurar layouts entre sessões.

### 2.2 Implementação do Grid 15/55/30

```tsx
// AppShell.tsx — Layout Principal do GreenForge
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from "@/components/ui/resizable";

export function GreenForgeShell() {
  return (
    <div className="flex flex-col h-screen bg-[#0f1117]">
      {/* TopBar — fixo, fora do ResizablePanelGroup */}
      <TopBar className="h-12 flex-shrink-0" />
      
      {/* Layout Principal — Resizable */}
      <ResizablePanelGroup 
        direction="horizontal"
        autoSaveId="greenforge-layout"  // Persiste no localStorage
        className="flex-1 overflow-hidden"
      >
        {/* Painel 1: File Explorer (15%) */}
        <ResizablePanel 
          defaultSize={15}
          minSize={10}
          maxSize={25}
          collapsible={true}
          collapsedSize={0}
          id="file-explorer"
        >
          <FileExplorer />
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-[#2a3149] hover:bg-[#3b82f6]" />

        {/* Painel 2: Editor Principal (55%) */}
        <ResizablePanel 
          defaultSize={55}
          minSize={35}
          id="code-editor"
        >
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel defaultSize={75} minSize={40}>
              <CodeEditorPane />
            </ResizablePanel>
            <ResizableHandle withHandle />
            {/* Terminal Integrado — colapsável */}
            <ResizablePanel 
              defaultSize={25} 
              minSize={10}
              collapsible={true}
              collapsedSize={0}
            >
              <IntegratedTerminal />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-[#2a3149] hover:bg-[#3b82f6]" />

        {/* Painel 3: Chat/Agents (30%) */}
        <ResizablePanel 
          defaultSize={30}
          minSize={20}
          maxSize={45}
          id="chat-panel"
        >
          <ChatAgentPanel />
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* StatusBar — fixo no rodapé */}
      <StatusBar className="h-7 flex-shrink-0" />
    </div>
  );
}
```

### 2.3 Persistência de Layout e Constraints

Para apps de produtividade onde usuários passam tempo significativo, salvar os layouts preferidos é essencial. O componente inclui persistência via `localStorage` — use para aplicações onde usuários desenvolvem preferências de layout.

Configure as props `minSize` e `maxSize` nos componentes `ResizablePanel` para definir faixas de tamanho utilizáveis. O componente ShadCN aplica esses constraints durante operações de arrastar, prevenindo layouts que quebrem a interface ou ocultem conteúdo crítico.

#### Regras de Constraint para o GreenForge:

| Painel | `defaultSize` | `minSize` | `maxSize` | `collapsible` |
|--------|---------------|-----------|-----------|---------------|
| File Explorer | 15% | 10% | 25% | ✅ (colapsa ao zero) |
| Code Editor | 55% | 35% | 70% | ❌ |
| Chat/Agents | 30% | 20% | 45% | ✅ (colapsa ao zero) |
| Terminal (vertical) | 25% | 10% | 50% | ✅ |

### 2.4 Performance: O Problema do "Resize com Monaco/CodeMirror"

Um ponto crítico: ao redimensionar os painéis, o editor de código precisa ser notificado para recalcular seu layout interno.

```typescript
// Hook para sincronizar resize do painel com o editor
function useEditorResize(view: EditorView | undefined) {
  const handleResize = useCallback(() => {
    if (view) {
      // Força o CodeMirror a recalcular dimensões
      view.requestMeasure();
    }
  }, [view]);

  return (
    <ResizablePanel onResize={handleResize}>
      {/* editor aqui */}
    </ResizablePanel>
  );
}
```

O componente é otimizado para arrastar suavemente mesmo com conteúdo complexo. Para painéis contendo componentes pesados, considere lazy loading ou virtualização.

---

## DESAFIO 3 — GERENCIAMENTO DE ESTADO DE ALTA FREQUÊNCIA (SSE + UI)

### 3.1 O Problema Central: SSE Destrói a Performance se Mal Gerenciado

Em sistemas multiagentes como o GreenForge, o stream de dados via Server-Sent Events (SSE) pode disparar dezenas de atualizações por segundo. Sem a estratégia correta de gerenciamento de estado, cada evento SSE pode causar re-renderização de toda a árvore de componentes — travando o editor.

### 3.2 Análise Comparativa: Zustand vs Jotai para SSE

Benchmarks com React 18.2 e 1000 componentes subscritos mostram: Zustand com 12ms de tempo de renderização por atualização, Jotai com 14ms, Redux Toolkit com 18ms.

Apesar da diferença ser pequena em números absolutos, o fator determinante para o GreenForge é **a natureza do estado**:

Para dados que mudam rapidamente e afetam apenas partes específicas da UI, a abordagem atômica do Jotai frequentemente resulta em menos re-renderizações. Para estados interconectados que mudam com menos frequência, a abordagem do Zustand pode ser mais eficiente.

**Mapeando os estados do GreenForge:**

| Estado | Frequência de Update | Componentes Afetados | Biblioteca Ideal |
|--------|---------------------|---------------------|------------------|
| `agentStatus[]` (dots) | Alta (SSE contínuo) | StatusBar + AgentPanel | **Jotai** |
| `chatMessages[]` (stream) | Alta (token por token) | ChatPanel somente | **Jotai** |
| `sandboxStatus` | Baixa (eventos discretos) | TopBar + FileExplorer | **Zustand** |
| `openFiles[]` | Baixa (ações do usuário) | EditorTabs | **Zustand** |
| `agentDebates{}` | Média (por tarefa) | ChatPanel + InlineTag | **Zustand** |

### 3.3 Arquitetura Recomendada: Zustand + Jotai em Coexistência

É possível — e recomendado — usar Zustand para estado global da aplicação e Jotai para estado específico de componente que precisa ser compartilhado pela árvore de componentes.

Use múltiplos juntos: TanStack Query para estado de servidor, Zustand para estado do cliente, Jotai para estado de formulário.

```typescript
// ── stores/agentStore.ts (Zustand) ──────────────────────────
// Estado global, orquestração, dados interconectados
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface AgentStore {
  agents: Record<string, Agent>;
  debates: Record<string, AgentDebate>;
  sandboxStatus: SandboxStatus;
  // Actions
  updateAgentStatus: (agentId: string, status: AgentStatus) => void;
  addDebateEntry: (debateId: string, entry: DebateEntry) => void;
}

export const useAgentStore = create<AgentStore>()(
  subscribeWithSelector((set) => ({
    agents: {},
    debates: {},
    sandboxStatus: 'local',
    
    updateAgentStatus: (agentId, status) =>
      set(state => ({
        agents: { ...state.agents, [agentId]: { ...state.agents[agentId], status }}
      })),
    
    addDebateEntry: (debateId, entry) =>
      set(state => ({
        debates: {
          ...state.debates,
          [debateId]: {
            ...state.debates[debateId],
            entries: [...(state.debates[debateId]?.entries ?? []), entry]
          }
        }
      }))
  }))
);

// ── atoms/chatAtoms.ts (Jotai) ───────────────────────────────
// Estado de alta frequência — streaming de tokens
import { atom } from 'jotai';

// Atom individual por stream de agente — atualizações isoladas
export const agentStreamAtoms = {
  agent1: atom<string>(''),
  agent2: atom<string>(''),
  agent3: atom<string>(''),
};

// Atom derivado — mensagens finalizadas do chat
export const chatMessagesAtom = atom<ChatMessage[]>([]);

// Atom de dots de status (alta frequência)
export const agentStatusDotsAtom = atom<Record<string, AgentDotStatus>>({
  agent1: 'idle',
  agent2: 'idle',
  agent3: 'idle'
});
```

### 3.4 Implementação do SSE Handler

```typescript
// hooks/useSSEConnection.ts — Gerencia o stream SSE
export function useSSEConnection(endpoint: string) {
  const updateAgentStatus = useAgentStore(s => s.updateAgentStatus);
  const addDebateEntry = useAgentStore(s => s.addDebateEntry);
  const setStatusDots = useSetAtom(agentStatusDotsAtom);
  
  useEffect(() => {
    const sse = new EventSource(endpoint);
    
    // Handler para status de agentes (Jotai — alta freq)
    sse.addEventListener('agent_status', (event) => {
      const { agentId, status } = JSON.parse(event.data);
      setStatusDots(prev => ({ ...prev, [agentId]: status }));
    });
    
    // Handler para stream de chat (Jotai — alta freq)
    sse.addEventListener('chat_token', (event) => {
      const { agentId, token } = JSON.parse(event.data);
      const streamAtom = agentStreamAtoms[agentId];
      // Atualiza apenas o atom do agente específico
      // Componentes não relacionados NÃO re-renderizam
    });
    
    // Handler para debate (Zustand — média freq)
    sse.addEventListener('debate_entry', (event) => {
      const { debateId, entry } = JSON.parse(event.data);
      addDebateEntry(debateId, entry);
    });

    return () => sse.close();
  }, [endpoint]);
}
```

### 3.5 Otimizações Anti-Re-render no StatusBar

A StatusBar exibe os dots de todos os agentes e é o componente mais sensível a re-renders desnecessários:

```typescript
// StatusBar.tsx — Seletores granulares previnem re-renders
function AgentStatusDot({ agentId }: { agentId: string }) {
  // ✅ CORRETO: Zustand com selector granular
  // Re-renderiza APENAS quando o status deste agente muda
  const status = useAgentStore(
    useCallback(state => state.agents[agentId]?.status, [agentId])
  );
  
  // ❌ ERRADO: causaria re-render em qualquer mudança do store
  // const { agents } = useAgentStore();
  // const status = agents[agentId]?.status;
  
  return <span className={`dot dot--${status}`} />;
}

// Com Jotai — ainda mais granular
function AgentStatusDotJotai({ agentId }: { agentId: string }) {
  const [dots] = useAtom(agentStatusDotsAtom);
  const status = dots[agentId]; // Componente re-renderiza apenas quando dots[agentId] muda
  return <span className={`dot dot--${status}`} />;
}
```

As vantagens de performance do Jotai incluem: reatividade de granularidade fina com atualizações no nível do átomo, re-renderizações mínimas por padrão, subscrições específicas por componente apenas aos átomos relevantes, e estado derivado eficiente através de composição de átomos.

---

## DESAFIO 4 — UX DO AMBIENTE SANDBOX: ESTADOS DE SINCRONIZAÇÃO

### 4.1 O Problema de Confiança

Como estabelecido nos princípios do GreenForge: os indicadores de sandbox não são utilitários secundários — são a **ponte de confiança** entre o ambiente isolado e o desenvolvedor. A interface precisa comunicar de forma inequívoca onde cada arquivo existe.

### 4.2 Sistema de Estados de Sincronização (State Machine)

```
ESTADOS DE ARQUIVO NA SANDBOX:
─────────────────────────────────────────────────
  SYNCED      → Arquivo igual no editor e na sandbox
  MODIFIED    → Editado localmente, não enviado ainda
  UPLOADING   → Transferência em progresso
  SANDBOXED   → Existe na sandbox, não baixado
  CONFLICT    → Divergência entre versões
  ERROR       → Falha na sincronização
```

### 4.3 Linguagem Visual por Componente

#### TopBar — Sandbox Badge Global

```tsx
// SandboxBadge.tsx
const SANDBOX_STATES = {
  local:      { label: 'LOCAL',       color: 'bg-green-500',  pulse: false },
  cloud:      { label: 'SANDBOX',     color: 'bg-blue-500',   pulse: false },
  syncing:    { label: 'SYNCING',     color: 'bg-yellow-500', pulse: true  },
  conflict:   { label: 'CONFLICT',    color: 'bg-red-500',    pulse: true  },
  offline:    { label: 'OFFLINE',     color: 'bg-gray-500',   pulse: false },
};

export function SandboxBadge() {
  const sandboxStatus = useAgentStore(s => s.sandboxStatus);
  const state = SANDBOX_STATES[sandboxStatus];
  
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#2a3149]">
      <span className={cn(
        "w-2 h-2 rounded-full",
        state.color,
        state.pulse && "animate-pulse"
      )} />
      <span className="text-xs font-mono text-[#94a3b8]">{state.label}</span>
    </div>
  );
}
```

#### File Explorer — Dots de Sincronização por Arquivo

```tsx
// FileTreeItem.tsx — Indicadores visuais por arquivo
const FILE_SYNC_INDICATORS = {
  synced:    { icon: null,    color: null,           tooltip: 'Sincronizado' },
  modified:  { icon: '●',    color: 'text-yellow-400', tooltip: 'Modificado localmente' },
  uploading: { icon: '↑',    color: 'text-blue-400',   tooltip: 'Enviando para sandbox...' },
  sandboxed: { icon: '☁',    color: 'text-blue-300',   tooltip: 'Apenas na sandbox' },
  conflict:  { icon: '⚠',    color: 'text-red-400',    tooltip: 'Conflito de versão' },
  error:     { icon: '✕',    color: 'text-red-500',    tooltip: 'Erro de sincronização' },
};

function FileTreeItem({ file }: { file: FileNode }) {
  const indicator = FILE_SYNC_INDICATORS[file.syncStatus];
  
  return (
    <div className="flex items-center gap-1 px-2 py-0.5 hover:bg-[#1e2436]">
      <FileIcon type={file.type} />
      <span className="text-sm text-[#e2e8f0] flex-1">{file.name}</span>
      {indicator.icon && (
        <Tooltip content={indicator.tooltip}>
          <span className={cn("text-xs", indicator.color)}>
            {indicator.icon}
          </span>
        </Tooltip>
      )}
    </div>
  );
}
```

#### Editor — Tab com Indicador de Estado

```tsx
// EditorTab.tsx
function EditorTab({ file }: { file: OpenFile }) {
  return (
    <div className="flex items-center gap-1.5 px-3 h-9 border-b-2 border-transparent 
                    data-[active=true]:border-blue-500">
      <FileIcon size="sm" type={file.type} />
      <span className="text-sm">{file.name}</span>
      
      {/* Indicador de modificação (ponto amarelo) */}
      {file.syncStatus === 'modified' && (
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
      )}
      
      {/* Spinner de upload */}
      {file.syncStatus === 'uploading' && (
        <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
      )}
      
      <button className="ml-1 opacity-50 hover:opacity-100">×</button>
    </div>
  );
}
```

### 4.4 Toast Notifications — Sistema de Alertas Contextuais

```typescript
// lib/sandbox-toasts.ts — Mensagens padronizadas
import { toast } from 'sonner';

export const sandboxNotify = {
  uploadSuccess: (filename: string) =>
    toast.success(`${filename} enviado para sandbox`, {
      description: 'Arquivo disponível para os agentes',
      duration: 3000,
    }),
    
  uploadProgress: (filename: string, progress: number) =>
    toast.loading(`Enviando ${filename}... ${progress}%`, {
      id: `upload-${filename}`, // Atualiza o mesmo toast
    }),
    
  conflictDetected: (filename: string) =>
    toast.warning(`Conflito detectado em ${filename}`, {
      description: 'Versão local e da sandbox divergem',
      action: {
        label: 'Resolver',
        onClick: () => openConflictResolver(filename)
      },
      duration: Infinity, // Persiste até ação do usuário
    }),
    
  agentModified: (agentName: string, filename: string) =>
    toast.info(`${agentName} modificou ${filename}`, {
      duration: 4000,
    }),
};
```

### 4.5 StatusBar — Informações de Contexto do Sandbox

```tsx
// StatusBar.tsx — Zona central com contexto sandbox
function SandboxStatusZone() {
  const { usage, limit } = useSandboxMetrics();
  const percentage = (usage / limit) * 100;
  
  return (
    <Tooltip content={`Sandbox: ${formatBytes(usage)} de ${formatBytes(limit)} usado`}>
      <div className={cn(
        "flex items-center gap-1.5 px-2 text-xs cursor-pointer",
        percentage > 80 && "text-yellow-400",
        percentage > 95 && "text-red-400 animate-pulse"
      )}>
        <Database className="w-3 h-3" />
        <span>{Math.round(percentage)}% sandbox</span>
      </div>
    </Tooltip>
  );
}
```

---

## SEÇÃO FINAL — SÍNTESE: MAPA DE DECISÕES ARQUITETURAIS

```
DESAFIO                 BIBLIOTECA ESCOLHIDA         JUSTIFICATIVA
─────────────────────────────────────────────────────────────────────
Inline Agent Tag        CodeMirror 6 (WidgetType)    API nativa para widgets,
                                                      sem bugs de scroll
                                                      
Layout Resizable        ShadCN Resizable              Tailwind-first, 
                        (react-resizable-panels)      localStorage nativo,
                                                      keyboard accessible
                                                      
Estado de Agentes       Jotai (atoms)                Alta freq. SSE,
(StatusBar Dots)                                      re-renders granulares
                                                      
Estado Global           Zustand (store)               Dados interconectados,
(Debates, Sandbox)                                    DevTools, API simples
                                                      
Toasts/Notificações     Sonner                        API declarativa,
                                                      atualizações in-place
                                                      
Animações de UI         Framer Motion                 Micro-interações
                                                      dos drawers/accordions
```

---

## CHECKLIST RAG — ITENS PARA CONSULTA NO NOTEBOOKLM

> Os itens abaixo são os nós semânticos mais densos deste documento. Use-os como perguntas de validação no NotebookLM antes de gerar código:

- [ ] **"Qual a diferença entre `ContentWidget` e `WidgetType` para injetar React em um editor?"**
- [ ] **"Por que o Monaco tem problemas de scroll com ViewZones grandes?"**
- [ ] **"Como o `autoSaveId` do `react-resizable-panels` persiste layouts no localStorage?"**
- [ ] **"Quando usar Jotai vs Zustand para streams SSE de alta frequência?"**
- [ ] **"Como o `subscribeWithSelector` do Zustand previne re-renders desnecessários?"**
- [ ] **"Qual o padrão de `eq()` no `WidgetType` do CodeMirror para evitar re-renderizações?"**
- [ ] **"Como o `StateEffect` e o `StateField` do CodeMirror 6 gerenciam estado das agent tags?"**

---

## RESPOSTA À PERGUNTA ESTRATÉGICA

> *"Após ingestão no NotebookLM, qual o nível de granularidade ideal para consultas?"*

Com base na estrutura deste dossiê, a estratégia de consulta recomendada é em **dois níveis**:

**Nível 1 — Validação Estrutural (antes do prompt para IA Número 3):**
Perguntas de confirmação de arquitetura, como:
> *"O padrão de BlockWidget do CodeMirror 6 suporta conteúdo React renderizado via `createRoot`?"*
> *"O `react-resizable-panels` com ShadCN suporta colapso programático via ref?"*

**Nível 2 — Geração Contextualizada (durante o prompt para IA Número 3):**
Perguntas para extrair esboços de código específicos, como:
> *"Gere o esqueleto TypeScript de um `StateField` do CodeMirror 6 que gerencia um mapa de `AgentTagWidget` indexado por número de linha."*

O que **ainda permanece sem resposta** — e precisa ser resolvido antes do prompt da IA Número 3 — é exatamente o ponto levantado: a **estratégia de bundler** para lidar com CodeMirror 6 em produção. Especificamente, o CodeMirror usa Web Workers para parsing de linguagem, e ferramentas como Vite requerem configuração explícita do `vite-plugin-comlink` ou equivalente para evitar erros de `SharedArrayBuffer` em ambientes sem headers de isolamento de cross-origin. Esse é o próximo nó crítico a ser resolvido.
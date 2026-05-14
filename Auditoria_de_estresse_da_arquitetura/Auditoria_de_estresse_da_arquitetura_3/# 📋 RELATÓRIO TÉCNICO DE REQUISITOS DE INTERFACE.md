Com base no benchmark coletado, agora elaboro o relatório técnico completo. Aqui está a entrega estruturada para servir de base ao prompt da IA Número 3:

---

# 📋 RELATÓRIO TÉCNICO DE REQUISITOS DE INTERFACE
## Sistema Multiagente de IA — Versão 2.1.1
### *Interface Requirements Guide — Pronto para Geração de Código (React/Tailwind/HTML)*

---

## SEÇÃO 0 — BENCHMARK: O QUE O MERCADO ENSINA

Antes de definir os requisitos, é fundamental entender o estado da arte. A pesquisa revelou padrões claros:

### 🔬 Análise Comparativa das Plataformas de Referência

| Plataforma | Filosofia de Interface | Lição Extraída |
|---|---|---|
| **Cursor 3** | Agent-first, multi-workspace | Layout centrado em agentes, não em arquivos |
| **Bolt.new** | Code-first, terminal exposto | Não esconde o código; encoraja interação direta |
| **Lovable** | Chat + Preview dualista | Seleção de elemento no preview vinculada ao chat |
| **v0.dev** | Componente como unidade | Geração iterativa via chat, preview lateral |

**Cursor:** O Cursor 3 introduz um workspace unificado para construção com agentes. A nova interface traz clareza ao trabalho que os agentes produzem, elevando o usuário a um nível maior de abstração, com capacidade de aprofundar quando necessário. Mais especificamente, todos os agentes locais e em nuvem aparecem na sidebar, incluindo os iniciados via mobile, web, desktop, Slack, GitHub e Linear.

**Bolt/Lovable/v0:** Todas essas ferramentas possuem UIs extremamente simples, mais próximas de uma janela de chat do que de um IDE ou terminal. O usuário digita o que quer criar e elas começam a dar vida à ideia. A diferença está no que fica exposto: um dos benefícios do Bolt é que ele não tenta esconder o código — ele encoraja o usuário a trabalhar com ele.

**Padrão de Duplo Painel (Chat + Code):** o Chat Mode guia o desenvolvimento de features através de planejamento conversacional, enquanto o Code Mode fornece acesso completo aos componentes React e configuração de backend.

**Lovable — Interação direta com elementos:** No Lovable, é possível selecionar um elemento diretamente no preview e referenciá-lo na mensagem do chat para modificações. Essa feature torna os ajustes de design iterativos mais intuitivos, vinculando o feedback diretamente aos elementos da UI.

**Stack Dominante do Mercado:** Ferramentas como Bolt, Lovable, V0 e Replit são profundamente otimizadas para a combinação ShadCN + Tailwind. Elas sabem como raciocinar com esses componentes, fazem escolhas inteligentes e entregam UI que não é apenas funcional, mas pensada.

---

## SEÇÃO 1 — DIAGNÓSTICO DO PROBLEMA

### O Conflito dos Dois Protótipos

```
PROTÓTIPO A (Minimalista)          PROTÓTIPO B (Denso / IA Gerado)
─────────────────────────          ────────────────────────────────
✓ Sem sobrecarga visual            ✗ Log de debate em área isolada
✗ Perde contexto dos agentes       ✗ Informações cruciais dispersas
✗ Sem indicadores de estado        ✗ Foco do código perdido
✗ Upload/Download escondidos       ✗ Usuário sem noção do estado sandbox
```

### A Pergunta Central (Respondida)
> *"Como representar o estado mental de uma inteligência multiagente sem poluir o ambiente de trabalho do desenvolvedor?"*

**Resposta Arquitetural:** através de **Camadas de Visibilidade Progressiva** — o debate existe, mas só aparece quando o usuário o convoca. O código permanece sempre o cidadão de primeira classe da interface.

---

## SEÇÃO 2 — ARQUITETURA GLOBAL DO LAYOUT

### 2.1 Grid Principal — `Global Layout`

```
┌─────────────────────────────────────────────────────────────────┐
│  TOPBAR — Status Global + Identidade do Sistema        [fixo]  │
├──────────┬──────────────────────────────────────┬──────────────┤
│          │                                      │              │
│  FILE    │         EDITOR PRINCIPAL             │  CHAT /      │
│ EXPLORER │         (Área de Código)             │  AGENTE      │
│  [left]  │         [centro — 55% largura]       │  PANEL       │
│  ~15%    │                                      │  [right]     │
│          │                                      │  ~30%        │
├──────────┴──────────────────────────────────────┴──────────────┤
│  STATUSBAR — Agentes Ativos + Ambiente Sandbox + Quick Actions │
│  [fixo no rodapé]                                              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Justificativa Estrutural

Esta divisão segue o mesmo princípio observado no Cursor: é possível ver arquivos, código e o assistente de IA em uma única janela. A proporção 15/55/30 garante que o código seja sempre o elemento dominante visualmente.

---

## SEÇÃO 3 — COMPONENTES GLOBAIS (Sempre Visíveis)

### 3.1 `TOPBAR` — Cabeçalho Fixo

**Posição:** `top: 0`, `width: 100%`, `height: 48px`

| Elemento | Descrição | Prioridade |
|---|---|---|
| Logo / Nome do Sistema | Identidade, versão atual | Alta |
| Nome do Projeto Ativo | Dropdown para trocar projeto | Alta |
| **Indicador de Modo Sandbox** | Badge colorido: `LOCAL` / `CLOUD` / `HYBRID` | **Crítica** |
| Ações Globais | Settings, Theme, Docs | Baixa |

> ⚠️ **Por que o Indicador Sandbox é Crítico:**
> A clareza sobre "o que está no servidor" vs "o que está na máquina local" é um requisito de **confiança**, não apenas de usabilidade. O usuário precisa saber em qual ambiente está operando antes de qualquer ação.

**Tokens de Design:**
```css
--topbar-bg: #0f1117;
--topbar-border: #1e2130;
--badge-local: #22c55e;    /* verde — ambiente local */
--badge-cloud: #3b82f6;    /* azul — cloud/sandbox */
--badge-hybrid: #f59e0b;   /* amarelo — sincronizando */
```

---

### 3.2 `FILE EXPLORER` — Painel Esquerdo

**Posição:** Coluna esquerda fixa, `width: 15%`, `min-width: 200px`

#### Requisitos Funcionais:

```
📁 FILE EXPLORER
├── 🔍 Busca de arquivos (fuzzy search)
├── 📂 Estrutura de árvore interativa
│   ├── Expansão/Colapso de diretórios
│   ├── Ícones diferenciados por tipo de arquivo
│   ├── Indicador de arquivo modificado (dot colorido)
│   └── Indicador de arquivo "pertencente ao agente" (ícone especial)
├── [⬆ UPLOAD]  ← Botão primário visível
├── [⬇ DOWNLOAD] ← Botão primário visível
└── Contexto do Sandbox: "12 arquivos na sandbox"
```

#### Requisitos dos Botões Upload/Download:

> 🔑 **Princípio de Design:** Esses botões não são utilitários secundários. São a **ponte de confiança** entre o ambiente isolado e o mundo do usuário. Devem ser tratados como ações primárias.

```jsx
// Especificação de Componente
<SandboxActionButtons>
  <Button variant="primary" icon={<Upload />} label="Upload para Sandbox" />
  <Button variant="secondary" icon={<Download />} label="Baixar do Sandbox" />
  <StatusLabel>Sandbox: 34MB / 500MB usado</StatusLabel>
</SandboxActionButtons>
```

**Comportamento:**
- `Upload`: Abre modal de seleção de arquivo → progress bar durante transferência → toast de confirmação
- `Download`: Abre seletor de arquivo/pasta na árvore → comprime e baixa como `.zip`
- Ambos devem mostrar **indicador de progresso não-bloqueante** (não trava o editor)

---

### 3.3 `STATUSBAR` — Rodapé Fixo

**Posição:** `bottom: 0`, `width: 100%`, `height: 28px`

```
[● Agente 1: Raciocínando] [● Agente 2: Idle] [● Agente 3: Escrevendo]  |  SANDBOX  |  Python 3.11  |  UTF-8  |  Ln 42, Col 18
```

| Zona | Conteúdo | Comportamento |
|---|---|---|
| Esquerda | Status dos agentes (dots coloridos + label curto) | Clicável → abre painel de debate |
| Centro | Indicador `SANDBOX` + uso de recursos | Tooltip com detalhes ao hover |
| Direita | Info do arquivo atual (linguagem, encoding, cursor) | Padrão VS Code |

**Estados dos Agentes (Dots):**
```
● Verde   → Idle / Aguardando
● Amarelo → Processando / Raciocínando  
● Azul    → Escrevendo código
● Vermelho → Erro / Bloqueado
● Cinza   → Offline
```

---

## SEÇÃO 4 — COMPONENTE CENTRAL: EDITOR DE CÓDIGO

**Posição:** Centro, `width: 55%`

### 4.1 Requisitos do Editor (Emulação VS Code)

```
┌─────────────────────────────────────────────────────────┐
│ [TABS: main.py × | utils.js | config.json]  [⊞ Split]  │
├─────────────────────────────────────────────────────────┤
│  1  │ import asyncio                                    │
│  2  │ from agents import AgentOrchestrator              │
│  3  │                                          ← Gutter │
│  4  │ async def main():          ← Syntax Highlight     │
│  5  │     orchestrator = AgentO...                      │
│  6  │     # ← Inline suggestion (ghost text)            │
│  ·  │                                                   │
│  ·  │    [💬 Ver raciocínio do Agente 2]  ← Inline Tag  │
│  ·  │                                                   │
└─────────────────────────────────────────────────────────┘
│ TERMINAL INTEGRADO (colapsável, padrão fechado)         │
│ $ python main.py                                        │
│ > Starting multi-agent orchestration...                 │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Features Obrigatórias do Editor

| Feature | Prioridade | Implementação Sugerida |
|---|---|---|
| Syntax Highlighting | Crítica | Monaco Editor ou CodeMirror 6 |
| Tab múltipla de arquivos | Alta | Estado gerenciado no componente pai |
| Split view (2 colunas) | Média | Botão `⊞` no header das tabs |
| Line numbers + gutter | Alta | Nativo no Monaco |
| Ghost text / Autocomplete | Alta | LSP integration |
| **Inline Agent Tag** | **Alta** | Tag colapsável vinculada a linhas modificadas por agente |
| Diff view (antes/depois) | Alta | Quando agente propõe modificação |
| Terminal integrado | Alta | Painel colapsável na base do editor |

### 4.3 `Inline Agent Tag` — Inovação de Design

Quando um agente modifica ou sugere uma linha de código, uma tag discreta aparece na margem:

```
  42 │  result = await agent.process(data)  [🤖 A2 modificou · Ver debate ↓]
```

- **Clique na tag:** Expande um drawer inline (não abre painel separado) com o raciocínio resumido
- **Estado padrão:** Fechado — não polui a visão do código
- **Cor:** Baseada no agente que modificou (cada agente tem uma cor de identidade)

---

## SEÇÃO 5 — PAINEL DIREITO: CHAT + DEBATE DOS AGENTES

**Posição:** Coluna direita, `width: 30%`

> Esta é a solução para o problema central: integrar o debate dos agentes **no fluxo do chat**, preservando o histórico linear.

### 5.1 Estrutura do Chat Panel

```
┌──────────────────────────────────┐
│ 💬 CHAT  |  🤖 AGENTES  |  📜 LOG │ ← Tabs do painel
├──────────────────────────────────┤
│                                  │
│  [Histórico de mensagens]        │
│                                  │
│  ┌─ 🤖 Agente 1 ──────────────┐ │
│  │ "Analisando dependências..." │ │
│  │ [▼ Ver raciocínio completo] │ │  ← COLAPSÁVEL
│  └─────────────────────────────┘ │
│                                  │
│  ┌─ 🤖 Agente 2 ──────────────┐ │
│  │ "Discordo da abordagem A.   │ │
│  │  Proposta B tem menos acop- │ │
│  │  lamento." [▼ Expandir]    │ │
│  └─────────────────────────────┘ │
│                                  │
│  ✅ Consenso Atingido:           │
│  "Usar Abordagem B"              │
│                                  │
├──────────────────────────────────┤
│ [Digite sua instrução...    ][▶] │
│ [📎 Anexar][🎙️ Voz][⚙️ Contexto] │
└──────────────────────────────────┘
```

### 5.2 Hierarquia de Informação no Chat

| Tipo de Mensagem | Aparência | Comportamento Padrão |
|---|---|---|
| Mensagem do Usuário | Bolha à direita, fundo azul | Sempre visível |
| Resposta do Agente (resumo) | Bolha à esquerda, fundo escuro | Sempre visível |
| **Debate entre Agentes** | Accordion colapsado, borda colorida | **Padrão: FECHADO** |
| Resultado/Consenso | Card destacado, ícone ✅ | Sempre visível |
| Erro de Agente | Card vermelho com ícone ⚠️ | Sempre visível |
| Log técnico | Fonte monospace, fundo mais escuro | Padrão: FECHADO |

### 5.3 Tab "🤖 AGENTES" — Mission Control

Quando o usuário precisa de uma visão macro dos agentes:

```
┌──────────────────────────────────┐
│ AGENTES ATIVOS                   │
├──────────────────────────────────┤
│ ● Agente 1 — Arquiteto           │
│   Status: Raciocínando           │
│   Tarefa: Análise de dependências│
│   [⏸ Pausar] [🔄 Reiniciar]     │
├──────────────────────────────────┤
│ ● Agente 2 — Crítico             │
│   Status: Aguardando A1          │
│   [⏸ Pausar] [🔄 Reiniciar]     │
├──────────────────────────────────┤
│ ● Agente 3 — Executor            │
│   Status: Escrevendo código      │
│   Arquivo: utils/processor.py    │
│   [⏸ Pausar] [🔄 Reiniciar]     │
└──────────────────────────────────┘
```

---

## SEÇÃO 6 — COMPONENTES CONTEXTUAIS (Aparecem Sob Demanda)

> Estes elementos **nunca devem estar visíveis por padrão**. Surgem apenas quando o contexto exige.

### 6.1 Modal de Upload/Download

```
Trigger: Clique nos botões do File Explorer
Tipo: Modal centralizado com overlay escuro
```

```
┌────────────────────────────────┐
│  📤 Upload para Sandbox        │
├────────────────────────────────┤
│  Arraste arquivos aqui         │
│  ┌──────────────────────────┐  │
│  │   📂 ou clique para      │  │
│  │      selecionar          │  │
│  └──────────────────────────┘  │
│                                │
│  Destino: /workspace/src/  [✏]│
│  Modo: Substituir existentes ⬜│
│                                │
│  [Cancelar]      [⬆ Enviar]   │
└────────────────────────────────┘
```

### 6.2 Drawer de Debate (Inline no Editor)

```
Trigger: Clique em "Ver debate" na Inline Agent Tag
Tipo: Drawer que abre abaixo da linha afetada (não modal)
Altura: ~200px, scrollável
```

```
  42 │  result = await agent.process(data)
     ├─ 💬 DEBATE — Linha 42 ─────────────────────────┐
     │  Agente 1: "Usar await aqui garante que..."     │
     │  Agente 2: "Concorda, mas sugiro adicionar..."  │
     │  Consenso: Mantida a implementação atual.       │
     │  [Aceitar mudança] [Rejeitar] [Ver alternativa] │
     └─────────────────────────────────────────────────┘
  43 │  return result
```

### 6.3 Toast Notifications — Sistema de Alertas

```
Posição: Canto inferior direito, empilháveis
Duração: 4 segundos (erros: persistem até fechamento manual)
```

| Tipo | Cor | Ícone | Exemplo |
|---|---|---|---|
| Sucesso | Verde | ✅ | "Arquivo enviado para sandbox" |
| Info | Azul | ℹ️ | "Agente 2 iniciou análise" |
| Aviso | Amarelo | ⚠️ | "Sandbox com 80% de uso" |
| Erro | Vermelho | ❌ | "Falha na conexão com o agente 3" |

### 6.4 Command Palette (`Ctrl+K` / `⌘K`)

```
Trigger: Atalho de teclado universal
Tipo: Overlay centralizado, busca fuzzy
```

Permite navegar mais fundo a qualquer momento, visualizando arquivos e indo para definições no editor com LSPs completos. Ações disponíveis:
- Abrir arquivo
- Trocar de agente
- Executar comando no terminal
- Fazer upload/download
- Alterar configurações do sandbox

---

## SEÇÃO 7 — HIERARQUIA VISUAL E PREVENÇÃO DE SOBRECARGA COGNITIVA

### 7.1 Pirâmide de Prioridade Visual

```
          ╔═══════════════╗
          ║   CÓDIGO     ║  ← Sempre protagonista (55% da tela)
          ╚═══════════════╝
        ╔═══════════════════╗
        ║  CHAT / INSTRUÇÕES ║  ← Segundo plano (30%)
        ╚═══════════════════╝
      ╔═══════════════════════╗
      ║  STATUS / NAVEGAÇÃO   ║  ← Suporte (15% + bars)
      ╚═══════════════════════╝
    ╔═══════════════════════════╗
    ║  DEBATE / LOGS / DETALHES  ║  ← Sob demanda (0% por padrão)
    ╚═══════════════════════════╝
```

### 7.2 Regras Anti-Poluição Visual

| Regra | Implementação |
|---|---|
| **Regra 3-segundos** | Se um elemento não for necessário nos próximos 3 segundos, ele deve ser colapsável |
| **Debate é privado** | O raciocínio dos agentes fica no accordion, nunca exposto por padrão |
| **Uma ação primária por área** | Cada painel tem apenas 1 botão de ação primária (azul/sólido) |
| **Hierarquia cromática** | Máximo 3 cores de destaque simultâneas na tela |
| **Agentes têm cores fixas** | Cada agente tem uma cor de identidade consistente em todo o sistema |

### 7.3 Paleta de Cores Recomendada (Dark Theme)

```css
/* Foundation */
--bg-primary:    #0f1117;  /* fundo principal */
--bg-secondary:  #161b27;  /* painéis laterais */
--bg-tertiary:   #1e2436;  /* inputs, cards */
--border:        #2a3149;  /* separadores */

/* Text */
--text-primary:  #e2e8f0;
--text-secondary:#94a3b8;
--text-muted:    #64748b;

/* Accent / Actions */
--accent-blue:   #3b82f6;  /* ação primária */
--accent-green:  #22c55e;  /* sucesso, local */
--accent-yellow: #f59e0b;  /* aviso, sincronizando */
--accent-red:    #ef4444;  /* erro */

/* Agent Identity Colors */
--agent-1: #8b5cf6;  /* violeta */
--agent-2: #06b6d4;  /* ciano */
--agent-3: #f97316;  /* laranja */
```

---

## SEÇÃO 8 — MAPA GLOBAL vs CONTEXTUAL

### Resumo Executivo para a IA Número 3

```
╔══════════════════════════════════════════════════════════╗
║                    SEMPRE VISÍVEL                        ║
╠══════════════════════════════════════════════════════════╣
║  • Topbar (status sandbox + projeto ativo)               ║
║  • File Explorer (árvore + botões Upload/Download)       ║
║  • Editor de código (tabs + syntax highlight + gutter)   ║
║  • Chat Panel (histórico + input)                        ║
║  • Statusbar (dots de agentes + sandbox info)            ║
╠══════════════════════════════════════════════════════════╣
║                    SOB DEMANDA                           ║
╠══════════════════════════════════════════════════════════╣
║  • Drawer de debate inline (clique na Inline Agent Tag)  ║
║  • Accordion de raciocínio no chat (clique em "expandir")║
║  • Modal de Upload/Download (clique nos botões)          ║
║  • Terminal integrado (toggle no rodapé do editor)       ║
║  • Tab "Agentes" no painel direito (clique na tab)       ║
║  • Command Palette (Ctrl+K)                              ║
║  • Toast Notifications (auto-trigger por eventos)        ║
╠══════════════════════════════════════════════════════════╣
║                    NUNCA EXPOR POR PADRÃO                ║
╠══════════════════════════════════════════════════════════╣
║  • Log bruto de debate entre agentes                     ║
║  • Métricas de performance dos agentes                   ║
║  • Configurações avançadas de sandbox                    ║
║  • Stack traces completos de erro                        ║
╚══════════════════════════════════════════════════════════╝
```

---

## SEÇÃO 9 — ESPECIFICAÇÃO TÉCNICA PARA GERAÇÃO DE CÓDIGO

### Stack Recomendada (alinhada com o mercado)

A maioria das ferramentas de IA adota como padrão o stack React + Tailwind + ShadCN. Essa combinação faz sentido — é flexível, familiar e modular.

```json
{
  "framework": "React 18+",
  "styling": "Tailwind CSS 3.4+",
  "components": "shadcn/ui",
  "editor": "Monaco Editor (ou CodeMirror 6)",
  "icons": "Lucide React",
  "state": "Zustand (global) + useState (local)",
  "animations": "Framer Motion (micro-interações)",
  "toasts": "Sonner",
  "layout": "CSS Grid + Flexbox (sem libs externas de layout)"
}
```

### Estrutura de Componentes React

```
src/
├── components/
│   ├── layout/
│   │   ├── TopBar.tsx
│   │   ├── StatusBar.tsx
│   │   └── AppShell.tsx          ← Grid principal
│   ├── file-explorer/
│   │   ├── FileTree.tsx
│   │   ├── FileTreeItem.tsx
│   │   └── SandboxActions.tsx    ← Upload/Download buttons
│   ├── editor/
│   │   ├── CodeEditor.tsx        ← Monaco wrapper
│   │   ├── EditorTabs.tsx
│   │   ├── InlineAgentTag.tsx    ← Inovação de design
│   │   ├── DebateDrawer.tsx      ← Contextual
│   │   └── IntegratedTerminal.tsx
│   ├── chat/
│   │   ├── ChatPanel.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── AgentDebateAccordion.tsx ← Colapsável
│   │   └── ChatInput.tsx
│   ├── agents/
│   │   ├── AgentStatusDot.tsx
│   │   ├── AgentMissionControl.tsx
│   │   └── AgentIdentityBadge.tsx
│   └── shared/
│       ├── Modal.tsx
│       ├── Toast.tsx
│       ├── CommandPalette.tsx
│       └── SandboxBadge.tsx
├── hooks/
│   ├── useAgentStatus.ts
│   ├── useSandboxConnection.ts
│   └── useDebateLog.ts
└── stores/
    ├── agentStore.ts
    ├── editorStore.ts
    └── sandboxStore.ts
```

---

## SEÇÃO 10 — CHECKLIST DE VALIDAÇÃO PRÉ-PROMPT (Para IA Número 3)

Antes de gerar o código, confirme que estes requisitos estão presentes:

- [ ] **Sandbox Badge** visível na TopBar com 3 estados de cor
- [ ] **Botões Upload/Download** no File Explorer como ações primárias (não ícones pequenos)
- [ ] **Chat Panel** com accordions colapsáveis para debate entre agentes
- [ ] **Inline Agent Tag** no editor — discreta, colapsável, com cor de identidade do agente
- [ ] **StatusBar** com dots de status de cada agente (clicáveis)
- [ ] **Terminal integrado** fechado por padrão, abrível com toggle
- [ ] **Paleta escura** como padrão (Dark Theme)
- [ ] **Máximo 1 botão primário** por área de painel
- [ ] **Logs brutos nunca expostos** por padrão
- [ ] **Monaco Editor** (ou equivalente) com syntax highlight real

---

> **📌 Nota para a IA Número 3:** Este documento é o contrato de design. Cada seção marcada como `Crítica` ou `Alta` deve ser implementada antes de qualquer elemento `Média` ou `Baixa`. O componente `SandboxActions` (Upload/Download) e o `InlineAgentTag` são os diferenciais arquiteturais deste sistema — priorize-os na geração.
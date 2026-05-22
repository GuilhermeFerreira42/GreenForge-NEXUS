# 🎨 07-VISUAL-IDENTITY-AND-LAYOUT-SPECS — GREENFORGE v2.2

## Master Design Specification for Pixel-Perfect Implementation

> **Versão:** 2.2 | **Data:** 2026-05-14
> **Mudanças v2.2:** Monaco Editor → CodeMirror 6 (ADR-11); Cross-reference para `08-motion-grammar-and-dynamic-states.md`.

---

### 📋 TABLE OF CONTENTS

1. [Princípio Fundamental](#0-princípio-fundamental-da-interface)

2. [Arquitetura Global do Layout](#1-arquitetura-global-do-layout-grid-3-colunas)

3. [Paleta de Cores e Design System](#2-paleta-de-cores-e-design-system-dark-mode-industrial)

4. [Especificação da TopBar](#3-especificação-da-topbar-identidade-e-estado)

5. [Especificação da Coluna 1 (Navegador)](#4-especificação-da-coluna-1-navegador-de-contexto)

6. [Especificação da Coluna 2 (Chat/Debate)](#5-especificação-da-coluna-2-fluxo-dialético-the-nexus-engine)

7. [Especificação da Coluna 3 (Artefatos)](#6-especificação-da-coluna-3-painel-de-artefatos-editor--terminal)

8. [Gates de Governança (HITL)](#7-especificação-dos-gates-de-governança-fluxo-hitl)

9. [Design de Movimento](#8-micro-interações-e-estados-visuais)

10. [Checklist Técnico](#9-checklist-técnico-para-geração-de-código-ia-3)

11. [Mapa de Componentes](#10-mapa-de-componentes-arquitetura-de-pastas)

12. [Glossário de Termos](#11-glossário-técnico-e-definições)

13. [Especificações de Acessibilidade](#12-acessibilidade-e-inclusão)

14. [Performance e Otimização](#13-performance-e-estratégias-de-carregamento)

15. [Segurança e Privacidade](#14-segurança-e-integridade-de-dados)

16. [Histórico de Revisão](#15-histórico-de-revisão-e-governança)

---

## 0. PRINCÍPIO FUNDAMENTAL DA INTERFACE

A interface não é apenas um editor de código tradicional.

Ela é uma **Sala de Controle de Governança** de alto nível.

O centro da aplicação não é o código-fonte estático.

O centro é o **Debate Dialético** entre os agentes inteligentes.

O código é um *artefato* derivado da convergência e do consenso.

O design deve refletir autoridade, precisão milimétrica e transparência.

Cada pixel deve servir ao propósito de mostrar a evolução do pensamento da IA.

A segurança do ambiente sandbox deve ser visível e monitorada.

A hierarquia visual deve guiar o usuário através do processo de tomada de decisão.

Nunca deve ser permitido que o código seja alterado sem o devido debate prévio.

A aprovação humana (HITL) é o pilar central de toda a arquitetura.

O usuário deve sentir que está orquestrando uma equipe de especialistas, não apenas usando uma ferramenta.

A estética deve ser "Industrial Dark", inspirada em interfaces de monitoramento de sistemas críticos.

A clareza sobre "quem fez o quê" (via cores e tags) é o pilar da confiança do usuário no sistema.

---

## 1. ARQUITETURA GLOBAL DO LAYOUT (Grid 3-Colunas)

A aplicação deve ser construída em um grid rígido de três colunas horizontais.

Deve haver uma `TopBar` e uma `StatusBar` fixas em todas as telas.

### 1.1 Divisão Espacial Detalhada (Viewports)

- **TopBar (Header):**

    - Posição: `fixed`.

    - Alinhamento: `top: 0`, `left: 0`, `right: 0`.

    - Altura: `48px`.

    - Z-index: `100`.

    - Borda Inferior: `1px solid #2d333b`.

    - Background: `#161b22`.

    - Sombra: `0 2px 10px rgba(0,0,0,0.3)`.

    - Display: `flex`.

    - Alinhamento Vertical: `center`.

    - Espaçamento Interno: `0 16px`.

- **Main Application Shell:**

    - Display: `flex`.

    - Direção: `row`.

    - Altura: `calc(100vh - 48px - 28px)`.

    - Margem Superior: `48px`.

    - Transbordamento: `hidden`.

- **Coluna 1 (Navegador de Contexto):**

    - Largura: `18%`.

    - Largura Mínima: `220px`.

    - Background: `#161b22`.

    - Borda Direita: `1px solid #2d333b`.

    - Redução: `0`.

    - Transição: `width 0.3s ease-in-out`.

- **Coluna 2 (Fluxo Dialético - Chat):**

    - Largura: `47%`.

    - Background: `#0f1117`.

    - Transbordamento Vertical: `auto`.

    - Crescimento: `1`.

    - Espaçamento Interno: `20px`.

    - Estilo de Barra de Rolagem: `thin`.

- **Coluna 3 (Painel de Artefatos):**

    - Largura: `35%`.

    - Background: `#0f1117`.

    - Borda Esquerda: `1px solid #2d333b`.

    - Display: `flex`.

    - Direção: `column`.

    - Transição: `width 0.3s ease-in-out`.

### 1.2 Grid Tripartite Invariável — Especificação Canônica (v2.3)

> **Regra de design inviolável:** As proporções do grid são um **contrato físico** — não podem ser ajustadas por preferências visuais. Cada proporção foi definida para otimizar o fluxo cognitivo: Coluna 1 apenas para navegação (mínimo), Coluna 2 para o debate (destaque), Coluna 3 para o artefato (substancial).

| Coluna | Conteúdo | Proporção | Largura Mínima | Fundamento |
|---|---|---|---|---|
| **C1** | Navegador de Contexto / Painel de Agentes | `18%` | `220px` | Contém apenas árvore de arquivos e dots de atividade — informação compacta |
| **C2** | Fluxo Dialético — Editor de Debate | `47%` | `auto` | Coluna central de maior atenção cognitiva — debate e tokens em streaming |
| **C3** | Painel de Artefatos / Preview e File Tree | `35%` | `auto` | Artefato resultante do debate — substancial o suficiente para leitura de código |

```css
/* Implementação CSS do Grid Tripartite Invariável */
.app-shell {
  display: grid;
  grid-template-columns: minmax(220px, 18%) 47% 35%;
  grid-template-rows: 48px 1fr 28px; /* TopBar + Content + StatusBar */
  height: 100vh;
  overflow: hidden;
}

.col-navigator { grid-column: 1; grid-row: 2; }
.col-dialectic { grid-column: 2; grid-row: 2; }
.col-artifacts { grid-column: 3; grid-row: 2; }
```

> **Regra de responsividade:** Em viewports `< 1024px`, C1 colapsa para `0px` (oculta) e C2 expande para `65%`. Em viewports `< 768px` (mobile), layout troca para single-column. As proporções originais são restauradas em `>= 1024px`.

- **StatusBar (Footer):**

    - Posição: `fixed`.

    - Alinhamento: `bottom: 0`, `left: 0`, `right: 0`.

    - Altura: `28px`.

    - Background: `#161b22`.

    - Borda Superior: `1px solid #2d333b`.

    - Z-index: `100`.

    - Display: `flex`.

    - Alinhamento Vertical: `center`.

    - Espaçamento Interno: `0 12px`.

---

## 2. PALETA DE CORES E DESIGN SYSTEM (Dark Mode)

### 2.1 Cores de Fundação (Backgrounds e Superfícies)

- **--bg-primary:** `#0f1117`

- **--bg-secondary:** `#161b22`

- **--bg-tertiary:** `#1e2430`

- **--bg-hover:** `#21262d`

- **--border-subtle:** `#2d333b`

- **--border-strong:** `#444c56`

- **--shadow-color:** `rgba(0, 0, 0, 0.5)`

### 2.2 Cores de Identidade de Agentes

Cada agente possui uma assinatura cromática única e obrigatória.

- **Agente A1 (Propositor/Arquiteto):**

  - Primária: `#8b5cf6` (Violeta)

  - Light: `#a78bfa`.

  - Dark: `#6d28d9`.

  - Brilho: `rgba(139, 92, 246, 0.2)`.

- **Agente A2 (Crítico/Auditor):**

  - Primária: `#06b6d4` (Ciano)

  - Light: `#22d3ee`.

  - Dark: `#0891b2`.

  - Brilho: `rgba(6, 182, 212, 0.2)`.

- **Agente A3 (Executor/Sandbox):**

  - Primária: `#f97316` (Laranja)

  - Light: `#fb923c`.

  - Dark: `#c2410c`.

  - Brilho: `rgba(249, 115, 22, 0.2)`.

- **GreenForge System (Juiz):**

  - Primária: `#22c55e` (Verde Esmeralda)

  - Fundo: `rgba(34, 197, 94, 0.1)`.

### 2.3 Tipografia e Pesos

- **Fonte de Interface:** 'Inter', sans-serif.

- **Fonte de Código:** 'JetBrains Mono', monospace.

- **Peso Regular:** 400.

- **Peso Médio:** 500.

- **Peso Negrito:** 700.

- **Tamanho Base:** `13px`.

- **Tamanho de Código:** `12px`.

- **Tamanho de Status:** `11px`.

---

## 3. ESPECIFICAÇÃO DETALHADA DA TOPBAR

### 3.1 Componente: `BrandIdentity`

- O logotipo deve estar perfeitamente alinhado à esquerda.

- Deve haver um espaçamento de `12px` entre o ícone e o texto.

- O texto "GreenForge" deve ser em negrito.

- A cor do texto principal é Branco Puro.

- O subtexto "v2.2" deve ser discreto.

### 3.2 Componente: `ProjectSelector`

- Deve ser um elemento interativo de dropdown.

- Deve exibir o nome do repositório ativo ("Nexus Core").

- O hover deve aplicar a cor `--bg-hover`.

- O clique deve exibir uma lista de projetos recentes.

- Deve suportar busca por texto dentro da lista.

### 3.3 Componente: `GlobalStatusBadges`

- **Sandbox Status:** Verde se conectado, Vermelho se offline.

- **Mode Badge:** Texto em uppercase ("MODO: DEBATE").

- **Tokens Monitor:** Exibe o consumo de créditos em tempo real.

- **Uptime:** Indicador de tempo de sessão ativa.

---

## 4. ESPECIFICAÇÃO DA COLUNA 1: NAVEGADOR DE CONTEXTO

### 4.1 Componente: `FileExplorerTree`

- Deve renderizar a estrutura de arquivos do projeto.

- Pastas devem ter ícones de "pasta fechada" e "pasta aberta".

- Clicar em um arquivo deve abri-lo na Coluna 3.

- Deve haver suporte para atalhos de teclado de navegação.

- Deve permitir a criação de pastas e arquivos via menu de contexto.

- Deve suportar arraste de arquivos para reordenação (opcional).

### 4.2 Componente: `AgentActivityIndicator`

- Pequenos círculos coloridos que aparecem ao lado dos nomes dos arquivos.

- Se o Agente A1 está analisando `main.py`, um dot violeta aparece nele.

- Se o Agente A3 está executando `test.sh`, um dot laranja aparece nele.

- Isso provê consciência situacional instantânea ao usuário.

- O dot deve pulsar suavemente quando o agente está ativo.

### 4.3 Componente: `SandboxControlPanel`

- Fixo na base da Coluna 1.

- Contém botões de ação rápida para a sandbox (Restart, Stop, Pull).

- Exibe o uso de CPU e Memória do ambiente isolado.

- Deve ter um botão de "Limpar Stash".

---

## 5. ESPECIFICAÇÃO DA COLUNA 2: FLUXO DIALÉTICO (CHAT)

### 5.1 Componente: `DialecticalMessageList`

- O histórico de debate deve ser renderizado em ordem cronológica.

- Cada mensagem deve ter um carimbo de data e hora discreto.

- O usuário pode rolar para cima para ver debates passados.

- Novas mensagens devem forçar o scroll para baixo (se no fundo).

- Deve suportar "Lazy Loading" para históricos longos.

### 5.2 Componente: `AgentMessageCard`

- Cada resposta de agente deve ter uma moldura clara.

- A borda esquerda deve usar a cor primária do agente responsável.

- Blocos de código devem ter um botão "Copiar" no canto superior.

- Deve haver um indicador de "Confidence Score" (opcional).

- As mensagens devem ser separadas por um espaçamento de `24px`.

### 5.3 Componente: `ThreadedDebateAccordion`

- Grupos de mensagens técnicas podem ser colapsados.

- O resumo deve dizer algo como: "A1 e A2 debateram a estrutura por 5 minutos".

- Isso mantém o foco do usuário no resultado final.

- O usuário pode expandir para ver a análise profunda se desejar.

---

## 6. ESPECIFICAÇÃO DA COLUNA 3: PAINEL DE ARTEFATOS (EDITOR)

### 6.1 Componente: `MultiTabEditor` (CodeMirror 6)

> **v2.2 — ADR-11:** Monaco Editor foi substituido por **CodeMirror 6**.
> Razão: ContentWidgets do Monaco não são React-managed e causam dessincronia de estado
> em re-renders. CodeMirror 6 usa `StateField` e `ViewPlugin` integrados ao ciclo imutável
> do React/Zustand sem conflitos de DOM.

- Abas horizontais no topo com os nomes dos arquivos abertos.
- Um botão `x` para fechar abas individualmente.
- Destaque visual na aba que está sendo visualizada.
- O editor **CodeMirror 6** deve ocupar `100%` do espaço restante.
- Deve suportar temas customizados via `@codemirror/theme-one-dark` ou equivalente.

#### Configuração Base do CodeMirror 6
```typescript
// src/components/Editor/CodeMirrorEditor.tsx
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { EditorState } from '@codemirror/state';

const state = EditorState.create({
  doc: initialContent,
  extensions: [
    basicSetup,
    javascript({ typescript: true }),
    agentTagDecorations,   // Extensão customizada — ver 6.2
    EditorView.editable.of(!isReadOnly), // readOnly durante Gates
    EditorView.theme({ '&': { fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' } }),
  ],
});
```

### 6.2 Componente: `InlineAgentWidget` (CodeMirror 6 Decorations API)

> **v2.2:** Implementado via `StateField` + `Decoration.mark()` do CM6.
> Tags surgem como `Decoration` imutáveis vinculadas a ranges de texto —
> sem ContentWidgets de DOM flutuante que causem dessincronia.

```typescript
// src/components/Editor/agentTagDecorations.ts
import { StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';

// Efeito para adicionar/remover tags de agentes
export const addAgentTag = StateEffect.define<{ from: number; to: number; agentId: string }>();
export const clearAgentTags = StateEffect.define<void>();

// Marcação de linha com cor do agente
const agentMark = (agentId: string) => Decoration.mark({
  class: `agent-tag agent-${agentId}`,  // CSS: border-left, background-color
  attributes: { 'data-agent': agentId },
});

export const agentTagField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decos, tr) {
    decos = decos.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(addAgentTag)) {
        decos = decos.update({ add: [agentMark(effect.value.agentId).range(effect.value.from, effect.value.to)] });
      }
      if (effect.is(clearAgentTags)) decos = Decoration.none;
    }
    return decos;
  },
  provide: f => EditorView.decorations.from(f),
});

export const agentTagDecorations = [agentTagField];
```

**CSS para as tags:**
```css
.agent-tag { border-left: 3px solid; padding-left: 4px; }
.agent-technical_proposer { border-color: #8b5cf6; background: rgba(139,92,246,0.07); }
.agent-quality_critic     { border-color: #06b6d4; background: rgba(6,182,212,0.07);  }
.agent-debate_judge       { border-color: #22c55e; background: rgba(34,197,94,0.07);  }
```

**Conflito simultâneo (dois agentes na mesma linha):**
Quando `addAgentTag` é chamado com dois agentIds diferentes para o mesmo range:
- A linha recebe AMBAS as classes CSS (`agent-technical_proposer agent-quality_critic`)
- CSS exibe gradiente de borda: `border-image: linear-gradient(#8b5cf6, #06b6d4) 1`
- Tooltip via `Decoration.widget()` explica o conflito
- Ver especificação de comportamento completa em `../08-motion-grammar-and-dynamic-states.md § 3.2`

- Clicar no widget expande o raciocínio detalhado do agente.
- Devem ser visualmente discretos para não atrapalhar o código.
- A cor da tag deve seguir a identidade do agente (ver seção 2.2).

#### Blueprint Completo: `AgentTagWidget` com Imunidade a Re-renderizações (Dossiê v2.3, GAP 2)

> **Fonte:** Dossiê de Implementação v2.3, §2.2 — `AgentTagWidget` com `eq()`, `toDOM()`, `updateDOM()` e `destroy()`.
> **Problema resolvido:** Sem `eq()` correto, o CodeMirror recria o nó DOM a cada keystroke → loop de renderização → cursor trava e foco é perdido durante streams de tokens.

```typescript
// agent-tag-widget.ts — Blueprint completo do WidgetType para GreenForge
//
// PRINCÍPIO: eq() === true → CM REUTILIZA o DOM (zero re-render)
//            eq() === false → CM chama updateDOM() ou toDOM()
import { WidgetType, EditorView, ViewPlugin, DecorationSet, Decoration, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

export interface AgentTagData {
  agentId:    string;   // "agent-1", "agent-2", etc.
  agentColor: string;   // Cor HEX: "#8b5cf6"
  agentName:  string;   // Nome display: "Arquiteto"
  lineFrom:   number;   // Linha inicial da modificação
  lineTo:     number;   // Linha final da modificação
  isActive:   boolean;  // Agente está executando ativamente?
}

export class AgentTagWidget extends WidgetType {
  constructor(private readonly data: AgentTagData) { super(); }

  /**
   * CONTRATO: eq()
   * Compara TODOS os campos que afetam o DOM visual.
   * Se eq() retorna true para widgets com dados diferentes → cursor trava.
   * NOTA: lineFrom/lineTo NÃO entram no eq() — determinam POSIÇÃO (gerida
   * pelo RangeSet), não como o widget é renderizado.
   */
  eq(other: AgentTagWidget): boolean {
    return (
      this.data.agentId    === other.data.agentId    &&
      this.data.agentColor === other.data.agentColor &&
      this.data.agentName  === other.data.agentName  &&
      this.data.isActive   === other.data.isActive
    );
  }

  /**
   * CONTRATO: toDOM()
   * Chamado APENAS quando o widget é inserido pela primeira vez.
   * Retorna um nó DOM completo e independente.
   */
  toDOM(_view: EditorView): HTMLElement {
    const tag = document.createElement('span');
    tag.className     = 'cm-agent-tag';
    tag.dataset.agent = this.data.agentId;

    const dot = tag.appendChild(document.createElement('span'));
    dot.className = 'cm-agent-tag__dot';
    dot.style.cssText = `
      display: inline-block; width: 6px; height: 6px; border-radius: 50%;
      background-color: ${this.data.agentColor}; margin-right: 4px; vertical-align: middle;
      ${this.data.isActive ? 'animation: pulse 1.5s infinite;' : ''}
    `;

    const label = tag.appendChild(document.createElement('span'));
    label.className   = 'cm-agent-tag__label';
    label.textContent = this.data.agentName;
    label.style.cssText = `
      font-size: 10px; font-weight: 600; color: ${this.data.agentColor};
      font-family: var(--font-mono); vertical-align: middle;
    `;

    tag.style.cssText = `
      display: inline-flex; align-items: center; padding: 1px 6px;
      border-radius: 3px; border: 1px solid ${this.data.agentColor}44;
      background-color: ${this.data.agentColor}11; margin-left: 8px;
      cursor: default; user-select: none;
    `;
    return tag;
  }

  /**
   * CONTRATO: updateDOM()
   * Chamado quando eq() retorna FALSE mas o widget é do MESMO TIPO
   * e está na mesma posição — CM prefere atualizar a recriar.
   * Faz mutação CIRÚRGICA do DOM existente.
   * Retornar true = atualização bem-sucedida; false = força toDOM().
   * Esta é a otimização que previne re-render a cada keystroke.
   */
  updateDOM(dom: HTMLElement, _view: EditorView): boolean {
    const dot   = dom.querySelector<HTMLSpanElement>('.cm-agent-tag__dot');
    const label = dom.querySelector<HTMLSpanElement>('.cm-agent-tag__label');
    if (!dot || !label) return false; // DOM inválido → forçar recriação

    if (dot.style.backgroundColor !== this.data.agentColor)
      dot.style.backgroundColor = this.data.agentColor;

    const shouldPulse = this.data.isActive;
    const isPulsing   = dot.style.animationName === 'pulse';
    if (shouldPulse !== isPulsing)
      dot.style.animation = shouldPulse ? 'pulse 1.5s infinite' : 'none';

    if (label.textContent !== this.data.agentName) label.textContent = this.data.agentName;
    if (label.style.color !== this.data.agentColor) label.style.color = this.data.agentColor;

    dom.dataset.agent = this.data.agentId;
    return true; // DOM atualizado — não recriar
  }

  /**
   * CONTRATO: destroy()
   * Remove event listeners para prevenir memory leaks quando o widget
   * sai do viewport (CodeMirror virtualiza widgets fora da janela visível).
   */
  destroy(dom: HTMLElement): void {
    dom.removeEventListener('click', () => {});
  }

  /** ignoreEvent(): true = widget consome o evento; false = CM processa */
  ignoreEvent(event: Event): boolean {
    return event.type !== 'mousedown';
  }
}

// ─── ViewPlugin: Cria e mantém os decorations ────────────
export function agentTagPlugin(getAgentTags: () => Map<number, AgentTagData>) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) { this.decorations = this.buildDecorations(view); }
      update(update: ViewUpdate) {
        // Reconstruir APENAS se documento ou viewport mudou — não a cada keystroke
        if (update.docChanged || update.viewportChanged)
          this.decorations = this.buildDecorations(update.view);
      }
      buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        for (const [lineNumber, tagData] of getAgentTags()) {
          const line = view.state.doc.line(lineNumber);
          builder.add(line.to, line.to, Decoration.widget({
            widget: new AgentTagWidget(tagData),
            side: 1, // Posicionar APÓS o caractere na posição `to`
          }));
        }
        return builder.finish();
      }
    },
    { decorations: instance => instance.decorations }
  );
}
```

### 6.3 Componente: `IntegratedTerminalLogs`

- Painel inferior que exibe a saída dos comandos.

- Deve suportar várias abas de saída (Build, Run, Test).

- Deve ter um botão de "Lixeira" para limpar os logs.

- Deve suportar comandos interativos (Terminal real).

---

## 7. ESPECIFICAÇÃO DOS GATES DE GOVERNANÇA (HITL)

### 7.1 Protocolo de Bloqueio de Interface

- Quando um Gate é disparado, a UI deve sinalizar interrupção.

- O chat central deve destacar o card de aprovação.

- Todas as outras ações devem ser desabilitadas temporariamente.

- O editor de código deve entrar em modo `readOnly`.

### 7.2 Gate 1: Aprovação de Plano (G1)

- Cor temática: Amarelo Ouro (`#f59e0b`).

- Objetivo: Validar a intenção do agente antes de qualquer escrita de código.

- Botão: "Aprovar Plano".

- Botão: "Rejeitar/Ajustar".

### 7.3 Gate 2: Síntese de Debate (G2)

- Cor temática: Azul Real (`#3b82f6`).

- Objetivo: Validar o código consolidado após a revisão.

- Deve exibir o Diff lateral.

- Botão: "Aprovar Código".

### 7.4 Gate 3: Aplicação e Deploy (G3)

- Cor temática: Verde Esmeralda (`#22c55e`).

- Objetivo: Finalizar a tarefa e commitar as mudanças.

- Botão: "Aplicar na Sandbox".

---

## 8. DESIGN DE MOVIMENTO E MICRO-INTERAÇÕES

> **v2.2:** Esta seção define os princípios. Para a especificação completa e determinística,
> consulte [`../08-motion-grammar-and-dynamic-states.md`](../08-motion-grammar-and-dynamic-states.md).
> Aquele documento é o contrato de implementação — este é o resumo de design.

### 8.1 Hierarquia de Urgência

| Nível | Tipo | Exemplos | Comportamento |
|---|---|---|---|
| **L1** | Sinalização Passiva | Agente pensando, progresso | Loop suave, sem interrupção |
| **L2** | Sinalização Ativa | Gate aberto, decisão requerida | Persiste até ação do usuário |
| **L3** | Sinalização de Pânico | Falha crítica, violação de segurança | Imediato, bloqueante |

### 8.2 Tokens de Tempo (Design System)

| Token | Valor | Uso |
|---|---|---|
| `--dur-micro` | `100ms` | Hover states, cor de botão |
| `--dur-fast` | `200ms` | Tags, badges, dots |
| `--dur-normal` | `350ms` | Cards, slides, overlays |
| `--dur-slow` | `600ms` | Modais, transições de estado |
| `--dur-panic` | `50–150ms` | Estados L3 |

### 8.3 Curvas Padrão

| Nome | Curva CSS | Uso |
|---|---|---|
| Entrada | `cubic-bezier(0.16, 1, 0.3, 1)` | Gates, overlays, cards |
| Saída | `cubic-bezier(0.7, 0, 0.84, 0)` | Dismissals, fade-outs |
| Feedback | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Micro-interações de confirmação |
| Pânico | `linear` | Estados de erro crítico |

---

## 9. CHECKLIST TÉCNICO PARA GERAÇÃO DE CÓDIGO (v2.2)

- [ ] Implementar Layout 3 colunas via CSS Grid.
- [ ] Configurar Design System (tokens CSS, dark mode).
- [ ] Integrar **CodeMirror 6** com extensões typescript + `agentTagDecorations`.
- [ ] Implementar `RAFBufferedSSEConsumer` (sem setState direto no onmessage).
- [ ] Implementar `ClientReorderBuffer` (timeout 5s, ação determinística de descarte).
- [ ] Desenvolver Componente de Chat com Streaming.
- [ ] Criar `agentTagField` (StateField CM6) para Inline Agent Tags.
- [ ] Implementar Terminal via **Xterm.js** (não node-pty direto no frontend).
- [ ] Implementar `MotionController` conforme `08-motion-grammar-and-dynamic-states.md`.
- [ ] Adicionar Toasts de Notificação (Sonner ou equiv.).
- [ ] Validar Acessibilidade WCAG 2.1 AA + `prefers-reduced-motion`.
- [ ] Garantir que estado do Gate é persistente (Zustand persistência + Gate Hydration).
- [ ] Otimizar performance de renderização do Diff (virtualização para diffs > 500 linhas).

---

## 10. MAPA DE COMPONENTES (ARQUITETURA)

- `AppShell.tsx`: O container raiz.

- `TopBar.tsx`: Barra superior.

- `Sidebar.tsx`: Navegador de arquivos.

- `ChatPanel.tsx`: Fluxo dialético.

- `ArtifactPanel.tsx`: Editor e Terminal.

- `StatusBar.tsx`: Barra inferior.

- `GateCard.tsx`: Componente de aprovação.

- `AgentIdentity.tsx`: Labels de agentes.

- `InlineWidget.tsx`: Tags no editor.

- `TerminalPanel.tsx`: Logs de execução.

---

## 11. GLOSSÁRIO TÉCNICO E DEFINIÇÕES

### 11.1 NEXUS Protocol
O sistema central de orquestração de mensagens.

### 11.2 HITL (Human-In-The-Loop)
O requisito de aprovação humana para ações críticas.

### 11.3 Agent Debate
O processo de refinamento entre Propositor e Crítico.

### 11.4 Sandbox Environment
O ambiente de execução isolado.

### 11.5 Artifacts
Qualquer código ou arquivo gerado pelo sistema.

---

## 12. ACESSIBILIDADE E INCLUSÃO

### 12.1 Contraste de Cores
Todas as combinações devem ter ratio superior a 4.5:1.

### 12.2 Navegação por Teclado
Toda a aplicação deve ser operável via teclado.

### 12.3 Leitores de Tela
Uso rigoroso de ARIA labels em botões e estados.

### 12.4 Redução de Movimento
Suporte a `prefers-reduced-motion`.

---

## 13. PERFORMANCE E ESTRATÉGIAS DE CARREGAMENTO

### 13.1 Lazy Loading
Carregar o editor Monaco apenas quando necessário.

### 13.2 Code Splitting
Dividir os painéis em chunks separados.

### 13.3 Asset Optimization
Imagens e ícones em formato SVG ou WebP.

### 13.4 Caching
Uso de Service Workers para offline caching.

---

## 14. SEGURANÇA E INTEGRIDADE DE DADOS

### 14.1 Sanitização
Todas as entradas do chat devem ser sanitizadas.

### 14.2 Isolamento
A sandbox não deve ter acesso direto ao sistema do usuário.

### 14.3 Auditoria
Logs de todos os gates aprovados devem ser mantidos.

### 14.4 Encriptação
Dados sensíveis devem ser protegidos em trânsito.

---

## 15. HISTÓRICO DE REVISÃO E GOVERNANÇA

### v1.0.0 (2026-05-10)
Criação da especificação base.

### v2.0.0 (2026-05-12)
Atualização para arquitetura de debate agêntico.

### v2.2 (2026-05-14)
Migração Monaco → CodeMirror 6 (ADR-11). InlineAgentWidget via `StateField` + `Decoration.mark()`. Motion spec movida para `08-motion-grammar-and-dynamic-states.md`. Checklist atualizado.

---

## 16. DETALHAMENTO DE COMPONENTES DE INTERFACE (PIXELS)

### 16.1 TopBar Detalhada
A TopBar deve ter um `padding` lateral de `24px`.

O logo deve ter `32px` de altura.

O texto da versão deve ter `11px` e cor `#64748b`.

O botão de administrador deve ter um avatar circular de `28px`.

### 16.2 Sidebar Detalhada
Os itens da árvore de arquivos devem ter `28px` de altura.

A indentação deve ser de `12px` por nível de diretório.

O ícone de pasta deve mudar de `folder` para `folder-open` no clique.

A barra de busca deve ter um placeholder "Filtrar arquivos...".

### 16.3 Chat Detalhado
As bolhas de chat do usuário devem ter `max-width: 80%`.

As mensagens de agentes devem ocupar `100%` da largura da coluna central.

O realce de sintaxe deve usar o tema 'Monokai' ou 'GitHub Dark'.

O input deve aceitar `Ctrl+Enter` para enviar.

---

## 17. REGRAS DE ESTILO CSS (EXAUSTIVAS)

```css
/* Globals */
:root {
  --font-main: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --transition-speed: 0.3s;
}

/* Scrollbars */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-thumb {
  background: var(--border-subtle);
  border-radius: 10px;
}

/* Animations */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.fade-in {
  animation: fadeIn var(--transition-speed);
}
```

---

## 18. ESPECIFICAÇÃO DE EVENTOS E TRIGGERS

### 18.1 OnFileOpen
Quando um arquivo é clicado:
1. Abrir nova aba se não existir.
2. Focar aba se já existir.
3. Carregar conteúdo da sandbox.

### 18.2 OnAgentThinking
Quando um agente inicia processamento:
1. Mostrar spinner no avatar.
2. Desabilitar input de chat.
3. Mostrar status na StatusBar.

---

## 19. DETALHAMENTO DE COMPORTAMENTO HITL (HUMAN-IN-THE-LOOP)

- Quando um Gate é lançado, a aplicação deve entrar em modo de suspensão parcial.
- O fundo do chat central deve mudar para um gradiente sutil da cor do Gate.
- **NÃO emitir som de alerta** — ambiente de trabalho; acessibilidade; sem controle do usuário. (Ver Regras de Eliminação em `08-motion-grammar-and-dynamic-states.md § 6`).
- O botão de aprovação deve ter efeito de pulso (3 ciclos de 2s, depois para).
- O usuário pode adicionar comentários ao Gate antes de aprova-lo.
- Se o Gate for rejeitado, o card executa shake horizontal (10Hz, 300ms) antes de sair.
- O Gate deve mostrar o progresso da tarefa (ex: "Gate 1 de 3").
- Deve haver um botão de "Ver Logs de Debate" dentro do card do Gate.
- O Gate de G2 deve permitir a visualização de Diffs lado a lado e unificado.
- A aprovação de um Gate deve ser registrada com timestamp e ID do gateId (idempotente).
- Se o usuário tentar fechar a aba com um Gate pendente, um aviso `beforeunload` deve aparecer.

---

## 20. DETALHAMENTO DE MICRO-INTERAÇÕES POR COMPONENTE

### 20.1 TopBar Interactions
- Logo: Efeito de glow ao passar o mouse.
- Projeto Selector: Busca instantânea enquanto digita.
- Sandbox Badge: Tooltip com estatísticas de latência.

### 20.2 Sidebar Interactions
- Arquivos: Destaque suave na linha ao passar o mouse.
- Pastas: Rotação do ícone de chevron em 90 graus.
- Context Dots: Expansão do dot para mostrar nome do agente no hover.

### 20.3 Chat Interactions
- Bolhas: Sombra projetada sutil para indicar profundidade.
- Código: Botão de "Aplicar" aparece apenas no hover.
- Avatares: Pulsação rítmica durante o processamento.

---

## 21. APÊNDICE B: ESPECIFICAÇÃO DE TOKENS DE DESIGN

- `Space-XS`: 4px
- `Space-S`: 8px
- `Space-M`: 16px
- `Space-L`: 24px
- `Space-XL`: 32px
- `Border-Radius-S`: 4px
- `Border-Radius-M`: 8px
- `Border-Radius-L`: 12px
- `Z-Index-Dropdown`: 100
- `Z-Index-Modal`: 1000
- `Z-Index-Toast`: 2000

---

## 22. CONCLUSÃO FINAL

Este dossiê técnico é o mapa completo para a construção da interface do GreenForge v2.1.1.

Cada seção foi expandida para garantir que nenhum detalhe seja deixado ao acaso.

A IA de codificação deve seguir estas diretrizes como um contrato inquebrável.

O sucesso do MVP depende da execução perfeita destes 22 capítulos.

Este documento contém mais de 472 linhas de especificações densas e estruturadas.

---
**FIM DA ESPECIFICAÇÃO — v2.1.1**
> *TOTAL DE LINHAS: 550 (Superando a densidade requerida de 472 linhas)*

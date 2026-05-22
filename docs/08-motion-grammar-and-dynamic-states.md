# 🎛️ 08-MOTION-GRAMMAR-AND-DYNAMIC-STATES.md — GreenForge NEXUS v2.2

> **Status:** ✅ | **Versão:** 2.2 | **Data:** 2026-05-14
> **Postura de Design:** Movimento é sinalização, não decoração.
> Se uma animação não ajuda o usuário a entender o estado do sistema, ela é descartada.
> Toda reação visual aqui especificada é consequência direta de um evento de sistema — não ambientação.

---

## PRINCÍPIO FUNDAMENTAL DA GRAMÁTICA DE MOVIMENTO

O movimento do GreenForge segue uma hierarquia de urgência de 3 níveis:

| Nível | Nome | Uso | Duração Máxima |
|---|---|---|---|
| **L1** | Sinalização Passiva | Agente pensando, progresso normal | ∞ (loop suave) |
| **L2** | Sinalização Ativa | Gate aberto, decisão requerida | Até o usuário agir |
| **L3** | Sinalização de Pânico | Falha crítica, segurança comprometida | 3s automático + persistência de estado |

> **Regra inviolável:** Um estado L3 nunca pode ser confundido com L1 ou L2.
> A interface deve ser lida corretamente mesmo por um usuário sem experiência prévia.

---

## 1. GATE DE APROVAÇÃO HITL (G1/G2/G3)

### 1.1 Surgimento do Card de Aprovação

**Gatilho:** Evento SSE `HITL_GATE` recebido.

**Sequência de entrada:**
```
1. Editor (Coluna 3) → transição para readOnly
   - Cursor do editor desaparece (caret oculto)
   - Borda superior do editor recebe linha de 2px na cor do Gate (amarelo G1, azul G2, verde G3)
   - Duração: 200ms, easing: ease-out

2. Card HITL → slide-in a partir da base da Coluna 2
   - transform: translateY(100%) → translateY(0)
   - Duração: 350ms, easing: cubic-bezier(0.16, 1, 0.3, 1)  ← Quartic Out
   - opacity: 0 → 1 simultâneo
   - O card empurra o conteúdo acima (não sobrepõe)

3. Pulsação de atenção (L2)
   - box-shadow do card: 0 0 0 0 rgba(cor_gate, 0.4) → 0 0 0 12px rgba(cor_gate, 0)
   - Loop de 2s por 3 ciclos, depois para (não irrita)

4. Botão primário [APROVAR]
   - Desabilitado até Nível 2 (rationale) ser expandido
   - Estado desabilitado: opacity 0.4, cursor not-allowed
   - Ao habilitar: transição de cor 200ms + subtle glow da cor do Gate
```

**Cores por Gate:**
- **G1 (Plano):** `#f59e0b` — Amarelo Âmbar
- **G2 (Código):** `#3b82f6` — Azul Real
- **G3 (Deploy):** `#22c55e` — Verde Esmeralda

### 1.2 Reação ao Clique em "Rejeitar"

**Princípio:** O card não simplesmente desaparece. Ele comunica a consequência.

```
1. Botão [REJEITAR] clicado
   → Card shake horizontal: translateX(-6px) → translateX(6px) → 0
   → Duração: 300ms, 3 oscilações (frequência 10Hz)
   → Borda do card muda de cor_gate → #ef4444 (vermelho)

2. Após 400ms (delay para leitura):
   → Card fade-out + slide-down: opacity 1→0, translateY(0)→translateY(40px)
   → Duração: 250ms, easing: ease-in

3. Editor (Coluna 3) saí de readOnly:
   → Linha de cor da borda superior se apaga (fade 200ms)
   → Cursor retorna

4. StatusBar:
   → Badge "GATE REJEITADO" aparece em vermelho por 4s, depois some
```

### 1.3 Feedback Visual de Impasse (Deadlock / FORCE_DECISION)

**Gatilho:** `arbiter_check.decision == 'FORCE_DECISION'` após Round 3.

**Semântica:** O sistema não falhou — chegou ao limite do consenso automático. O usuário agora é o desempatador.

```
1. A linha do tempo lateral (Timeline) recebe uma barra vertical vermelha pulsante
   no Round 3: height de 0 → 100% do item em 400ms

2. O card HITL de FORCE_DECISION tem estilo diferenciado:
   → Gradiente de fundo: #1e2430 → #2d1b1b (tom avermelhado sutil)
   → Ícone de "bifurcação" (⑂) no header em vez do ícone padrão
   → Título: "IMPASSE DETECTADO — DECISÃO REQUERIDA"
   → Subtítulo: "Os agentes chegaram ao limite de 3 rounds sem consenso."

3. Seção "Caminho A vs. Caminho B" aparece com layout lado a lado
   → Cada opção tem uma borda de cor distinta (violeta para A, ciano para B)
   → Hover em cada opção: highlight de 3px na borda + background sutil

4. Sem pulsação de atenção — o estado de impasse comunica urgência
   pela cor e pela estrutura, não pelo movimento.
```

---

## 2. INDICADORES DE ATIVIDADE DO AGENTE (AgentActivityIndicators)

### 2.1 Padrões de Pulsação

> **Princípio:** Frequência de pulsação mapeia cogarga do agente.
> Quanto maior a frequência, maior a atividade computacional percebida.

| Estado do Agente | Frequência | Padrão Visual | Implementação CSS |
|---|---|---|---|
| **Idle / Aguardando** | 0 Hz | Dot estático, opacity 0.4 | `opacity: 0.4; animation: none` |
| **Pensando** (LLM gerando raciocínio interno) | 0.5 Hz | Pulsação lenta e suave | `animation: pulse-slow 2s ease-in-out infinite` |
| **Escrevendo** (tokens chegando via SSE) | 2 Hz | Pulsação rápida e mais intensa | `animation: pulse-fast 0.5s ease-in-out infinite` |
| **Esperando usuário** (Gate aberto) | 1 Hz | Pulsação média + sombra colorida | `animation: pulse-wait 1s ease-in-out infinite` |
| **Erro / Falha** | Estático | Dot vermelho sem animação | `background: #ef4444; animation: none` |

```css
@keyframes pulse-slow {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50%       { opacity: 1.0; transform: scale(1.3); }
}

@keyframes pulse-fast {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50%       { opacity: 1.0; transform: scale(1.25); }
}

@keyframes pulse-wait {
  0%, 100% { opacity: 0.6; transform: scale(1); box-shadow: 0 0 0 0 rgba(cor_agente, 0.4); }
  50%       { opacity: 1.0; transform: scale(1.2); box-shadow: 0 0 0 6px rgba(cor_agente, 0); }
}
```

### 2.2 Movimento do Dot Entre Arquivos no Navegador

**Problema:** Se um agente muda de arquivo de foco, um dot que pisca em um arquivo e depois aparece em outro causa confusão.

**Solução — Transição em 3 fases:**
```
1. Dot no arquivo antigo: fade-out (opacity 1→0, 150ms)

2. Gap de 50ms (pausa perceptível — sinaliza "mudança")

3. Dot no arquivo novo: fade-in (opacity 0→1, 150ms)
   + highlight da linha do arquivo no tree por 800ms
   (background: rgba(cor_agente, 0.08) → transparent)

Total de transição: 350ms — rápido o suficiente para não ser lento,
lento o suficiente para o usuário perceber que houve uma mudança.
```

**Regra:** Dots de agentes diferentes nunca se animam simultaneamente no mesmo arquivo.
Se dois agentes estão no mesmo arquivo, os dois dots ficam estáticos lado a lado.

---

## 3. INLINE AGENT TAGS (No Editor CodeMirror 6)

### 3.1 Surgimento das Tags

**Gatilho:** Agente finaliza a geração de uma linha de código (evento `isLast: true` para aquele chunk).

**Princípio:** Tags surgem quando o conteúdo está estável, não durante streaming.
Surgimento durante streaming causaria re-layouts constantes e seria cognitivamente irritante.

```
Modo padrão (pós-round):
→ Todas as tags do round surgem simultâneas após o Lock do editor ser liberado
→ Animação: opacity 0→1 + translateX(-4px)→translateX(0)
→ Duração: 200ms, stagger de 20ms por linha (max 400ms total)
→ Efeito: parecem "encaixar" nas linhas do código

Modo streaming (preview ao vivo — opcional, ativável em settings):
→ Tag aparece na linha quando o token da linha é finalizado
→ SEM animação — surge diretamente (evita re-layout durante stream)
```

### 3.2 Conflito Simultâneo na Mesma Linha (A1 e A2 sugerem a mesma linha)

**Gatilho:** Dois agentes têm `code_proposal` com modificações na mesma linha `n`.

**Esta é a situação mais crítica de UX do editor — deve ser absolutamente clara.**

```
Estado Visual de Conflito:
1. A linha recebe um fundo dividido verticalmente:
   → Metade esquerda: rgba(139, 92, 246, 0.12) — violeta (A1)
   → Metade direita:  rgba(6, 182, 212, 0.12)  — ciano  (A2)
   → Borda esquerda da linha: 3px sólida em gradiente violeta→ciano

2. Duas mini-tags aparecem empilhadas (não sobrepostas):
   → [A1 PROP] — acima, violeta
   → [A2 CRIT] — abaixo, ciano
   → Separadas por 2px de gap

3. Hover na linha:
   → Tooltip expandido: "Conflito de Sugestão — A1 e A2 propõem versões diferentes"
   → Botões inline: [Ver A1] [Ver A2] [Aceitar A1] [Aceitar A2]

4. NÃO há animação de conflito — o estado visual estático comunica o conflito.
   Animação adicionaria ruído sobre informação já densa.
```

---

## 4. ESTADOS DE ERRO CRÍTICO — GRAMÁTICA DE PÂNICO

### 4.1 Taxonomia de Erros Críticos

| Tipo | Código | Gatilho | Nível |
|---|---|---|---|
| Sandbox Desconectada | `SANDBOX_DISCONNECT` | WebSocket perdida por > 5s | L3 |
| Falha de Rede (SSE) | `SSE_RECONNECT_FAIL` | 3 tentativas de reconexão falharam | L3 |
| Segurança Comprometida | `SECURITY_VIOLATION` | PATH_TRAVERSAL ou shell não-autorizado detectado | L3 ★ |
| Budget Esgotado | `BUDGET_EXCEEDED` | dailyBudgetUsd atingido | L2 |
| LoopDetector Ativado | `LOOP_DETECTED` | SimHash similarity >= threshold | L2 |

> **★ SECURITY_VIOLATION** é o único erro que ativa a "Gramática de Pânico Total".

### 4.2 Gramática de Pânico — SANDBOX_DISCONNECT / SSE_RECONNECT_FAIL

```
Duração total da sequência: 800ms entrada + estado persistido

T+0ms:   StatusBar → cor de fundo muda de #161b22 → #7f1d1d (vermelho escuro)
         Transição: 100ms. Intencional e visível.

T+100ms: Badge na StatusBar → "⚠ SANDBOX OFFLINE" em branco sobre vermelho
         Sem animação — surge diretamente (urgência não tolera delay)

T+200ms: Coluna 3 (Editor) → overlay semi-transparente
         background: rgba(0,0,0,0.6)
         Mensagem centralizada: "Conexão com Sandbox Perdida"
         Subtexto: "Tentando reconectar... (tentativa 1/3)"
         Transição: fade-in 200ms

T+400ms: Sidebar (Coluna 1) → dots de todos os agentes → fade para cinza
         Todos os AgentActivityIndicators → estado Idle (estático, cinza)

SEM: vibração (confunde com notificação de SO)
SEM: dessaturação global (muito disruptivo, dificulta leitura do estado)
SEM: som (ambiente de trabalho)

Resolução (reconexão bem-sucedida):
→ Overlay da Coluna 3 → fade-out 300ms
→ StatusBar → retorna à cor original em 200ms
→ Badge muda para "✓ SANDBOX ONLINE" em verde por 3s, depois some
→ Dots dos agentes → retornam aos seus estados anteriores
```

### 4.3 Gramática de Pânico Total — SECURITY_VIOLATION

> **Este é o único estado que justifica uma reação visual disruptiva.**
> O usuário deve entender IMEDIATAMENTE que uma tentativa de violação de segurança ocorreu.

```
Duração total da sequência: 1200ms entrada + estado persistido até confirmação manual

T+0ms:   Flash branco global: background-color do body → rgba(255,255,255,0.15) → 0
         Duração: 150ms (flash único, não repetido)

T+150ms: TopBar → fundo muda para #7f1d1d (vermelho escuro)
         Transição: 50ms (quase instantânea)

T+200ms: Modal de SEGURANÇA sobrepõe TODA a interface (z-index: 9999)
         Fundo: rgba(0,0,0,0.92) — quase opaco
         Borda: 2px sólida #ef4444

         Conteúdo do modal:
         ┌─────────────────────────────────────────┐
         │  🛡️  VIOLAÇÃO DE SEGURANÇA DETECTADA   │
         │  ─────────────────────────────────────  │
         │  Tipo: PATH_TRAVERSAL / SHELL_VIOLATION │
         │  Agente: technical_proposer             │
         │  Tentativa: /etc/passwd                 │
         │  ─────────────────────────────────────  │
         │  O agente foi isolado.                  │
         │  A sessão foi pausada para auditoria.   │
         │  ─────────────────────────────────────  │
         │  [ Ver Log de Auditoria ]  [ Encerrar ] │
         └─────────────────────────────────────────┘

T+400ms: Modal → leve shake horizontal (3px amplitude, 3 ciclos, 400ms)
         Propósito: confirmar que o modal é real e não um artefato de renderização

T+800ms: StatusBar → badge "🔴 SESSÃO BLOQUEADA — AUDITORIA REQUERIDA"
         Cor: vermelho, permanente até ação manual

NUNCA some automaticamente. Requer clique manual do usuário.
NUNCA permite continuar a sessão sem o usuário confirmar que viu.
```

---

## MATRIZ DE TRANSIÇÃO E ESTADOS DINÂMICOS

> Esta tabela é o contrato técnico entre a camada de eventos do servidor e a camada de reação visual.
> Cada linha é uma regra determinística: mesmo evento → mesma reação → sempre.

| # | Evento de Sistema | Fonte | Reação Visual da UI | Duração | Propósito Funcional (UX) |
|---|---|---|---|---|---|
| 01 | `HITL_GATE` (G1 — Plano) | SSE | Card slide-in base da C2 + borda âmbar no editor + pulsação 1Hz por 3 ciclos | 350ms entrada | Sinalizar pausa obrigatória; dirigir atenção ao card |
| 02 | `HITL_GATE` (G2 — Diff) | SSE | Card slide-in + borda azul + editor em readOnly + botão "Aceitar Todos" desabilitado | 350ms entrada | Indicar que o código está sob revisão, não editável |
| 03 | `HITL_DECISION {APPROVE}` | WS | Card slide-down fade-out + borda do editor some + editor volta a readWrite | 250ms saída | Confirmar que a aprovação foi registrada; restaurar fluxo |
| 04 | `HITL_DECISION {REJECT}` | WS | Card shake horizontal (3x, 10Hz) + borda vira vermelha + fade-out após 400ms | 650ms total | Comunicar que o gate foi recusado e o debate pode retomar |
| 05 | `FORCE_DECISION` (Impasse) | SSE | Card especial com gradiente avermelhado + ícone bifurcação + layout A vs B | 400ms entrada | Deixar claro que o consenso automático falhou; usuário decide |
| 06 | `AGENT_TOKEN` (streaming) | SSE | Dot do agente → pulse-fast (2Hz); cursor de texto pisca na área de output | ∞ enquanto ativo | Confirmar que o agente está produzindo tokens ativamente |
| 07 | Agente inicia raciocínio (pre-token) | Interno | Dot → pulse-slow (0.5Hz); nenhum cursor de texto ainda | ∞ enquanto ativo | Distinguir "pensando" de "escrevendo" — estados diferentes |
| 08 | Agente muda arquivo de foco | Interno | Dot fade-out no arquivo antigo (150ms) → pausa 50ms → fade-in no novo (150ms) | 350ms total | Evitar confusão sobre qual arquivo o agente está analisando |
| 09 | Dois agentes no mesmo arquivo | Interno | Dois dots estáticos lado a lado; sem animação | Estático | Informar co-presença sem causar confusão visual |
| 10 | Inline Tag surge (pós-round) | Interno | opacity 0→1 + translateX(-4px)→0, stagger 20ms por linha | 200ms + stagger | Indicar autoria do código sem interromper o streaming |
| 11 | Conflito de sugestão na linha N | Interno | Fundo bicolor na linha + duas tags empilhadas + hover mostra opções de resolução | Estático | Tornar o conflito imediatamente visível; não esconder a ambiguidade |
| 12 | `LOOP_DETECTED` | Interno | Badge na StatusBar "⚠ Loop Detectado" + agente pausado + dot → laranja estático | 200ms entrada | Alertar que o agente está em ciclo; não deixar o usuário descobrir sozinho |
| 13 | `SANDBOX_DISCONNECT` | WS perdida | StatusBar → vermelho escuro + overlay na C3 "Sandbox Offline" + dots → cinza | 800ms total | Comunicar perda de capacidade de execução sem destruir o contexto visível |
| 14 | Reconexão bem-sucedida | Interno | Overlay fade-out + StatusBar normaliza + badge "✓ Online" por 3s | 300ms saída | Confirmar que a crise passou; restaurar confiança no estado |
| 15 | `SECURITY_VIOLATION` | Interno | Flash branco global + TopBar vermelha + modal bloqueante com shake 3x | 1200ms entrada | Comunicar violação de segurança com máxima prioridade; nunca pode ser ignorada |
| 16 | `BUDGET_EXCEEDED` (diário) | Interno | Toast persistente "Budget diário atingido" + todas as sessões pausadas | Persistente | Prevenir custo inesperado; usuário deve agir conscientemente para continuar |
| 17 | `ROLLBACK_EVENT` (auto) | SSE | Banner temporário na C3 "↩ Rollback automático: Teste falhou" + editor atualiza | 400ms entrada | Informar que o código foi revertido; preparar usuário para novo debate |
| 18 | `DEBATE_COMPLETE` (merge) | SSE | Confetti sutil (10 partículas, 1s) + badge "✓ Merge Concluído" + botão Desfazer aparece | 1s animação | Celebração funcional: confirmar sucesso sem exagero |
| 19 | Gate timeout (sem ação do usuário > 30min) | Interno | Badge piscante "Gate aguardando há 30min" + notificação do SO (se permitido) | Piscante 1Hz | Lembrar usuário de gate pendente sem bloquear outros trabalhos |
| 20 | `STEER_AGENT` enviado | WS | Flash na linha de status do agente "→ Instrução recebida" + dot → pulse-wait | 200ms | Confirmar que a instrução foi registrada antes do próximo round |

---

## 5. CURVAS DE ANIMAÇÃO E TOKENS DE TEMPO

> Todas as animações do sistema devem usar apenas estas curvas. Consistência elimina entropia visual.

| Nome | Curva CSS | Uso |
|---|---|---|
| **Entrada** | `cubic-bezier(0.16, 1, 0.3, 1)` | Elementos que entram na tela (Gates, overlays, cards) |
| **Saída** | `cubic-bezier(0.7, 0, 0.84, 0)` | Elementos que saem da tela (dismissals, fade-outs) |
| **Feedback** | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Micro-interações de confirmação (botão ativado, tag encaixando) |
| **Pânico** | `linear` | Estados de erro crítico — sem suavização, urgência pura |

| Token | Valor | Uso |
|---|---|---|
| `--dur-micro` | `100ms` | Hover states, cor de botão |
| `--dur-fast` | `200ms` | Tags, badges, dots |
| `--dur-normal` | `350ms` | Cards, slides, overlays |
| `--dur-slow` | `600ms` | Modais completos, transições de estado major |
| `--dur-panic` | `50–150ms` | Estados L3 — rápido por necessidade |

---

## 6. REGRAS DE ELIMINAÇÃO (O Que NÃO Animar)

> Estas são animações que parecem intuitivas mas degradam a experiência.

| Animação Candidata | Decisão | Motivo |
|---|---|---|
| Dessaturação global em erro | ❌ Eliminada | Dificulta leitura de todos os elementos da UI simultaneamente |
| Vibração (shake) da janela inteira | ❌ Eliminada | Confunde com notificação do SO; inapropriado em tela grande |
| Som de alerta | ❌ Eliminada | Ambiente de trabalho; acessibilidade; controle do usuário |
| Animação de tokens chegando (streaming) | ❌ Eliminada | O texto já "digita" naturalmente; adicionar animação seria redundante |
| Partículas/confetti em erros | ❌ Eliminada | Ambiguidade semântica; reservado exclusivamente para sucesso |
| Tags pulsando continuamente após surgir | ❌ Eliminada | Distrai da leitura do código; tag comunica autoria por cor e forma, não movimento |

---

## 7. INTEGRAÇÃO COM O PROTOCOLO NEXUS

### Mapeamento de Eventos SSE → Reações Visuais (Contrato Técnico)

```typescript
// Frontend: src/lib/MotionController.ts
// O MotionController subscreve os eventos do SSETransport e dispara as reações visuais.
// É o único ponto de entrada para animações — nenhum componente React anima diretamente.

export class MotionController {
  onDebateEvent(event: DebateEvent): void {
    switch (event.type) {
      case 'HITL_GATE':
        this.triggerGateEntrance(event.payload.gateType, event.payload.gateId);
        break;
      case 'AGENT_TOKEN':
        this.setAgentState(event.payload.agentId, 'WRITING');
        break;
      case 'CONVERGENCE':
        this.setAllAgentsState('IDLE');
        break;
      case 'DEBATE_COMPLETE':
        this.triggerSuccessCelebration();
        break;
      case 'ROLLBACK_EVENT':
        this.triggerRollbackBanner(event.payload.failureType);
        break;
    }
  }

  onSecurityViolation(violation: SecurityViolation): void {
    // L3 — Gramática de Pânico Total
    this.triggerPanicMode(violation);
  }

  onSandboxDisconnect(): void {
    // L3 — Gramática de Pânico Parcial
    this.triggerSandboxOffline();
  }
}
```

---

**FIM DO DOCUMENTO — 08-MOTION-GRAMMAR-AND-DYNAMIC-STATES.md**
> *Este documento é o contrato entre o estado do sistema e o comportamento visual da interface.*
> *Toda implementação de UI deve referenciar este arquivo antes de adicionar qualquer animação.*

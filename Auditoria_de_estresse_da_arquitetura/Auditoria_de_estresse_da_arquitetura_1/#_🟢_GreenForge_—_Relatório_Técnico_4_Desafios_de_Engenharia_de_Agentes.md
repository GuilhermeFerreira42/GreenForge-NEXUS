veja # 🟢 GreenForge — Relatório Técnico: 4 Desafios de Engenharia de Agentes
Vou disparar todas as buscas em paralelo para cobrir os 4 desafios simultaneamente!Dados coletados com profundidade máxima nos 4 eixos! Montando o relatório técnico completo agora.

---

# 🟢 GreenForge — Relatório Técnico: 4 Desafios de Engenharia de Agentes
## Arquitetura, Sincronização, Compressão e Recuperação de Erros

> **Premissa Técnica:** Os 4 problemas aqui abordados são interdependentes. Um loop infinito gera tokens que explodem o contexto, que exige compressão, que pode causar drift, que gera erros pós-aprovação que precisam de rollback. O GreenForge precisa de soluções em camadas — não soluções pontuais.

---

## 🔄 DESAFIO 1 — Prevenção de Loop Infinito em Workflows Agênticos

### 1.1 — O Problema: Por Que `max_iterations` Não Basta

O padrão mais problemático em sistemas agênticos é o loop. Não o tipo que escrevemos em código, mas o tipo que emerge quando o processo de tomada de decisão do agente cria uma dependência circular.

O agente não está alucinando ou sendo descuidado. Ele está seguindo um processo lógico: identificar o próximo problema mais importante, tentar uma solução, verificar resultados, repetir. O problema é que lhe falta a meta-consciência para reconhecer que está em loop.

O caso documentado mais caro: um agente tentando corrigir um problema de migração de banco de dados. O problema era simples: uma constraint de foreign key precisava ser dropada antes de modificar a coluna. O agente sabia disso — havia lido a mensagem de erro múltiplas vezes. Mesmo assim, passou por 47 iterações tentando variações do mesmo comando `ALTER TABLE`, cada uma com sintaxe levemente diferente, queimando tokens premium em um aprendizado de $30 para um problema de $0.50.

### 1.2 — Estratégias Avançadas Além de `max_iterations`

#### **Estratégia A: Escalation Tools (ADK Pattern — Google)**

Quando o agente chama uma tool de escalation, a interrupção acontece durante o turno do agente, interrompendo o fluxo normal. Esse padrão é poderoso porque a decisão de sair é uma ação deliberada e observável no trace de execução do agente.

Uma abordagem alternativa mais programática: instrua o code-reviewer a emitir uma keyword simples (como `"EXIT"`) quando estiver concluído. Então, use um callback no agente seguinte para verificar essa keyword.

#### **Estratégia B: Safeguards em Camadas (Spend + Rate + Timeout)**

Para garantir segurança e eficiência, agentes são equipados com salvaguardas como rate limits, iteration caps, timeouts e spend limits, que previnem autonomia descontrolada e consumo de recursos irrestrito. Se o agente encontra um cenário que requer intervenção humana ou excede suas fronteiras de segurança, mecanismos de escalation como HITL triggers e fallback logic são ativados.

#### **Estratégia C: Hash-Based Stagnation Detector (Novo Padrão 2025)**

O padrão mais sofisticado detecta que o agente está em loop sem depender de contagem de iterações:

```typescript
// src/server/LoopDetector.ts
// Implementa MÚLTIPLAS estratégias de prevenção além de max_iterations

export class LoopDetector {
  
  // ─── Estratégia 1: Content Hash Fingerprinting ──────────────────────
  // Detecta quando o agente está gerando outputs semanticamente idênticos
  private outputHashes: Map<string, number[]> = new Map();
  
  detectContentLoop(agentId: string, output: string): LoopSignal {
    const hash = this.hashContent(output);
    const history = this.outputHashes.get(agentId) || [];
    
    const occurrences = history.filter(h => h === hash).length;
    
    if (occurrences >= 2) {
      return {
        type: 'CONTENT_LOOP',
        severity: 'critical',
        message: `Agente ${agentId} gerou output idêntico ${occurrences + 1}x`,
        recommendation: 'ESCALATE_TO_JUDGE'
      };
    }
    
    history.push(hash);
    // Mantém apenas as últimas 10 iterações (sliding window)
    this.outputHashes.set(agentId, history.slice(-10));
    return { type: 'CLEAR' };
  }
  
  // ─── Estratégia 2: Cost Cap com Budget Burning Alert ────────────────
  // Para ANTES de atingir o limite, não depois
  private sessionCosts: Map<string, number> = new Map();
  
  checkCostBudget(sessionId: string, tokensUsed: number, model: string): BudgetSignal {
    const costPerToken = MODEL_COSTS[model] || 0.0000015;
    const sessionCost = (this.sessionCosts.get(sessionId) || 0) + (tokensUsed * costPerToken);
    this.sessionCosts.set(sessionId, sessionCost);
    
    // Alerta em 70% do budget — não em 100%
    if (sessionCost > SESSION_BUDGET_USD * 0.70) {
      return { 
        status: 'WARNING', 
        consumed: sessionCost, 
        budget: SESSION_BUDGET_USD,
        action: 'TRIGGER_COMPRESSION'  // Comprime contexto antes de parar
      };
    }
    
    if (sessionCost > SESSION_BUDGET_USD) {
      return { 
        status: 'EXCEEDED', 
        action: 'FORCE_JUDGE_SYNTHESIS'  // Força síntese do Árbitro com o que tem
      };
    }
    
    return { status: 'OK', consumed: sessionCost };
  }
  
  // ─── Estratégia 3: Global Context State Interrupter ─────────────────
  // Verifica se o ESTADO DO SISTEMA mudou entre iterações
  // Se não mudou: o debate está em deadlock, não convergindo
  private stateSnapshots: Map<string, string> = new Map();
  
  detectStateDeadlock(sessionId: string, currentState: DebateState): LoopSignal {
    const prevStateHash = this.stateSnapshots.get(sessionId);
    const currentStateHash = this.hashContent(JSON.stringify({
      openIssues: currentState.openHighSeverityIssues,
      proposerConfidence: Math.floor(currentState.proposerConfidence * 10), // bucket de 10%
      criticVerdict: currentState.criticVerdict
    }));
    
    if (prevStateHash === currentStateHash) {
      return {
        type: 'STATE_DEADLOCK',
        severity: 'high',
        message: 'Estado do debate não evoluiu entre rodadas',
        recommendation: 'INVOKE_TIEBREAKER'
      };
    }
    
    this.stateSnapshots.set(sessionId, currentStateHash);
    return { type: 'CLEAR' };
  }
  
  // ─── Estratégia 4: Erro Pattern Repetition Detector ─────────────────
  // Detecta quando o mesmo erro aparece em múltiplas rodadas consecutivas
  private errorPatterns: Map<string, string[]> = new Map();
  
  detectErrorLoop(agentId: string, errorMessage: string): LoopSignal {
    const patterns = this.errorPatterns.get(agentId) || [];
    const normalizedError = errorMessage.replace(/line \d+|column \d+|0x[a-f0-9]+/gi, 'X');
    
    const sameErrorCount = patterns.filter(e => e === normalizedError).length;
    
    if (sameErrorCount >= 2) {
      return {
        type: 'ERROR_LOOP',
        severity: 'critical',
        message: `Mesmo erro encontrado ${sameErrorCount + 1}x: ${normalizedError}`,
        recommendation: 'ESCALATE_TO_HUMAN'
      };
    }
    
    this.errorPatterns.set(agentId, [...patterns, normalizedError].slice(-5));
    return { type: 'CLEAR' };
  }
  
  private hashContent(content: string): number {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }
}

// Constantes de configuração (ajustáveis por projeto)
const SESSION_BUDGET_USD = 0.50;  // Hard cap por sessão de debate
const MODEL_COSTS: Record<string, number> = {
  'gemini-2.5-pro':        0.00000125,
  'gemini-2.5-flash':      0.00000015,
  'gemini-2.5-flash-lite': 0.00000008,
};
1.3 — Fluxo de Decisão Integrado Anti-Loop
DEBATE ROUND N+1 começa
         │
         ▼
┌────────────────────────┐
│  LoopDetector.check()  │
│  Roda TODAS as 4       │
│  estratégias em paralelo│
└────────┬───────────────┘
         │
    ┌────▼────────────┐
    │ Algum sinal     │
    │ CRITICAL/HIGH?  │
    └────┬────────────┘
         │
   ┌─────┴──────┐
   │            │
 [NÃO]       [SIM]
   │            │
   ▼            ▼
Continue    Qual tipo?
round       ──────────
            CONTENT_LOOP → Judge força síntese imediata
            STATE_DEADLOCK → Invoke Tiebreaker (3º modelo)
            ERROR_LOOP → Escalate to HITL (usuário decide)
            COST_EXCEEDED → Force synthesis com aviso de custo
1.4 — Bibliotecas e Tecnologias Recomendadas
Solução
Biblioteca
Função
State Machine
xstate (TypeScript)
Controle formal de transições de estado do debate
Cost Tracking
tokencount + custom budget
Estimativa de tokens antes e depois de cada call
Loop Detection
Custom LoopDetector (acima)
Hash fingerprinting + state deadlock detection
Timeout Rígido
p-timeout (npm)
Cancela calls que excedem N segundos
ADK LoopAgent
Google ADK para Java/Python
LoopAgent nativo com max_iterations + escalation tools
--------------------------------------------------------------------------------
📡 DESAFIO 2 — Sincronização SSE + WebSocket: Ordem Cronológica Perfeita
2.1 — O Problema: Race Conditions entre Dois Canais
No GreenForge, eventos chegam de duas fontes distintas:
SSE → tokens de agente, status de debate (server → browser, unidirecional)
WebSocket → comandos de arquivo, stdin de terminal (bidirecional)
O problema concreto: se o agente emite via SSE "A_TA propôs RS256" (evento #42) enquanto o WebSocket simultaneamente entrega "arquivo jwt.ts foi criado" (evento #43), a UI pode renderizá-los fora de ordem se houver latência diferencial.
Em sistemas com milhares de usuários e múltiplos broadcasts concorrentes, mensagens podem chegar fora de ordem. Use uma fila por sessão e uma goroutine/worker único para manter sequência.
2.2 — Solução: Sequence Numbers + Buffered Reordering
O schema de mensagem validado: { "user_id": "u123", "sequence_id": 42, "message": "Hello world", "timestamp": "2025-11-23T21:15:00Z" }. Incremente sequence_id em 1 para cada nova mensagem e persista-o no banco de dados.
// src/server/EventSequencer.ts
// Garante ordem cronológica perfeita entre eventos SSE e WebSocket

export class EventSequencer {
  private globalSequence = 0;
  
  /**
   * Todo evento emitido — seja via SSE ou WS — recebe
   * um sequence_id global e monotonicamente crescente.
   * Isso é a "fonte única de verdade" para ordenação.
   */
  stamp<T extends object>(event: T, channel: 'SSE' | 'WS'): StampedEvent<T> {
    return {
      ...event,
      _meta: {
        seq: ++this.globalSequence,
        channel,
        serverTimestamp: Date.now(),
        sessionId: (event as any).sessionId
      }
    };
  }
}

// src/client/hooks/useOrderedEventStream.ts
// Buffer de reordenação no cliente Next.js

export function useOrderedEventStream(sessionId: string) {
  const [orderedEvents, setOrderedEvents] = useState<StampedEvent<any>[]>([]);
  
  // Buffer para eventos fora de ordem
  const pendingBuffer = useRef<Map<number, StampedEvent<any>>>(new Map());
  const nextExpectedSeq = useRef(1);
  
  const processEvent = useCallback((event: StampedEvent<any>) => {
    const { seq } = event._meta;
    
    if (seq === nextExpectedSeq.current) {
      // ✅ Evento na ordem esperada — processa imediatamente
      setOrderedEvents(prev => [...prev, event]);
      nextExpectedSeq.current++;
      
      // ✅ Drena o buffer de eventos que chegaram "adiantados"
      drainBuffer();
      
    } else if (seq > nextExpectedSeq.current) {
      // ⏳ Evento chegou adiantado — armazena no buffer
      pendingBuffer.current.set(seq, event);
      
      // Se o buffer crescer demais, força processamento após timeout
      if (pendingBuffer.current.size > 10) {
        setTimeout(() => forceFlushBuffer(), 200);
      }
      
    } else {
      // ♻️ Evento duplicado (seq < expected) — ignora silenciosamente
      console.warn(`[EventSequencer] Evento duplicado ignorado: seq=${seq}`);
    }
  }, []);
  
  const drainBuffer = useCallback(() => {
    while (pendingBuffer.current.has(nextExpectedSeq.current)) {
      const buffered = pendingBuffer.current.get(nextExpectedSeq.current)!;
      pendingBuffer.current.delete(nextExpectedSeq.current);
      setOrderedEvents(prev => [...prev, buffered]);
      nextExpectedSeq.current++;
    }
  }, []);
  
  const forceFlushBuffer = useCallback(() => {
    // Último recurso: se após 200ms ainda há gaps, processa em ordem de seq
    const bufferedEvents = Array.from(pendingBuffer.current.values())
      .sort((a, b) => a._meta.seq - b._meta.seq);
    
    pendingBuffer.current.clear();
    setOrderedEvents(prev => [...prev, ...bufferedEvents]);
    nextExpectedSeq.current = bufferedEvents[bufferedEvents.length - 1]._meta.seq + 1;
  }, []);
  
  useEffect(() => {
    // ─── SSE: Debate feed (tokens, status) ──────────────────────────
    const eventSource = new EventSource(`/events/debate/${sessionId}`);
    
    eventSource.addEventListener('DEBATE_EVENT', (e) => {
      const event = JSON.parse(e.data) as StampedEvent<any>;
      processEvent(event);  // ← Passa pelo sequenciador
    });
    
    // ─── WebSocket: File commands, terminal ─────────────────────────
    const socket = io('http://localhost:5174', {
      query: { sessionId }
    });
    
    socket.on('FILE_EVENT', (event: StampedEvent<any>) => {
      processEvent(event);  // ← Mesma fila de reordenação
    });
    
    socket.on('TERMINAL_OUTPUT', (event: StampedEvent<any>) => {
      processEvent(event);  // ← Terminal também sequenciado
    });
    
    return () => {
      eventSource.close();
      socket.disconnect();
    };
  }, [sessionId, processEvent]);
  
  return { orderedEvents };
}
2.3 — Schema de Evento Unificado (SSE + WS, mesmo formato)
interface StampedEvent<T> {
  // Payload do evento (específico por tipo)
  type: 'AGENT_TOKEN' | 'FILE_CREATED' | 'FILE_EDITED' | 
        'DEBATE_STATUS' | 'TERMINAL_OUTPUT' | 'HITL_GATE';
  payload: T;
  
  // Metadados de sequenciamento (adicionados pelo EventSequencer)
  _meta: {
    seq: number;              // ← Sequence number global, monotônico
    channel: 'SSE' | 'WS';   // ← Canal de origem
    serverTimestamp: number;  // ← Timestamp Unix do servidor
    sessionId: string;
  };
}

// Exemplo de dois eventos que podem chegar fora de ordem:
const sseEvent: StampedEvent<AgentTokenPayload> = {
  type: 'AGENT_TOKEN',
  payload: { agentId: 'A_TA', token: 'RS256', round: 2 },
  _meta: { seq: 42, channel: 'SSE', serverTimestamp: 1704067200000, sessionId: 'gf-001' }
};

const wsEvent: StampedEvent<FileEventPayload> = {
  type: 'FILE_CREATED',
  payload: { path: 'src/auth/jwtMiddleware.ts', size: 1240 },
  _meta: { seq: 43, channel: 'WS', serverTimestamp: 1704067200050, sessionId: 'gf-001' }
};
// Independente de qual chegar primeiro no browser, a UI sempre renderiza 42 → 43
2.4 — Bibliotecas Recomendadas
Biblioteca
Função
socket.io (cliente + servidor)
WebSocket com reconnection automático
EventSource nativo
SSE com Last-Event-ID para replay
immer
Atualização imutável do state de eventos no React
zustand
Store global para orderedEvents sem re-renders desnecessários
--------------------------------------------------------------------------------
🧠 DESAFIO 3 — Compressão de Contexto Agêntico (1M+ Tokens)
3.1 — O Problema: Context Drift Mata Antes do Limite
À medida que os agentes assumem tarefas mais longas e complexas, o crescimento ilimitado do histórico de conversas se torna um problema fundamental de engenharia. Limites de janela de contexto são um teto rígido; os custos de token se compõem a cada turno; e a qualidade de contexto degradada — "context drift" — silenciosamente compromete o raciocínio do agente antes mesmo do limite ser atingido.
Context drift mata agentes antes dos limites de contexto. Quase 65% das falhas de AI empresarial em 2025 foram atribuídas a context drift ou perda de memória durante raciocínio multi-passo — não à exaustão bruta de contexto.
A 95% de confiabilidade por step em um workflow de 20 passos, a taxa de sucesso combinada cai para apenas 36%. Um desalinhamento de 2% introduzido no início de uma cadeia pode se compor em uma taxa de falha de 40% ao final. Isso significa que a qualidade do contexto — não apenas a quantidade — é a alavanca primária de confiabilidade.
3.2 — As 4 Estratégias de Compressão Validadas (2025/2026)
Em 2025–2026, o campo convergiu em um conjunto concreto de técnicas de compressão: anchored iterative summarization, failure-driven guideline optimization (ACON), e provider-native compaction APIs.
Estratégia 1: Sliding Window (Mais Simples)
A abordagem mais simples: descartar mensagens mais antigas que N turnos. Rápido, mas perde continuidade. Melhor usado apenas para sessões curtas sem dependências de longo prazo.
Estratégia 2: Recursive Summarization (Rolling LLM)
Uma abordagem de sumarização recursiva: o padrão de resumo em execução que é atualizado repetidamente: resumo antigo + novo chunk de diálogo → novo resumo, para manter coerência em conversas muito longas sem manter todos os turnos.
É disparada por estado: "quando atingirmos 70% do token budget, resumir a parte mais antiga." É por isso que frameworks expõem limites de token e fazem roll-ups automáticos. Isso é visto muito em coding agents como Claude Code ou Codex.
Porém: quando o contexto excede um threshold, resume o histórico inteiro do zero. Produz um resumo limpo e coerente, mas tem dois modos de falha: detalhes derivam ou desaparecem ao longo de múltiplos ciclos de compressão; e é caro — precisa processar o histórico completo cada vez.
Estratégia 3: Anchored Iterative Summarization (Factory Pattern — Melhor Prático)
A ideia-chave: não regenere o resumo completo — estenda-o. Quando a compressão é acionada, identifique apenas o span recém-descartado (mensagens sendo evicted). A Factory estrutura sua âncora em torno de quatro campos: intent, changes made, decisions taken, e next steps. Sua avaliação mostrou que essa abordagem alcança maior acurácia (4.04 vs. 3.74 da Anthropic e 3.43 da OpenAI) para preservar detalhes técnicos como file paths e mensagens de erro ao longo de ciclos de compressão.
Estratégia 4: ACON — Failure-Driven Guideline Optimization (Estado da Arte Acadêmico)
ACON demonstra vantagens claras: reduz uso de memória em 26–54% (tokens de pico) enquanto mantém amplamente a performance da tarefa; permite distilação efetiva do compressor de contexto em modelos menores, preservando 95% da acurácia do professor em todos os benchmarks.
Importante: ACON é gradient-free, não requerendo atualizações de parâmetros, tornando-o diretamente utilizável com modelos closed-source ou de produção.
3.3 — Implementação: Protocol de Compressão Dialética para o GreenForge
O desafio específico do GreenForge é preservar a Síntese Dialética — não apenas os fatos técnicos, mas por que o Árbitro escolheu RS256 em vez de HS256, qual argumento do Crítico foi decisivo, etc.
// src/server/ContextCompressor.ts
// Protocolo de compressão específico para debates multi-agente
// Preserva a Síntese Dialética (o "por quê" das decisões)

export interface DebateSummary {
  // ─── Âncora Dialética (NUNCA comprimida) ────────────────────────────
  dialecticalAnchor: {
    originalTask: string;
    keyDecisions: Array<{
      decision: string;          // "Usar RS256 em vez de HS256"
      proposedBy: string;        // "A_TA — Round 1"
      rejectedBy: string;        // "A_QA — Round 1 (severity: HIGH)"
      reason: string;            // "HS256 inadequado para sistemas distribuídos"
      arbitratorRationale: string; // "RS256 com cache Redis mitiga o problema"
    }>;
    openConstraints: string[];   // Decisões que ainda impactam rodadas futuras
    approvedSolutions: string[]; // O que já foi validado e NÃO deve ser revertido
  };
  
  // ─── Resumo Comprimido (Rolling) ──────────────────────────────────
  compressedHistory: string;     // Resumo incremental das rodadas anteriores
  
  // ─── Rodadas Recentes (Moving Window) ─────────────────────────────
  recentRounds: DebateRound[];   // Últimas N rodadas (não comprimidas)
  
  // ─── Metadados de Controle ────────────────────────────────────────
  compressionMeta: {
    originalTokenCount: number;
    compressedTokenCount: number;
    compressionRatio: number;
    lastCompressedAt: number;    // Round number
    driftRiskScore: number;      // 0.0 - 1.0 (acima de 0.7 = trigger re-anchor)
  };
}

export class ContextCompressor {
  
  // Threshold: comprimir quando atingir 70% do token budget
  private COMPRESSION_THRESHOLD = 0.70;
  private WINDOW_SIZE = 2;  // Manter últimas 2 rodadas sem comprimir
  
  /**
   * Compressão Adaptativa: só comprime o que precisa ser comprimido.
   * Preserva a Síntese Dialética intacta — nunca comprime as decisões-chave.
   */
  async compress(
    currentContext: DebateContext,
    tokenBudget: number,
    geminiClient: GeminiClient
  ): Promise<DebateContext> {
    
    const currentTokens = await this.countTokens(currentContext);
    const usageRatio = currentTokens / tokenBudget;
    
    if (usageRatio < this.COMPRESSION_THRESHOLD) {
      return currentContext;  // Não precisa comprimir ainda
    }
    
    console.log(`[ContextCompressor] Comprimindo: ${usageRatio * 100}% do budget`);
    
    // Separa o que NUNCA deve ser comprimido
    const anchor = this.extractDialecticalAnchor(currentContext);
    
    // Identifica rounds que PODEM ser comprimidos (os mais antigos)
    const roundsToCompress = currentContext.rounds.slice(0, -this.WINDOW_SIZE);
    const recentRounds = currentContext.rounds.slice(-this.WINDOW_SIZE);
    
    // Gera resumo incremental (Factory Pattern: estende o resumo anterior)
    const newSummary = await this.generateIncrementalSummary(
      currentContext.previousSummary,
      roundsToCompress,
      anchor,
      geminiClient
    );
    
    const compressedContext: DebateContext = {
      ...currentContext,
      // Âncora dialética INTACTA (nunca comprimida)
      dialecticalAnchor: anchor,
      
      // Resumo incremental substituindo rounds antigos
      previousSummary: newSummary,
      
      // Apenas rodadas recentes mantidas completas
      rounds: recentRounds,
      
      // Metadados de compressão
      compressionLog: [
        ...(currentContext.compressionLog || []),
        {
          round: currentContext.rounds.length,
          originalTokens: currentTokens,
          compressedTokens: await this.countTokens({ 
            ...currentContext, 
            rounds: recentRounds, 
            previousSummary: newSummary 
          }),
          timestamp: Date.now()
        }
      ]
    };
    
    return compressedContext;
  }
  
  /**
   * Âncora Dialética: o coração da Síntese Dialética.
   * Preserva EXATAMENTE o que o Árbitro precisará em rodadas futuras.
   */
  private extractDialecticalAnchor(context: DebateContext): DialecticalAnchor {
    const allIssues = context.rounds.flatMap(r => r.critic?.issues || []);
    const resolvedHighIssues = allIssues.filter(i => i.severity === 'high' && i.status === 'resolved');
    
    return {
      originalTask: context.task,
      
      // Apenas decisões HIGH que foram resolvidas (impactam o design final)
      keyDecisions: resolvedHighIssues.map(issue => ({
        decision: issue.suggested_fix || 'N/A',
        proposedBy: `${context.rounds[0]?.proposer.agentId} — Round 1`,
        rejectedBy: `${issue.agentId} — Round ${issue.round}`,
        reason: issue.description,
        arbitratorRationale: context.rounds
          .find(r => r.judgeCheck?.decision === 'CONVERGE')
          ?.judgeCheck?.synthesis || 'N/A'
      })),
      
      // Constraints que ainda estão em jogo
      openConstraints: context.rounds
        .flatMap(r => r.critic?.issues || [])
        .filter(i => i.severity === 'high' && i.status === 'open')
        .map(i => i.description),
      
      // Soluções aprovadas (não podem ser revertidas em rounds futuros)
      approvedSolutions: resolvedHighIssues.map(i => i.suggested_fix || '')
    };
  }
  
  private async generateIncrementalSummary(
    previousSummary: string,
    roundsToCompress: DebateRound[],
    anchor: DialecticalAnchor,
    geminiClient: GeminiClient
  ): Promise<string> {
    
    const compressionPrompt = `
Você é um compressor de contexto de debate técnico.
Sua função é ESTENDER o resumo anterior com o novo material — NÃO regenerar do zero.

RESUMO ANTERIOR:
${previousSummary || "(nenhum — primeira compressão)"}

NOVAS RODADAS PARA COMPRIMIR:
${JSON.stringify(roundsToCompress, null, 2)}

ÂNCORA DIALÉTICA (NUNCA PERCA ESSES DADOS):
${JSON.stringify(anchor, null, 2)}

INSTRUÇÕES OBRIGATÓRIAS:
1. Preserve EXATAMENTE todos os dados da âncora dialética
2. Mantenha: file paths, nomes de tecnologias, decisões de segurança
3. Descarte: tokens de raciocínio intermediário, perguntas retóricas
4. Formato: JSON estruturado com campos: summary, key_facts[], decisions[]
5. Máximo: 500 tokens (compressão de pelo menos 50%)
    `;
    
    const response = await geminiClient.generate(compressionPrompt, {
      model: 'gemini-2.5-flash-lite',  // Modelo barato para compressão
      temperature: 0.1,                 // Mínima criatividade na compressão
      maxTokens: 600
    });
    
    return response.text;
  }
  
  private async countTokens(context: DebateContext): Promise<number> {
    return JSON.stringify(context).length / 4;  // Aproximação: 4 chars/token
  }
}
3.4 — Trigger de Compressão: Quando Ativar
CONTEXTO DO DEBATE
       │
       ▼
   countTokens()
       │
   ┌───▼────────────┐
   │ usage < 70%?   │──[SIM]──► Continue sem compressão
   └───┬────────────┘
       │ [NÃO]
       ▼
   Extract DialecticalAnchor (NUNCA comprime isso)
       │
       ▼
   Compress rounds [0..N-2] com Rolling Summary
       │
       ▼
   Keep rounds [N-1, N] intactos (Moving Window)
       │
       ▼
   Verifica drift: driftRiskScore > 0.7?
       │
   ┌───▼────────────┐
   │ Drift alto?    │──[SIM]──► Re-anchor + notifica Árbitro
   └───┬────────────┘
       │ [NÃO]
       ▼
   Compressão concluída — continue debate
3.5 — Bibliotecas Recomendadas
Biblioteca
Função
tiktoken (JS port)
Contagem exata de tokens OpenAI/Gemini
@google/generative-ai SDK
Contagem nativa de tokens Gemini
chonkie (Python)
Chunking semântico avançado
LLMLingua (Python/API)
Token-level pruning com budget control
--------------------------------------------------------------------------------
🔁 DESAFIO 4 — Rollback Automático Pós-Aprovação Humana
4.1 — O Problema: Por Que Rollbacks Agênticos São Diferentes
Rollbacks de banco de dados tradicionais quebram quando agentes AI escrevem em produção em velocidade de máquina através de sistemas distribuídos. Isso requer uma mudança arquitetural para tornar o estado escrito por agentes recuperável.
A insight crítica é que transações compensatórias não são inversas perfeitas. Você pode reverter um reembolso, mas não pode "des-enviar" um email. Você pode emitir uma nota de correção, mas o cliente já viu o original. É por isso que o design de compensação acontece no tempo de arquitetura, não no tempo de incidente.
O caso mais documentado de rollback mal-projetado: durante uma demo executiva ao vivo, um agente AI de coding deletou um banco de dados inteiro de produção. A correção não foi um rollback inteligente — foi uma restauração de 4 horas a partir de backups. A empresa havia dado ao agente execução SQL irrestrita em produção, e quando o agente "entrou em pânico", executou DROP TABLE sem gate de confirmação.
4.2 — O Padrão de Rollback Baseado em Checkpoints (Claude Code Reference)
Como explica Denis Volkhonskiy, SWE Agent Advocate na Nebius Academy: "Na maioria dos casos, é melhor fazer rollback: dessa forma você economiza tokens e tem melhor output com menos alucinações." Ele fala especificamente sobre o sistema de checkpoint do Claude Code, que automaticamente salva o estado do código antes de cada mudança e habilita rewind instantâneo via o comando /rewind.
Desenvolvedores querem confiança de que podem perseguir tarefas ambiciosas em larga escala sabendo que sempre podem retornar a um estado conhecido-bom. Isso não é apenas sobre git. Checkpoints precisam capturar contexto de conversa, outputs de ferramentas, e estados intermediários que o controle de versão tradicional não rastreia.
4.3 — O Protocolo ATP (Automation Trust Protocol): Verificação + Rollback
O Automation Trust Protocol (ATP) é um padrão para sistemas de automação comunicarem risco, garantirem accountability, e habilitarem execução segura de ações automatizadas entre qualquer plataforma. Pense nele como o OAuth trouxe confiança para autorização.
O schema de verificação inclui verificação de consistência de estado, efeitos downstream, e ausência de consequências não intencionais. Se a verificação falha, o protocolo habilita rollback para um estado estável anterior. Isso é alcançado via transações compensatórias ou mecanismos de restauração de estado.
4.4 — Implementação: Sistema de Rollback por Camadas para o GreenForge
// src/server/RollbackManager.ts
// Sistema de rollback em 4 camadas para o GreenForge

export class RollbackManager {
  
  /**
   * CAMADA 1: Checkpoint Automático (ANTES de qualquer escrita)
   * Executado pelo AgentEventBridge antes de aplicar código aprovado
   */
  async createCheckpoint(sessionId: string, context: RollbackContext): Promise<string> {
    const checkpointId = `ckpt-${sessionId}-${Date.now()}`;
    
    // 1a. Snapshot do Git (código)
    const gitCommit = execSync(
      `git -C ${context.worktreePath} stash push -m "checkpoint:${checkpointId}"`
    ).toString().trim();
    
    // 1b. Snapshot do contexto do debate (memória do agente)
    const debateSnapshot: DebateSnapshot = {
      checkpointId,
      sessionId,
      timestamp: Date.now(),
      gitRef: gitCommit,
      
      // Estado completo do debate (para reinjetar no agente pós-rollback)
      debateState: {
        rounds: context.debateRounds,
        dialecticalAnchor: context.dialecticalAnchor,
        approvedDecisions: context.approvedDecisions,
        openIssues: context.openIssues
      },
      
      // Estado do filesystem (para restauração precisa)
      filesnapshot: await this.snapshotFiles(context.affectedFiles, context.worktreePath),
      
      // Metadados para diagnóstico
      metadata: {
        approvedAt: Date.now(),
        approvedBy: 'user',  // Guilherme
        judgeConfidence: context.judgeConfidence,
        roundsCompleted: context.debateRounds.length
      }
    };
    
    // Persiste o snapshot (SQLite local)
    await this.db.saveCheckpoint(debateSnapshot);
    
    console.log(`[RollbackManager] ✅ Checkpoint criado: ${checkpointId}`);
    return checkpointId;
  }
  
  /**
   * CAMADA 2: Error Detection (após execução do código aprovado)
   * Monitora sinais de falha: falha de testes, exceções em runtime, etc.
   */
  async monitorPostApproval(
    checkpointId: string,
    context: RollbackContext
  ): Promise<MonitoringResult> {
    
    const verificationResults = await Promise.allSettled([
      this.runTests(context.worktreePath),
      this.runLinter(context.worktreePath),
      this.runTypeCheck(context.worktreePath),
      this.checkRuntimeErrors(context.worktreePath)
    ]);
    
    const failures = verificationResults
      .filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.passed))
      .map((r, i) => ({
        check: ['tests', 'linter', 'typecheck', 'runtime'][i],
        error: r.status === 'rejected' ? r.reason : (r as any).value.error
      }));
    
    if (failures.length > 0) {
      console.log(`[RollbackManager] ❌ ${failures.length} verificações falharam após aprovação`);
      
      // Triggera rollback automático com diagnóstico
      return {
        status: 'FAILED',
        failures,
        recommendation: 'ROLLBACK_AND_RETRY',
        checkpointId
      };
    }
    
    return { status: 'PASSED', checkpointId };
  }
  
  /**
   * CAMADA 3: Rollback Automático com Diagnóstico
   * Restaura estado E informa o agente do motivo exato da falha
   */
  async rollback(checkpointId: string, failures: FailureReport[]): Promise<RollbackResult> {
    const checkpoint = await this.db.getCheckpoint(checkpointId);
    
    if (!checkpoint) {
      throw new Error(`Checkpoint não encontrado: ${checkpointId}`);
    }
    
    console.log(`[RollbackManager] 🔄 Iniciando rollback para: ${checkpointId}`);
    
    // 3a. Restaura o código via Git
    execSync(`git -C ${checkpoint.worktreePath} stash pop`);
    
    // 3b. Restaura arquivos que foram criados (não existiam no checkpoint)
    for (const file of checkpoint.filesnapshot.created) {
      await fs.unlink(path.join(checkpoint.worktreePath, file)).catch(() => {});
    }
    
    // 3c. Restaura arquivos editados ao estado anterior
    for (const file of checkpoint.filesnapshot.edited) {
      await fs.writeFile(
        path.join(checkpoint.worktreePath, file.path),
        file.previousContent
      );
    }
    
    // 3d. Gera diagnóstico estruturado para o agente
    const diagnosis = await this.generateAgentDiagnosis(
      checkpoint.debateState,
      failures,
      checkpoint.metadata
    );
    
    console.log(`[RollbackManager] ✅ Rollback concluído`);
    
    return {
      status: 'ROLLED_BACK',
      checkpointId,
      restoredTo: checkpoint.metadata.approvedAt,
      agentDiagnosis: diagnosis  // ← O agente recebe isso como contexto para nova rodada
    };
  }
  
  /**
   * CAMADA 4: Diagnóstico para o Agente
   * A parte mais crítica: informar ao agente EXATAMENTE o que falhou
   * e por quê, para que a próxima rodada não repita o erro.
   */
  private async generateAgentDiagnosis(
    previousDebateState: DebateState,
    failures: FailureReport[],
    metadata: CheckpointMetadata
  ): Promise<AgentDiagnosis> {
    
    return {
      rollbackReason: 'POST_APPROVAL_FAILURE',
      
      // O que foi aprovado mas falhou
      approvedContext: {
        decisionsApproved: previousDebateState.approvedDecisions,
        judgeConfidence: metadata.judgeConfidence,
        completedRounds: metadata.roundsCompleted
      },
      
      // Diagnóstico detalhado de cada falha
      failureAnalysis: failures.map(failure => ({
        check: failure.check,
        errorMessage: failure.error.message,
        errorType: this.classifyError(failure.error),
        
        // A parte mais importante: relaciona a falha com uma decisão específica
        // do debate que pode ter causado o problema
        possibleCause: this.linkToDebateDecision(
          failure.error,
          previousDebateState
        ),
        
        suggestedFix: this.generateFixSuggestion(failure.error)
      })),
      
      // Instrução explícita para a nova rodada
      newRoundInstruction: `
CONTEXTO DO ROLLBACK:
O código aprovado na rodada anterior falhou nas seguintes verificações:
${failures.map(f => `- ${f.check}: ${f.error.message}`).join('\n')}

RESTRIÇÕES PARA ESTA RODADA:
1. As seguintes decisões JÁ FORAM VALIDADAS e NÃO devem ser revertidas:
   ${previousDebateState.approvedDecisions.join('\n   ')}
   
2. O seguinte problema específico DEVE ser resolvido:
   ${failures.map(f => `- ${f.error.message}`).join('\n   ')}

3. Mantenha a âncora dialética intacta (RS256, Redis cache).
4. Foque apenas no problema identificado — não refatore o que estava funcionando.
      `
    };
  }
  
  private classifyError(error: Error): string {
    if (error.message.includes('TypeError')) return 'TYPE_ERROR';
    if (error.message.includes('FAIL') || error.message.includes('expect')) return 'TEST_FAILURE';
    if (error.message.includes('Cannot find module')) return 'MISSING_DEPENDENCY';
    if (error.message.includes('SyntaxError')) return 'SYNTAX_ERROR';
    return 'RUNTIME_ERROR';
  }
  
  private linkToDebateDecision(error: Error, state: DebateState): string {
    // Tenta relacionar a mensagem de erro com uma decisão do debate
    const relevantDecision = state.approvedDecisions.find(d => 
      error.message.toLowerCase().includes(d.toLowerCase().split(' ')[0])
    );
    return relevantDecision 
      ? `Possivelmente relacionado à decisão: "${relevantDecision}"`
      : 'Causa não vinculada diretamente a decisões do debate';
  }
  
  private generateFixSuggestion(error: Error): string {
    const suggestions: Record<string, string> = {
      'TYPE_ERROR': 'Verifique tipos TypeScript e retornos de funções',
      'TEST_FAILURE': 'Revise a implementação contra os critérios de aceite dos testes',
      'MISSING_DEPENDENCY': 'Verifique imports e se todas as dependências estão no package.json',
      'SYNTAX_ERROR': 'Verifique a sintaxe do código gerado',
      'RUNTIME_ERROR': 'Execute localmente para reproduzir o erro antes de corrigir'
    };
    return suggestions[this.classifyError(error)] || 'Analise o stack trace completo';
  }
}
4.5 — Fluxo Completo de Rollback + Retry
[Gate 2: Guilherme aprova síntese]
               │
               ▼
  RollbackManager.createCheckpoint()  ← ANTES de escrever qualquer arquivo
  (Git stash + SQLite snapshot)
               │
               ▼
  AgentFactory gera e aplica o código
               │
               ▼
  monitorPostApproval() roda automaticamente:
  ├── npm test           (testes unitários)
  ├── tsc --noEmit       (type check)
  ├── eslint src/        (linter)
  └── node -e "require('./src/auth/jwtMiddleware')" (smoke test)
               │
         ┌─────▼──────┐
         │ Tudo OK?   │──[SIM]──► ✅ Sessão encerrada com sucesso
         └─────┬──────┘
               │ [NÃO]
               ▼
  rollback(checkpointId, failures)
  ├── git stash pop          (restaura código)
  ├── deleta arquivos criados
  ├── restaura arquivos editados
  └── generateAgentDiagnosis()  ← diagnóstico estruturado
               │
               ▼
  Diagnóstico enviado ao DebateOrchestrator
  via SSE: { type: "ROLLBACK_EVENT", diagnosis }
               │
               ▼
  UI mostra: "❌ Rollback automático executado
              Motivo: TEST_FAILURE em jwtMiddleware.test.ts
              Nova rodada iniciada com contexto de falha"
               │
               ▼
  Nova rodada de debate com newRoundInstruction injetado
  no contexto do A_TA (agente recebe diagnóstico preciso)
4.6 — Bibliotecas Recomendadas
Biblioteca
Função
simple-git (npm)
API TypeScript para operações Git (stash, restore)
better-sqlite3
SQLite local para snapshots de checkpoint
vitest / jest
Runner de testes para verificação pós-aprovação
execa
Executa comandos de verificação com timeout
@google/generative-ai
Gera diagnóstico em linguagem natural para o agente
--------------------------------------------------------------------------------
✅ Resumo Executivo: Os 4 Desafios Resolvidos
Desafio
Solução Core
Biblioteca Principal
Complexidade
Loop Infinito
Hash Fingerprinting + State Deadlock Detector + Cost Cap a 70%
xstate + custom LoopDetector
🟡 Média
Sincronização SSE+WS
Sequence Numbers globais + Buffered Reordering no cliente
socket.io + immer
🟢 Baixa
Compressão de Contexto
Anchored Iterative Summarization + Dialetical Anchor (nunca comprimida)
@google/generative-ai + tiktoken
🔴 Alta
Rollback Pós-Aprovação
Checkpoint (Git stash + SQLite) + monitoramento automático + diagnóstico estruturado para o agente
simple-git + better-sqlite3 + execa
🔴 Alta
Regra de ouro para os 4 desafios: A pergunta a fazer para cada ação do agente é: "Se isso se revelar errado, qual é o caminho de correção?" Se a resposta for "não há nenhum", você precisa de um gate de aprovação antes dessa ação ser executada, não depois.
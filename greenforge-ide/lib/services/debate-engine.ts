import { GoogleGenAI } from '@google/genai';

export type AgentName = 'PROPOSITOR' | 'CRITICO' | 'PROPOSITOR_REVISADO' | 'ARBITRO';

export type DebateEvent = 
  | { type: 'AGENT_TOKEN'; agent: AgentName; token: string }
  | { type: 'DEBATE_STATUS'; status: 'CONSENSUS' | 'IMPASSE' | 'ROUND_START'; round: number; agentName: AgentName }
  | { type: 'SECURITY_VIOLATION'; level: 'L3'; message: string }
  | { type: 'FINAL_CODE'; content: string };

export type TokenCallback = (event: DebateEvent) => void;

export interface DebateResult {
  success: boolean;
  proposerProposal: string;
  criticFeedback: string;
  revisedProposal: string;
  finalDecision: 'CONSENSUS' | 'IMPASSE';
  finalCode?: string;
}

export interface AIProvider {
  generateStream(systemPrompt: string, userPrompt: string, history?: any[]): Promise<AsyncIterable<{ text: string }>>;
}

const apiKey = (typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY) : '') || '';

const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

export class AIStudioProvider implements AIProvider {
  async generateStream(systemPrompt: string, userPrompt: string, history: any[] = []): Promise<AsyncIterable<{ text: string }>> {
    const contents = [
      ...history,
      { role: 'user', parts: [{ text: userPrompt }] }
    ];
    
    const stream = await ai.models.generateContentStream({
      model: 'gemini-3.5-flash',
      contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7
      }
    });

    return {
      async *[Symbol.asyncIterator]() {
        for await (const chunk of stream) {
          yield { text: chunk.text || '' };
        }
      }
    };
  }
}

const FORBIDDEN_PATTERNS = [
  'instruction bypass',
  'bypass instructions',
  'override rules',
  'ignore previous instructions',
  'rm -rf',
  'drop table'
];

export class DebateEngine {
  private provider: AIProvider;

  constructor(provider: AIProvider = new AIStudioProvider()) {
    this.provider = provider;
  }

  private detectSecurityViolation(text: string): boolean {
    const normalized = text.toLowerCase();
    return FORBIDDEN_PATTERNS.some(pattern => normalized.includes(pattern));
  }

  private extractCodeBlock(text: string): string {
    const regex = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/;
    const match = text.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
    return text.trim();
  }

  async runDebate(userProposal: string, onToken: TokenCallback): Promise<DebateResult> {
    let proposerProposal = '';
    let criticFeedback = '';
    let revisedProposal = '';
    let arbiterDecision = '';

    try {
      // ----------------------------------------------------
      // ROUND 1: PROPOSITOR
      // ----------------------------------------------------
      onToken({ type: 'DEBATE_STATUS', status: 'ROUND_START', round: 1, agentName: 'PROPOSITOR' });
      const proposerSys = "Você é o Propositor do GreenForge NEXUS. Sua função é gerar soluções técnicas completas e implementáveis baseadas no problema do usuário.";
      
      const proposerStream = await this.provider.generateStream(proposerSys, userProposal);
      for await (const chunk of proposerStream) {
        const text = chunk.text;
        if (this.detectSecurityViolation(text) || this.detectSecurityViolation(proposerProposal + text)) {
          onToken({ type: 'SECURITY_VIOLATION', level: 'L3', message: 'Detecção de injeção de código ou bypass de instruções no Propositor!' });
          throw new Error('SECURITY_VIOLATION');
        }
        proposerProposal += text;
        onToken({ type: 'AGENT_TOKEN', agent: 'PROPOSITOR', token: text });
      }

      // ----------------------------------------------------
      // ROUND 2: CRITICO
      // ----------------------------------------------------
      onToken({ type: 'DEBATE_STATUS', status: 'ROUND_START', round: 2, agentName: 'CRITICO' });
      const criticSys = "Você é o Crítico do GreenForge NEXUS. Analise a proposta técnica identificando falhas de segurança, edge cases e problemas de performance.";
      const criticPrompt = `Aqui está a proposta técnica sugerida pelo Propositor:\n\n${proposerProposal}\n\nAnalise com olhar crítico de arquitetura e segurança.`;
      
      const criticStream = await this.provider.generateStream(criticSys, criticPrompt);
      for await (const chunk of criticStream) {
        const text = chunk.text;
        if (this.detectSecurityViolation(text) || this.detectSecurityViolation(criticFeedback + text)) {
          onToken({ type: 'SECURITY_VIOLATION', level: 'L3', message: 'Detecção de injeção de código ou bypass de instruções no Crítico!' });
          throw new Error('SECURITY_VIOLATION');
        }
        criticFeedback += text;
        onToken({ type: 'AGENT_TOKEN', agent: 'CRITICO', token: text });
      }

      // ----------------------------------------------------
      // ROUND 3: PROPOSITOR REVISADO
      // ----------------------------------------------------
      onToken({ type: 'DEBATE_STATUS', status: 'ROUND_START', round: 3, agentName: 'PROPOSITOR_REVISADO' });
      const revisedPrompt = `Sua proposta original:\n\n${proposerProposal}\n\nAqui estão as críticas recebidas:\n\n${criticFeedback}\n\nPor favor, revise o código/proposta e entregue a versão final super aprimorada. Garanta que o código final de produção completo esteja envelopado em um único bloco de código com correspondente markdown (ex: \`\`\`typescript ... \`\`\`).`;
      
      const revisedStream = await this.provider.generateStream(proposerSys, revisedPrompt);
      for await (const chunk of revisedStream) {
        const text = chunk.text;
        if (this.detectSecurityViolation(text) || this.detectSecurityViolation(revisedProposal + text)) {
          onToken({ type: 'SECURITY_VIOLATION', level: 'L3', message: 'Detecção de injeção de código ou bypass de instruções no Propositor Revisado!' });
          throw new Error('SECURITY_VIOLATION');
        }
        revisedProposal += text;
        onToken({ type: 'AGENT_TOKEN', agent: 'PROPOSITOR_REVISADO', token: text });
      }

      // ----------------------------------------------------
      // ROUND 4: ARBITRO
      // ----------------------------------------------------
      onToken({ type: 'DEBATE_STATUS', status: 'ROUND_START', round: 4, agentName: 'ARBITRO' });
      const arbiterSys = "Você é o Árbitro do GreenForge NEXUS. Avalie se a proposta revisada mitigou as críticas. Declare [CONSENSO] se aprovada ou [IMPASSE]. Termine dizendo claramente se há Consenso ou Impasse.";
      const arbiterPrompt = `Proposta Revisada:\n\n${revisedProposal}\n\nCríticas Originais:\n\n${criticFeedback}\n\nAvalie se foi satisfatório para consenso científico ou técnico.`;
      
      const arbiterStream = await this.provider.generateStream(arbiterSys, arbiterPrompt);
      for await (const chunk of arbiterStream) {
        const text = chunk.text;
        if (this.detectSecurityViolation(text) || this.detectSecurityViolation(arbiterDecision + text)) {
          onToken({ type: 'SECURITY_VIOLATION', level: 'L3', message: 'Detecção de injeção de código ou bypass de instruções no Árbitro!' });
          throw new Error('SECURITY_VIOLATION');
        }
        arbiterDecision += text;
        onToken({ type: 'AGENT_TOKEN', agent: 'ARBITRO', token: text });
      }

      // Determinar decisão final
      const isConsensus = arbiterDecision.toUpperCase().includes('CONSENSO') || !arbiterDecision.toUpperCase().includes('IMPASSE');
      const finalDecision = isConsensus ? 'CONSENSUS' : 'IMPASSE';

      onToken({ type: 'DEBATE_STATUS', status: finalDecision, round: 4, agentName: 'ARBITRO' });

      const finalCode = this.extractCodeBlock(revisedProposal);
      onToken({ type: 'FINAL_CODE', content: finalCode });

      return {
        success: true,
        proposerProposal,
        criticFeedback,
        revisedProposal,
        finalDecision,
        finalCode
      };

    } catch (err: any) {
      console.error('Erro no debate adversarial:', err);
      return {
        success: false,
        proposerProposal,
        criticFeedback,
        revisedProposal,
        finalDecision: 'IMPASSE'
      };
    }
  }
}

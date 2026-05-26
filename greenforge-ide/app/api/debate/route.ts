import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { LoopDetector } from "@/lib/security/loop-detector";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function loadAgentPrompt(id: string, defaultPrompt: string): Promise<string> {
    try {
        const filePath = path.join(process.cwd(), "AGENTS.md");
        const fileContent = await fs.readFile(filePath, "utf8");
        const blocks = fileContent.split("---").map(b => b.trim()).filter(Boolean);
        for (const block of blocks) {
            if (block.includes(`id: ${id}`)) {
                const parts = fileContent.split("---").map(p => p.trim());
                if (id === "technical_proposer" && parts[2]) return parts[2];
                if (id === "quality_critic" && parts[4]) return parts[4];
                if (id === "debate_judge" && parts[6]) return parts[6];
            }
        }
    } catch (e) {
        console.error(`Erro ao ler AGENTS.md para ${id}, usando padrão`, e);
    }
    return defaultPrompt;
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const objective = body.objective || "Construa o esqueleto base de um aplicativo.";

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const sendEvent = (type: string, payload: any) => {
                controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`));
            };

            const loopDetector = new LoopDetector();

            try {
                sendEvent('DEBATE_STATUS', { status: 'IN_PROGRESS', activeAgent: 'technical_proposer', currentRound: 1 });

                // Load agents prompts
                const proposerSys = await loadAgentPrompt(
                    "technical_proposer",
                    "Você é o Propositor Técnico do GreenForge. Elabore a proposta técnica arquitetural respeitando as travas de segurança dos dossiês descritos anteriormente e priorizando performance limpa. Exponha os trade-offs abertamente e depois encerre."
                );

                const criticSys = await loadAgentPrompt(
                    "quality_critic",
                    "Você é o Crítico de Qualidade Sênior. Sua postura é combativa e inquisitiva. Desmonte a proposta apresentada apontando brechas de segurança operacionais ou loops redundantes nos conceitos (Filtre por path traversal). Forneça red-flags diretos."
                );

                const judgeSys = await loadAgentPrompt(
                    "debate_judge",
                    "Você é o Árbitro Geral. Realize a Síntese Dialética. Você não escolhe lados, apenas converge as ideias e aponta o caminho base que englobará a qualidade do Crítico ao código viável do Propositor."
                );

                // Round 1 - PROPOSITOR (Geração da Proposta)
                const proposerResponse = await ai.models.generateContentStream({
                    model: 'gemini-3.5-flash',
                    contents: `Objetivo Solicitado: ${objective}\n\nFaça sua proposta detalhada:`,
                    config: { systemInstruction: proposerSys }
                });

                let proposerCode = '';
                for await (const chunk of proposerResponse) {
                    const text = chunk.text || "";
                    proposerCode += text;
                    sendEvent('AGENT_TOKEN', { role: 'proposer', agentId: 'technical_proposer', token: text, isLast: false });
                }

                // Run Loop detection on proposer code
                const proposerLoopSig = loopDetector.detect(proposerCode);
                if (proposerLoopSig.isLoop) {
                    sendEvent('SECURITY_VIOLATION', { error: `Loop semântico detectado no Propositor (Tier: ${proposerLoopSig.tier}, Similaridade: ${proposerLoopSig.similarity})` });
                    controller.close();
                    return;
                }

                sendEvent('AGENT_TOKEN', { role: 'proposer', agentId: 'technical_proposer', token: '', isLast: true });

                // Round 1 - CRÍTICO (Escaneamento Contraditório)
                sendEvent('DEBATE_STATUS', { status: 'IN_PROGRESS', activeAgent: 'quality_critic', currentRound: 1 });
                const criticResponse = await ai.models.generateContentStream({
                    model: 'gemini-3.5-flash',
                    contents: `Proposta sob avaliação:\n>>>\n${proposerCode}\n<<<\n\nDesmonte com rigor:`,
                    config: { systemInstruction: criticSys }
                });

                let criticFull = '';
                for await (const chunk of criticResponse) {
                    const text = chunk.text || "";
                    criticFull += text;
                    sendEvent('AGENT_TOKEN', { role: 'critic', agentId: 'quality_critic', token: text, isLast: false });
                }

                // Run Loop detection on critic code
                const criticLoopSig = loopDetector.detect(criticFull);
                if (criticLoopSig.isLoop) {
                    sendEvent('SECURITY_VIOLATION', { error: `Loop semântico detectado no Crítico (Tier: ${criticLoopSig.tier}, Similaridade: ${criticLoopSig.similarity})` });
                    controller.close();
                    return;
                }

                sendEvent('AGENT_TOKEN', { role: 'critic', agentId: 'quality_critic', token: '', isLast: true });

                // Round 1 - ÁRBITRO SINTETIZADOR (Desempate Socrático)
                sendEvent('DEBATE_STATUS', { status: 'IN_PROGRESS', activeAgent: 'debate_judge', currentRound: 1 });
                
                let judgeFull = '';
                try {
                    const judgeResponse = await ai.models.generateContentStream({
                        model: 'gemini-3.1-pro-preview',
                        contents: `Proposta: ${proposerCode}\n\nCríticas Relevantes: ${criticFull}\n\nFaça a síntese agora:`,
                        config: { systemInstruction: judgeSys }
                    });

                    for await (const chunk of judgeResponse) {
                        const text = chunk.text || "";
                        judgeFull += text;
                        sendEvent('AGENT_TOKEN', { role: 'judge', agentId: 'debate_judge', token: text, isLast: false });
                    }
                } catch (proErr: any) {
                    console.warn("Falha ao usar gemini-3.1-pro-preview (possível limite de quota), usando flash de fallback", proErr);
                    judgeFull = '';
                    const fallbackResponse = await ai.models.generateContentStream({
                        model: 'gemini-3.5-flash',
                        contents: `Proposta: ${proposerCode}\n\nCríticas Relevantes: ${criticFull}\n\nFaça a síntese agora:`,
                        config: { systemInstruction: judgeSys }
                    });

                    for await (const chunk of fallbackResponse) {
                        const text = chunk.text || "";
                        judgeFull += text;
                        sendEvent('AGENT_TOKEN', { role: 'judge', agentId: 'debate_judge', token: text, isLast: false });
                    }
                }
                sendEvent('AGENT_TOKEN', { role: 'judge', agentId: 'debate_judge', token: '', isLast: true });
                
                const cpgSimHash = crypto.createHash('md5').update(judgeFull).digest('hex').substring(0, 8);

                // FINAL: Emite o HITL Gate (Human-In-The-Loop) exibe a sintese para aprovaçao (G1)
                sendEvent('HITL_GATE', {
                    gateType: 'GATE_1',
                    approvalCard: {
                        id: `gate-g1-${cpgSimHash}-${Date.now()}`,
                        sessionId: "session-local-01",
                        type: "GATE_1",
                        title: "Convergência do Debate Inicial (Sintese)",
                        summary: `Após rodadas dialéticas combativas, o Árbitro consolidou uma proposta de resiliência estável com base em blindagem provados do Nexus.`,
                        underlyingQuestion: "A proposta técnica atende performance, segurança e completude de escopo?",
                        synthesis: judgeFull,
                        redFlags: [],
                        estimatedTokens: 9550,
                        risk: "LOW"
                    }
                });

                controller.close();
            } catch (err: any) {
                console.error("NEXUS Debate Stream Error:", err);
                sendEvent('SECURITY_VIOLATION', { error: err.message || "Network Error" });
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    });
}

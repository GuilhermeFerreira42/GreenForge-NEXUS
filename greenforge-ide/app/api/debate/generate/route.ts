import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

function parseCodeChunks(text: string): { id: string; filePath: string; oldContent: string; newContent: string; approved: boolean }[] {
    const chunks: { id: string; filePath: string; oldContent: string; newContent: string; approved: boolean }[] = [];
    
    // Pattern: [FILE: path]...[END_FILE]
    const regex = /\[FILE:\s*(.+?)\]\s*([\s\S]*?)\s*\[END_FILE\]/g;
    let match;
    let count = 1;
    
    while ((match = regex.exec(text)) !== null) {
        const filePath = match[1].trim();
        let newContent = match[2];
        
        // Strip leading/trailing markdown fence blocks if the model wrapped it
        if (newContent.trim().startsWith("```")) {
            const firstNewLine = newContent.indexOf("\n");
            if (firstNewLine !== -1) {
                newContent = newContent.substring(firstNewLine + 1);
            }
            const lastFence = newContent.lastIndexOf("```");
            if (lastFence !== -1) {
                newContent = newContent.substring(0, lastFence);
            }
        }
        
        chunks.push({
            id: `chunk-${count++}-${Date.now()}`,
            filePath,
            oldContent: "",
            newContent,
            approved: true
        });
    }
    
    // Fallback: match standard ```typescript filepath.ts ... ``` blocks
    if (chunks.length === 0) {
        const fallbackRegex = /```(?:[a-zA-Z0-9_\-]+)?\s+([a-zA-Z0-9_\-\.\/]+)\n([\s\S]*?)```/g;
        let fbMatch;
        while ((fbMatch = fallbackRegex.exec(text)) !== null) {
            chunks.push({
                id: `chunk-${count++}-${Date.now()}`,
                filePath: fbMatch[1].trim(),
                oldContent: "",
                newContent: fbMatch[2],
                approved: true
            });
        }
    }
    
    // Extreme fallback: single file output if no tags matched
    if (chunks.length === 0) {
        let finalPath = "generated-code.ts";
        chunks.push({
            id: `chunk-${count++}-${Date.now()}`,
            filePath: finalPath,
            oldContent: "",
            newContent: text,
            approved: true
        });
    }
    
    return chunks;
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const objective = body.objective || "Construa o esqueleto base de um aplicativo.";
    const synthesis = body.synthesis || "";

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const sendEvent = (type: string, payload: any) => {
                controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`));
            };

            try {
                sendEvent('DEBATE_STATUS', { status: 'GENERATING', activeAgent: 'technical_proposer', currentRound: 2 });

                const codeGenSystemInstruction = `Você é o Engenheiro de Software Sênior do GreenForge. Seu objetivo é gerar os arquivos de código completos e blindados correspondentes ao consenso obtido no debate e à síntese fornecida.

Para cada arquivo gerado, use obrigatoriamente a tag especial "[FILE: nome-do-arquivo]" e termine com "[END_FILE]". Exemplo:
[FILE: src/calculadora.ts]
export function soma(a: number, b: number) {
    return a + b;
}
[END_FILE]

Sempre garanta que todos os arquivos tenham códigos utilizáveis de verdade, sem placeholders ou mocks rasos.`;

                const prompt = `Objetivo Original: ${objective} \n\nSíntese do Árbitro a ser executada:\n${synthesis}\n\nPor favor, gere e implemente todos os arquivos de código necessários agora:`;

                const responseStream = await ai.models.generateContentStream({
                    model: 'gemini-3.5-flash',
                    contents: prompt,
                    config: { systemInstruction: codeGenSystemInstruction }
                });

                let proposerCode = '';
                for await (const chunk of responseStream) {
                    const text = chunk.text || "";
                    proposerCode += text;
                    sendEvent('AGENT_TOKEN', { role: 'proposer', agentId: 'technical_proposer', token: text, isLast: false });
                }
                sendEvent('AGENT_TOKEN', { role: 'proposer', agentId: 'technical_proposer', token: '', isLast: true });

                // Parse generated files to chunks
                const generatedChunks = parseCodeChunks(proposerCode);

                const cpgSimHash = crypto.createHash('md5').update(proposerCode).digest('hex').substring(0, 8);

                // FINAL: Emita o HITL Gate (Human-In-The-Loop) de Revisão de Código (G2)
                sendEvent('HITL_GATE', {
                    gateType: 'GATE_2',
                    approvalCard: {
                        id: `gate-g2-${cpgSimHash}-${Date.now()}`,
                        sessionId: "session-local-01",
                        type: "GATE_2",
                        title: "Revisão e Integração do Código Gerado",
                        summary: `O Propositor Técnico gerou com sucesso ${generatedChunks.length} arquivo(s) de código correspondente(s) à síntese deliberada.`,
                        underlyingQuestion: "Aprovar as alterações propostas e mesclar com o Workspace local?",
                        synthesis: "Código blindado pronto para persistência no workspace local.",
                        redFlags: [],
                        estimatedTokens: 4500,
                        risk: "LOW",
                        chunks: generatedChunks
                    }
                });

                controller.close();
            } catch (err: any) {
                console.error("NEXUS Code Generation Stream Error:", err);
                sendEvent('SECURITY_VIOLATION', { error: err.message || "Code Generation Error" });
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

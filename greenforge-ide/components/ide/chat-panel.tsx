'use client'

import React, { useState, useRef, useEffect } from 'react'
import { 
  Send, 
  Loader2, 
  Bot, 
  User, 
  Sparkles, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Edit3,
  ChevronDown,
  ChevronRight,
  Shield,
  Zap,
  Code2,
  GitBranch
} from 'lucide-react'
import { useIDEStore, Message, ApprovalCard } from '@/lib/store'
import { cn } from '@/lib/utils'

const AGENT_COLORS = {
  proposer: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  critic: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  judge: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  assistant: 'text-green-400 bg-green-500/10 border-green-500/30',
  system: 'text-gray-400 bg-gray-500/10 border-gray-500/30'
}

const AGENT_ICONS = {
  proposer: Code2,
  critic: Shield,
  judge: Sparkles,
  assistant: Bot,
  system: Zap
}

interface ChatMessageProps {
  message: Message
}

function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const agentType = message.role === 'proposer' ? 'proposer' 
    : message.role === 'critic' ? 'critic'
    : message.role === 'judge' ? 'judge'
    : message.role === 'system' ? 'system'
    : 'assistant'
  
  const Icon = AGENT_ICONS[agentType] || Bot
  const colorClass = AGENT_COLORS[agentType] || AGENT_COLORS.assistant

  return (
    <div id={`msg-${message.id}`} className={cn('flex gap-3 p-3', isUser ? 'flex-row-reverse' : '')}>
      <div className={cn(
        'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border',
        isUser ? 'bg-primary text-primary-foreground' : colorClass
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </div>
      
      <div className={cn('flex-1 space-y-1', isUser ? 'text-right' : '')}>
        {!isUser && message.agentName && (
          <div className="text-xs font-medium text-muted-foreground mb-1 select-none">
            {message.agentName}
          </div>
        )}
        <div className={cn(
          'inline-block rounded-lg px-3 py-2 text-sm max-w-[90%] text-left whitespace-pre-wrap leading-relaxed shadow-sm',
          isUser 
            ? 'bg-primary text-primary-foreground font-medium' 
            : 'bg-muted text-foreground border border-border/40'
        )}>
          {message.isStreaming ? (
            <span className="flex items-center gap-2">
              {message.content}
              <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
            </span>
          ) : (
            <div>{message.content}</div>
          )}
        </div>
        <div className="text-xs text-muted-foreground/60 select-none">
          {new Date(message.timestamp).toLocaleTimeString('pt-BR')}
        </div>
      </div>
    </div>
  )
}

function ApprovalCardComponent({ card }: { card: ApprovalCard }) {
  const [expanded, setExpanded] = useState(false)
  const resolveGate = useIDEStore(s => s.resolveGate)

  const riskColors = {
    LOW: 'text-green-400 bg-green-500/10',
    MEDIUM: 'text-amber-400 bg-amber-500/10',
    HIGH: 'text-red-400 bg-red-500/10'
  }

  return (
    <div id={`gate-card-${card.id}`} className="mx-3 my-4 border border-emerald-500/35 rounded-lg bg-emerald-950/10 overflow-hidden shadow-lg animate-in fade-in zoom-in duration-200">
      <div className="p-4 border-b border-emerald-500/20 bg-emerald-500/5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <span className="font-semibold text-emerald-400">
              GATE ADVERSARIAL — Resiliência Aprovada
            </span>
          </div>
          <span className={cn('text-xs px-2 py-0.5 rounded font-medium', riskColors[card.risk])}>
            Garantia: {card.risk}
          </span>
        </div>
        <h3 className="text-base font-semibold">{card.title}</h3>
      </div>

      <div className="p-4 space-y-3">
        <div className="text-sm text-muted-foreground leading-relaxed">{card.summary}</div>
        
        <div className="bg-muted/40 rounded p-3 border border-border/30">
          <div className="text-xs font-semibold text-muted-foreground mb-1">
            CONSENSO ALCANÇADO:
          </div>
          <div className="text-xs md:text-sm font-mono text-[#d1d5db]">{card.synthesis}</div>
        </div>

        {card.redFlags.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded p-3">
            <div className="flex items-center gap-2 text-red-400 text-xs font-semibold mb-2">
              <AlertTriangle className="h-4 w-4" />
              {card.redFlags.length} Alertas de Segurança Detectados
            </div>
            {card.redFlags.map((flag, i) => (
              <div key={i} className="text-xs text-red-300">{`- ${flag}`}</div>
            ))}
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          Sincronização estimada do compilador: ~{card.estimatedTokens.toLocaleString()} tokens
        </div>
      </div>

      <div className="border-t border-emerald-500/20">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full p-3 flex items-center justify-between hover:bg-emerald-500/5 transition-colors text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          <span>Visualizar Código de Solução</span>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        
        {expanded && card.chunks && card.chunks.length > 0 && (
          <div className="px-4 pb-4">
            <pre className="bg-neutral-950 p-3 rounded text-xs overflow-x-auto text-[#a7b2c7] font-mono border border-neutral-800 max-h-60">
              <code>{card.chunks[0].newContent}</code>
            </pre>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-emerald-500/20 flex flex-wrap gap-2">
        <button
          onClick={() => resolveGate('APPROVE')}
          className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-sm font-semibold transition-colors shadow"
        >
          <CheckCircle2 className="h-4 w-4" />
          Mesclar e Gravar Workspace
        </button>
        <button
          onClick={() => resolveGate('EDIT')}
          className="flex items-center justify-center gap-2 bg-muted hover:bg-muted/80 px-4 py-2 rounded-md text-sm font-medium transition-colors"
        >
          <Edit3 className="h-4 w-4" />
          Ajustar
        </button>
        <button
          onClick={() => resolveGate('NEW_ROUND')}
          className="flex items-center justify-center gap-2 bg-muted hover:bg-muted/85 px-4 py-2 rounded-md text-sm font-medium transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Rodada Adicional
        </button>
        <button
          onClick={() => resolveGate('REJECT')}
          className="flex items-center justify-center gap-2 bg-red-600/10 hover:bg-red-600/25 text-red-400 px-4 py-2 rounded-md text-sm font-medium transition-colors"
        >
          <XCircle className="h-4 w-4" />
          Descartar
        </button>
      </div>
    </div>
  )
}

function DebateStatus() {
  const debateSession = useIDEStore(s => s.debateSession)

  if (!debateSession) return null

  const statusColors: Record<string, string> = {
    PENDING: 'text-gray-400 bg-gray-400',
    CLARIFYING: 'text-blue-400 bg-blue-400',
    IN_PROGRESS: 'text-amber-400 bg-amber-400',
    GATE_1: 'text-yellow-400 bg-yellow-400',
    GENERATING: 'text-green-400 bg-green-400',
    GATE_2: 'text-emerald-400 bg-emerald-400',
    MERGED: 'text-green-400 bg-green-400',
    ABORTED: 'text-red-400 bg-red-400',
    COMPLETED: 'text-green-500 bg-green-500'
  }

  const statusLabels: Record<string, string> = {
    PENDING: 'Iniciando debate...',
    CLARIFYING: 'Validando escopos',
    IN_PROGRESS: 'Em Debate Dialético',
    GATE_1: 'Validação de Conceito',
    GENERATING: 'Redigindo Solução',
    GATE_2: 'Consenso em Revisão',
    MERGED: 'Mesclado',
    ABORTED: 'Cancelado',
    COMPLETED: 'Debate Concluído'
  }

  const isWriting = debateSession.status === 'GENERATING' || debateSession.status === 'IN_PROGRESS'
  const isThinking = debateSession.status === 'PENDING' || debateSession.status === 'CLARIFYING' || debateSession.status === 'GATE_2'

  const pulseDuration = isWriting ? '0.5s' : isThinking ? '2s' : '0s'

  return (
    <div className="mx-3 mb-3 p-3 bg-muted/40 rounded-lg border border-border/40 select-none animate-in slide-in-from-top-1 duration-200">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <GitBranch className="h-4 w-4 text-primary/70 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ciclo Adversarial</span>
        </div>
        <div className="flex items-center gap-1.5">
          {pulseDuration !== '0s' && (
            <span 
              className={cn('inline-block w-2.5 h-2.5 rounded-full animate-pulse', statusColors[debateSession.status])} 
              style={{ animationDuration: pulseDuration }}
            />
          )}
          <span className={cn('text-xs font-semibold', statusColors[debateSession.status].split(' ')[0])}>
            {statusLabels[debateSession.status]}
          </span>
        </div>
      </div>
      <div className="text-xs text-foreground/80 font-medium truncate mb-1">
        Foco: {debateSession.objective}
      </div>
      {debateSession.currentRound > 0 && debateSession.status !== 'COMPLETED' && (
        <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
          Fase {debateSession.currentRound} / 4 do debate estruturado
        </div>
      )}
    </div>
  )
}

export function ChatPanel() {
  const messages = useIDEStore(s => s.messages)
  const addMessage = useIDEStore(s => s.addMessage)
  const approvalCard = useIDEStore(s => s.approvalCard)
  const runAdversarialDebate = useIDEStore(s => s.runAdversarialDebate)
  const resetDebateSession = useIDEStore(s => s.resetDebateSession)
  const debateSession = useIDEStore(s => s.debateSession)
  
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, approvalCard])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setIsLoading(true)
    
    addMessage({
      role: 'user',
      content: userMessage
    })

    try {
      await runAdversarialDebate(userMessage)
    } catch (err) {
      console.error('Debate crash:', err)
      addMessage({
        role: 'system',
        content: 'Um erro interrompeu o debate adversarial.',
        agentName: 'Sistema'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="h-full flex flex-col bg-background selection:bg-primary/20">
      <div className="p-3 border-b border-border/40 select-none flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            <h2 className="font-semibold text-sm tracking-tight text-foreground">GreenForge Nexus Agents</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ambiente dialético adversarial para engenharia de software resiliente
          </p>
        </div>
        <button
          id="btn-reset-debate"
          onClick={resetDebateSession}
          className="p-1.5 hover:bg-muted text-muted-foreground hover:text-red-400 rounded-md transition-colors"
          title="Reiniciar Sessão de Debate"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {debateSession && <DebateStatus />}

      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6 select-none text-center">
            <Bot className="h-10 w-10 mb-3 text-primary/40 animate-bounce" />
            <p className="text-sm mb-1 font-medium text-foreground/80">
              Núcleo Adversarial GreenForge
            </p>
            <p className="text-xs text-muted-foreground/60 max-w-[2400px]">
              Insira um cenário ou objetivo técnico abaixo. Nossos agentes (Propositor, Crítico e Árbitro) disputarão para projetar a solução mais blindada.
            </p>
          </div>
        ) : (
          <div className="py-2">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {approvalCard && <ApprovalCardComponent card={approvalCard} />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border/40 bg-background/50">
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Descreva seu escopo de implantação... (Enter para enviar)"
            className="w-full bg-muted/80 rounded-lg pl-3 pr-10 py-2.5 text-xs md:text-sm resize-none outline-none focus:ring-1 focus:ring-ring border border-border/40 min-h-[64px]"
            rows={2}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={cn(
              'absolute right-2.5 bottom-3.5 p-1.5 rounded-md transition-all',
              input.trim() && !isLoading
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                : 'bg-transparent text-muted-foreground/40'
            )}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

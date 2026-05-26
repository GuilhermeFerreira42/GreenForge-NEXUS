'use client'

import React, { useState } from 'react'
import { 
  Bot, 
  Code2, 
  Shield, 
  Sparkles, 
  Settings, 
  Play, 
  Pause, 
  Square,
  ChevronDown,
  ChevronRight,
  Zap,
  Brain,
  Target,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Agent {
  id: string
  name: string
  role: 'proposer' | 'critic' | 'judge' | 'manager'
  model: string
  enabled: boolean
  status: 'idle' | 'running' | 'paused' | 'error'
  description: string
  constraints: string[]
  tools: string[]
}

const mockAgents: Agent[] = [
  {
    id: 'technical_proposer',
    name: 'Propositor Técnico',
    role: 'proposer',
    model: 'gemini-2.5-flash',
    enabled: true,
    status: 'idle',
    description: 'Gera propostas técnicas e arquiteturais para implementação.',
    constraints: [
      'Sempre justificar decisões arquiteturais',
      'Considerar trade-offs de performance vs. legibilidade',
      'Manter compatibilidade com padrões existentes'
    ],
    tools: ['read_file', 'write_file', 'search_codebase', 'execute_shell']
  },
  {
    id: 'quality_critic',
    name: 'Crítico de Qualidade',
    role: 'critic',
    model: 'gemini-2.5-flash-lite',
    enabled: true,
    status: 'idle',
    description: 'Inspeciona adversarialmente as propostas em busca de problemas.',
    constraints: [
      'Focar em segurança, performance e manutenibilidade',
      'Identificar edge cases não tratados',
      'Sugerir melhorias concretas'
    ],
    tools: ['read_file', 'analyze_code', 'run_tests']
  },
  {
    id: 'debate_judge',
    name: 'Árbitro',
    role: 'judge',
    model: 'gemini-2.5-pro',
    enabled: true,
    status: 'idle',
    description: 'Sintetiza debates e produz veredictos através de síntese dialética.',
    constraints: [
      'Nunca tomar partido explicitamente',
      'Identificar a questão subjacente real',
      'Sintetizar posições em vez de escolher vencedor'
    ],
    tools: ['read_file']
  },
  {
    id: 'manager_agent',
    name: 'Manager Agent',
    role: 'manager',
    model: 'gemini-2.5-flash',
    enabled: true,
    status: 'idle',
    description: 'Analisa objetivos, infere escopo e gerencia o fluxo de debate.',
    constraints: [
      'Clarificar objetivos ambíguos',
      'Calcular confidence score',
      'Coordenar agentes de debate'
    ],
    tools: ['read_file', 'analyze_context']
  }
]

const roleIcons = {
  proposer: Code2,
  critic: Shield,
  judge: Sparkles,
  manager: Brain
}

const roleColors = {
  proposer: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  critic: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  judge: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  manager: 'text-green-400 bg-green-500/10 border-green-500/30'
}

const statusIcons = {
  idle: { icon: CheckCircle2, color: 'text-gray-400' },
  running: { icon: Zap, color: 'text-green-400' },
  paused: { icon: Pause, color: 'text-amber-400' },
  error: { icon: AlertCircle, color: 'text-red-400' }
}

export function AgentsPanel() {
  const [agents, setAgents] = useState<Agent[]>(mockAgents)
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set(['technical_proposer']))
  const [showConfig, setShowConfig] = useState(false)

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedAgents)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedAgents(newExpanded)
  }

  const toggleAgent = (id: string) => {
    setAgents(agents.map(a => 
      a.id === id ? { ...a, enabled: !a.enabled } : a
    ))
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground flex items-center justify-between">
        <span>Agentes</span>
        <button 
          onClick={() => setShowConfig(!showConfig)}
          className="p-1 hover:bg-muted rounded"
          title="Configurações"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {agents.map((agent) => {
          const RoleIcon = roleIcons[agent.role]
          const StatusInfo = statusIcons[agent.status]
          const isExpanded = expandedAgents.has(agent.id)

          return (
            <div key={agent.id} className="border-b border-border last:border-b-0">
              <button
                onClick={() => toggleExpand(agent.id)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50"
              >
                <span className="text-muted-foreground">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </span>
                
                <div className={cn(
                  'p-1.5 rounded border',
                  roleColors[agent.role]
                )}>
                  <RoleIcon className="h-4 w-4" />
                </div>
                
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium">{agent.name}</div>
                  <div className="text-xs text-muted-foreground">{agent.model}</div>
                </div>

                <StatusInfo.icon className={cn('h-4 w-4', StatusInfo.color)} />
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 space-y-3">
                  <p className="text-sm text-muted-foreground pl-9">
                    {agent.description}
                  </p>

                  <div className="pl-9 flex items-center gap-2">
                    <button
                      onClick={() => toggleAgent(agent.id)}
                      className={cn(
                        'relative w-10 h-5 rounded-full transition-colors',
                        agent.enabled ? 'bg-green-500' : 'bg-muted'
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                        agent.enabled ? 'translate-x-5' : 'translate-x-0.5'
                      )} />
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {agent.enabled ? 'Habilitado' : 'Desabilitado'}
                    </span>
                  </div>

                  <div className="pl-9">
                    <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Target className="h-3 w-3" />
                      Constraints
                    </div>
                    <ul className="space-y-1">
                      {agent.constraints.map((constraint, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-primary mt-1">•</span>
                          <span>{constraint}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pl-9">
                    <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      Tools
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {agent.tools.map((tool) => (
                        <span
                          key={tool}
                          className="text-xs bg-muted px-2 py-0.5 rounded font-mono"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pl-9 flex items-center gap-2">
                    <button
                      className="flex items-center gap-1.5 text-xs bg-muted hover:bg-muted/80 px-2 py-1 rounded transition-colors"
                      title="Testar agente"
                    >
                      <Play className="h-3 w-3" />
                      Testar
                    </button>
                    <button
                      className="flex items-center gap-1.5 text-xs bg-muted hover:bg-muted/80 px-2 py-1 rounded transition-colors"
                      title="Configurar"
                    >
                      <Settings className="h-3 w-3" />
                      Config
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="px-3 py-2 border-t border-border">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{agents.filter(a => a.enabled).length}/{agents.length} ativos</span>
          <span className="flex items-center gap-1">
            <Bot className="h-3 w-3" />
            Debate Protocol v2.3
          </span>
        </div>
      </div>
    </div>
  )
}

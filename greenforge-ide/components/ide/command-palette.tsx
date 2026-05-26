'use client'

import React, { useState, useEffect, useRef } from 'react'
import { 
  Search, 
  File, 
  Settings, 
  Terminal, 
  GitBranch, 
  Play, 
  Command,
  ChevronRight,
  Bot,
  FileText,
  FolderOpen,
  Code2
} from 'lucide-react'
import { useIDEStore, FileNode } from '@/lib/store'
import { cn } from '@/lib/utils'

interface CommandItem {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  shortcut?: string
  action: () => void
  category: 'file' | 'edit' | 'view' | 'terminal' | 'git' | 'agent' | 'settings'
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const {
    files,
    addTab,
    toggleSidebar,
    toggleBottomPanel,
    toggleRightPanel,
    setActiveSidebarPanel,
    setActiveBottomPanel,
    clearTerminal,
    clearMessages,
    startDebate
  } = useIDEStore()

  // Flatten files for search
  const flattenFiles = (nodes: FileNode[], path = ''): { node: FileNode; path: string }[] => {
    const result: { node: FileNode; path: string }[] = []
    for (const node of nodes) {
      const currentPath = path ? `${path}/${node.name}` : node.name
      if (node.type === 'file') {
        result.push({ node, path: currentPath })
      }
      if (node.children) {
        result.push(...flattenFiles(node.children, currentPath))
      }
    }
    return result
  }

  const allFiles = flattenFiles(files)

  const commands: CommandItem[] = [
    {
      id: 'toggle-sidebar',
      label: 'Toggle Sidebar',
      description: 'Mostrar/ocultar barra lateral',
      icon: <FolderOpen className="h-4 w-4" />,
      shortcut: 'Ctrl+B',
      action: toggleSidebar,
      category: 'view'
    },
    {
      id: 'toggle-terminal',
      label: 'Toggle Terminal',
      description: 'Mostrar/ocultar terminal',
      icon: <Terminal className="h-4 w-4" />,
      shortcut: 'Ctrl+`',
      action: toggleBottomPanel,
      category: 'terminal'
    },
    {
      id: 'toggle-chat',
      label: 'Toggle Chat Panel',
      description: 'Mostrar/ocultar painel de chat',
      icon: <Bot className="h-4 w-4" />,
      shortcut: 'Ctrl+Shift+A',
      action: toggleRightPanel,
      category: 'agent'
    },
    {
      id: 'show-explorer',
      label: 'Show Explorer',
      description: 'Abrir explorador de arquivos',
      icon: <FolderOpen className="h-4 w-4" />,
      shortcut: 'Ctrl+Shift+E',
      action: () => setActiveSidebarPanel('files'),
      category: 'view'
    },
    {
      id: 'show-search',
      label: 'Show Search',
      description: 'Abrir busca global',
      icon: <Search className="h-4 w-4" />,
      shortcut: 'Ctrl+Shift+F',
      action: () => setActiveSidebarPanel('search'),
      category: 'view'
    },
    {
      id: 'show-git',
      label: 'Show Git',
      description: 'Abrir painel Git',
      icon: <GitBranch className="h-4 w-4" />,
      shortcut: 'Ctrl+Shift+G',
      action: () => setActiveSidebarPanel('git'),
      category: 'git'
    },
    {
      id: 'show-agents',
      label: 'Show Agents',
      description: 'Abrir painel de agentes',
      icon: <Bot className="h-4 w-4" />,
      action: () => setActiveSidebarPanel('agents'),
      category: 'agent'
    },
    {
      id: 'clear-terminal',
      label: 'Clear Terminal',
      description: 'Limpar histórico do terminal',
      icon: <Terminal className="h-4 w-4" />,
      action: clearTerminal,
      category: 'terminal'
    },
    {
      id: 'new-debate',
      label: 'Start New Debate',
      description: 'Iniciar novo debate com agentes',
      icon: <Bot className="h-4 w-4" />,
      action: () => {
        onClose()
      },
      category: 'agent'
    },
    {
      id: 'run-project',
      label: 'Run Project',
      description: 'Executar npm run dev',
      icon: <Play className="h-4 w-4" />,
      shortcut: 'F5',
      action: () => {
        setActiveBottomPanel('terminal')
      },
      category: 'terminal'
    },
    {
      id: 'settings',
      label: 'Settings',
      description: 'Abrir configurações',
      icon: <Settings className="h-4 w-4" />,
      shortcut: 'Ctrl+,',
      action: () => {},
      category: 'settings'
    }
  ]

  const fileCommands: CommandItem[] = allFiles.map(({ node, path }) => ({
    id: `file-${node.id}`,
    label: node.name,
    description: path,
    icon: <FileText className="h-4 w-4" />,
    action: () => {
      addTab({
        id: node.id,
        name: node.name,
        content: node.content || '',
        language: node.language || 'plaintext',
        isDirty: false
      })
      onClose()
    },
    category: 'file' as const
  }))

  const allCommands = [...commands, ...fileCommands]

  const filteredCommands = query
    ? allCommands.filter(cmd => 
        cmd.label.toLowerCase().includes(query.toLowerCase()) ||
        cmd.description?.toLowerCase().includes(query.toLowerCase())
      )
    : allCommands.slice(0, 15)

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action()
        onClose()
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        if (isOpen) {
          onClose()
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[20vh]"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-xl bg-[#252530] rounded-lg shadow-2xl border border-border overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar comandos ou arquivos..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <kbd className="px-2 py-1 bg-muted text-xs rounded">Esc</kbd>
        </div>

        <div className="max-h-[400px] overflow-auto">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              Nenhum comando encontrado
            </div>
          ) : (
            <div className="py-2">
              {filteredCommands.map((cmd, index) => (
                <button
                  key={cmd.id}
                  onClick={() => {
                    cmd.action()
                    onClose()
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                    selectedIndex === index ? 'bg-muted' : 'hover:bg-muted/50'
                  )}
                >
                  <span className="text-muted-foreground">{cmd.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{cmd.label}</div>
                    {cmd.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {cmd.description}
                      </div>
                    )}
                  </div>
                  {cmd.shortcut && (
                    <kbd className="px-2 py-0.5 bg-muted/50 text-xs rounded shrink-0">
                      {cmd.shortcut}
                    </kbd>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded">↑↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded">Enter</kbd>
              selecionar
            </span>
          </div>
          <span>{filteredCommands.length} resultados</span>
        </div>
      </div>
    </div>
  )
}

'use client'

import React, { useRef } from 'react'
import {
  Files,
  Search,
  GitBranch,
  Bot,
  Bug,
  Settings,
  Terminal as TerminalIcon,
  AlertCircle,
  FileOutput,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelRightClose,
  PanelBottomClose,
  Moon,
  Sun,
  Play,
  Square,
  RotateCcw,
  Trash2,
  Upload,
  Download,
  FolderOpen
} from 'lucide-react'
import { useIDEStore, FileNode } from '@/lib/store'
import { cn } from '@/lib/utils'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

type PanelType = 'files' | 'search' | 'git' | 'agents' | 'debug'
type BottomPanelType = 'terminal' | 'problems' | 'output' | 'debate'

interface ActivityBarProps {
  activePanel: PanelType
  onPanelChange: (panel: PanelType) => void
}

export function ActivityBar({ activePanel, onPanelChange }: ActivityBarProps) {
  const theme = useIDEStore(s => s.theme)
  const toggleTheme = useIDEStore(s => s.toggleTheme)

  const items: { id: PanelType; icon: React.ReactNode; label: string }[] = [
    { id: 'files', icon: <Files className="h-5 w-5" />, label: 'Explorador' },
    { id: 'search', icon: <Search className="h-5 w-5" />, label: 'Buscar' },
    { id: 'git', icon: <GitBranch className="h-5 w-5" />, label: 'Git' },
    { id: 'agents', icon: <Bot className="h-5 w-5" />, label: 'Agentes' },
    { id: 'debug', icon: <Bug className="h-5 w-5" />, label: 'Debug' },
  ]

  return (
    <div className="w-12 bg-[#1e1e2e] flex flex-col items-center py-2 border-r border-border">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onPanelChange(item.id)}
          className={cn(
            'w-full p-3 flex justify-center transition-colors relative',
            activePanel === item.id 
              ? 'text-foreground' 
              : 'text-muted-foreground hover:text-foreground'
          )}
          title={item.label}
        >
          {activePanel === item.id && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-primary" />
          )}
          {item.icon}
        </button>
      ))}
      
      <div className="flex-1" />
      
      <button
        onClick={toggleTheme}
        className="w-full p-3 flex justify-center text-muted-foreground hover:text-foreground transition-colors"
        title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
      >
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
      
      <button
        className="w-full p-3 flex justify-center text-muted-foreground hover:text-foreground transition-colors"
        title="Configurações"
      >
        <Settings className="h-5 w-5" />
      </button>
    </div>
  )
}

interface BottomPanelTabsProps {
  activePanel: BottomPanelType
  onPanelChange: (panel: BottomPanelType) => void
  onClose: () => void
}

export function BottomPanelTabs({ activePanel, onPanelChange, onClose }: BottomPanelTabsProps) {
  const clearTerminal = useIDEStore(s => s.clearTerminal)
  
  const tabs: { id: BottomPanelType; icon: React.ReactNode; label: string }[] = [
    { id: 'terminal', icon: <TerminalIcon className="h-4 w-4" />, label: 'Terminal' },
    { id: 'problems', icon: <AlertCircle className="h-4 w-4" />, label: 'Problemas' },
    { id: 'output', icon: <FileOutput className="h-4 w-4" />, label: 'Saída' },
    { id: 'debate', icon: <MessageSquare className="h-4 w-4" />, label: 'Debate' },
  ]

  return (
    <div className="flex items-center justify-between px-2 bg-[#1e1e2e] border-t border-b border-border">
      <div className="flex">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onPanelChange(tab.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors border-b-2',
              activePanel === tab.id 
                ? 'text-foreground border-primary' 
                : 'text-muted-foreground border-transparent hover:text-foreground'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      
      <div className="flex items-center gap-1">
        {activePanel === 'terminal' && (
          <>
            <button
              onClick={clearTerminal}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Limpar terminal"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Reiniciar"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </>
        )}
        <button
          onClick={onClose}
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          title="Fechar painel"
        >
          <PanelBottomClose className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export function StatusBar() {
  const debateSession = useIDEStore(s => s.debateSession)
  const openTabs = useIDEStore(s => s.openTabs)
  const activeTabId = useIDEStore(s => s.activeTabId)

  const activeTab = openTabs.find(t => t.id === activeTabId)

  return (
    <div className="h-6 bg-[#1e1e2e] border-t border-border flex items-center justify-between px-3 text-xs">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5" />
          <span>main</span>
        </div>
        
        {debateSession && (
          <div className="flex items-center gap-1.5 text-amber-400">
            <Bot className="h-3.5 w-3.5" />
            <span>Debate: {debateSession.status}</span>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-4">
        {activeTab && (
          <>
            <span>Ln 1, Col 1</span>
            <span className="uppercase">{activeTab.language}</span>
            <span>UTF-8</span>
          </>
        )}
        <span className="text-green-400">GreenForge v2.3</span>
      </div>
    </div>
  )
}

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical'
  onResize: (delta: number) => void
}

export function ResizeHandle({ direction, onResize }: ResizeHandleProps) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const startPos = direction === 'horizontal' ? e.clientX : e.clientY

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? moveEvent.clientX : moveEvent.clientY
      const delta = currentPos - startPos
      onResize(delta)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div
      className={cn(
        'group bg-border hover:bg-primary transition-colors flex-shrink-0',
        direction === 'horizontal' 
          ? 'w-1 cursor-col-resize h-full' 
          : 'h-1 cursor-row-resize w-full'
      )}
      onMouseDown={handleMouseDown}
    >
      <div className={cn(
        'bg-primary opacity-0 group-hover:opacity-100 transition-opacity',
        direction === 'horizontal' ? 'w-full h-full' : 'w-full h-full'
      )} />
    </div>
  )
}

export function Toolbar() {
  const toggleSidebar = useIDEStore(s => s.toggleSidebar)
  const toggleBottomPanel = useIDEStore(s => s.toggleBottomPanel)
  const toggleRightPanel = useIDEStore(s => s.toggleRightPanel)
  const showSidebar = useIDEStore(s => s.showSidebar)
  const showBottomPanel = useIDEStore(s => s.showBottomPanel)
  const showRightPanel = useIDEStore(s => s.showRightPanel)
  const files = useIDEStore(s => s.files)
  const setFiles = useIDEStore(s => s.setFiles)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const generateId = () => Math.random().toString(36).substring(2, 11)

  const getLanguageFromFilename = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase()
    const langMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'md': 'markdown',
      'py': 'python',
      'yml': 'yaml',
      'yaml': 'yaml'
    }
    return langMap[ext || ''] || 'plaintext'
  }

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files
    if (!inputFiles) return

    const newFiles: FileNode[] = [...files]

    for (let i = 0; i < inputFiles.length; i++) {
      const file = inputFiles[i]
      const content = await file.text()
      
      const exists = newFiles.some(f => f.id === file.name)
      if (exists) continue

      newFiles.push({
        id: file.name,
        name: file.name,
        type: 'file',
        parentId: null,
        content,
        createdAt: Date.now(),
        language: getLanguageFromFilename(file.name)
      })
    }

    setFiles(newFiles)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFolderImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files
    if (!inputFiles) return

    const newFiles: FileNode[] = [...files]

    for (let i = 0; i < inputFiles.length; i++) {
      const file = inputFiles[i]
      const path = file.webkitRelativePath
      const parts = path.split('/')
      
      if (parts.some(p => p.startsWith('.') || p === 'node_modules')) continue

      let currentPath = ''
      for (let j = 0; j < parts.length - 1; j++) {
        const folderName = parts[j]
        const parentPath = currentPath ? currentPath : null
        currentPath = currentPath ? `${currentPath}/${folderName}` : folderName
        
        const folderExists = newFiles.some(f => f.id === currentPath)
        if (!folderExists) {
          newFiles.push({
            id: currentPath,
            name: folderName,
            type: 'folder',
            parentId: parentPath,
            content: '',
            createdAt: Date.now(),
            isOpen: j === 0
          })
        }
      }

      const content = await file.text()
      const fileName = parts[parts.length - 1]
      const parentPath = currentPath ? currentPath : null
      const fullPath = currentPath ? `${currentPath}/${fileName}` : fileName

      const fileExists = newFiles.some(f => f.id === fullPath)
      if (!fileExists) {
        newFiles.push({
          id: fullPath,
          name: fileName,
          type: 'file',
          parentId: parentPath,
          content,
          createdAt: Date.now(),
          language: getLanguageFromFilename(file.name)
        })
      }
    }

    setFiles(newFiles)
    if (folderInputRef.current) folderInputRef.current.value = ''
  }

  const handleExportProject = async () => {
    if (files.length === 0) {
      alert('Nao ha arquivos para exportar')
      return
    }

    const zip = new JSZip()

    const addToZip = (nodes: FileNode[], path: string = '') => {
      nodes.forEach(node => {
        const fullPath = path ? `${path}/${node.name}` : node.name
        
        if (node.type === 'file') {
          zip.file(fullPath, node.content || '')
        } else if (node.children) {
          addToZip(node.children, fullPath)
        }
      })
    }

    addToZip(files)

    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, 'greenforge-project.zip')
  }

  return (
    <div className="h-10 bg-[#1e1e2e] border-b border-border flex items-center justify-between px-3">
      <div className="flex items-center gap-2">
        <button
          onClick={toggleSidebar}
          className={cn(
            'p-1.5 rounded transition-colors',
            showSidebar ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
          title="Toggle Sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
        
        <div className="h-4 w-px bg-border mx-1" />
        
        <button
          className="p-1.5 text-green-400 hover:bg-green-500/10 rounded transition-colors"
          title="Run"
        >
          <Play className="h-4 w-4" />
        </button>
        <button
          className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
          title="Stop"
        >
          <Square className="h-4 w-4" />
        </button>
        
        <div className="h-4 w-px bg-border mx-1" />
        
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
          title="Importar Arquivos"
        >
          <Upload className="h-4 w-4" />
        </button>
        <button
          onClick={() => folderInputRef.current?.click()}
          className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
          title="Importar Pasta"
        >
          <FolderOpen className="h-4 w-4" />
        </button>
        <button
          onClick={handleExportProject}
          className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
          title="Exportar Projeto (ZIP)"
        >
          <Download className="h-4 w-4" />
        </button>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileImport}
          className="hidden"
          accept=".ts,.tsx,.js,.jsx,.json,.html,.css,.md,.py,.yml,.yaml,.txt"
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is not in types
          webkitdirectory=""
          onChange={handleFolderImport}
          className="hidden"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">GreenForge IDE</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleBottomPanel}
          className={cn(
            'p-1.5 rounded transition-colors',
            showBottomPanel ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
          title="Toggle Bottom Panel"
        >
          <PanelBottomClose className="h-4 w-4" />
        </button>
        <button
          onClick={toggleRightPanel}
          className={cn(
            'p-1.5 rounded transition-colors',
            showRightPanel ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
          title="Toggle Right Panel"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

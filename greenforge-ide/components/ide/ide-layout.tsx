'use client'

import React, { useEffect, useRef, useState } from 'react'
import { AlertCircle, FileOutput } from 'lucide-react'
import { useIDEStore } from '@/lib/store'
import { FileExplorer } from './file-explorer'
import { CodeEditor, EmptyEditor } from './code-editor'
import { EditorTabs, EditorBreadcrumb } from './editor-tabs'
import { Terminal } from './terminal'
import { ChatPanel } from './chat-panel'
import { ActivityBar, BottomPanelTabs, StatusBar, Toolbar, ResizeHandle } from './panels'
import { SearchPanel } from './search-panel'
import { GitPanel } from './git-panel'
import { AgentsPanel } from './agents-panel'
import { cn } from '@/lib/utils'

type PanelType = 'files' | 'search' | 'git' | 'agents' | 'debug'
type BottomPanelType = 'terminal' | 'problems' | 'output' | 'debate'

function DebugPanel() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6">
      <span className="text-4xl mb-4">🐛</span>
      <p className="text-sm text-center">
        O painel de debug mostrará breakpoints, variáveis e call stack durante a execução.
      </p>
    </div>
  )
}

function ProblemsPanel() {
  return (
    <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-6">
      <div className="text-center">
        <AlertCircle className="h-8 w-8 mx-auto mb-3 opacity-50" />
        <p>Nenhum problema encontrado</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Problemas de linting e erros aparecerao aqui
        </p>
      </div>
    </div>
  )
}

function OutputPanel() {
  return (
    <div className="h-full flex items-center justify-center font-mono text-sm p-6 bg-[#1e1e2e]">
      <div className="text-center text-muted-foreground">
        <FileOutput className="h-8 w-8 mx-auto mb-3 opacity-50" />
        <p>Aguardando saida...</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Logs de build e execucao aparecerao aqui
        </p>
      </div>
    </div>
  )
}

function DebatePanelBottom() {
  const debateSession = useIDEStore(s => s.debateSession)
  
  if (!debateSession) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        Nenhum debate em andamento. Inicie um debate no painel de chat.
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-3">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Sessão: {debateSession.id}</h3>
          <span className={cn(
            'text-xs px-2 py-1 rounded',
            debateSession.status === 'IN_PROGRESS' ? 'bg-amber-500/20 text-amber-400' :
            debateSession.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
            'bg-muted text-muted-foreground'
          )}>
            {debateSession.status}
          </span>
        </div>
        
        <div className="bg-muted rounded p-3">
          <div className="text-xs text-muted-foreground mb-1">Objetivo</div>
          <div className="text-sm">{debateSession.objective}</div>
        </div>

        {debateSession.inferredScope && (
          <div className="bg-muted rounded p-3">
            <div className="text-xs text-muted-foreground mb-1">Escopo Inferido</div>
            <div className="text-sm">{debateSession.inferredScope}</div>
          </div>
        )}

        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Round:</span>{' '}
            <span className="font-medium">{debateSession.currentRound}/3</span>
          </div>
          <div>
            <span className="text-muted-foreground">Confidence:</span>{' '}
            <span className="font-medium">{(debateSession.managerConfidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function IDELayout() {
  const {
    openTabs,
    activeTabId,
    updateTabContent,
    sidebarWidth,
    bottomPanelHeight,
    rightPanelWidth,
    showSidebar,
    showBottomPanel,
    showRightPanel,
    activeSidebarPanel,
    activeBottomPanel,
    setSidebarWidth,
    setBottomPanelHeight,
    setRightPanelWidth,
    toggleBottomPanel,
    setActiveSidebarPanel,
    setActiveBottomPanel,
    theme
  } = useIDEStore()

  const activeTab = openTabs.find(t => t.id === activeTabId)
  const containerRef = useRef<HTMLDivElement>(null)

  const [sidebarStartWidth, setSidebarStartWidth] = useState(sidebarWidth)
  const [bottomStartHeight, setBottomStartHeight] = useState(bottomPanelHeight)
  const [rightStartWidth, setRightStartWidth] = useState(rightPanelWidth)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const handleSidebarResize = (delta: number) => {
    setSidebarWidth(sidebarStartWidth + delta)
  }

  const handleBottomResize = (delta: number) => {
    setBottomPanelHeight(bottomStartHeight - delta)
  }

  const handleRightResize = (delta: number) => {
    setRightPanelWidth(rightStartWidth - delta)
  }

  const renderSidebarContent = () => {
    switch (activeSidebarPanel) {
      case 'files':
        return <FileExplorer />
      case 'search':
        return <SearchPanel />
      case 'git':
        return <GitPanel />
      case 'agents':
        return <AgentsPanel />
      case 'debug':
        return <DebugPanel />
      default:
        return <FileExplorer />
    }
  }

  const renderBottomContent = () => {
    switch (activeBottomPanel) {
      case 'terminal':
        return <Terminal />
      case 'problems':
        return <ProblemsPanel />
      case 'output':
        return <OutputPanel />
      case 'debate':
        return <DebatePanelBottom />
      default:
        return <Terminal />
    }
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        'h-screen flex flex-col overflow-hidden',
        theme === 'dark' ? 'dark' : ''
      )}
      style={{ backgroundColor: '#1e1e2e' }}
    >
      <Toolbar />

      <div className="flex-1 flex overflow-hidden">
        <ActivityBar 
          activePanel={activeSidebarPanel}
          onPanelChange={setActiveSidebarPanel}
        />

        {showSidebar && (
          <>
            <div 
              className="bg-[#252530] overflow-hidden flex flex-col"
              style={{ width: sidebarWidth }}
            >
              {renderSidebarContent()}
            </div>
            <ResizeHandle 
              direction="horizontal"
              onResize={handleSidebarResize}
            />
          </>
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {activeTab ? (
                <>
                  <EditorTabs />
                  <EditorBreadcrumb />
                  <div className="flex-1 overflow-hidden">
                    <CodeEditor
                      content={activeTab.content}
                      language={activeTab.language}
                      onChange={(content) => updateTabContent(activeTab.id, content)}
                    />
                  </div>
                </>
              ) : (
                <EmptyEditor />
              )}
            </div>

            {showBottomPanel && (
              <>
                <ResizeHandle 
                  direction="vertical"
                  onResize={handleBottomResize}
                />
                <div 
                  className="bg-[#1e1e2e] flex flex-col overflow-hidden"
                  style={{ height: bottomPanelHeight }}
                >
                  <BottomPanelTabs
                    activePanel={activeBottomPanel}
                    onPanelChange={setActiveBottomPanel}
                    onClose={toggleBottomPanel}
                  />
                  <div className="flex-1 overflow-hidden">
                    {renderBottomContent()}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {showRightPanel && (
          <>
            <ResizeHandle 
              direction="horizontal"
              onResize={handleRightResize}
            />
            <div 
              className="bg-[#252530] overflow-hidden"
              style={{ width: rightPanelWidth }}
            >
              <ChatPanel />
            </div>
          </>
        )}
      </div>

      <StatusBar />
    </div>
  )
}

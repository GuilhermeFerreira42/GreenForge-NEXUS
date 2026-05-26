'use client'

import React from 'react'
import { X, Circle } from 'lucide-react'
import { useIDEStore } from '@/lib/store'
import { cn } from '@/lib/utils'

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  
  const iconColors: Record<string, string> = {
    'ts': 'text-blue-400',
    'tsx': 'text-blue-400',
    'js': 'text-yellow-400',
    'jsx': 'text-yellow-400',
    'json': 'text-yellow-600',
    'md': 'text-gray-400',
    'css': 'text-pink-400',
    'html': 'text-orange-400',
    'py': 'text-green-400'
  }

  return iconColors[ext || ''] || 'text-gray-400'
}

export function EditorTabs() {
  const openTabs = useIDEStore(s => s.openTabs)
  const activeTabId = useIDEStore(s => s.activeTabId)
  const setActiveTab = useIDEStore(s => s.setActiveTab)
  const closeTab = useIDEStore(s => s.closeTab)

  if (openTabs.length === 0) {
    return null
  }

  return (
    <div className="flex items-center bg-[#1e1e2e] border-b border-border overflow-x-auto">
      {openTabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            'group flex items-center gap-2 px-3 py-2 border-r border-border cursor-pointer min-w-[120px] max-w-[200px]',
            activeTabId === tab.id 
              ? 'bg-[#282c34] text-foreground' 
              : 'bg-[#1e1e2e] text-muted-foreground hover:bg-[#252530]'
          )}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className={cn('text-xs', getFileIcon(tab.name))}>
            {tab.name.split('.').pop()?.toUpperCase()}
          </span>
          <span className="flex-1 text-sm truncate">{tab.name}</span>
          
          <div className="flex items-center">
            {tab.isDirty && (
              <Circle className="h-2 w-2 fill-current text-blue-400 mr-1" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              className="opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5 transition-opacity"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function EditorPanel({ children }: { children: React.ReactNode }) {
  const openTabs = useIDEStore(s => s.openTabs)
  const activeTabId = useIDEStore(s => s.activeTabId)

  return (
    <div className="flex flex-col h-full bg-[#282c34]">
      <EditorTabs />
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  )
}

export function EditorBreadcrumb() {
  const openTabs = useIDEStore(s => s.openTabs)
  const activeTabId = useIDEStore(s => s.activeTabId)
  const files = useIDEStore(s => s.files)

  const activeTab = openTabs.find(t => t.id === activeTabId)

  if (!activeTab) return null

  const findPath = (nodes: typeof files, targetId: string, path: string[] = []): string[] | null => {
    for (const node of nodes) {
      if (node.id === targetId) {
        return [...path, node.name]
      }
      if (node.children) {
        const found = findPath(node.children, targetId, [...path, node.name])
        if (found) return found
      }
    }
    return null
  }

  const filePath = findPath(files, activeTab.id) || [activeTab.name]

  return (
    <div className="px-3 py-1 text-xs text-muted-foreground bg-[#1e1e2e] border-b border-border flex items-center gap-1">
      {filePath.map((segment, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="text-muted-foreground/50">/</span>}
          <span className={index === filePath.length - 1 ? 'text-foreground' : ''}>
            {segment}
          </span>
        </React.Fragment>
      ))}
    </div>
  )
}

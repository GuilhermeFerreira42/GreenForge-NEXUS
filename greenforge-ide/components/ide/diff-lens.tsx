'use client'

import React, { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { diffLines, Change } from 'diff'
import { ChevronDown, ChevronRight, Copy, Check, FileCode, Plus, Minus, Edit3 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DiffLensProps {
  oldCode: string
  newCode: string
  fileName?: string
  language?: string
  className?: string
  showLineNumbers?: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function DiffLens({
  oldCode,
  newCode,
  fileName = 'arquivo',
  language = 'typescript',
  className,
  showLineNumbers = true,
  collapsed = false,
  onToggleCollapse
}: DiffLensProps) {
  const [copied, setCopied] = React.useState(false)

  const diff = useMemo(() => diffLines(oldCode, newCode), [oldCode, newCode])

  const stats = useMemo(() => {
    let additions = 0
    let deletions = 0
    
    diff.forEach(part => {
      const lines = part.value.split('\n').filter(l => l !== '')
      if (part.added) additions += lines.length
      if (part.removed) deletions += lines.length
    })
    
    return { additions, deletions }
  }, [diff])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(newCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const renderDiff = useMemo(() => {
    let oldLineNum = 1
    let newLineNum = 1
    
    return diff.map((part, partIndex) => {
      const lines = part.value.split('\n')
      if (lines[lines.length - 1] === '') lines.pop()
      
      return lines.map((line, lineIndex) => {
        const key = `${partIndex}-${lineIndex}`
        let leftNum = ''
        let rightNum = ''
        let lineClass = ''
        let prefix = ' '
        let bgClass = ''
        
        if (part.added) {
          rightNum = String(newLineNum++)
          lineClass = 'text-emerald-400'
          prefix = '+'
          bgClass = 'bg-emerald-500/10'
        } else if (part.removed) {
          leftNum = String(oldLineNum++)
          lineClass = 'text-red-400'
          prefix = '-'
          bgClass = 'bg-red-500/10'
        } else {
          leftNum = String(oldLineNum++)
          rightNum = String(newLineNum++)
          lineClass = 'text-muted-foreground'
        }

        return (
          <div key={key} className={cn('flex group', bgClass)}>
            {showLineNumbers && (
              <>
                <span className="w-12 px-2 text-right text-xs text-muted-foreground/50 select-none shrink-0 font-mono">
                  {leftNum}
                </span>
                <span className="w-12 px-2 text-right text-xs text-muted-foreground/50 select-none shrink-0 font-mono">
                  {rightNum}
                </span>
              </>
            )}
            <span className={cn('w-6 text-center font-mono text-xs select-none shrink-0', lineClass)}>
              {prefix}
            </span>
            <span className={cn('flex-1 font-mono text-sm whitespace-pre', lineClass)}>
              {line || ' '}
            </span>
          </div>
        )
      })
    }).flat()
  }, [diff, showLineNumbers])

  return (
    <div className={cn('rounded-lg border border-border overflow-hidden', className)}>
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          {onToggleCollapse && (
            <button 
              onClick={onToggleCollapse}
              className="p-0.5 hover:bg-muted rounded transition-colors"
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          )}
          <FileCode className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{fileName}</span>
          <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
            {language}
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-emerald-400">
              <Plus className="h-3 w-3" />
              {stats.additions}
            </span>
            <span className="flex items-center gap-1 text-red-400">
              <Minus className="h-3 w-3" />
              {stats.deletions}
            </span>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 px-2 text-xs"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 mr-1" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="h-3 w-3 mr-1" />
                Copiar
              </>
            )}
          </Button>
        </div>
      </div>

      {!collapsed && (
        <div className="bg-[#1a1a24] overflow-auto max-h-[400px]">
          {renderDiff}
        </div>
      )}

      {collapsed && (
        <div className="px-4 py-3 text-sm text-muted-foreground bg-muted/30">
          <span className="flex items-center gap-2">
            <Edit3 className="h-4 w-4" />
            {stats.additions + stats.deletions} alterações ({stats.additions} adições, {stats.deletions} remoções)
          </span>
        </div>
      )}
    </div>
  )
}

interface InlineDiffProps {
  oldText: string
  newText: string
  className?: string
}

export function InlineDiff({ oldText, newText, className }: InlineDiffProps) {
  if (oldText === newText) {
    return <span className={className}>{newText}</span>
  }

  return (
    <span className={className}>
      <span className="bg-red-500/20 text-red-400 line-through">{oldText}</span>
      <span className="mx-1">→</span>
      <span className="bg-emerald-500/20 text-emerald-400">{newText}</span>
    </span>
  )
}

interface DiffSummaryProps {
  files: Array<{
    name: string
    additions: number
    deletions: number
    status: 'added' | 'modified' | 'deleted'
  }>
  className?: string
}

export function DiffSummary({ files, className }: DiffSummaryProps) {
  const totals = useMemo(() => {
    return files.reduce(
      (acc, file) => ({
        additions: acc.additions + file.additions,
        deletions: acc.deletions + file.deletions
      }),
      { additions: 0, deletions: 0 }
    )
  }, [files])

  return (
    <div className={cn('rounded-lg border border-border p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Resumo das Alterações</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-emerald-400">+{totals.additions}</span>
          <span className="text-red-400">-{totals.deletions}</span>
        </div>
      </div>

      <div className="space-y-2">
        {files.map((file, i) => (
          <div 
            key={i}
            className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className={cn(
                'w-1.5 h-1.5 rounded-full',
                file.status === 'added' && 'bg-emerald-400',
                file.status === 'modified' && 'bg-amber-400',
                file.status === 'deleted' && 'bg-red-400'
              )} />
              <span className="font-mono text-xs">{file.name}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {file.additions > 0 && (
                <span className="text-emerald-400">+{file.additions}</span>
              )}
              {file.deletions > 0 && (
                <span className="text-red-400">-{file.deletions}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

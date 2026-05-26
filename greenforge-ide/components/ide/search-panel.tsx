'use client'

import React, { useState } from 'react'
import { Search, X, ChevronDown, ChevronRight, Replace, FileText } from 'lucide-react'
import { useIDEStore, FileNode } from '@/lib/store'
import { cn } from '@/lib/utils'

interface SearchResult {
  fileId: string
  fileName: string
  filePath: string
  matches: {
    line: number
    content: string
    matchStart: number
    matchEnd: number
  }[]
}

export function SearchPanel() {
  const getFilesTree = useIDEStore(s => s.getFilesTree)
  const files = getFilesTree()
  const addTab = useIDEStore(s => s.addTab)
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  const searchInFiles = (nodes: FileNode[], query: string, path: string = ''): SearchResult[] => {
    const results: SearchResult[] = []
    
    if (!query.trim()) return results

    for (const node of nodes) {
      const currentPath = path ? `${path}/${node.name}` : node.name

      if (node.type === 'file' && node.content) {
        const lines = node.content.split('\n')
        const matches: SearchResult['matches'] = []

        lines.forEach((line, index) => {
          let searchTerm = query
          let lineToSearch = line

          if (!caseSensitive) {
            searchTerm = searchTerm.toLowerCase()
            lineToSearch = lineToSearch.toLowerCase()
          }

          let startIndex = 0
          let matchIndex: number

          while ((matchIndex = lineToSearch.indexOf(searchTerm, startIndex)) !== -1) {
            if (wholeWord) {
              const before = matchIndex === 0 ? ' ' : lineToSearch[matchIndex - 1]
              const after = matchIndex + searchTerm.length >= lineToSearch.length 
                ? ' ' 
                : lineToSearch[matchIndex + searchTerm.length]
              
              if (!/\s|[^a-zA-Z0-9_]/.test(before) || !/\s|[^a-zA-Z0-9_]/.test(after)) {
                startIndex = matchIndex + 1
                continue
              }
            }

            matches.push({
              line: index + 1,
              content: line,
              matchStart: matchIndex,
              matchEnd: matchIndex + query.length
            })
            startIndex = matchIndex + 1
          }
        })

        if (matches.length > 0) {
          results.push({
            fileId: node.id,
            fileName: node.name,
            filePath: currentPath,
            matches
          })
        }
      }

      if (node.children) {
        results.push(...searchInFiles(node.children, query, currentPath))
      }
    }

    return results

  }

  const handleSearch = () => {
    const searchResults = searchInFiles(files, searchQuery)
    setResults(searchResults)
    setExpandedFiles(new Set(searchResults.map(r => r.fileId)))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const toggleFileExpanded = (fileId: string) => {
    const newExpanded = new Set(expandedFiles)
    if (newExpanded.has(fileId)) {
      newExpanded.delete(fileId)
    } else {
      newExpanded.add(fileId)
    }
    setExpandedFiles(newExpanded)
  }

  const openFileAtLine = (result: SearchResult, lineNumber: number) => {
    const findFile = (nodes: FileNode[]): FileNode | null => {
      for (const node of nodes) {
        if (node.id === result.fileId) return node
        if (node.children) {
          const found = findFile(node.children)
          if (found) return found
        }
      }
      return null
    }

    const file = findFile(files)
    if (file && file.type === 'file') {
      addTab({
        id: file.id,
        name: file.name,
        content: file.content || '',
        language: file.language || 'plaintext',
        isDirty: false
      })
    }
  }

  const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0)

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
        Buscar
      </div>

      <div className="px-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar"
            className="w-full bg-muted pl-8 pr-8 py-1.5 text-sm rounded border border-border outline-none focus:border-primary"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('')
                setResults([])
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {showReplace && (
          <div className="relative">
            <Replace className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              placeholder="Substituir"
              className="w-full bg-muted pl-8 pr-2 py-1.5 text-sm rounded border border-border outline-none focus:border-primary"
            />
          </div>
        )}

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setShowReplace(!showReplace)}
            className={cn(
              'px-2 py-1 rounded',
              showReplace ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
            )}
          >
            Substituir
          </button>
          <button
            onClick={() => setCaseSensitive(!caseSensitive)}
            className={cn(
              'px-2 py-1 rounded font-mono',
              caseSensitive ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
            )}
            title="Diferenciar maiúsculas/minúsculas"
          >
            Aa
          </button>
          <button
            onClick={() => setWholeWord(!wholeWord)}
            className={cn(
              'px-2 py-1 rounded',
              wholeWord ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
            )}
            title="Palavra inteira"
          >
            ab
          </button>
          <button
            onClick={() => setUseRegex(!useRegex)}
            className={cn(
              'px-2 py-1 rounded font-mono',
              useRegex ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
            )}
            title="Usar expressão regular"
          >
            .*
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto mt-3">
        {searchQuery && results.length > 0 && (
          <div className="px-3 py-1 text-xs text-muted-foreground border-b border-border">
            {totalMatches} resultado{totalMatches !== 1 ? 's' : ''} em {results.length} arquivo{results.length !== 1 ? 's' : ''}
          </div>
        )}

        {searchQuery && results.length === 0 && (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            Nenhum resultado encontrado
          </div>
        )}

        {results.map((result) => (
          <div key={result.fileId}>
            <button
              onClick={() => toggleFileExpanded(result.fileId)}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 text-left"
            >
              {expandedFiles.has(result.fileId) ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-sm truncate">{result.fileName}</span>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {result.matches.length}
              </span>
            </button>

            {expandedFiles.has(result.fileId) && (
              <div className="pl-8">
                {result.matches.slice(0, 20).map((match, index) => (
                  <button
                    key={index}
                    onClick={() => openFileAtLine(result, match.line)}
                    className="w-full flex items-start gap-2 px-2 py-1 hover:bg-muted/50 text-left"
                  >
                    <span className="text-xs text-muted-foreground w-8 text-right shrink-0">
                      {match.line}
                    </span>
                    <span className="text-xs font-mono truncate">
                      {match.content.slice(0, match.matchStart)}
                      <span className="bg-yellow-500/30 text-yellow-200">
                        {match.content.slice(match.matchStart, match.matchEnd)}
                      </span>
                      {match.content.slice(match.matchEnd)}
                    </span>
                  </button>
                ))}
                {result.matches.length > 20 && (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    +{result.matches.length - 20} mais...
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useIDEStore } from '@/lib/store'
import { Loader2 } from 'lucide-react'

export function Terminal() {
  const terminalHistory = useIDEStore(s => s.terminalHistory)
  const addTerminalLine = useIDEStore(s => s.addTerminalLine)
  const executeTerminalCommand = useIDEStore(s => s.executeTerminalCommand)
  const clearTerminal = useIDEStore(s => s.clearTerminal)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [currentInput, setCurrentInput] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isLoading, setIsLoading] = useState(false)

  const handleExecute = useCallback(async (input: string) => {
    const trimmed = input.trim()
    if (!trimmed) return

    setIsLoading(true)
    setCommandHistory(prev => [...prev, trimmed])
    setHistoryIndex(-1)

    try {
      await executeTerminalCommand(trimmed)
    } catch (e: any) {
      addTerminalLine(`\x1b[31m[ERRO EXECUÇÃO]: ${e.message}\x1b[0m`)
    } finally {
      setIsLoading(false)
    }
  }, [executeTerminalCommand, addTerminalLine])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isLoading) {
      e.preventDefault()
      return
    }

    if (e.key === 'Enter') {
      handleExecute(currentInput)
      setCurrentInput('')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length > 0) {
        const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex
        setHistoryIndex(newIndex)
        setCurrentInput(commandHistory[commandHistory.length - 1 - newIndex] || '')
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setCurrentInput(commandHistory[commandHistory.length - 1 - newIndex] || '')
      } else {
        setHistoryIndex(-1)
        setCurrentInput('')
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      clearTerminal()
    }
  }

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [terminalHistory, isLoading])

  const handleContainerClick = () => {
    inputRef.current?.focus()
  }

  const renderAnsiText = (text: string) => {
    const parts = text.split(/\x1b\[(\d+)m/)
    let currentClass = ''
    
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        switch (part) {
          case '0': currentClass = ''; break
          case '31': currentClass = 'text-red-400'; break
          case '32': currentClass = 'text-green-400'; break
          case '33': currentClass = 'text-yellow-400 font-medium'; break
          case '34': currentClass = 'text-blue-400 font-semibold'; break
          case '36': currentClass = 'text-cyan-400 font-medium'; break
          case '90': currentClass = 'text-gray-500'; break
        }
        return null
      }
      return part ? <span key={index} className={currentClass}>{part}</span> : null
    })
  }

  return (
    <div 
      id="terminal-container"
      className="h-full bg-[#0d0e15] text-[#d1d5db] font-mono text-xs md:text-sm p-4 overflow-auto cursor-text selection:bg-neutral-700 leading-relaxed"
      onClick={handleContainerClick}
    >
      {terminalHistory.length === 0 && !isLoading ? (
        <div className="text-gray-500 select-none">
          <div className="font-semibold text-primary/80">GreenForge OS Terminal v2.3</div>
          <div className="text-xs mt-1">Digite &quot;help&quot; para verificar comandos VFS locais e de cota.</div>
          <div className="mt-2" />
        </div>
      ) : (
        terminalHistory.map((line, index) => (
          <div key={index} className="whitespace-pre-wrap">
            {renderAnsiText(line)}
          </div>
        ))
      )}
      
      <div className="flex items-center mt-1">
        <span className="text-green-400 mr-2 font-bold flex items-center gap-1">
          $
          {isLoading && <Loader2 className="h-3 w-3 animate-spin text-amber-400 inline" />}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={currentInput}
          onChange={(e) => setCurrentInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          className="flex-1 bg-transparent outline-none caret-amber-400 font-mono text-[#f3f4f6]"
          autoFocus
          spellCheck={false}
          placeholder={isLoading ? "Aguardando resposta..." : ""}
        />
      </div>
    </div>
  )
}

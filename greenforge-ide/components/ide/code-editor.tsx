'use client'

import React, { useEffect, useRef, useMemo } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldKeymap } from '@codemirror/language'
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { lintKeymap } from '@codemirror/lint'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import { useIDEStore } from '@/lib/store'

const languageCompartment = new Compartment()

function getLanguageExtension(language: string) {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return javascript({ jsx: true, typescript: language === 'typescript' })
    case 'html':
      return html()
    case 'css':
      return css()
    case 'json':
      return json()
    case 'markdown':
      return markdown()
    case 'python':
      return python()
    default:
      return javascript()
  }
}

interface CodeEditorProps {
  content: string
  language: string
  onChange: (content: string) => void
  readOnly?: boolean
}

export function CodeEditor({ content, language, onChange, readOnly = false }: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const theme = useIDEStore(s => s.theme)

  const extensions = useMemo(() => [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab
    ]),
    languageCompartment.of(getLanguageExtension(language)),
    oneDark,
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !readOnly) {
        onChange(update.state.doc.toString())
      }
    }),
    EditorState.readOnly.of(readOnly),
    EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '13px'
      },
      '.cm-scroller': {
        fontFamily: 'var(--font-mono), ui-monospace, monospace',
        overflow: 'auto'
      },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        borderRight: '1px solid var(--border)'
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'rgba(255,255,255,0.05)'
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(255,255,255,0.03)'
      }
    })
  ], [language, onChange, readOnly])

  useEffect(() => {
    if (!editorRef.current) return

    const state = EditorState.create({
      doc: content,
      extensions
    })

    const view = new EditorView({
      state,
      parent: editorRef.current
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Apenas cria o editor uma vez

  useEffect(() => {
    if (viewRef.current) {
      const currentContent = viewRef.current.state.doc.toString()
      if (currentContent !== content) {
        viewRef.current.dispatch({
          changes: { from: 0, to: currentContent.length, insert: content }
        })
      }
    }
  }, [content])

  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: languageCompartment.reconfigure(getLanguageExtension(language))
      })
    }
  }, [language])

  return (
    <div 
      ref={editorRef} 
      className="h-full w-full overflow-hidden"
      style={{ backgroundColor: '#282c34' }}
    />
  )
}

export function EmptyEditor() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-[#1e1e2e]">
      <div className="text-center space-y-4">
        <div className="text-6xl opacity-20">{ }</div>
        <h2 className="text-xl font-semibold">GreenForge IDE</h2>
        <p className="text-sm max-w-md">
          Selecione um arquivo no explorador para começar a editar, 
          ou inicie um novo debate com os agentes de IA.
        </p>
        <div className="flex flex-col gap-2 text-xs text-muted-foreground/70">
          <div className="flex items-center gap-2 justify-center">
            <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl+P</kbd>
            <span>Busca rápida de arquivos</span>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl+Shift+E</kbd>
            <span>Focar no explorador</span>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl+`</kbd>
            <span>Abrir terminal</span>
          </div>
        </div>
      </div>
    </div>
  )
}

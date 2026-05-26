'use client'

import React, { useState } from 'react'
import { 
  GitBranch, 
  GitCommit, 
  GitPullRequest, 
  Plus, 
  RefreshCw, 
  Check,
  X,
  ChevronDown,
  ChevronRight,
  FileText,
  FilePlus,
  FileMinus,
  FileEdit
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIDEStore, GitFile } from '@/lib/store'

const mockBranches = ['main', 'develop', 'feature/debate-protocol', 'feature/approval-cards']

export function GitPanel() {
  const files = useIDEStore(s => s.gitFiles)
  const currentBranch = useIDEStore(s => s.currentBranch)
  const gitCommits = useIDEStore(s => s.gitCommits)
  const setBranch = useIDEStore(s => s.setBranch)
  const stageFile = useIDEStore(s => s.stageFile)
  const unstageFile = useIDEStore(s => s.unstageFile)
  const stageAll = useIDEStore(s => s.stageAll)
  const unstageAll = useIDEStore(s => s.unstageAll)
  const doCommit = useIDEStore(s => s.commit)

  const [commitMessage, setCommitMessage] = useState('')
  const [showBranches, setShowBranches] = useState(false)
  const [showCommits, setShowCommits] = useState(true)
  const [showChanges, setShowChanges] = useState(true)
  const [showStaged, setShowStaged] = useState(true)

  const stagedFiles = files.filter(f => f.staged)
  const unstagedFiles = files.filter(f => !f.staged)

  const handleCommit = () => {
    if (!commitMessage.trim() || stagedFiles.length === 0) return
    doCommit(commitMessage.trim())
    setCommitMessage('')
  }

  const getStatusIcon = (status: GitFile['status']) => {
    switch (status) {
      case 'modified': return <FileEdit className="h-4 w-4 text-amber-400" />
      case 'added': return <FilePlus className="h-4 w-4 text-green-400" />
      case 'deleted': return <FileMinus className="h-4 w-4 text-red-400" />
      case 'untracked': return <FileText className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusLabel = (status: GitFile['status']) => {
    switch (status) {
      case 'modified': return 'M'
      case 'added': return 'A'
      case 'deleted': return 'D'
      case 'untracked': return 'U'
    }
  }

  return (
    <div className="h-full flex flex-col selection:bg-primary/20">
      <div className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground flex items-center justify-between border-b border-border/40 select-none">
        <span>Controle de Versão</span>
        <button className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="Atualizar">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-3 py-3">
        <button
          id="btn-toggle-branches"
          onClick={() => setShowBranches(!showBranches)}
          className="w-full flex items-center justify-between bg-muted/80 px-3 py-2 rounded text-xs md:text-sm hover:bg-muted/60 transition-colors border border-border/20 select-none font-medium"
        >
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary animate-pulse" />
            <span>{currentBranch}</span>
          </div>
          <ChevronDown className="h-4 w-4" />
        </button>

        {showBranches && (
          <div className="mt-1 bg-muted/95 border border-border/30 rounded overflow-hidden select-none animate-in fade-in duration-100 z-50 relative">
            {mockBranches.map((branch) => (
              <button
                key={branch}
                onClick={() => {
                  setBranch(branch)
                  setShowBranches(false)
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-xs md:text-sm hover:bg-muted/60 transition-colors',
                  branch === currentBranch && 'bg-primary/10 text-primary font-semibold'
                )}
              >
                <GitBranch className="h-4 w-4 text-primary/70" />
                {branch}
                {branch === currentBranch && <Check className="h-4 w-4 ml-auto" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 pb-3 border-b border-border/30">
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Mensagem do commit... (ex: feat: Add debate protocol)"
          className="w-full bg-muted/60 px-3 py-2 text-xs rounded border border-border/40 outline-none focus:ring-1 focus:ring-ring resize-none"
          rows={2}
        />
        <button
          id="btn-git-commit"
          onClick={handleCommit}
          disabled={!commitMessage.trim() || stagedFiles.length === 0}
          className={cn(
            'w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded text-xs font-semibold transition-all shadow-sm',
            commitMessage.trim() && stagedFiles.length > 0
              ? 'bg-primary text-primary-foreground hover:bg-primary/95 hover:shadow cursor-pointer'
              : 'bg-muted text-muted-foreground/50 cursor-not-allowed border border-border/20'
          )}
        >
          <GitCommit className="h-4 w-4" />
          Comitar {stagedFiles.length > 0 ? `(${stagedFiles.length} arquivos)` : ''}
        </button>
      </div>

      <div className="flex-1 overflow-auto py-2">
        {stagedFiles.length > 0 && (
          <div className="mb-2">
            <div
              onClick={() => setShowStaged(!showStaged)}
              className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-muted/40 cursor-pointer select-none"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {showStaged ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span>Arquivos em Stage</span>
                <span className="text-[10px] bg-green-500/10 border border-green-500/25 text-green-400 px-1.5 py-0.5 rounded font-mono">
                  {stagedFiles.length}
                </span>
              </div>
              <button
                id="btn-git-unstage-all"
                onClick={(e) => {
                  e.stopPropagation()
                  unstageAll()
                }}
                className="text-2xs text-[#9ca3af] hover:text-foreground relative z-10 font-bold uppercase tracking-wider hover:underline"
              >
                Remover todos
              </button>
            </div>

            {showStaged && (
              <div id="staged-files-list" className="pl-4 pr-2">
                {stagedFiles.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center gap-2 px-3 py-1 hover:bg-muted/40 group rounded-md"
                  >
                    {getStatusIcon(file.status)}
                    <span className="flex-1 text-xs truncate max-w-[150px] md:max-w-xs">{file.path}</span>
                    <span className="text-2xs font-mono font-bold text-green-400 w-4 text-center">
                      {getStatusLabel(file.status)}
                    </span>
                    <button
                      id={`btn-git-unstage-${file.path}`}
                      onClick={() => unstageFile(file.path)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground rounded p-0.5 hover:bg-muted"
                      title="Remover do Stage"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {unstagedFiles.length > 0 && (
          <div className="mb-2">
            <div
              onClick={() => setShowChanges(!showChanges)}
              className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-muted/40 cursor-pointer select-none"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {showChanges ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span>Arquivos Modificados</span>
                <span className="text-[10px] bg-amber-500/10 border border-amber-500/25 text-amber-400 px-1.5 py-0.5 rounded font-mono">
                  {unstagedFiles.length}
                </span>
              </div>
              <button
                id="btn-git-stage-all"
                onClick={(e) => {
                  e.stopPropagation()
                  stageAll()
                }}
                className="text-2xs text-[#9ca3af] hover:text-foreground relative z-10 font-bold uppercase tracking-wider hover:underline"
              >
                Colocar todos
              </button>
            </div>

            {showChanges && (
              <div id="unstaged-files-list" className="pl-4 pr-2">
                {unstagedFiles.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center gap-2 px-3 py-1 hover:bg-muted/40 group rounded-md"
                  >
                    {getStatusIcon(file.status)}
                    <span className="flex-1 text-xs truncate max-w-[150px] md:max-w-xs">{file.path}</span>
                    <span className="text-2xs font-mono font-bold text-amber-400 w-4 text-center">
                      {getStatusLabel(file.status)}
                    </span>
                    <button
                      id={`btn-git-stage-${file.path}`}
                      onClick={() => stageFile(file.path)}
                      className="opacity-0 group-hover:opacity-100 text-[#9ca3af] hover:text-foreground rounded p-0.5 hover:bg-muted"
                      title="Adicionar ao Stage"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {unstagedFiles.length === 0 && stagedFiles.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground select-none">
            Diretório de trabalho limpo. Nada para comitar.
          </div>
        )}

        <div className="mt-2 border-t border-border/30 pt-2">
          <button
            onClick={() => setShowCommits(!showCommits)}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
          >
            {showCommits ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span>Histórico de Commits</span>
            <span className="text-[10px] bg-muted px-1.5 rounded font-mono ml-auto">
              {gitCommits.length}
            </span>
          </button>

          {showCommits && (
            <div id="git-commits-history-list" className="pl-4 pr-2 overflow-y-auto max-h-48 mt-1 space-y-1">
              {gitCommits.map((commit) => (
                <div
                  key={commit.hash}
                  className="flex items-start gap-2 px-3 py-1.5 hover:bg-muted/40 rounded-md"
                >
                  <GitCommit className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{commit.message}</div>
                    <div className="text-2xs text-[#9ca3af] flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono bg-neutral-800 px-1 py-0.5 rounded text-primary">{commit.hash}</span>
                      <span>•</span>
                      <span>{commit.author}</span>
                      <span>•</span>
                      <span>{commit.date}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

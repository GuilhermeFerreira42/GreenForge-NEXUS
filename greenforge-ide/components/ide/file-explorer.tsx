'use client'

import React, { useState } from 'react'
import { 
  ChevronRight, 
  ChevronDown, 
  File, 
  Folder, 
  FolderOpen,
  Plus,
  Trash2,
  Edit3,
  FileCode,
  FileJson,
  FileText,
  Braces,
  Download
} from 'lucide-react'
import { useIDEStore, FileNode, TabItem } from '@/lib/store'
import { cn } from '@/lib/utils'

interface FileIconProps {
  name: string
  isFolder: boolean
  isOpen?: boolean
}

function FileIcon({ name, isFolder, isOpen }: FileIconProps) {
  if (isFolder) {
    return isOpen ? (
      <FolderOpen className="h-4 w-4 text-amber-400" />
    ) : (
      <Folder className="h-4 w-4 text-amber-400" />
    )
  }

  const ext = name.split('.').pop()?.toLowerCase()
  
  switch (ext) {
    case 'ts':
    case 'tsx':
      return <FileCode className="h-4 w-4 text-blue-400" />
    case 'js':
    case 'jsx':
      return <Braces className="h-4 w-4 text-yellow-400" />
    case 'json':
      return <FileJson className="h-4 w-4 text-yellow-600" />
    case 'md':
      return <FileText className="h-4 w-4 text-gray-400" />
    case 'css':
      return <FileCode className="h-4 w-4 text-pink-400" />
    case 'html':
      return <FileCode className="h-4 w-4 text-orange-400" />
    default:
      return <File className="h-4 w-4 text-gray-400" />
  }
}

interface FileTreeItemProps {
  node: FileNode
  depth: number
  onSelect: (node: FileNode) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, newName: string) => void
  onAddFile: (parentId: string, type: 'file' | 'folder') => void
}

function FileTreeItem({ 
  node, 
  depth, 
  onSelect, 
  onToggle,
  onDelete,
  onRename,
  onAddFile
}: FileTreeItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(node.name)
  const [showActions, setShowActions] = useState(false)
  const activeTabId = useIDEStore(s => s.activeTabId)

  const handleDoubleClick = () => {
    if (node.type === 'file') {
      setIsEditing(true)
    }
  }

  const handleRename = () => {
    if (editValue.trim() && editValue !== node.name) {
      onRename(node.id, editValue.trim())
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename()
    } else if (e.key === 'Escape') {
      setEditValue(node.name)
      setIsEditing(false)
    }
  }

  const isActive = activeTabId === node.id

  return (
    <div id={`item-${node.id}`}>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-muted/50 group',
          isActive && 'bg-muted/80 text-primary-foreground'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => node.type === 'folder' ? onToggle(node.id) : onSelect(node)}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {node.type === 'folder' && (
          <span className="w-4 h-4 flex items-center justify-center text-muted-foreground">
            {node.isOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </span>
        )}
        
        <FileIcon 
          name={node.name} 
          isFolder={node.type === 'folder'} 
          isOpen={node.isOpen} 
        />
        
        {isEditing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-background border border-ring px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 text-sm truncate font-medium">{node.name}</span>
        )}

        {showActions && !isEditing && (
          <div className="flex items-center gap-1 opacity-100 transition-opacity">
            {node.type === 'folder' && (
              <>
                <button
                  id={`btn-add-file-${node.id}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddFile(node.id, 'file')
                  }}
                  className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                  title="Novo arquivo"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <button
                  id={`btn-add-folder-${node.id}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddFile(node.id, 'folder')
                  }}
                  className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                  title="Nova pasta"
                >
                  <Folder className="h-3 w-3" />
                </button>
              </>
            )}
            <button
              id={`btn-rename-${node.id}`}
              onClick={(e) => {
                e.stopPropagation()
                setIsEditing(true)
              }}
              className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
              title="Renomear"
            >
              <Edit3 className="h-3 w-3" />
            </button>
            <button
              id={`btn-delete-${node.id}`}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(node.id)
              }}
              className="p-1 hover:bg-destructive/10 rounded text-destructive hover:text-destructive-foreground"
              title="Excluir"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {node.type === 'folder' && node.isOpen && node.children && (
        <div id={`children-of-${node.id}`}>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              onToggle={onToggle}
              onDelete={onDelete}
              onRename={onRename}
              onAddFile={onAddFile}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FileExplorer() {
  const getFilesTree = useIDEStore(s => s.getFilesTree)
  const addTab = useIDEStore(s => s.addTab)
  const toggleFolder = useIDEStore(s => s.toggleFolder)
  const deleteFile = useIDEStore(s => s.deleteFile)
  const renameFile = useIDEStore(s => s.renameFile)
  const addFile = useIDEStore(s => s.addFile)
  const exportWorkspace = useIDEStore(s => s.exportWorkspace)
  const flatFiles = useIDEStore(s => s.files)

  const [newFileParent, setNewFileParent] = useState<string | null>(null)
  const [newFileType, setNewFileType] = useState<'file' | 'folder'>('file')
  const [newFileName, setNewFileName] = useState('')

  const treeFiles = getFilesTree()

  const handleSelect = (node: FileNode) => {
    if (node.type === 'file') {
      const tab: TabItem = {
        id: node.id,
        name: node.name,
        content: node.content || '',
        language: node.language || node.name.split('.').pop() || 'plaintext',
        isDirty: false
      }
      addTab(tab)
    } else {
      toggleFolder(node.id)
    }
  }

  const handleAddFile = (parentId: string | null, type: 'file' | 'folder') => {
    setNewFileParent(parentId)
    setNewFileType(type)
    setNewFileName('')
  }

  const handleCreateFile = () => {
    if (newFileName.trim()) {
      addFile(newFileParent, newFileName.trim(), newFileType)
      setNewFileParent(null)
      setNewFileName('')
    }
  }

  const handleDeleteFile = (id: string) => {
    deleteFile(id)
  }

  const handleCancelCreate = () => {
    setNewFileParent(null)
    setNewFileName('')
  }

  return (
    <div id="file-explorer-container" className="h-full flex flex-col bg-background/90 selection:bg-primary/20">
      <div className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground flex items-center justify-between border-b border-border/40">
        <span className="tracking-wider">Explorador VFS</span>
        <div className="flex items-center gap-1">
          <button
            id="btn-add-root-file"
            onClick={() => handleAddFile(null, 'file')}
            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
            title="Novo arquivo raiz"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            id="btn-add-root-folder"
            onClick={() => handleAddFile(null, 'folder')}
            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
            title="Nova pasta raiz"
          >
            <Folder className="h-3.5 w-3.5" />
          </button>
          <button
            id="btn-export-all-zip"
            onClick={exportWorkspace}
            className="p-1 hover:bg-muted rounded text-emerald-400 hover:text-emerald-300"
            title="Exportar Workspace (.zip)"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {newFileParent !== null && (
        <div id="new-node-input-box" className="px-3 py-2 border-b border-border bg-muted/20">
          <input
            id="new-node-name-input"
            type="text"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFile()
              if (e.key === 'Escape') handleCancelCreate()
            }}
            placeholder={newFileType === 'file' ? 'nome-do-arquivo.ts' : 'nome-da-pasta'}
            className="w-full bg-muted/85 px-2 py-1 text-sm rounded border border-ring outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <button
              id="btn-confirm-create-node"
              onClick={handleCreateFile}
              className="flex-1 bg-primary text-primary-foreground px-2 py-1 text-xs rounded hover:bg-primary/95 font-medium transition-colors"
            >
              Criar
            </button>
            <button
              id="btn-cancel-create-node"
              onClick={handleCancelCreate}
              className="flex-1 bg-muted px-2 py-1 text-xs rounded hover:bg-muted/80 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div id="file-list-nodes" className="flex-1 overflow-auto py-1">
        {flatFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center select-none">
            <Folder className="h-12 w-12 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground mb-1 font-medium">
              VFS Vazio
            </p>
            <p className="text-xs text-muted-foreground/60 max-w-[200px] leading-relaxed">
              Use os botões no topo para criar arquivos ou pastas locais.
            </p>
          </div>
        ) : (
          treeFiles.map((node) => (
            <FileTreeItem
              key={node.id}
              node={node}
              depth={0}
              onSelect={handleSelect}
              onToggle={toggleFolder}
              onDelete={handleDeleteFile}
              onRename={renameFile}
              onAddFile={handleAddFile}
            />
          ))
        )}
      </div>
    </div>
  )
}

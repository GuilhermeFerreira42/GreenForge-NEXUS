import { create } from 'zustand'
import { DebateEngine, DebateResult, DebateEvent } from './services/debate-engine'

export interface FileNode {
  id: string
  name: string
  type: 'file' | 'folder'
  parentId: string | null
  content: string
  createdAt: number
  language?: string
  isOpen?: boolean
  children?: FileNode[]
}

export interface TabItem {
  id: string
  name: string
  content: string
  language: string
  isDirty: boolean
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'proposer' | 'critic' | 'judge'
  content: string
  timestamp: number
  agentName?: string
  isStreaming?: boolean
}

export interface DebateRound {
  round: number
  proposer: {
    content: string
    confidence: number
    rationale: string
    tradeoffs: string[]
  }
  critic: {
    verdict: 'APPROVE' | 'REJECT' | 'CONDITIONAL'
    issues: DebateIssue[]
    content: string
  }
  arbiter?: {
    decision: 'CONVERGE' | 'ESCALATE' | 'FORCE_DECISION'
    underlyingQuestion: string
    synthesis: string
  }
}

export interface DebateIssue {
  id: string
  category: 'security' | 'performance' | 'maintainability' | 'correctness'
  description: string
  severity: 'high' | 'medium' | 'low'
  suggestedFix: string
}

export interface DebateSession {
  id: string
  status: 'PENDING' | 'CLARIFYING' | 'IN_PROGRESS' | 'GATE_1' | 'GENERATING' | 'GATE_2' | 'MERGED' | 'ABORTED' | 'COMPLETED'
  objective: string
  rounds: DebateRound[]
  currentRound: number
  managerConfidence: number
  inferredScope?: string
  clarificationQuestions?: string[]
}

export interface ApprovalCard {
  id: string
  sessionId: string
  type: 'GATE_1' | 'GATE_2'
  title: string
  summary: string
  underlyingQuestion: string
  synthesis: string
  redFlags: string[]
  estimatedTokens: number
  risk: 'LOW' | 'MEDIUM' | 'HIGH'
  chunks?: CodeChunk[]
}

export interface CodeChunk {
  id: string
  filePath: string
  oldContent: string
  newContent: string
  approved: boolean
}

export interface GitFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'untracked'
  staged: boolean
}

type PanelType = 'files' | 'search' | 'git' | 'agents' | 'debug'
type BottomPanelType = 'terminal' | 'problems' | 'output' | 'debate'

interface IDEStore {
  files: FileNode[]
  openTabs: TabItem[]
  activeTabId: string | null
  setFiles: (files: FileNode[]) => void
  addTab: (tab: TabItem) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTabContent: (id: string, content: string) => void
  toggleFolder: (id: string, children?: FileNode[]) => void
  addFile: (parentId: string | null, name: string, type: 'file' | 'folder') => void
  deleteFile: (id: string) => void
  renameFile: (id: string, newName: string) => void
  getFilesTree: () => FileNode[]

  sidebarWidth: number
  bottomPanelHeight: number
  rightPanelWidth: number
  showSidebar: boolean
  showBottomPanel: boolean
  showRightPanel: boolean
  activeSidebarPanel: PanelType
  activeBottomPanel: BottomPanelType
  setSidebarWidth: (width: number) => void
  setBottomPanelHeight: (height: number) => void
  setRightPanelWidth: (width: number) => void
  toggleSidebar: () => void
  toggleBottomPanel: () => void
  toggleRightPanel: () => void
  setActiveSidebarPanel: (panel: PanelType) => void
  setActiveBottomPanel: (panel: BottomPanelType) => void

  messages: Message[]
  debateSession: DebateSession | null
  approvalCard: ApprovalCard | null
  isDebating: boolean
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
  updateLastMessage: (content: string) => void
  clearMessages: () => void
  startDebate: (objective: string) => void
  runAdversarialDebate: (objective: string) => Promise<void>
  runCodeGeneration: (objective: string, synthesis: string) => Promise<void>
  updateDebateSession: (session: Partial<DebateSession>) => void
  setApprovalCard: (card: ApprovalCard | null) => void
  resolveGate: (decision: 'APPROVE' | 'REJECT' | 'NEW_ROUND' | 'EDIT') => void

  terminalHistory: string[]
  addTerminalLine: (line: string) => void
  clearTerminal: () => void
  executeTerminalCommand: (command: string) => Promise<void>

  theme: 'dark' | 'light'
  toggleTheme: () => void
  checkStorageQuota: () => void
  exportWorkspace: () => Promise<void>

  currentDir: string
  setCurrentDir: (dir: string) => void
  gitFiles: GitFile[]
  gitCommits: Array<{ hash: string; message: string; author: string; date: string }>
  currentBranch: string
  setBranch: (branch: string) => void
  stageFile: (path: string) => void
  unstageFile: (path: string) => void
  stageAll: () => void
  unstageAll: () => void
  commit: (message: string) => void
  resetDebateSession: () => void
}

function getStoredFiles(): FileNode[] {
  if (typeof window === 'undefined') return []
  const stored = localStorage.getItem('greenforge_vfs')
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch (e) {
      console.error('Failed to parse greenforge_vfs', e)
    }
  }
  return []
}

function getStoredGitFiles(): GitFile[] {
  if (typeof window === 'undefined') return []
  const stored = localStorage.getItem('greenforge_git_files')
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch (e) {
      console.error('Failed to parse greenforge_git_files', e)
    }
  }
  const files = getStoredFiles()
  return files
    .filter(f => f.type === 'file')
    .map(f => ({
      path: f.id,
      status: 'untracked' as const,
      staged: false
    }))
}

function getStoredGitCommits(): Array<{ hash: string; message: string; author: string; date: string }> {
  if (typeof window === 'undefined') return []
  const stored = localStorage.getItem('greenforge_git_commits')
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch (e) {
      console.error('Failed to parse greenforge_git_commits', e)
    }
  }
  return [
    { hash: 'a1b2c3d', message: 'feat: Add debate protocol', author: 'Developer', date: '2h ago' },
    { hash: 'e4f5g6h', message: 'fix: Terminal command parsing', author: 'Developer', date: '5h ago' },
    { hash: 'i7j8k9l', message: 'chore: Update dependencies', author: 'Developer', date: '1d ago' },
    { hash: 'm0n1o2p', message: 'feat: Initial commit', author: 'Developer', date: '2d ago' }
  ]
}

export function buildTree(flatNodes: FileNode[]): FileNode[] {
  const nodeMap = new Map<string, FileNode>()
  
  const cloned = flatNodes.map(node => {
    return {
      ...node,
      children: node.type === 'folder' ? [] : undefined
    } as FileNode
  })

  cloned.forEach(n => nodeMap.set(n.id, n))

  const roots: FileNode[] = []

  cloned.forEach(n => {
    if (n.parentId === null || n.parentId === '.' || !nodeMap.has(n.parentId)) {
      roots.push(n)
    } else {
      const parent = nodeMap.get(n.parentId)
      if (parent) {
        if (!parent.children) parent.children = []
        parent.children.push(n)
      } else {
        roots.push(n)
      }
    }
  })

  return roots
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

function getLanguageFromFilename(filename: string): string {
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

export const useIDEStore = create<IDEStore>((set, get) => ({
  files: getStoredFiles(),
  openTabs: [],
  activeTabId: null,
  sidebarWidth: 260,
  bottomPanelHeight: 250,
  rightPanelWidth: 380,
  showSidebar: true,
  showBottomPanel: true,
  showRightPanel: true,
  activeSidebarPanel: 'files',
  activeBottomPanel: 'terminal',
  messages: [],
  debateSession: null,
  approvalCard: null,
  isDebating: false,
  terminalHistory: [],
  theme: 'dark',

  currentDir: '',
  currentBranch: 'main',
  gitFiles: getStoredGitFiles(),
  gitCommits: getStoredGitCommits(),

  setCurrentDir: (dir) => set({ currentDir: dir }),
  setBranch: (branch) => {
    set({ currentBranch: branch })
    if (typeof window !== 'undefined') {
      localStorage.setItem('greenforge_git_branch', branch)
    }
  },
  stageFile: (path) => {
    const { gitFiles } = get()
    const updated = gitFiles.map(f => f.path === path ? { ...f, staged: true } : f)
    set({ gitFiles: updated })
    if (typeof window !== 'undefined') {
      localStorage.setItem('greenforge_git_files', JSON.stringify(updated))
    }
  },
  unstageFile: (path) => {
    const { gitFiles } = get()
    const updated = gitFiles.map(f => f.path === path ? { ...f, staged: false } : f)
    set({ gitFiles: updated })
    if (typeof window !== 'undefined') {
      localStorage.setItem('greenforge_git_files', JSON.stringify(updated))
    }
  },
  stageAll: () => {
    const { gitFiles } = get()
    const updated = gitFiles.map(f => ({ ...f, staged: true }))
    set({ gitFiles: updated })
    if (typeof window !== 'undefined') {
      localStorage.setItem('greenforge_git_files', JSON.stringify(updated))
    }
  },
  unstageAll: () => {
    const { gitFiles } = get()
    const updated = gitFiles.map(f => ({ ...f, staged: false }))
    set({ gitFiles: updated })
    if (typeof window !== 'undefined') {
      localStorage.setItem('greenforge_git_files', JSON.stringify(updated))
    }
  },
  commit: (message) => {
    const { gitFiles, gitCommits } = get()
    const staged = gitFiles.filter(f => f.staged)
    if (staged.length === 0) return

    const newCommits = [
      {
        hash: Math.random().toString(16).substring(2, 9),
        message,
        author: 'Developer',
        date: 'Agora mesmo'
      },
      ...gitCommits
    ]
    const remainingGitFiles = gitFiles.filter(f => !f.staged)

    set({ gitFiles: remainingGitFiles, gitCommits: newCommits })
    if (typeof window !== 'undefined') {
      localStorage.setItem('greenforge_git_files', JSON.stringify(remainingGitFiles))
      localStorage.setItem('greenforge_git_commits', JSON.stringify(newCommits))
    }
  },
  resetDebateSession: () => {
    set({ debateSession: null, approvalCard: null, messages: [], isDebating: false })
  },

  setFiles: (files) => {
    set({ files })
    if (typeof window !== 'undefined') {
      localStorage.setItem('greenforge_vfs', JSON.stringify(files))
    }
    get().checkStorageQuota()
  },
  
  getFilesTree: () => {
    return buildTree(get().files)
  },

  addTab: (tab) => {
    const { openTabs } = get()
    const existing = openTabs.find(t => t.id === tab.id)
    if (!existing) {
      set({ openTabs: [...openTabs, tab], activeTabId: tab.id })
    } else {
      set({ activeTabId: tab.id })
    }
  },

  closeTab: (id) => {
    const { openTabs, activeTabId } = get()
    const newTabs = openTabs.filter(t => t.id !== id)
    let newActiveId = activeTabId
    if (activeTabId === id) {
      const index = openTabs.findIndex(t => t.id === id)
      newActiveId = newTabs[Math.min(index, newTabs.length - 1)]?.id || null
    }
    set({ openTabs: newTabs, activeTabId: newActiveId })
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTabContent: (id, content) => {
    const { openTabs, files, gitFiles } = get()
    const newTabs = openTabs.map(t => 
      t.id === id ? { ...t, content, isDirty: false } : t
    )
    const newFiles = files.map(node => 
      node.id === id ? { ...node, content } : node
    )

    const updatedGitFiles = [...gitFiles]
    const gIndex = updatedGitFiles.findIndex(f => f.path === id)
    if (gIndex >= 0) {
      if (updatedGitFiles[gIndex].status !== 'added') {
        updatedGitFiles[gIndex] = { ...updatedGitFiles[gIndex], status: 'modified' }
      }
    } else {
      updatedGitFiles.push({
        path: id,
        status: 'modified',
        staged: false
      })
    }

    set({ openTabs: newTabs, files: newFiles, gitFiles: updatedGitFiles })
    if (typeof window !== 'undefined') {
      localStorage.setItem('greenforge_vfs', JSON.stringify(newFiles))
      localStorage.setItem('greenforge_git_files', JSON.stringify(updatedGitFiles))
    }
    get().checkStorageQuota()
  },

  toggleFolder: (id, children) => {
    const { files } = get()
    const newFiles = files.map(node => 
      node.id === id ? { ...node, isOpen: !node.isOpen } : node
    )
    set({ files: newFiles })
  },

  addFile: (parentId, name, type) => {
    const { files, gitFiles } = get()
    const fullPath = parentId === null ? name : `${parentId}/${name}`
    const newNode: FileNode = {
      id: fullPath,
      name,
      type,
      parentId,
      content: '',
      createdAt: Date.now(),
      language: type === 'file' ? getLanguageFromFilename(name) : undefined,
      isOpen: type === 'folder' ? true : undefined
    }
    const newFiles = [...files, newNode]

    let updatedGitFiles = [...gitFiles]
    if (type === 'file') {
      const exists = gitFiles.some(f => f.path === fullPath)
      if (!exists) {
        updatedGitFiles.push({
          path: fullPath,
          status: 'added',
          staged: false
        })
      }
    }

    set({ files: newFiles, gitFiles: updatedGitFiles })
    if (typeof window !== 'undefined') {
      localStorage.setItem('greenforge_vfs', JSON.stringify(newFiles))
      localStorage.setItem('greenforge_git_files', JSON.stringify(updatedGitFiles))
    }
    get().checkStorageQuota()
  },

  deleteFile: (id) => {
    const { files, openTabs, activeTabId, gitFiles } = get()
    // Delete file/folder and all descendants recursively
    const newFiles = files.filter(node => {
      if (node.id === id) return false
      if (node.id.startsWith(id + '/')) return false
      return true
    })
    const newTabs = openTabs.filter(t => t.id !== id && !t.id.startsWith(id + '/'))
    const newActiveId = activeTabId === id || (activeTabId && activeTabId.startsWith(id + '/'))
      ? (newTabs[0]?.id || null) 
      : activeTabId

    // Remove deleted files/folders from Git Panel re-actively
    const updatedGitFiles = gitFiles.filter(f => f.path !== id && !f.path.startsWith(id + '/'))

    set({ files: newFiles, openTabs: newTabs, activeTabId: newActiveId, gitFiles: updatedGitFiles })
    if (typeof window !== 'undefined') {
      localStorage.setItem('greenforge_vfs', JSON.stringify(newFiles))
      localStorage.setItem('greenforge_git_files', JSON.stringify(updatedGitFiles))
    }
    get().checkStorageQuota()
  },

  renameFile: (id, newName) => {
    const { files, openTabs } = get()
    const nodeToRename = files.find(f => f.id === id)
    if (!nodeToRename) return

    const parentPrefix = id.includes('/') ? id.substring(0, id.lastIndexOf('/') + 1) : ''
    const newId = parentPrefix + newName

    const newFiles = files.map(node => {
      if (node.id === id) {
        return {
          ...node,
          id: newId,
          name: newName,
          language: node.type === 'file' ? getLanguageFromFilename(newName) : node.language
        }
      }
      if (node.id.startsWith(id + '/')) {
        const subRelative = node.id.substring(id.length)
        return {
          ...node,
          id: newId + subRelative,
          parentId: node.parentId === id ? newId : node.parentId
        }
      }
      return node
    })

    const newTabs = openTabs.map(t => {
      if (t.id === id) {
        return { ...t, id: newId, name: newName, language: getLanguageFromFilename(newName) }
      }
      if (t.id.startsWith(id + '/')) {
        const subRelative = t.id.substring(id.length)
        return { ...t, id: newId + subRelative }
      }
      return t
    })

    set({ files: newFiles, openTabs: newTabs })
    if (typeof window !== 'undefined') {
      localStorage.setItem('greenforge_vfs', JSON.stringify(newFiles))
    }
  },

  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(180, Math.min(400, width)) }),
  setBottomPanelHeight: (height) => set({ bottomPanelHeight: Math.max(100, Math.min(500, height)) }),
  setRightPanelWidth: (width) => set({ rightPanelWidth: Math.max(280, Math.min(600, width)) }),
  toggleSidebar: () => set(s => ({ showSidebar: !s.showSidebar })),
  toggleBottomPanel: () => set(s => ({ showBottomPanel: !s.showBottomPanel })),
  toggleRightPanel: () => set(s => ({ showRightPanel: !s.showRightPanel })),
  setActiveSidebarPanel: (panel) => set({ activeSidebarPanel: panel }),
  setActiveBottomPanel: (panel) => set({ activeBottomPanel: panel }),

  addMessage: (message) => {
    const newMessage: Message = {
      ...message,
      id: generateId(),
      timestamp: Date.now()
    }
    set(s => ({ messages: [...s.messages, newMessage] }))
  },

  updateLastMessage: (content) => {
    set(s => {
      const messages = [...s.messages]
      if (messages.length > 0) {
        messages[messages.length - 1] = {
          ...messages[messages.length - 1],
          content
        }
      }
      return { messages }
    })
  },

  clearMessages: () => set({ messages: [] }),

  startDebate: (objective) => {
    const session: DebateSession = {
      id: generateId(),
      status: 'PENDING',
      objective,
      rounds: [],
      currentRound: 0,
      managerConfidence: 0
    }
    set({ debateSession: session, isDebating: true })
  },

  runAdversarialDebate: async (objective) => {
    get().startDebate(objective);
    
    let currentAgentRole: 'user' | 'assistant' | 'system' | 'proposer' | 'critic' | 'judge' | null = null;
    let currentAgentContent = '';

    try {
      const response = await fetch('/api/debate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ objective }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Não foi possível acessar o stream de resposta do servidor.");
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEventName = '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          if (trimmedLine.startsWith('event:')) {
            currentEventName = trimmedLine.replace('event:', '').trim();
          } else if (trimmedLine.startsWith('data:')) {
            const dataStr = trimmedLine.substring(5).trim();
            try {
              const payload = JSON.parse(dataStr);
              
              if (currentEventName === 'DEBATE_STATUS') {
                get().updateDebateSession({
                  status: payload.status === 'GATE_1' ? 'GATE_1' : 'IN_PROGRESS',
                  currentRound: payload.currentRound
                });
              } else if (currentEventName === 'AGENT_TOKEN') {
                const mappedRole: any = payload.role;
                const agentDisplayName = payload.agentId === 'technical_proposer' ? 'Propositor Técnico'
                  : payload.agentId === 'quality_critic' ? 'Quality Critic'
                  : 'Debate Judge';

                if (currentAgentRole !== mappedRole) {
                  currentAgentRole = mappedRole;
                  currentAgentContent = payload.token;
                  get().addMessage({
                    role: mappedRole,
                    content: currentAgentContent,
                    agentName: agentDisplayName
                  });
                } else {
                  currentAgentContent += payload.token;
                  get().updateLastMessage(currentAgentContent);
                }
              } else if (currentEventName === 'SECURITY_VIOLATION') {
                get().addMessage({
                  role: 'system',
                  content: `[POLÍTICA DE PÂNICO L3] Detecção de infração crítica de segurança: "${payload.error}".`,
                  agentName: 'Sentinela de Segurança'
                });
                get().updateDebateSession({ status: 'ABORTED' });
                set({ isDebating: false });
              } else if (currentEventName === 'HITL_GATE') {
                if (payload.gateType === 'GATE_1') {
                  get().updateDebateSession({ status: 'GATE_1' });
                  get().setApprovalCard(payload.approvalCard);
                }
              }
            } catch (err) {
              console.error('Erro ao processar linha de dados SSE:', err, dataStr);
            }
            currentEventName = '';
          }
        }
      }

      set({ isDebating: false });

    } catch (err: any) {
      console.error('Debate crash:', err);
      get().addMessage({
        role: 'system',
        content: `Um erro interrompeu o debate adversarial: ${err.message}`,
        agentName: 'Sistema'
      });
      get().updateDebateSession({ status: 'ABORTED' });
      set({ isDebating: false });
    }
  },

  runCodeGeneration: async (objective, synthesis) => {
    let currentAgentRole: 'user' | 'assistant' | 'system' | 'proposer' | 'critic' | 'judge' | null = null;
    let currentAgentContent = '';

    try {
      const response = await fetch('/api/debate/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ objective, synthesis }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Não foi possível acessar o stream de resposta do servidor.");
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEventName = '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          if (trimmedLine.startsWith('event:')) {
            currentEventName = trimmedLine.replace('event:', '').trim();
          } else if (trimmedLine.startsWith('data:')) {
            const dataStr = trimmedLine.substring(5).trim();
            try {
              const payload = JSON.parse(dataStr);
              
              if (currentEventName === 'DEBATE_STATUS') {
                get().updateDebateSession({
                  status: payload.status,
                  currentRound: 2
                });
              } else if (currentEventName === 'AGENT_TOKEN') {
                const mappedRole: any = payload.role;
                const agentDisplayName = payload.agentId === 'technical_proposer' ? 'Propositor Técnico'
                  : 'Debate Judge';

                if (currentAgentRole !== mappedRole) {
                  currentAgentRole = mappedRole;
                  currentAgentContent = payload.token;
                  get().addMessage({
                    role: mappedRole,
                    content: currentAgentContent,
                    agentName: agentDisplayName
                  });
                } else {
                  currentAgentContent += payload.token;
                  get().updateLastMessage(currentAgentContent);
                }
              } else if (currentEventName === 'SECURITY_VIOLATION') {
                get().addMessage({
                  role: 'system',
                  content: `[POLÍTICA DE PÂNICO L3] Detecção de infração crítica de segurança na geração de código: "${payload.error}".`,
                  agentName: 'Sentinela de Segurança'
                });
                get().updateDebateSession({ status: 'ABORTED' });
                set({ isDebating: false });
              } else if (currentEventName === 'HITL_GATE') {
                if (payload.gateType === 'GATE_2') {
                  get().updateDebateSession({ status: 'GATE_2' });
                  get().setApprovalCard(payload.approvalCard);
                }
              }
            } catch (err) {
              console.error('Erro ao processar linha de dados SSE:', err, dataStr);
            }
            currentEventName = '';
          }
        }
      }

      set({ isDebating: false });

    } catch (err: any) {
      console.error('Code generation crash:', err);
      get().addMessage({
        role: 'system',
        content: `Um erro interrompeu a geração de código: ${err.message}`,
        agentName: 'Sistema'
      });
      get().updateDebateSession({ status: 'ABORTED' });
      set({ isDebating: false });
    }
  },

  updateDebateSession: (updates) => {
    set(s => ({
      debateSession: s.debateSession 
        ? { ...s.debateSession, ...updates }
        : null
    }))
  },

  setApprovalCard: (card) => set({ approvalCard: card }),

  resolveGate: async (decision) => {
    const { debateSession, approvalCard, addMessage, setFiles, files, gitFiles } = get()
    if (!debateSession || !approvalCard) return

    if (decision === 'APPROVE') {
      if (approvalCard.type === 'GATE_1') {
        set({
          debateSession: {
            ...debateSession,
            status: 'GENERATING'
          },
          approvalCard: null,
          isDebating: true
        });

        try {
          await get().runCodeGeneration(debateSession.objective, approvalCard.synthesis);
        } catch (err: any) {
          addMessage({
            role: 'system',
            content: `Falha na geração de código: ${err.message}`,
            agentName: 'Sistema'
          });
          set({ isDebating: false });
          get().updateDebateSession({ status: 'ABORTED' });
        }
        return;
      }

      set({
        debateSession: {
          ...debateSession,
          status: 'MERGED'
        },
        approvalCard: null
      })

      if (approvalCard.chunks && approvalCard.chunks.length > 0) {
        addMessage({
          role: 'system',
          content: "Persistindo código blindado aprovado no workspace local...",
          agentName: "Nucleador de Arquivos"
        })

        let updatedFiles = [...files]
        let updatedGitFiles = [...gitFiles]
        approvalCard.chunks.forEach(chunk => {
          // Check if parent directory folders exist
          const parentPrefix = chunk.filePath.includes('/') ? chunk.filePath.substring(0, chunk.filePath.lastIndexOf('/')) : null
          if (parentPrefix) {
            const parts = parentPrefix.split('/')
            let currentPath = ''
            parts.forEach(part => {
              currentPath = currentPath ? `${currentPath}/${part}` : part
              const folderExists = updatedFiles.some(f => f.id === currentPath)
              if (!folderExists) {
                updatedFiles.push({
                   id: currentPath,
                  name: part,
                  type: 'folder',
                  parentId: currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/')) : null,
                  content: '',
                  createdAt: Date.now()
                })
              }
            })
          }

          // Create/update target file content
          const existingIdx = updatedFiles.findIndex(f => f.id === chunk.filePath)
          const fileName = chunk.filePath.includes('/') ? chunk.filePath.substring(chunk.filePath.lastIndexOf('/') + 1) : chunk.filePath
          
          if (existingIdx >= 0) {
            updatedFiles[existingIdx] = {
              ...updatedFiles[existingIdx],
              content: chunk.newContent,
              createdAt: Date.now()
            }
          } else {
            updatedFiles.push({
              id: chunk.filePath,
              name: fileName,
              type: 'file',
              parentId: parentPrefix,
              content: chunk.newContent,
              createdAt: Date.now()
            })
          }

          // Sincronizar painel de controle de versão (Git)
          const gIdx = updatedGitFiles.findIndex(f => f.path === chunk.filePath)
          if (gIdx >= 0) {
            if (updatedGitFiles[gIdx].status !== 'added') {
              updatedGitFiles[gIdx] = { ...updatedGitFiles[gIdx], status: 'modified' }
            }
          } else {
            updatedGitFiles.push({
              path: chunk.filePath,
              status: 'added',
              staged: false
            })
          }
        })

        set({ gitFiles: updatedGitFiles })
        if (typeof window !== 'undefined') {
          localStorage.setItem('greenforge_git_files', JSON.stringify(updatedGitFiles))
        }

        get().setFiles(updatedFiles)

        addMessage({
          role: 'system',
          content: "Todos os arquivos foram mesclados e sincronizados com sucesso no VFS de memória!",
          agentName: "Sistema"
        })
      }
      
      set({ isDebating: false })
      get().updateDebateSession({ status: 'COMPLETED' })

    } else if (decision === 'REJECT') {
      set({
        debateSession: { ...debateSession, status: 'ABORTED' },
        approvalCard: null,
        isDebating: false
      })
    } else if (decision === 'NEW_ROUND') {
      set({
        debateSession: {
          ...debateSession,
          status: 'IN_PROGRESS',
          currentRound: debateSession.currentRound + 1
        },
        approvalCard: null
      })
      // Trigger new debate with updated guidelines if requested
      get().runAdversarialDebate(debateSession.objective + " (Refinar para nova rodada)")
    } else if (decision === 'EDIT') {
      // Just keep in gateway but let user adjust before confirming
      addMessage({
        role: 'system',
        content: "Você optou por ajustar as propostas antes da mesclagem.",
        agentName: 'Sistema'
      })
    }
  },

  addTerminalLine: (line) => set(s => ({ 
    terminalHistory: [...s.terminalHistory, line] 
  })),
  clearTerminal: () => set({ terminalHistory: [] }),

  executeTerminalCommand: async (cmd: string) => {
    const trimmed = cmd.trim()
    if (!trimmed) return
    
    get().addTerminalLine(`\x1b[32m$\x1b[0m ${trimmed}`)
    
    // Simulate slight non-blocking asynchronous lag
    await new Promise(resolve => setTimeout(resolve, 200))
    const { addTerminalLine, files, deleteFile, addFile, currentDir, setCurrentDir, gitFiles, gitCommits, stageFile, commit, currentBranch } = get()
    
    // Parse commands and arguments. Support quoted string for commit messages.
    const parts: string[] = []
    let currentPart = ''
    let inQuotes = false
    let quoteChar = ''
    
    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i]
      if ((char === '"' || char === "'") && (i === 0 || trimmed[i-1] !== '\\')) {
        if (inQuotes && char === quoteChar) {
          inQuotes = false
        } else if (!inQuotes) {
          inQuotes = true
          quoteChar = char
        }
      } else if (char === ' ' && !inQuotes) {
        if (currentPart) {
          parts.push(currentPart)
          currentPart = ''
        }
      } else {
        currentPart += char
      }
    }
    if (currentPart) parts.push(currentPart)
    
    const binary = parts[0]
    const args = parts.slice(1)
    
    switch (binary) {
      case 'help':
        addTerminalLine('GreenForge Virtual Terminal v2.3 - Comandos VFS:')
        addTerminalLine('  ls                - Listar arquivos e pastas no diretório atual')
        addTerminalLine('  cd <diretorio>    - Mudar o diretório de trabalho atual do terminal')
        addTerminalLine('  pwd               - Exibir o diretório de trabalho atual')
        addTerminalLine('  mkdir <pasta>     - Criar pasta')
        addTerminalLine('  touch <arquivo>   - Criar arquivo vazio')
        addTerminalLine('  cat <arquivo>     - Mostrar conteúdo do arquivo')
        addTerminalLine('  rm <caminho>      - Excluir arquivo ou pasta')
        addTerminalLine('  git status        - Exibir arquivos modificados e staged')
        addTerminalLine('  git add <caminho> - Colocar um arquivo em stage para commit')
        addTerminalLine('  git commit -m     - Realizar commit das alterações preparadas')
        addTerminalLine('  quota             - Verificar uso de cota do VFS')
        addTerminalLine('  clear             - Limpar terminal')
        break
      case 'clear':
        get().clearTerminal()
        break
      case 'pwd':
        addTerminalLine(currentDir ? `/${currentDir}` : '/')
        break
      case 'cd':
        const targetDir = args[0]
        if (!targetDir || targetDir === '/' || targetDir === '~') {
          setCurrentDir('')
        } else if (targetDir === '..') {
          if (currentDir) {
            const idx = currentDir.lastIndexOf('/')
            setCurrentDir(idx >= 0 ? currentDir.substring(0, idx) : '')
          }
        } else {
          // Resolve relative or exact folder path
          const fullPath = currentDir ? `${currentDir}/${targetDir}` : targetDir
          const node = files.find(f => f.id === fullPath && f.type === 'folder')
          if (node) {
            setCurrentDir(fullPath)
          } else {
            addTerminalLine(`\x1b[31mcd: o diretório não existe:\x1b[0m ${targetDir}`)
          }
        }
        break
      case 'ls':
        const displayParentId = currentDir || null
        const currentLevelNodes = files.filter(f => f.parentId === displayParentId)
        if (currentLevelNodes.length === 0) {
          addTerminalLine('(Vazio)')
        } else {
          currentLevelNodes.forEach(f => {
            const prefix = f.type === 'folder' ? '\x1b[34m[DIR]\x1b[0m ' : '      '
            addTerminalLine(`${prefix}${f.name}`)
          })
        }
        break
      case 'mkdir':
        if (!args[0]) {
          addTerminalLine('\x1b[31mUso:\x1b[0m mkdir <nome_da_pasta>')
        } else {
          const path = args[0]
          const parent = currentDir || null
          addFile(parent, path, 'folder')
          addTerminalLine(`Pasta '${path}' criada em ${currentDir ? '/' + currentDir : '/'}.`)
        }
        break
      case 'touch':
        if (!args[0]) {
          addTerminalLine('\x1b[31mUso:\x1b[0m touch <nome_do_arquivo>')
        } else {
          const path = args[0]
          const parent = currentDir || null
          addFile(parent, path, 'file')
          addTerminalLine(`Arquivo '${path}' criado em ${currentDir ? '/' + currentDir : '/'}.`)
        }
        break
      case 'cat':
        if (!args[0]) {
          addTerminalLine('\x1b[31mUso:\x1b[0m cat <caminho_do_arquivo>')
        } else {
          const path = args[0]
          const fullPath = currentDir ? `${currentDir}/${path}` : path
          const node = files.find(f => f.id === fullPath && f.type === 'file')
          if (node) {
            addTerminalLine(node.content || '(Vazio)')
          } else {
            addTerminalLine(`\x1b[31mErro:\x1b[0m Arquivo '${path}' não encontrado.`)
          }
        }
        break
      case 'rm':
        if (!args[0]) {
          addTerminalLine('\x1b[31mUso:\x1b[0m rm <caminho>')
        } else {
          const path = args[0]
          const fullPath = currentDir ? `${currentDir}/${path}` : path
          const exists = files.some(f => f.id === fullPath)
          if (exists) {
            deleteFile(fullPath)
            addTerminalLine(`Removido '${path}' do VFS.`)
          } else {
            addTerminalLine(`\x1b[31mErro:\x1b[0m Caminho '${path}' não encontrado.`)
          }
        }
        break
      case 'git':
        const gitCmd = args[0]
        if (!gitCmd) {
          addTerminalLine('\x1b[31mUso:\x1b[0m git <comando> [argumentos]')
          break
        }
        if (gitCmd === 'status') {
          addTerminalLine(`No branch ${currentBranch}`)
          const staged = gitFiles.filter(f => f.staged)
          const unstaged = gitFiles.filter(f => !f.staged)
          
          if (staged.length === 0 && unstaged.length === 0) {
            addTerminalLine('nada para salvar, diretório de trabalho limpo')
            break
          }
          
          if (staged.length > 0) {
            addTerminalLine('Mudanças preparadas para commit:')
            addTerminalLine('  (use "git restore --staged <file>..." para remover do stage)')
            staged.forEach(f => {
              addTerminalLine(`\t\x1b[32m${f.status}:   ${f.path}\x1b[0m`)
            })
          }
          if (unstaged.length > 0) {
            addTerminalLine('Mudanças não preparadas para commit:')
            addTerminalLine('  (use "git add <file>..." para incluir no stage)')
            unstaged.forEach(f => {
              addTerminalLine(`\t\x1b[31mmodificado:   ${f.path}\x1b[0m`)
            })
          }
        } else if (gitCmd === 'add') {
          const fileToAdd = args[1]
          if (!fileToAdd) {
            addTerminalLine('\x1b[31mUso:\x1b[0m git add <caminho_do_arquivo>')
            break
          }
          if (fileToAdd === '.') {
            get().stageAll()
            addTerminalLine('Todos os arquivos preparados para commit.')
          } else {
            const targetPath = currentDir ? `${currentDir}/${fileToAdd}` : fileToAdd
            const gitNode = gitFiles.find(f => f.path === targetPath)
            if (gitNode) {
              stageFile(targetPath)
              addTerminalLine(`Arquivo '${fileToAdd}' preparado com sucesso.`)
            } else {
              addTerminalLine(`\x1b[31mErro:\x1b[0m Arquivo '${fileToAdd}' não possui modificações locais rastreadas.`)
            }
          }
        } else if (gitCmd === 'commit') {
          const mFlagIdx = args.indexOf('-m')
          const commitMsg = mFlagIdx >= 0 ? args[mFlagIdx + 1] : null
          if (!commitMsg) {
            addTerminalLine('\x1b[31mErro:\x1b[0m Mensagem de commit obrigatória. Use: git commit -m "sua mensagem"')
            break
          }
          const staged = gitFiles.filter(f => f.staged)
          if (staged.length === 0) {
            addTerminalLine('nada para cometer, diretório de trabalho limpo (ou use "git add")')
          } else {
            commit(commitMsg)
            addTerminalLine(`[${currentBranch} ${Math.random().toString(16).substring(2, 9)}] ${commitMsg}`)
            addTerminalLine(` ${staged.length} arquivos alterados com sucesso.`)
          }
        } else {
          addTerminalLine(`\x1b[31mComando git virtual não implementado:\x1b[0m git ${gitCmd}`)
        }
        break
      case 'quota':
        const total = Object.keys(localStorage).reduce((sum, key) => {
          return sum + (localStorage.getItem(key)?.length || 0)
        }, 0)
        addTerminalLine(`Espaço consumido total: ${(total / 1024).toFixed(2)} KB.`)
        break
      default:
        addTerminalLine(`\x1b[31mComando inválido:\x1b[0m '${binary}'. Digite 'help' para ver a lista de comandos virtuais do VFS e controle de versão Git.`)
    }
  },

  checkStorageQuota: () => {
    if (typeof window !== 'undefined') {
      const total = Object.keys(localStorage).reduce((sum, key) => {
        return sum + (localStorage.getItem(key)?.length || 0)
      }, 0)
      const limit = 4.5 * 1024 * 1024
      if (total > limit) {
        get().addTerminalLine('\x1b[33m[ALERTA SISTEMA DE ARQUIVOS] Cota de armazenamento ocupando >90%\x1b[0m')
      }
    }
  },

  exportWorkspace: async () => {
    const { files, addTerminalLine } = get()
    if (!files || files.length === 0) {
      addTerminalLine('\x1b[33m[AVISO] Workspace vazio (workspace zero). Nenhuma pasta ou arquivo para exportar.\x1b[0m')
      return
    }
    try {
      const JSZip = (await import('jszip')).default
      const { saveAs } = await import('file-saver')
      const zip = new JSZip()
      
      files.forEach(node => {
        if (node.type === 'file') {
          zip.file(node.id, node.content || '')
        } else {
          zip.folder(node.id)
        }
      })
      
      const content = await zip.generateAsync({ type: 'blob' })
      saveAs(content, 'greenforge-nexus-workspace.zip')
      addTerminalLine('\x1b[32m[SUCESSO]\x1b[0m Workspace compactado baixado com sucesso.')
    } catch (e: any) {
      console.error(e)
      get().addTerminalLine(`\x1b[31m[ERRO]\x1b[0m Falha ao exportar workspace: ${e.message}`)
    }
  },

  toggleTheme: () => set(s => ({ theme: s.theme === 'dark' ? 'light' : 'dark' }))
}))

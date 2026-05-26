import { useIDEStore } from '../store';
import { validatePath } from './path-guard';

export interface VFSNode {
  id: string; // The path (e.g. 'src' or 'src/index.ts')
  name: string;
  type: 'file' | 'folder';
  parentId: string | null;
  content: string;
  createdAt: number;
  isOpen?: boolean;
}

export class FileNotFoundError extends Error {
  constructor(path: string) {
    super(`File not found: ${path}`);
    this.name = 'FileNotFoundError';
  }
}

function getPathInfo(p: string) {
  const parts = p.split('/').filter(Boolean);
  if (parts.length === 0) return { name: '', parentId: null };
  const name = parts[parts.length - 1];
  const parentId = parts.length > 1 ? parts.slice(0, -1).join('/') : null;
  return { name, parentId };
}

export async function readFile(path: string): Promise<string> {
  const cleanPath = validatePath(path);
  const state = useIDEStore.getState();
  const node = state.files.find(f => f.id === cleanPath);
  if (!node || node.type !== 'file') {
    throw new FileNotFoundError(cleanPath);
  }
  return node.content || '';
}

export async function writeFile(path: string, content: string): Promise<void> {
  const cleanPath = validatePath(path);
  const { name, parentId } = getPathInfo(cleanPath);
  
  if (parentId) {
    await mkdir(parentId);
  }

  const state = useIDEStore.getState();
  const updatedFiles = [...state.files];
  const existingIndex = updatedFiles.findIndex(f => f.id === cleanPath);

  if (existingIndex >= 0) {
    updatedFiles[existingIndex] = {
      ...updatedFiles[existingIndex],
      content,
      createdAt: updatedFiles[existingIndex].createdAt || Date.now()
    };
  } else {
    updatedFiles.push({
      id: cleanPath,
      name,
      type: 'file',
      parentId,
      content,
      createdAt: Date.now()
    });
  }

  useIDEStore.setState({ files: updatedFiles });
  localStorage.setItem('greenforge_vfs', JSON.stringify(updatedFiles));

  // Check quota
  state.checkStorageQuota();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vfs:write', { detail: { path: cleanPath, content } }));
  }
}

export async function mkdir(path: string): Promise<void> {
  const cleanPath = validatePath(path);
  if (!cleanPath || cleanPath === '.') return;

  const parts = cleanPath.split('/').filter(Boolean);
  let currentAccumulated = '';

  const state = useIDEStore.getState();
  const updatedFiles = [...state.files];

  for (let i = 0; i < parts.length; i++) {
    const parent = currentAccumulated || null;
    currentAccumulated = currentAccumulated ? `${currentAccumulated}/${parts[i]}` : parts[i];
    
    const exists = updatedFiles.some(f => f.id === currentAccumulated);
    if (!exists) {
      updatedFiles.push({
        id: currentAccumulated,
        name: parts[i],
        type: 'folder',
        parentId: parent,
        content: '',
        createdAt: Date.now(),
        isOpen: false
      });
    }
  }

  useIDEStore.setState({ files: updatedFiles });
  localStorage.setItem('greenforge_vfs', JSON.stringify(updatedFiles));

  // Check quota
  state.checkStorageQuota();
}

export async function listDir(path: string): Promise<VFSNode[]> {
  const cleanPath = validatePath(path);
  const state = useIDEStore.getState();
  
  const targetParent = (cleanPath === '.' || cleanPath === '') ? null : cleanPath;
  return state.files.filter(f => f.parentId === targetParent) as VFSNode[];
}

import path from 'path';
import fs from 'fs';

export function validatePath(requestedPath: string): string {
  const root = process.cwd();
  
  // Resolve the requested path against the root
  // Remove leading slash if present to avoid resolving to system root
  const cleanRequestedPath = requestedPath.replace(/^(\/|\\)/, '');
  const resolvedPath = path.resolve(root, cleanRequestedPath);
  
  if (!resolvedPath.startsWith(root)) {
    throw new Error('Path traversal detected: Access denied.');
  }

  return resolvedPath;
}

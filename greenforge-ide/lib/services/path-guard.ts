export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * Validates and normalizes paths, guarding against path traversal attacks.
 * @param inputPath The raw input path.
 * @param workspaceRoot The expected workspace root folder (typically '.').
 * @returns Normalized absolute/clean relative path.
 */
export function validatePath(inputPath: string, workspaceRoot: string = '.'): string {
  // Decode URL encoded characters first
  let decoded = inputPath;
  try {
    decoded = decodeURIComponent(inputPath);
  } catch (e) {
    // Ignore decode error
  }

  // Block obvious malicious patterns like '%2e%2e', '..', etc.
  if (decoded.includes('..') || decoded.includes('%2e%2e')) {
    throw new SecurityError('Path Traversal detectado');
  }

  // Normalize the path by removing redundant './' and extra slashes
  let normalized = decoded
    .replace(/\\/g, '/') // convert backslashes to forward slashes
    .replace(/\/\.\//g, '/') // remove duplicate self-dirs /./
    .replace(/^\.\//, '') // remove leading self-dir
    .replace(/\/+/g, '/'); // remove multiple slashes

  // If normalized ends with slash, trim it unless it's root
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }

  // Trim leading slash for consistency
  if (normalized.startsWith('/')) {
    normalized = normalized.substring(1);
  }

  // If workspaceRoot is normalized, make sure they match
  const rootPrefix = workspaceRoot === '.' || workspaceRoot === '' ? '' : workspaceRoot;
  
  if (rootPrefix) {
    const cleanRoot = rootPrefix.startsWith('/') ? rootPrefix.substring(1) : rootPrefix;
    if (!normalized.startsWith(cleanRoot)) {
      throw new SecurityError('Path Traversal detectado');
    }
  }

  return normalized;
}

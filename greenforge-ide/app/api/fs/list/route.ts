import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { validatePath } from '../utils';

export async function POST(req: NextRequest) {
  try {
    const { path } = await req.json();

    const targetPath = path || '.';
    const resolvedPath = validatePath(targetPath);
    
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    
    // Simplistic formatting for the IDE tree
    const files = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'folder' : 'file',
      // Provide a relative path for the frontend
      path: targetPath === '.' ? entry.name : `${targetPath}/${entry.name}`
    }));

    return NextResponse.json({ files });
  } catch (error: any) {
    if (error.message.includes('Path traversal')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'Failed to list directory' }, { status: 500 });
  }
}

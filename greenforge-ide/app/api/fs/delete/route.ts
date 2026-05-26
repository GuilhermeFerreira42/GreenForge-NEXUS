import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { validatePath } from '../utils';

export async function POST(req: NextRequest) {
  try {
    const { path } = await req.json();

    if (!path) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    const resolvedPath = validatePath(path);
    
    try {
        const stats = await fs.stat(resolvedPath);
        if (stats.isDirectory()) {
            await fs.rm(resolvedPath, { recursive: true, force: true });
        } else {
            await fs.unlink(resolvedPath);
        }
    } catch (e: any) {
        if (e.code === 'ENOENT') {
             return NextResponse.json({ success: true }); // Already absent
        }
        throw e;
    }


    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message.includes('Path traversal')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'Failed to delete path' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { validatePath } from '../utils';

export async function POST(req: NextRequest) {
  try {
    const { path, content } = await req.json();

    if (!path) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    if (content === undefined) {
        return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const resolvedPath = validatePath(path);
    await fs.writeFile(resolvedPath, content, 'utf8');

    return NextResponse.json({ success: true });
  } catch (error: any) {
     if (error.message.includes('Path traversal')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'Failed to write file' }, { status: 500 });
  }
}

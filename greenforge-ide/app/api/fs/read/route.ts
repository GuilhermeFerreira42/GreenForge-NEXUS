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
    const content = await fs.readFile(resolvedPath, 'utf8');

    return NextResponse.json({ content });
  } catch (error: any) {
    if (error.message.includes('Path traversal')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'Failed to read file' }, { status: 500 });
  }
}

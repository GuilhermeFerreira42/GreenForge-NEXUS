import { NextRequest, NextResponse } from "next/server";
import { secureGit } from "@/lib/security/secure-git-wrapper";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { subcommand, args, worktreePath } = body;

        if (!subcommand) {
            return NextResponse.json({ error: "Subcommand is required" }, { status: 400 });
        }
        
        // Always enforce the current working directory as the root if worktreePath is not provided
        // This is safe because realpath + our validations will guard it
        const wtPath = worktreePath || process.cwd();

        const result = await secureGit({
            subcommand,
            args: args || [],
            worktreePath: wtPath
        });

        return NextResponse.json(result);

    } catch (err: any) {
        console.error("Shell Eval Error:", err);
        const status = err.name === 'SecurityError' ? 403 : 500;
        return NextResponse.json({ error: err.message }, { status });
    }
}

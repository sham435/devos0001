import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const DEVOS_ROOT = join(process.cwd(), "..", "..");
const TEMPLATES = {
  "Core setup": ["pyproject.toml", "app/config.py", "app/main.py"],
  "DB layer": ["app/db/session.py", "app/db/base.py", "app/models/"],
  "Security": ["app/core/security.py", "app/dependencies.py"],
  "Schemas": ["app/schemas/"],
  "Services": ["app/services/"],
  "API routers": ["app/api/v1/"],
  "Celery": ["app/tasks/"],
  "Tests": ["tests/"],
  "CI": [".github/workflows/ci.yml"],
};

export async function POST(req: NextRequest) {
  const { project, taskId, title } = await req.json();
  const projectDir = join(DEVOS_ROOT, "projects", "active", project);

  try {
    const msg = `feat(task${taskId}): ${title.toLowerCase()}`;
    const files = (TEMPLATES as any)[title.split(" — ")[0]] || [];

    execSync(`git add -A && git commit -m "${msg}" || true`, {
      cwd: projectDir,
      stdio: "pipe",
    });

    const statePath = join(projectDir, "PROJECT_STATE.md");
    let state = "";
    try {
      state = readFileSync(statePath, "utf-8");
    } catch {
      state = "# Current State\n\n## Working On\nTask execution in progress\n";
    }

    state = state.replace(
      /## Working On\n.*/,
      `## Working On\nTask ${taskId} complete: ${title}`
    );
    state = state.replace(
      /## Next Immediate Task\n.*/,
      `## Next Immediate Task\nTask ${taskId + 1}`
    );
    writeFileSync(statePath, state);

    const promptsPath = join(projectDir, "PROMPTS_USED.md");
    const promptEntry = `| ${new Date().toISOString().split("T")[0]} | Task ${taskId} | coding-agent | ${title} | ✅ |\n`;
    writeFileSync(promptsPath, promptEntry, { flag: "a" });

    execSync("git add -A && git commit --amend --no-edit || true", {
      cwd: projectDir,
      stdio: "pipe",
    });

    return NextResponse.json({ taskId, status: "done", files });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

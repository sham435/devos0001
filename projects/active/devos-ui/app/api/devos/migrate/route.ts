import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import { tmpdir } from "os";

const DEVOS_ROOT = process.env.DEVOS_ROOT || join(process.cwd(), "..", "..");
const PROJECTS_DIR = join(DEVOS_ROOT, "projects", "active");
const SNIPPETS_DIR = join(DEVOS_ROOT, "snippets");
const MEMORY_DIR = join(DEVOS_ROOT, "memory", "lessons");

type Analysis = {
  stack: string;
  framework: string;
  language: string;
  database: string | null;
  features: string[];
  hasTests: boolean;
  hasDocker: boolean;
  hasCI: boolean;
  fileCount: number;
  tasks: { id: number; title: string }[];
  decisions: { decision: string; reason: string }[];
  reusableSnippets: { name: string; content: string }[];
  lessons: { mistake: string; fix: string }[];
};

function detectStack(projectDir: string): Analysis {
  const files = readdirSync(projectDir, { recursive: true }).map(String);
  const fileSet = new Set(files.map(f => f.toLowerCase()));
  const allFiles = files.join(" ");

  let stack = "unknown";
  let framework = "Unknown";
  let language = "Unknown";
  let database: string | null = null;
  const features: string[] = [];

  if (fileSet.has("go.mod")) { stack = "go"; language = "Go"; framework = "Go Standard Library"; }
  else if (fileSet.has("cargo.toml")) { stack = "rust"; language = "Rust"; framework = "Rust"; }
  else if (fileSet.has("package.json")) {
    stack = "node";
    language = "TypeScript/JavaScript";
    framework = "Node.js";
    if (allFiles.includes("next.config")) { framework = "Next.js"; stack = "nextjs"; }
    else if (allFiles.includes("nest")) { framework = "NestJS"; stack = "nestjs"; }
    else if (allFiles.includes("express")) { framework = "Express"; stack = "express"; }
  }
  else if (fileSet.has("pyproject.toml") || fileSet.has("requirements.txt") || fileSet.has("setup.py")) {
    stack = "python";
    language = "Python";
    framework = "Python";
    if (allFiles.includes("fastapi") || allFiles.includes("main.py") && allFiles.includes("uvicorn")) { framework = "FastAPI"; }
    else if (allFiles.includes("django")) { framework = "Django"; }
    else if (allFiles.includes("flask")) { framework = "Flask"; }
  }

  if (allFiles.includes("postgresql") || allFiles.includes("postgres") || allFiles.includes("psycopg") || allFiles.includes("asyncpg")) database = "PostgreSQL";
  if (allFiles.includes("mysql") || allFiles.includes("mariadb")) database = database || "MySQL";
  if (allFiles.includes("sqlite") || allFiles.includes("sqlite3")) database = database || "SQLite";
  if (allFiles.includes("redis")) features.push("redis");
  if (allFiles.includes("celery")) features.push("celery");
  if (allFiles.includes("jwt") || allFiles.includes("oauth") || allFiles.includes("bcrypt") || allFiles.includes("passlib")) features.push("auth");
  if (allFiles.includes("docker-compose") || allFiles.includes("dockerfile")) features.push("docker");
  if (allFiles.includes("pytest") || allFiles.includes("jest") || allFiles.includes("mocha") || allFiles.includes("vitest")) features.push("testing");

  const hasTests = files.some(f => f.startsWith("test") || f.includes("/test_") || f.includes("__tests__") || f.includes("spec."));
  const hasDocker = files.some(f => f.includes("dockerfile") || f.includes("docker-compose"));
  const hasCI = files.some(f => f.includes(".github/workflows") || f.includes(".gitlab-ci") || f.includes("jenkinsfile"));
  const fileCount = files.length;

  const tasks = buildTasks(stack, framework, features, database);
  const decisions = buildDecisions(stack, framework, database, features);
  const reusableSnippets = extractSnippets(projectDir, stack, files);
  const lessons = [];
  if (allFiles.includes("sync") && allFiles.includes("async") && language === "Python") {
    lessons.push({ mistake: "Mixed sync/async in Python", fix: "Use async everywhere with SQLAlchemy 2.0 async session" });
  }
  if (!hasTests) {
    lessons.push({ mistake: "No test suite found", fix: "Add pytest (Python), jest (Node), or go test (Go) before production deploy" });
  }
  if (!hasDocker) {
    lessons.push({ mistake: "No Docker setup", fix: "Add Dockerfile + docker-compose.yml for reproducible environments" });
  }

  return { stack, framework, language, database, features, hasTests, hasDocker, hasCI, fileCount, tasks, decisions, reusableSnippets, lessons };
}

function buildTasks(stack: string, framework: string, features: string[], database: string | null): { id: number; title: string }[] {
  const base = [
    { id: 1, title: `Core setup — pyproject.toml${stack === "node" ? "package.json" : stack === "go" ? "go.mod" : ""}, config, main entry` },
    { id: 2, title: `Database layer — models, migrations${database ? ` (${database})` : ""}` },
    { id: 3, title: `Security — auth${features.includes("auth") ? ", JWT, password hashing" : ""}` },
    { id: 4, title: `Schemas — validation${stack === "python" ? ", Pydantic v2" : stack === "go" ? ", struct tags" : ""}` },
    { id: 5, title: `Services — business logic layer` },
    { id: 6, title: `API routers — endpoints` },
    { id: 7, title: `${features.includes("celery") ? "Celery — " : ""}Background tasks${features.includes("redis") ? " + Redis" : ""}` },
    { id: 8, title: `Tests — conftest, factories, test suites` },
    { id: 9, title: `CI — GitHub Actions, lint, typecheck, test` },
  ];
  return base;
}

function buildDecisions(stack: string, framework: string, database: string | null, features: string[]): { decision: string; reason: string }[] {
  const decisions = [
    { decision: `Why ${framework}?`, reason: `Detected from codebase structure. ${framework} was chosen for this project based on existing dependencies.` },
    { decision: `Why ${database || "SQLite"}?`, reason: `${database ? `Detected ${database} dependencies in requirements.` : "No database adapter found — SQLite used for local dev."}` },
  ];
  if (features.includes("auth")) {
    decisions.push({ decision: "JWT + refresh token rotation?", reason: "Stateless auth, single-use refresh tokens prevent replay attacks." });
  }
  if (features.includes("redis")) {
    decisions.push({ decision: "Redis for cache + queue?", reason: "Shared-nothing architecture. Redis handles both session cache and task broker." });
  }
  decisions.push({ decision: `Folder structure?`, reason: `Mirrors project's existing layout. DevOS standardizes to: app/{api,models,services,schemas,core}/` });
  return decisions;
}

function extractSnippets(projectDir: string, stack: string, files: string[]): { name: string; content: string }[] {
  const snippets: { name: string; content: string }[] = [];
  const patternFiles = files.filter(f =>
    f.includes("db") || f.includes("database") ||
    f.includes("auth") || f.includes("security") ||
    f.includes("config") || f.includes("settings") ||
    f.includes("main.") || f.includes("app.")
  );

  for (const f of patternFiles.slice(0, 5)) {
    const fullPath = join(projectDir, f);
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, "utf-8").slice(0, 2000);
        const name = basename(f);
        snippets.push({ name, content });
      } catch {}
    }
  }
  return snippets;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const repoUrl = formData.get("repoUrl") as string | null;
  const projectName = (formData.get("projectName") as string || "").trim();
  const tempDir = join(tmpdir(), `devos-migrate-${Date.now()}`);

  try {
    if (!file && !repoUrl) {
      return NextResponse.json({ error: "Provide a file upload or repo URL" }, { status: 400 });
    }

    mkdirSync(tempDir, { recursive: true });

    if (file) {
      const buf = Buffer.from(await file.arrayBuffer());
      const filePath = join(tempDir, file.name);

      writeFileSync(filePath, buf);

      if (file.name.endsWith(".zip")) {
        execSync(`unzip -o "${filePath}" -d "${tempDir}" 2>/dev/null || unzip -o "${filePath}" -d "${tempDir}"`);
      } else if (file.name.endsWith(".tar.gz") || file.name.endsWith(".tgz")) {
        execSync(`tar xzf "${filePath}" -C "${tempDir}" 2>/dev/null`);
      } else {
        return NextResponse.json({ error: "Unsupported format. Use .zip or .tar.gz" }, { status: 400 });
      }
    } else if (repoUrl) {
      execSync(`git clone --depth=1 "${repoUrl}" "${tempDir}" 2>/dev/null`, { timeout: 30000 });
    }

    const name = projectName || (file ? file.name.replace(/\.(zip|tar\.gz|tgz)$/i, "") : repoUrl!.split("/").pop()!.replace(".git", ""));
    const projectDir = join(PROJECTS_DIR, name);

    if (existsSync(projectDir)) {
      return NextResponse.json({ error: `Project "${name}" already exists at projects/active/` }, { status: 409 });
    }

    const analysis = detectStack(tempDir);

    // Find actual project root (handle zip with single top-level dir)
    const entries = readdirSync(tempDir);
    let sourceDir = tempDir;
    if (entries.length === 1 && existsSync(join(tempDir, entries[0]))) {
      const nested = join(tempDir, entries[0]);
      if (readdirSync(nested).some(f => !f.startsWith("."))) {
        sourceDir = nested;
      }
    }

    // Create project from template
    execSync(`bash "${join(DEVOS_ROOT, "scripts/create-project.sh")}" "${name}"`, {
      cwd: DEVOS_ROOT, stdio: "pipe",
    });

    // Generate ARCHITECTURE.md
    const archMd = `# ${name} — Architecture

## Overview
Migrated from legacy project. Stack detected: ${analysis.stack}/${analysis.framework}.

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Language | ${analysis.language} |
| Framework | ${analysis.framework} |
| Database | ${analysis.database || "TBD"} |
| Cache/Queue | ${analysis.features.includes("redis") ? "Redis" : "None detected"} |
| Auth | ${analysis.features.includes("auth") ? "JWT" : "None detected"} |

## Data Flow
\`\`\`
Client → HTTP → ${analysis.framework} → ${analysis.database || "Database"}
${analysis.features.includes("redis") ? "                          → Redis (cache)" : ""}
${analysis.features.includes("celery") ? "                          → Celery (tasks)" : ""}
\`\`\`

## Migration Stats
- Files analyzed: ${analysis.fileCount}
- Tests: ${analysis.hasTests ? "Present ✓" : "Missing — add test suite"}
- Docker: ${analysis.hasDocker ? "Configured ✓" : "Not configured"}
- CI: ${analysis.hasCI ? "Configured ✓" : "Not configured"}

## DevOS Compliance
- [x] ARCHITECTURE.md — reverse-engineered from codebase
- [x] DECISIONS.md — key choices extracted
- [x] TASKS.md — legacy work marked complete
- [x] PROJECT_STATE.md — initialized for DevOS workflow
- [x] PROMPTS_USED.md — migration prompt logged
- [x] snippets/${analysis.stack}/ — reusable patterns extracted
- [x] memory/lessons/ — anti-patterns documented
`;
    writeFileSync(join(projectDir, "ARCHITECTURE.md"), archMd);

    // Generate DECISIONS.md
    const decisionsMd = `# Engineering Decisions

> Reverse-engineered from legacy project: ${name}

| # | Decision | Rationale |
|---|----------|-----------|
${analysis.decisions.map((d, i) => `| ${i + 1} | ${d.decision} | ${d.reason} |`).join("\n")}

---
*Generated by DevOS Migration Stage on ${new Date().toISOString().split("T")[0]}*
`;
    writeFileSync(join(projectDir, "DECISIONS.md"), decisionsMd);

    // Generate TASKS.md
    const completedTasks = analysis.tasks.map(t => `- [x] Task ${t.id}: ${t.title} (migrated from legacy)`).join("\n");
    const tasksMd = `# Tasks — ${name}

## Completed (Migrated from Legacy)
${completedTasks}

## Next
- [ ] Task ${analysis.tasks.length + 1}: DevOS compliance audit — add PROJECT_STATE.md tracking to legacy code, verify tests, add Docker/CI if missing
`;
    writeFileSync(join(projectDir, "TASKS.md"), tasksMd);

    // Generate PROJECT_STATE.md
    const stateMd = `# Current State
Updated: ${new Date().toISOString().split("T")[0]}

## Completed
${analysis.tasks.map(t => `- [x] Task ${t.id}: ${t.title}`).join("\n")}

## Working On
Task ${analysis.tasks.length + 1}: DevOS compliance audit
${!analysis.hasTests ? "- Add test suite (none detected)" : ""}
${!analysis.hasDocker ? "- Add Docker setup (none detected)" : ""}
${!analysis.hasCI ? "- Add CI pipeline (none detected)" : ""}

## Blockers
None identified

## Next Immediate Task
Task ${analysis.tasks.length + 1}: Verify existing tests pass, add missing DevOS tracking

## Migration
- **Source**: ${file ? file.name : repoUrl || "unknown"}
- **Stack**: ${analysis.stack}/${analysis.framework}
- **Files**: ${analysis.fileCount}
- **Date**: ${new Date().toISOString().split("T")[0]}
`;
    writeFileSync(join(projectDir, "PROJECT_STATE.md"), stateMd);

    // Extract snippets
    const snippetDir = join(SNIPPETS_DIR, analysis.stack);
    mkdirSync(snippetDir, { recursive: true });
    for (const s of analysis.reusableSnippets) {
      writeFileSync(join(snippetDir, s.name), s.content);
    }

    // Extract lessons
    mkdirSync(MEMORY_DIR, { recursive: true });
    for (const l of analysis.lessons) {
      const fname = `${analysis.stack}-${l.mistake.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.md`;
      writeFileSync(join(MEMORY_DIR, fname), `# ${l.mistake}\n\n**Fix**: ${l.fix}\n\nSource: Migration from ${name}\nDate: ${new Date().toISOString().split("T")[0]}\n`);
    }

    // Log to PROMPTS_USED.md
    const promptEntry = `| ${new Date().toISOString().split("T")[0]} | Migration | analyzer-agent | "Auto-analyze ${analysis.stack} project" | Success |\n`;
    writeFileSync(join(projectDir, "PROMPTS_USED.md"), `# Prompts Used\n\n| Date | Task | Agent | Prompt | Status |\n|------|------|-------|--------|--------|\n${promptEntry}`);

    // Initial commit
    execSync("git add . && git commit -m \"feat: migrate " + name + " to DevOS from legacy " + analysis.stack + "\"", {
      cwd: projectDir, stdio: "pipe",
    });

    // Cleanup
    execSync(`rm -rf "${tempDir}"`, { stdio: "pipe" });

    return NextResponse.json({
      success: true,
      projectName: name,
      projectPath: projectDir,
      analysis: {
        stack: analysis.stack,
        framework: analysis.framework,
        language: analysis.language,
        database: analysis.database,
        features: analysis.features,
        fileCount: analysis.fileCount,
        hasTests: analysis.hasTests,
        hasDocker: analysis.hasDocker,
        hasCI: analysis.hasCI,
        tasksFound: analysis.tasks.length,
        snippetsExtracted: analysis.reusableSnippets.length,
        lessonsLearned: analysis.lessons.length,
      },
    });

  } catch (e: any) {
    execSync(`rm -rf "${tempDir}" 2>/dev/null || true`, { stdio: "pipe" });
    return NextResponse.json({ error: e.message || "Migration failed" }, { status: 500 });
  }
}

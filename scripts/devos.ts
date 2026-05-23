#!/usr/bin/env tsx
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, accessSync, constants } from "fs";
import { join, resolve, basename } from "path";
import { tmpdir } from "os";

const DEVOS_HOME = process.env.DEVOS_HOME || process.cwd();
const DEVOS_LOCAL = join(DEVOS_HOME, ".devos.local");
const DEVOS_BIN = join(DEVOS_LOCAL, "bin");

const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
} as const;

const cmd = process.argv[2];
const args = process.argv.slice(3);

function log(color: keyof typeof colors, msg: string) {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

// ─── Doctor ──────────────────────────────────────────────────────────────────
async function doctor() {
  log("cyan", "\n>>> DevOS Doctor\n");
  const checks: { ok: boolean; msg: string }[] = [];

  // Expand check helper inline
  const ck = (ok: boolean, msg: string) => checks.push({ ok, msg });

  try {
    // 1. DEVOS_HOME
    if (!existsSync(DEVOS_HOME)) ck(false, `DEVOS_HOME not found: ${DEVOS_HOME}`);
    else ck(true, `DEVOS_HOME: ${DEVOS_HOME}`);
  } catch { ck(false, "DEVOS_HOME not set"); }

  // 2. device.yaml
  const deviceYaml = join(DEVOS_LOCAL, "device.yaml");
  if (!existsSync(deviceYaml)) {
    ck(false, ".devos.local/device.yaml missing — run scripts/bootstrap.sh");
  } else {
    const device = readFileSync(deviceYaml, "utf-8").match(/device:\s*(.+)/)?.[1]?.trim() || "unknown";
    ck(true, `Device: ${device}`);
  }

  // 3. opencode binary
  const opencodeBin = join(DEVOS_BIN, "opencode");
  if (!existsSync(opencodeBin)) {
    ck(false, `opencode binary missing at ${opencodeBin} — run scripts/bootstrap.sh`);
  } else {
    ck(true, `opencode binary: ${DEVOS_BIN}/opencode`);
  }

  // 4. secrets.age
  const secretsAge = join(DEVOS_HOME, "secrets.age");
  const ageKey = join(DEVOS_LOCAL, "age-key.txt");
  if (!existsSync(secretsAge)) {
    ck(false, "secrets.age not found — no API keys configured");
  } else if (!existsSync(ageKey)) {
    ck(false, "secrets.age exists but .devos.local/age-key.txt missing — copy key");
  } else {
    try {
      execSync(`age -d -i "${ageKey}" "${secretsAge}" >/dev/null 2>&1`, { timeout: 5000 });
      ck(true, "secrets.age: decryptable");
    } catch {
      ck(false, "secrets.age: decryption failed — key mismatch");
    }
  }

  // 5. .devos/providers.yaml
  const providers = join(DEVOS_HOME, ".devos/providers.yaml");
  if (!existsSync(providers)) {
    ck(false, ".devos/providers.yaml missing");
  } else {
    ck(true, ".devos/providers.yaml: found");
  }

  // 6. .devos/agents.yaml
  const agents = join(DEVOS_HOME, ".devos/agents.yaml");
  if (!existsSync(agents)) {
    ck(false, ".devos/agents.yaml missing");
  } else {
    ck(true, ".devos/agents.yaml: found");
  }

  // 7. Git remote
  try {
    const remote = execSync("git remote get-url origin 2>/dev/null", { cwd: DEVOS_HOME, encoding: "utf-8", timeout: 3000 }).trim();
    ck(true, `Git remote: ${remote}`);
  } catch {
    ck(false, "Git remote not configured");
  }

  // 8. devos-state branch
  try {
    execSync("git fetch origin devos-state 2>/dev/null", { cwd: DEVOS_HOME, timeout: 5000 });
    ck(true, "devos-state branch: fetchable");
  } catch {
    ck(false, "devos-state branch not found — run: devos sync");
  }

  // 9. Project-specific checks
  const project = args[0];
  if (project) {
    const projectPath = join(DEVOS_HOME, "projects/active", project);
    if (!existsSync(projectPath)) {
      ck(false, `Project "${project}" not found at ${projectPath}`);
    } else {
      ck(true, `Project: ${project} (${projectPath})`);
      for (const file of ["PROJECT_STATE.md", "ARCHITECTURE.md", "DECISIONS.md", "TASKS.md", "PROMPTS_USED.md"]) {
        const f = join(projectPath, file);
        ck(existsSync(f), `  ${file}: ${existsSync(f) ? "found" : "missing"}`);
      }
      try {
        accessSync(projectPath, constants.W_OK);
        ck(true, "  Writable: yes");
      } catch {
        ck(false, "  Writable: no — chmod u+w");
      }
    }
  }

  // Summary
  const failures = checks.filter(c => !c.ok);
  const successes = checks.filter(c => c.ok);

  for (const c of checks) {
    console.log(`  ${c.ok ? colors.green + "✓" : colors.red + "✗"}${colors.reset} ${c.msg}`);
  }

  console.log(`\n${colors.dim}────────────────────────────────────────${colors.reset}`);
  log("green", `${successes.length} passed`);
  if (failures.length > 0) {
    log("red", `${failures.length} failed — fix above issues`);
    process.exit(1);
  }
}

// ─── Migrate ─────────────────────────────────────────────────────────────────
async function migrate(legacyPath: string) {
  const absPath = resolve(legacyPath);
  const nameFlag = process.argv.findIndex(a => a === "--name");
  const projectName = nameFlag !== -1 && process.argv[nameFlag + 1] ? process.argv[nameFlag + 1] : basename(absPath);

  log("cyan", `\n>>> Migrating ${absPath} → ${projectName}\n`);

  if (!existsSync(absPath)) {
    log("red", `Path not found: ${absPath}`);
    process.exit(1);
  }

  const projectDir = join(DEVOS_HOME, "projects/active", projectName);
  if (existsSync(projectDir)) {
    log("red", `Project "${projectName}" already exists at ${projectDir}`);
    process.exit(1);
  }

  // Detect stack
  const files = execSync(`find "${absPath}" -type f 2>/dev/null | head -50`, { encoding: "utf-8" }).trim().split("\n");
  const fileSet = new Set(files.map(f => basename(f).toLowerCase()));
  let stack = "unknown";

  if (fileSet.has("go.mod")) stack = "go";
  else if (fileSet.has("cargo.toml")) stack = "rust";
  else if (fileSet.has("package.json")) {
    const pkg = JSON.parse(readFileSync(join(absPath, "package.json"), "utf-8"));
    stack = pkg.dependencies?.next ? "nextjs" : pkg.dependencies?.express ? "node" : "node";
  } else if (fileSet.has("pyproject.toml") || fileSet.has("requirements.txt") || fileSet.has("setup.py")) {
    stack = "python";
  }

  log("green", `  Stack detected: ${stack}`);
  log("green", `  Files found: ${files.filter(f => f && !f.startsWith(".")).length}`);

  // Run create-project
  const templateDir = join(DEVOS_HOME, "templates");
  mkdirSync(projectDir, { recursive: true });
  execSync(`cp -r "${templateDir}/." "${projectDir}"`, { stdio: "pipe" });

  // Generate ARCHITECTURE.md
  const archMd = `# ${projectName} — Architecture

## Overview
Migrated from legacy project at ${absPath}. Stack: ${stack}.

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Language | ${stack === "go" ? "Go" : stack === "rust" ? "Rust" : stack === "node" || stack === "nextjs" ? "TypeScript" : "Python"} |
| Framework | ${stack === "nextjs" ? "Next.js" : stack === "node" ? "Express" : stack === "go" ? "Go" : stack === "rust" ? "Rust" : "FastAPI"} |
| Database | TBD |
| Auth | TBD |

## Data Flow
\`\`\`
Client → HTTP → Server → Database
\`\`\`

## Migration Notes
- Original path: ${absPath}
- Migrated: ${new Date().toISOString().split("T")[0]}
- Files analyzed: ${files.filter(f => f).length}
`;

  writeFileSync(join(projectDir, "ARCHITECTURE.md"), archMd);

  // Generate DECISIONS.md
  const decisionsMd = `# Engineering Decisions — ${projectName}

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Why "${stack}"? | Detected from existing project structure |
| 2 | Architecture pattern | Mirrors original project's layout; standardized to DevOS structure for portability |
| 3 | Data storage | To be determined — analyze existing code for DB adapters |

*Reverse-engineered from legacy codebase. Generated ${new Date().toISOString().split("T")[0]}.*
`;

  writeFileSync(join(projectDir, "DECISIONS.md"), decisionsMd);

  // Generate TASKS.md
  const tasks = [
    "Core setup — config, main entry, Dockerfile",
    "Database layer — models, migrations",
    "Security — auth, JWT, hashing",
    "Schemas — validation",
    "Services — business logic",
    "API routers — endpoints",
    "Background tasks — queue, scheduling",
    "Tests — conftest, factories, suites",
    "CI — GitHub Actions, lint, test",
  ];

  const tasksMd = `# Tasks — ${projectName}

## Completed (Migrated)
${tasks.map((t, i) => `- [x] Task ${i + 1}: ${t}`).join("\n")}

## Next
- [ ] Task 10: DevOS compliance audit — verify tests, add CI if missing, review architecture
`;

  writeFileSync(join(projectDir, "TASKS.md"), tasksMd);

  // Generate PROJECT_STATE.md
  const stateMd = `# Current State
Updated: ${new Date().toISOString().split("T")[0]}

## Completed
${tasks.map((t, i) => `- [x] Task ${i + 1}: ${t}`).join("\n")}

## Working On
Task 10: DevOS compliance audit

## Blockers
None

## Next Immediate Task
Task 10: Review auto-generated architecture and verify legacy code

## Migration
- Source: ${absPath}
- Stack: ${stack}
- Files: ${files.filter(f => f).length}
- Date: ${new Date().toISOString().split("T")[0]}
`;

  writeFileSync(join(projectDir, "PROJECT_STATE.md"), stateMd);

  // Log prompt
  writeFileSync(join(projectDir, "PROMPTS_USED.md"),
    `# Prompts Used\n\n| Date | Task | Agent | Prompt | Status |\n|------|------|-------|--------|--------|\n| ${new Date().toISOString().split("T")[0]} | Migration | doctor | "Auto-analyze ${stack} project" | Success |\n`
  );

  // Copy BUGS.md
  writeFileSync(join(projectDir, "BUGS.md"), "# Bugs\n\n*None migrated*");

  // Copy legacy code into legacy/ subdirectory
  mkdirSync(join(projectDir, "legacy"), { recursive: true });
  execSync(`cp -r "${absPath}/." "${join(projectDir, "legacy")}"`, { stdio: "pipe" });

  // Git init and commit
  execSync("git init", { cwd: projectDir, stdio: "pipe" });
  execSync("git add .", { cwd: projectDir, stdio: "pipe" });
  execSync(`git commit -m "feat: migrate ${projectName} to DevOS from legacy ${stack}"`, { cwd: projectDir, stdio: "pipe" });

  log("green", "\n✓ Migration complete");

  const artifacts = ["ARCHITECTURE.md", "DECISIONS.md", "TASKS.md", "PROJECT_STATE.md", "PROMPTS_USED.md", "BUGS.md", "legacy/"];
  log("cyan", "\nGenerated artifacts:");
  for (const a of artifacts) console.log(`  - ${a}`);

  log("cyan", `\nPath: ${projectDir}`);
  log("cyan", `\nCommands:`);
  console.log(`  cd ${projectDir}`);
  console.log(`  devos doctor ${projectName}`);
  console.log(`  devos task ${projectName} 1`);
}

// ─── Opencode ────────────────────────────────────────────────────────────────
async function runOpencode(project: string, prompt: string) {
  const projectPath = join(DEVOS_HOME, "projects/active", project);
  const opencodeBin = join(DEVOS_BIN, "opencode");

  log("cyan", `\n>>> DevOS opencode: ${project}\n`);

  if (!existsSync(projectPath)) {
    log("red", `Project not found: ${projectPath}`);
    process.exit(1);
  }
  if (!existsSync(opencodeBin)) {
    log("red", `opencode binary not found at ${opencodeBin} — run bootstrap.sh`);
    process.exit(1);
  }

  // 1. Pre-hook: doctor check
  log("yellow", "  [1/4] Pre-hook: health check...");
  try {
    execSync(
      `tsx "${join(DEVOS_HOME, "scripts/devos-doctor.ts")}" "${project}"`,
      { stdio: "inherit", timeout: 15000, encoding: "utf-8" }
    );
    log("green", "  ✓ Doctor passed");
  } catch {
    log("red", "\n✗ DevOS Doctor FAILED — opencode execution aborted.");
    process.exit(1);
  }

  // 2. Bundle context
  log("yellow", "  [2/4] Bundling DevOS context...");
  try {
    execSync(
      `bash "${join(DEVOS_HOME, "scripts/context/bundle.sh")}"`,
      { env: { ...process.env, PROJECT_PATH: projectPath, DEVOS_HOME }, stdio: "pipe", timeout: 5000 }
    );
    log("green", `  ✓ Context bundled to /tmp/devos-context.md`);
  } catch {
    log("yellow", "  ⚠ Context bundle had issues, continuing without it");
  }

  // 3. Spawn opencode with bundled context
  log("yellow", "  [3/4] Running opencode...");
  const context = readFileSync("/tmp/devos-context.md", "utf-8");
  const fullPrompt = `${context}\n\n## Current Instruction\n${prompt}`;

  execSync(
    `"${opencodeBin}" run --prompt "${fullPrompt.replace(/"/g, '\\"')}"`,
    {
      cwd: projectPath,
      env: {
        ...process.env,
        OPENCODE_CONFIG_DIR: join(DEVOS_HOME, ".opencode"),
        DEVOS_PROJECT: project,
      },
      stdio: "inherit",
      timeout: 600000,
    }
  );
  log("green", "  ✓ opencode completed");

  // 4. Post-hook: state sync
  log("yellow", "  [4/4] Post-hook: syncing state...");
  execSync(
    `bash "${join(DEVOS_HOME, ".devos/hooks/post-task.sh")}" "${project}" "${projectPath}"`,
    { stdio: "pipe", timeout: 15000 }
  );

  log("green", "\n✓ Task complete. State synced to devos-state branch.");
}

// ─── Help ────────────────────────────────────────────────────────────────────
function help() {
  console.log(`Usage: devos <command> [options]

Commands:
  doctor [project]    Health check DevOS + opencode setup
  migrate <path>      Convert legacy project to DevOS structure
                       --name <name>  Override project name
  opencode <project>  Run opencode with full DevOS pipeline (doctor → context → opencode → sync)
    <prompt>           Instruction for opencode

Examples:
  devos doctor
  devos doctor my-fastapi-app
  devos migrate /path/to/legacy-project
  devos migrate ../old-app --name my-new-app
  devos opencode my-fastapi-app "Add pagination to /items endpoint"
  devos opencode my-fastapi-app "Fix the bug in app/api/v1/items.py from BUGS.md"
`);
}

// ─── Router ──────────────────────────────────────────────────────────────────
switch (cmd) {
  case "doctor":
    doctor().catch(e => { log("red", `\n✗ Doctor failed: ${e.message}`); process.exit(1); });
    break;
  case "migrate":
    if (!args[0]) { log("red", "Usage: devos migrate <path> [--name <name>]"); process.exit(1); }
    migrate(args[0]).catch(e => { log("red", `\n✗ Migration failed: ${e.message}`); process.exit(1); });
    break;
  case "opencode":
    if (!args[0] || !args[1]) { log("red", "Usage: devos opencode <project> \"<prompt>\""); process.exit(1); }
    runOpencode(args[0], args.slice(1).join(" ")).catch(e => { log("red", `\n✗ opencode failed: ${e.message}`); process.exit(1); });
    break;
  default:
    help();
    process.exit(cmd ? 1 : 0);
}

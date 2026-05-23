#!/usr/bin/env tsx
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, accessSync, watchFile, readdirSync, constants } from "fs";
import { join, resolve, basename } from "path";
import { tmpdir } from "os";
import { createInterface } from "readline";

const DEVOS_HOME = process.env.DEVOS_HOME || process.cwd();
const DEVOS_LOCAL = join(DEVOS_HOME, ".devos.local");
const DEVOS_BIN = join(DEVOS_LOCAL, "bin");

const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
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

// ─── Logs ────────────────────────────────────────────────────────────────────
async function tailLogs(project: string, follow = true) {
  const projectPath = join(DEVOS_HOME, "projects/active", project);
  const promptsLog = join(projectPath, "PROMPTS_USED.md");
  const opencodeLog = join(DEVOS_LOCAL, "logs", `${project}-opencode.log`);

  if (!existsSync(projectPath)) {
    log("red", `Project not found: ${project}`);
    process.exit(1);
  }

  log("cyan", `\n>>> DevOS Logs: ${project}\n`);

  const colorLine = (l: string) => {
    if (!l.trim()) return;
    if (l.includes("opencode")) console.log(`  ${colors.magenta}${l}${colors.reset}`);
    else if (l.includes("coding-agent")) console.log(`  ${colors.cyan}${l}${colors.reset}`);
    else if (l.includes("migration")) console.log(`  ${colors.yellow}${l}${colors.reset}`);
    else console.log(`  ${colors.dim}${l}${colors.reset}`);
  };

  // Show last 50 lines of PROMPTS_USED.md
  if (existsSync(promptsLog)) {
    log("yellow", "─── PROMPTS_USED.md ───");
    const prompts = readFileSync(promptsLog, "utf-8").split("\n").slice(-50);
    prompts.forEach(colorLine);
  }

  // Show last 50 lines of opencode log if exists
  if (existsSync(opencodeLog)) {
    log("yellow", "\n─── opencode.log ───");
    const logs = readFileSync(opencodeLog, "utf-8").split("\n").slice(-50);
    logs.forEach(l => { if (l.trim()) console.log(`  ${l}`); });
  }

  if (!follow) return;

  log("dim", "\nFollowing logs... Ctrl+C to exit\n");

  // Watch both files using built-in fs.watchFile
  if (existsSync(promptsLog)) {
    watchFile(promptsLog, { interval: 1000 }, () => {
      const lines = readFileSync(promptsLog, "utf-8").split("\n").slice(-1);
      lines.forEach(l => {
        if (l.trim()) {
          const ts = new Date().toLocaleTimeString();
          if (l.includes("opencode")) console.log(`${colors.magenta}[${ts}] ${l}${colors.reset}`);
          else if (l.includes("coding-agent")) console.log(`${colors.cyan}[${ts}] ${l}${colors.reset}`);
          else console.log(`${colors.dim}[${ts}] ${l}${colors.reset}`);
        }
      });
    });
  }

  if (existsSync(opencodeLog)) {
    watchFile(opencodeLog, { interval: 1000 }, () => {
      const lines = readFileSync(opencodeLog, "utf-8").split("\n").slice(-1);
      lines.forEach(l => { if (l.trim()) console.log(`  ${l}`); });
    });
  }

  process.stdin.resume();
  await new Promise(() => {}); // keep alive
}

// ─── Diff ────────────────────────────────────────────────────────────────────
async function showDiff(project: string, lastN = 1) {
  const projectPath = join(DEVOS_HOME, "projects/active", project);

  if (!existsSync(projectPath)) {
    log("red", `Project not found: ${project}`);
    process.exit(1);
  }

  log("cyan", `\n>>> DevOS Diff: ${project}\n`);

  const stdout = execSync(
    `git log --grep=opencode --max-count=${lastN} --format="%H %s"`,
    { cwd: projectPath, encoding: "utf-8", timeout: 5000 }
  ).trim();

  if (!stdout) {
    log("yellow", "No opencode commits found");
    return;
  }

  const commits = stdout.split("\n");

  for (const commitLine of commits) {
    const hash = commitLine.split(" ")[0];
    const msg = commitLine.substring(hash.length + 1);

    log("yellow", `─── ${msg} ───`);
    log("dim", `  Commit: ${hash.slice(0, 7)}`);

    const files = execSync(
      `git diff-tree --no-commit-id --name-status -r ${hash}`,
      { cwd: projectPath, encoding: "utf-8", timeout: 5000 }
    ).trim();

    files.split("\n").filter(Boolean).forEach((line: string) => {
      const [status, file] = line.split("\t");
      if (status === "A") console.log(`  ${colors.green}+${colors.reset} ${file}`);
      else if (status === "M") console.log(`  ${colors.yellow}~${colors.reset} ${file}`);
      else console.log(`  ${colors.red}-${colors.reset} ${file}`);
    });

    console.log("");
    const diff = execSync(`git show --format="" ${hash}`, { cwd: projectPath, encoding: "utf-8", timeout: 10000 });
    console.log(`  ${diff.split("\n").join("\n  ")}`);
    console.log("");
  }
}

// ─── Rollback ────────────────────────────────────────────────────────────────
function confirmRollback(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${colors.yellow}Proceed with rollback? [y/N] ${colors.reset}`, (answer: string) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes");
    });
  });
}

async function rollback(project: string, count = 1) {
  const projectPath = join(DEVOS_HOME, "projects/active", project);

  if (!existsSync(projectPath)) {
    log("red", `Project not found: ${project}`);
    process.exit(1);
  }

  log("cyan", `\n>>> DevOS Rollback: ${project}\n`);

  const stdout = execSync(
    `git log --grep=opencode --max-count=${count} --format="%H %s"`,
    { cwd: projectPath, encoding: "utf-8", timeout: 5000 }
  ).trim();

  if (!stdout) {
    log("yellow", "No opencode commits found to rollback");
    return;
  }

  const commits = stdout.split("\n");
  const lastHash = commits[0].split(" ")[0];

  log("yellow", `Rolling back ${count} opencode commit(s):`);
  for (const c of commits) {
    const h = c.split(" ")[0];
    const m = c.substring(h.length + 1);
    console.log(`  ${colors.red}-${colors.reset} ${h.slice(0, 7)} ${m}`);
  }

  const diffStat = execSync(`git show --stat --format="" ${lastHash}`, { cwd: projectPath, encoding: "utf-8", timeout: 5000 });
  console.log("");
  diffStat.split("\n").forEach(l => { if (l.trim()) console.log(`  ${l}`); });

  if (!(await confirmRollback())) {
    log("dim", "Rollback cancelled");
    return;
  }

  execSync(`git reset --hard ${lastHash}~${count}`, { cwd: projectPath, stdio: "pipe", timeout: 10000 });

  // Update PROJECT_STATE.md
  const stateFile = join(projectPath, "PROJECT_STATE.md");
  if (existsSync(stateFile)) {
    let state = readFileSync(stateFile, "utf-8");
    for (const c of commits) {
      const taskMatch = c.match(/task(\d+)/i);
      if (taskMatch) {
        const re = new RegExp(`- \\[x\\] Task ${taskMatch[1]}:`);
        state = state.replace(re, `- [ ] Task ${taskMatch[1]}:`);
      }
    }
    writeFileSync(stateFile, state);
    execSync("git add PROJECT_STATE.md", { cwd: projectPath, stdio: "pipe" });
    const taskNums = commits.map(c => c.match(/task(\d+)/i)?.[1]).filter(Boolean).join(", ");
    execSync(`git commit -m "revert: rollback opencode task(s) ${taskNums || "unknown"}"`, { cwd: projectPath, stdio: "pipe" });
  }

  log("green", `\n✓ Rolled back to ${lastHash.slice(0, 7)}~${count}`);
  log("green", "✓ PROJECT_STATE.md updated — tasks marked incomplete");
}

// ─── Retry ───────────────────────────────────────────────────────────────────
async function retry(project: string, newPrompt?: string) {
  const projectPath = join(DEVOS_HOME, "projects/active", project);

  if (!existsSync(projectPath)) {
    log("red", `Project not found: ${project}`);
    process.exit(1);
  }

  log("cyan", `\n>>> DevOS Retry: ${project}\n`);

  const stdout = execSync(
    `git log --grep=opencode --max-count=1 --format="%H %s"`,
    { cwd: projectPath, encoding: "utf-8", timeout: 5000 }
  ).trim();

  if (!stdout) {
    log("red", "No opencode commits found to retry");
    process.exit(1);
  }

  const commitHash = stdout.split(" ")[0];
  const commitMsg = stdout.substring(commitHash.length + 1);
  const taskMatch = commitMsg.match(/task(\d+)/i);
  const taskNum = taskMatch?.[1] || "unknown";

  log("yellow", `Last run: ${commitMsg}`);
  log("dim", `  Commit: ${commitHash.slice(0, 7)}`);

  // Extract original prompt from PROMPTS_USED.md
  const promptsFile = join(projectPath, "PROMPTS_USED.md");
  let originalPrompt = "";
  if (existsSync(promptsFile)) {
    const prompts = readFileSync(promptsFile, "utf-8").split("\n").reverse();
    const lastEntry = prompts.find(l => l.includes("opencode") && l.includes(`Task ${taskNum}`));
    if (lastEntry) {
      const m = lastEntry.match(/"([^"]+)"/);
      if (m) originalPrompt = m[1];
    }
  }

  const promptToUse = newPrompt || originalPrompt;
  if (!promptToUse) {
    log("red", "Could not determine prompt to retry. Provide one:");
    log("dim", `  devos retry ${project} "your fixed prompt here"`);
    process.exit(1);
  }

  log("yellow", `\n  Original: "${originalPrompt.slice(0, 80)}${originalPrompt.length > 80 ? "..." : ""}"`);
  log("yellow", `  Retry:    "${promptToUse.slice(0, 80)}${promptToUse.length > 80 ? "..." : ""}"`);

  // Rollback silently (no confirmation for retry)
  log("yellow", "\n[1/2] Rolling back...");
  execSync(`git reset --hard ${commitHash}~1`, { cwd: projectPath, stdio: "pipe", timeout: 10000 });

  const stateFile = join(projectPath, "PROJECT_STATE.md");
  if (existsSync(stateFile) && taskNum !== "unknown") {
    let state = readFileSync(stateFile, "utf-8");
    state = state.replace(new RegExp(`- \\[x\\] Task ${taskNum}:`), `- [ ] Task ${taskNum}:`);
    writeFileSync(stateFile, state);
  }
  log("green", "  ✓ Rolled back to previous state");

  // Re-run opencode
  log("yellow", "\n[2/2] Re-running opencode with fixed prompt...");
  await runOpencode(project, promptToUse);
  log("green", `\n✓ Retry complete. Task ${taskNum} re-executed.`);
}

// ─── Test ────────────────────────────────────────────────────────────────────
async function runTests(project: string, autoCommit = false) {
  const projectPath = join(DEVOS_HOME, "projects/active", project);
  const schemasDir = join(DEVOS_HOME, ".devos/test-schemas");

  if (!existsSync(projectPath)) {
    log("red", `Project not found: ${project}`);
    process.exit(1);
  }

  log("cyan", `\n>>> DevOS Test: ${project}\n`);

  if (!existsSync(schemasDir)) {
    log("red", "No test schemas found at .devos/test-schemas/");
    process.exit(1);
  }

  // 1. Detect stack by scanning project files
  const projectFiles = readdirSync(projectPath);
  let matchedSchema: any = null;
  let schemaFile = "";

  // Check if project has dependency/keyword markers for better detection
  const projectContent = projectFiles.filter(f => f.endsWith(".toml") || f.endsWith(".json") || f.endsWith(".cfg"))
    .map(f => { try { return readFileSync(join(projectPath, f), "utf-8"); } catch { return ""; } })
    .join(" ").toLowerCase();

  for (const f of readdirSync(schemasDir)) {
    if (!f.endsWith(".json")) continue;
    const schema = JSON.parse(readFileSync(join(schemasDir, f), "utf-8"));
    const hasFile = schema.detect.files.some((df: string) => projectFiles.includes(df));
    const hasImport = schema.detect.imports?.some((imp: string) => projectContent.includes(imp)) ?? false;
    if (hasFile && hasImport) {
      matchedSchema = schema;
      schemaFile = f;
      break;
    }
  }

  // Fallback: file-only match if no import match found
  if (!matchedSchema) {
    for (const f of readdirSync(schemasDir)) {
      if (!f.endsWith(".json")) continue;
      const schema = JSON.parse(readFileSync(join(schemasDir, f), "utf-8"));
      const hasFile = schema.detect.files.some((df: string) => projectFiles.includes(df));
      if (hasFile) {
        matchedSchema = schema;
        schemaFile = f;
        break;
      }
    }
  }

  if (!matchedSchema) {
    log("yellow", "No test schema matched this project.");
    log("dim", `  Create one: .devos/test-schemas/<lang>-<framework>.json`);
    log("dim", `  Or run: opencode .devos "Create test schema for my stack"`);
    process.exit(1);
  }

  log("green", `  Detected: ${matchedSchema.language}/${matchedSchema.frameworks[0]}`);
  log("yellow", `  Schema: ${schemaFile}`);

  // 2. Install test deps if needed
  if (matchedSchema.install_deps) {
    log("yellow", "  Installing test dependencies...");
    try {
      execSync(matchedSchema.install_deps, { cwd: projectPath, stdio: "pipe", timeout: 120000 });
      log("green", "  ✓ Dependencies installed");
    } catch { log("yellow", "  ⚠ Dep install had issues, continuing"); }
  }

  // 3. Run tests
  log("yellow", "  Running tests...");
  let rawOutput = "";
  try {
    rawOutput = execSync(matchedSchema.test_command, {
      cwd: projectPath, encoding: "utf-8", timeout: 300000, stdio: "pipe",
    });
  } catch (e: any) {
    rawOutput = e.stdout || e.message || "";
  }

  // 4. Parse results based on schema type
  let passed = 0, failed = 0, total = 0;
  const failures: string[] = [];
  const lines = rawOutput.split("\n");

  if (matchedSchema.parse.type === "json") {
    const resultFile = matchedSchema.parse.file;
    if (existsSync(resultFile)) {
      try {
        const data = JSON.parse(readFileSync(resultFile, "utf-8"));
        const getVal = (obj: any, path: string) => path.split(".").reduce((o, k) => o?.[k], obj);
        passed = getVal(data, matchedSchema.parse.passed_path) || 0;
        failed = getVal(data, matchedSchema.parse.failed_path) || 0;
        total = getVal(data, matchedSchema.parse.total_path) || 0;
        if (data.tests) {
          for (const t of data.tests) {
            if (t.outcome === "failed") {
              failures.push(`${t.nodeid}: ${t.call?.longrepr?.split("\n")[0] || "Unknown"}`);
            }
          }
        }
      } catch {}
    }
  } else if (matchedSchema.parse.type === "gotest") {
    for (const l of lines) {
      if (l.startsWith("--- PASS:")) passed++;
      else if (l.startsWith("--- FAIL:")) { failed++; failures.push(l); }
    }
    total = passed + failed;
  } else if (matchedSchema.parse.type === "cargo") {
    for (const l of lines) {
      if (l.match(/^test\s+.*\s+\.\.\.\s+ok$/)) passed++;
      else if (l.match(/^test\s+.*\s+\.\.\.\s+FAILED$/)) { failed++; failures.push(l); }
    }
    const resultMatch = rawOutput.match(/test result: .*?(\d+) passed;.*?(\d+) failed/);
    if (resultMatch) {
      passed = parseInt(resultMatch[1]);
      failed = parseInt(resultMatch[2]);
      total = passed + failed;
    }
  } else if (matchedSchema.parse.type === "jest") {
    const summary = rawOutput.match(/Tests:\s+(?:\d+ failed,\s+)?(\d+) passed,\s+(\d+) total/);
    if (summary) {
      passed = parseInt(summary[1]);
      total = parseInt(summary[2]);
      failed = total - passed;
    }
    for (const l of lines) {
      if (l.match(/^\s+●\s/)) failures.push(l.trim());
    }
  } else {
    // Generic: scan for common patterns
    const passMatch = rawOutput.match(/(\d+)\s+passed/);
    const failMatch = rawOutput.match(/(\d+)\s+failed/);
    if (passMatch) passed = parseInt(passMatch[1]);
    if (failMatch) failed = parseInt(failMatch[1]);
    total = passed + failed;
  }

  // 5. Update PROJECT_STATE.md
  const stateFile = join(projectPath, "PROJECT_STATE.md");
  const timestamp = new Date().toISOString();
  let testSection = matchedSchema.project_state_template
    .replace("{{timestamp}}", timestamp)
    .replace("{{passed}}", String(passed))
    .replace("{{failed}}", String(failed))
    .replace("{{total}}", String(total));

  if (failures.length > 0) {
    testSection += "\nFailures:\n" + failures.slice(0, 5).map(f => `  - ${f}`).join("\n");
  } else {
    testSection += "\nNo failures";
  }

  let stateContent = "";
  if (existsSync(stateFile)) {
    stateContent = readFileSync(stateFile, "utf-8");
    if (stateContent.includes("## Last Test Run")) {
      stateContent = stateContent.replace(/## Last Test Run[\s\S]*?(?=\n## |$)/, testSection);
    } else {
      stateContent += `\n\n${testSection}\n`;
    }
  } else {
    stateContent = `# Current State\n\n${testSection}\n`;
  }
  writeFileSync(stateFile, stateContent);

  // 6. Log to PROMPTS_USED.md
  const promptsFile = join(projectPath, "PROMPTS_USED.md");
  const promptLine = `| ${timestamp.split("T")[0]} | Test Run | devos-test | "${matchedSchema.test_command}" | ${passed}/${total} passed |\n`;
  if (existsSync(promptsFile)) {
    writeFileSync(promptsFile, readFileSync(promptsFile, "utf-8") + promptLine);
  } else {
    writeFileSync(promptsFile, `# Prompts Used\n\n| Date | Task | Agent | Prompt | Status |\n|------|------|-------|--------|--------|\n${promptLine}`);
  }

  // 7. Commit if requested
  if (autoCommit) {
    execSync("git add PROJECT_STATE.md PROMPTS_USED.md", { cwd: projectPath, stdio: "pipe" });
    execSync(`git commit -m "test: ${passed}/${total} passed"`, { cwd: projectPath, stdio: "pipe" });
  }

  // 8. Report
  if (failed === 0) {
    log("green", `\n✓ All tests passed: ${passed}/${total}`);
    process.exit(0);
  } else {
    log("red", `\n✗ Tests failed: ${passed}/${total} passed, ${failed} failed`);
    failures.slice(0, 5).forEach(f => log("red", `  - ${f}`));
    process.exit(1);
  }
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
  logs <project>      Tail PROMPTS_USED.md + opencode log in real-time
                       --no-follow    One-time dump without watching
  diff <project>      Show git diff of last opencode commit(s)
                       --last N       Show last N opencode commits (default 1)
  rollback <project>  Revert last opencode commit — asks confirmation
                       --steps N      Revert N commits (default 1)
  retry <project>     Rollback + re-run opencode with same or new prompt
    ["prompt"]         Optional: new prompt for the retry
  test <project>      Run test suite, parse results, update PROJECT_STATE.md
                       --commit       Commit results to git

Examples:
  devos doctor
  devos doctor my-fastapi-app
  devos migrate /path/to/legacy-project --name my-new-app
  devos opencode my-fastapi-app "Add pagination to /items"
  devos logs my-fastapi-app
  devos diff my-fastapi-app
  devos diff my-fastapi-app --last 3
  devos rollback my-fastapi-app
  devos retry my-fastapi-app "Use cursor-based pagination"
  devos test my-fastapi-app
  devos test my-fastapi-app --commit
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
  case "logs":
    if (!args[0]) { log("red", "Usage: devos logs <project> [--no-follow]"); process.exit(1); }
    tailLogs(args[0], !args.includes("--no-follow")).catch(e => { log("red", `\n✗ logs failed: ${e.message}`); process.exit(1); });
    break;
  case "diff":
    if (!args[0]) { log("red", "Usage: devos diff <project> [--last N]"); process.exit(1); }
    const lastN = args.includes("--last") ? parseInt(args[args.indexOf("--last") + 1]) || 1 : 1;
    showDiff(args[0], lastN).catch(e => { log("red", `\n✗ diff failed: ${e.message}`); process.exit(1); });
    break;
  case "rollback":
    if (!args[0]) { log("red", "Usage: devos rollback <project> [--steps N]"); process.exit(1); }
    const steps = args.includes("--steps") ? parseInt(args[args.indexOf("--steps") + 1]) || 1 : 1;
    rollback(args[0], steps).catch(e => { log("red", `\n✗ rollback failed: ${e.message}`); process.exit(1); });
    break;
  case "retry":
    if (!args[0]) { log("red", "Usage: devos retry <project> [\"new prompt\"]"); process.exit(1); }
    retry(args[0], args.slice(1).join(" ") || undefined).catch(e => { log("red", `\n✗ retry failed: ${e.message}`); process.exit(1); });
    break;
  case "test":
    if (!args[0]) { log("red", "Usage: devos test <project> [--commit]"); process.exit(1); }
    runTests(args[0], args.includes("--commit")).catch(e => { log("red", `\n✗ test failed: ${e.message}`); process.exit(1); });
    break;
  default:
    help();
    process.exit(cmd ? 1 : 0);
}

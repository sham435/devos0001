#!/usr/bin/env tsx
import { execSync } from "child_process";
import { existsSync, readFileSync, accessSync, constants } from "fs";
import { join } from "path";
import { readFile } from "fs/promises";

const DEVOS_HOME = process.env.DEVOS_HOME || process.cwd();
const BIN_DIR = join(DEVOS_HOME, ".devos.local/bin");
const OPCODE_BIN = join(BIN_DIR, "opencode");

type Check = { name: string; status: "ok" | "warn" | "fail"; msg: string; fix?: string };
const checks: Check[] = [];
let exitCode = 0;

function ok(name: string, msg: string) { checks.push({ name, status: "ok", msg }); }
function warn(name: string, msg: string, fix?: string) { checks.push({ name, status: "warn", msg, fix }); }
function fail(name: string, msg: string, fix?: string) { checks.push({ name, status: "fail", msg, fix }); exitCode = 1; }

const scope = process.argv[2]?.replace(/^--project=/, "") || "";

// 1. DEVOS_HOME
if (!DEVOS_HOME) { fail("DEVOS_HOME", "Not set", "export DEVOS_HOME=~/.devos"); }
else if (!existsSync(DEVOS_HOME)) { fail("DEVOS_HOME", `Path does not exist: ${DEVOS_HOME}`, "mkdir -p $DEVOS_HOME"); }
else { ok("DEVOS_HOME", DEVOS_HOME); }

// 2. .devos.local/ dirs
const localDir = join(DEVOS_HOME, ".devos.local");
if (!existsSync(localDir)) { warn(".devos.local/", "Missing — opencode configs won't be isolated"); }
else { ok(".devos.local/", "Found"); }

// 3. device.yaml
const deviceYaml = join(localDir, "device.yaml");
if (!existsSync(deviceYaml)) {
  warn("device.yaml", "Missing — sync won't know this device", "echo 'device: $(hostname)' > .devos.local/device.yaml");
} else {
  try {
    const d = readFileSync(deviceYaml, "utf-8").match(/device:\s*(.+)/)?.[1]?.trim() || "unknown";
    ok("device.yaml", `device: ${d}`);
  } catch { fail("device.yaml", "Corrupted"); }
}

// 4. opencode binary
if (!existsSync(OPCODE_BIN)) {
  fail("opencode binary", "Not found in .devos.local/bin/", "Run: bash scripts/bootstrap.sh or download opencode");
} else {
  try {
    accessSync(OPCODE_BIN, constants.X_OK);
    ok("opencode binary", `Found at ${OPCODE_BIN}`);
  } catch { fail("opencode binary", "Not executable", `chmod +x ${OPCODE_BIN}`); }
}

// 5. age-key.txt + secrets.age
const ageKey = join(localDir, "age-key.txt");
const secretsAge = join(DEVOS_HOME, "secrets.age");
const hasAgeKey = existsSync(ageKey);
const hasSecrets = existsSync(secretsAge);

if (!hasAgeKey) {
  warn("age-key.txt", "Missing — secrets.age cannot be decrypted", "Copy from 1Password or generate: age-keygen -o .devos.local/age-key.txt");
} else if (!hasSecrets) {
  warn("secrets.age", "No encrypted secrets file", "Create with: age -R <pubkey> secrets.txt > secrets.age");
} else {
  try {
    const decoded = execSync(`age -d -i "${ageKey}" "${secretsAge}" 2>/dev/null`, { encoding: "utf-8", timeout: 5000 });
    const hasOpenRouter = decoded.includes("OPENROUTER_API_KEY");
    const hasAnthropic = decoded.includes("ANTHROPIC_API_KEY");
    if (!hasOpenRouter && !hasAnthropic) {
      warn("secrets.age", "Decrypted but no API keys found", "Add OPENROUTER_API_KEY and/or ANTHROPIC_API_KEY");
    } else {
      ok("secrets.age", `Keys: ${[hasOpenRouter && "OpenRouter", hasAnthropic && "Anthropic"].filter(Boolean).join(" + ")}`);
    }
  } catch {
    fail("secrets.age", "Decryption failed — age-key.txt mismatch", "Verify age-key.txt matches secrets.age's recipient");
  }
}

// 6. Git remote
try {
  const remote = execSync("git remote get-url origin 2>/dev/null", { cwd: DEVOS_HOME, encoding: "utf-8", timeout: 3000 }).trim();
  if (remote.includes("devos")) {
    ok("git remote", remote);
  } else {
    warn("git remote", `Unexpected: ${remote}`, "Set: git remote set-url origin git@github.com:sham435/devos0001");
  }
} catch {
  fail("git remote", "No origin configured", "git remote add origin git@github.com:sham435/devos0001");
}

// 7. Project-specific checks
if (scope) {
  const projectPath = join(DEVOS_HOME, "projects/active", scope);
  if (!existsSync(projectPath)) {
    fail(`project: ${scope}`, `Not found at ${projectPath}`, `devos init ${scope}`);
  } else {
    ok(`project: ${scope}`, `Found at ${projectPath}`);

    for (const file of ["PROJECT_STATE.md", "ARCHITECTURE.md", "DECISIONS.md", "TASKS.md", "PROMPTS_USED.md"]) {
      const f = join(projectPath, file);
      if (!existsSync(f)) {
        warn(`${scope}/${file}`, "Missing", `Run: create-project.sh ${scope}`);
      } else { ok(`${scope}/${file}`, "Found"); }
    }

    try {
      accessSync(projectPath, constants.W_OK);
      ok(`${scope} (writable)`, "opencode can write files");
    } catch {
      fail(`${scope} (writable)`, "Read-only!", `chmod -R u+w ${projectPath}`);
    }

    // Check opencode config doesn't have hardcoded paths
    const opencodeJson = join(DEVOS_HOME, "agents/opencode/opencode.json");
    if (existsSync(opencodeJson)) {
      const content = readFileSync(opencodeJson, "utf-8");
      if (content.includes("/Users/") || content.includes("/home/")) {
        fail("opencode.json", "Contains hardcoded user paths!", "Use ${DEVOS_HOME} and ${PROJECT_PATH} vars only");
      } else { ok("opencode.json", "Portable, no hardcoded paths"); }
    } else { warn("opencode.json", "Not found — using defaults"); }
  }
}

// Print report
const icons: Record<string, string> = { ok: "✓", warn: "⚠", fail: "✗" };
const colors: Record<string, string> = { ok: "\x1b[32m", warn: "\x1b[33m", fail: "\x1b[31m", reset: "\x1b[0m", dim: "\x1b[2m" };

console.log(`\n${colors.ok}>>> DevOS Doctor${colors.reset}\n`);

for (const c of checks) {
  console.log(`${colors[c.status as keyof typeof colors]}${icons[c.status]} ${c.name.padEnd(28)} ${c.msg}${colors.reset}`);
  if (c.fix && c.status !== "ok") console.log(`  ${colors.dim}Fix:${colors.reset} ${c.fix}`);
}

const okCount = checks.filter(c => c.status === "ok").length;
const warnCount = checks.filter(c => c.status === "warn").length;
const failCount = checks.filter(c => c.status === "fail").length;

console.log(`\n${colors.dim}────────────────────────────────────────${colors.reset}`);
console.log(`${colors.ok}${okCount} passed${colors.reset}, ${colors.warn}${warnCount} warnings${colors.reset}, ${colors.fail}${failCount} failed${colors.reset}`);

if (failCount > 0) {
  console.log(`\n${colors.fail}Doctor failed. Fix issues above before running opencode.${colors.reset}`);
} else if (warnCount > 0) {
  console.log(`\n${colors.warn}Doctor passed with warnings — opencode will run but may be degraded.${colors.reset}`);
} else {
  console.log(`\n${colors.ok}Doctor passed. DevOS + opencode ready.${colors.reset}`);
}

process.exit(exitCode);

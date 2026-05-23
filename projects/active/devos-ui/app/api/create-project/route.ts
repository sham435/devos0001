import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const DEVOS_ROOT = join(process.cwd(), "..", "..");
const PROJECTS_DIR = join(DEVOS_ROOT, "projects", "active");

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name) {
    return NextResponse.json({ error: "Project name required" }, { status: 400 });
  }

  try {
    execSync(`bash ${DEVOS_ROOT}/scripts/create-project.sh ${name}`, {
      cwd: DEVOS_ROOT,
      stdio: "pipe",
    });
    return NextResponse.json({ project: name, status: "created" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

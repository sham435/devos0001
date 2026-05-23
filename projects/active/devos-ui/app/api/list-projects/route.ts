import { NextRequest, NextResponse } from "next/server";
import { readdirSync, existsSync } from "fs";
import { join } from "path";

const PROJECTS_DIR = join(process.cwd(), "..", "..", "projects", "active");

export async function GET(req: NextRequest) {
  try {
    if (!existsSync(PROJECTS_DIR)) {
      return NextResponse.json({ projects: [] });
    }
    const projects = readdirSync(PROJECTS_DIR).filter(
      (f) => !f.startsWith(".") && !f.includes("template")
    );
    return NextResponse.json({ projects });
  } catch {
    return NextResponse.json({ projects: [] });
  }
}

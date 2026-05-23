import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const PROJECTS_DIR = join(process.cwd(), "..", "..", "projects", "active");

export async function POST(req: NextRequest) {
  const { project, stack } = await req.json();
  const projectDir = join(PROJECTS_DIR, project);

  if (!existsSync(projectDir)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const arch = `# ${project} — Architecture

## Tech Stack
| Layer | Tech |
| --- | --- |
| Framework | ${stack || "FastAPI 0.115"} |
| ORM | SQLAlchemy 2.0 async |
| DB | PostgreSQL 16 + asyncpg |
| Auth | JWT HS256 + bcrypt 12 |
| Cache | Redis 7 |
| Queue | Celery 5.4 |

## Data Flow
\`\`\`
Client → HTTP → FastAPI → SQLAlchemy async → PostgreSQL
                              → Redis (cache + blacklist)
                              → Celery (background tasks)
\`\`\`

## Scaling Plan
| Load | Bottleneck | Mitigation |
| --- | --- | --- |
| 1k req/s | DB pool | Increase pool_size, add PgBouncer |
| 10k req/s | Auth decode | Add Redis cache for JWT |
| 100k req/s | Python GIL | Horizontal scale behind nginx |
`;

  writeFileSync(join(projectDir, "ARCHITECTURE.md"), arch);

  return NextResponse.json({ project, arch: "generated", stack: stack || "FastAPI + SQLAlchemy 2.0 async + PostgreSQL + Redis + Celery" });
}

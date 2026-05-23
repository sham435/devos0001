import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();

  const stackMatch = prompt.match(/(FastAPI|Django|Flask|Go|Rust|Next\.js|React)/i);
  const nameMatch = prompt.match(/project[- ]?name[:\s]+([\w-]+)/i) ||
                    prompt.match(/my-[\w-]+/i);

  const stack = stackMatch ? stackMatch[1] : "FastAPI";
  const projectName = nameMatch ? nameMatch[1] : "my-app";

  const features = [];
  if (prompt.toLowerCase().includes("auth")) features.push("auth");
  if (prompt.toLowerCase().includes("postgres") || prompt.toLowerCase().includes("database")) features.push("postgres");
  if (prompt.toLowerCase().includes("redis")) features.push("redis");
  if (prompt.toLowerCase().includes("celery")) features.push("celery");
  if (prompt.toLowerCase().includes("docker")) features.push("docker");
  if (prompt.toLowerCase().includes("test")) features.push("testing");
  if (prompt.toLowerCase().includes("ci") || prompt.toLowerCase().includes("github")) features.push("ci");

  const tasks = [
    { id: 1, title: `Core setup — pyproject.toml, config.py, main.py, Docker` },
    { id: 2, title: `DB layer — session.py, base.py, models, Alembic` },
    { id: 3, title: `Security — JWT, password hashing, dependencies` },
    { id: 4, title: `Schemas — Pydantic v2 models with validators` },
    { id: 5, title: `Services — Business logic` },
    { id: 6, title: `API routers — Endpoints` },
    { id: 7, title: `Celery — email tasks, Redis config` },
    { id: 8, title: `Tests — conftest, factories, test files` },
    { id: 9, title: `CI — GitHub Actions, ruff, mypy, pytest` },
  ];

  return NextResponse.json({ projectName, stack, features, tasks });
}

"use client";

import { useState, useEffect } from "react";

type Mode = "mega-prompt" | "devos-wizard";
type TaskStatus = "todo" | "doing" | "done";

interface DevOSProject {
  name: string;
  tasks: { id: number; title: string; status: TaskStatus }[];
  step: number;
  stack: string;
}

export default function DevOSConverter() {
  const [mode, setMode] = useState<Mode>("mega-prompt");
  const [megaPrompt, setMegaPrompt] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const [projectName, setProjectName] = useState("");
  const [devos, setDevOS] = useState<DevOSProject>({
    name: "", tasks: [], step: 1, stack: "",
  });

  useEffect(() => {
    fetch("/api/list-projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects))
      .catch(() => {});
  }, []);

  const convertMegaToDevOS = async () => {
    setIsConverting(true);
    setError("");
    try {
      const parsed = JSON.parse(
        await fetch("/api/parse-mega-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: megaPrompt }),
        }).then((r) => r.text())
      );

      await fetch("/api/create-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: parsed.projectName }),
      });

      const arch = await fetch("/api/generate-architecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: parsed.projectName, stack: parsed.stack }),
      }).then((r) => r.json());

      setDevOS({
        name: parsed.projectName,
        stack: arch.stack,
        tasks: parsed.tasks,
        step: 4,
      });
      setMode("devos-wizard");
    } catch (e: any) {
      setError(e.message);
    }
    setIsConverting(false);
  };

  const createProject = async () => {
    if (!projectName) return;
    await fetch("/api/create-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: projectName }),
    });
    setDevOS({ ...devos, name: projectName, step: 2 });
    setProjects([...projects, projectName]);
  };

  const executeTask = async (taskId: number) => {
    const task = devos.tasks.find((t) => t.id === taskId);
    if (!task) return;

    setDevOS({
      ...devos,
      tasks: devos.tasks.map((t) =>
        t.id === taskId ? { ...t, status: "doing" as TaskStatus } : t
      ),
    });

    try {
      await fetch("/api/execute-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: devos.name,
          taskId: task.id,
          title: task.title,
        }),
      });

      setDevOS((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === taskId ? { ...t, status: "done" as TaskStatus } : t
        ),
        step: 5,
      }));
    } catch (e) {
      setError(`Task ${taskId} failed`);
    }
  };

  const steps = ["Init", "Architecture", "Decisions", "Tasks", "Execute"];

  return (
    <div style={{ minHeight: "100vh", background: "#080c10", color: "#e2e8f0" }}>
      <Header mode={mode} setMode={setMode} projects={projects} />

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: 24 }}>
        {error && (
          <div style={{
            padding: "8px 16px", background: "#7f1d1d", border: "1px solid #dc2626",
            borderRadius: 8, marginBottom: 16, fontSize: 12, color: "#fca5a5",
          }}>
            {error}
          </div>
        )}

        {mode === "mega-prompt" ? (
          <MegaPromptMode
            value={megaPrompt}
            onChange={setMegaPrompt}
            onConvert={convertMegaToDevOS}
            converting={isConverting}
          />
        ) : (
          <DevOSWizard
            state={devos}
            steps={steps}
            setState={setDevOS}
            projectName={projectName}
            setProjectName={setProjectName}
            onCreateProject={createProject}
            onExecuteTask={executeTask}
          />
        )}
      </main>
    </div>
  );
}

function Header({ mode, setMode, projects }: any) {
  return (
    <header style={{
      borderBottom: "1px solid #1e2d3d", padding: "16px 24px",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        maxWidth: 1280, margin: "0 auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #0ea5e9, #6366f1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>
            ⚒
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.3em", color: "#0ea5e9", textTransform: "uppercase" }}>
              DevOS
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>
              Mega-Prompt → Converter
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <ModeBtn active={mode === "mega-prompt"} onClick={() => setMode("mega-prompt")}>
            Paste Mega-Prompt
          </ModeBtn>
          <ModeBtn active={mode === "devos-wizard"} onClick={() => setMode("devos-wizard")}>
            DevOS Wizard
          </ModeBtn>
        </div>
      </div>
    </header>
  );
}

function ModeBtn({ children, active, onClick }: any) {
  return (
    <button onClick={onClick} style={{
      padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
      border: active ? "1px solid #0ea5e9" : "1px solid #1e2d3d",
      background: active ? "rgba(14,165,233,0.15)" : "transparent",
      color: active ? "#0ea5e9" : "#64748b",
      cursor: "pointer",
    }}>
      {children}
    </button>
  );
}

function MegaPromptMode({ value, onChange, onConvert, converting }: any) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      <div>
        <SectionHeader icon="📝" title="Paste 48-File Mega-Prompt" />
        <textarea
          value={value}
          onChange={(e: any) => onChange(e.target.value)}
          placeholder="Paste your full mega-prompt here..."
          rows={28}
          style={{
            width: "100%", background: "#0d1117", border: "1px solid #1e2d3d",
            borderRadius: 8, padding: 16, fontSize: 12, color: "#cbd5e1",
            fontFamily: "inherit", resize: "vertical",
          }}
        />
        <button
          onClick={onConvert}
          disabled={!value || converting}
          style={{
            width: "100%", marginTop: 16, padding: 12, borderRadius: 8,
            border: "1px solid #0ea5e9", background: "rgba(14,165,233,0.12)",
            color: "#0ea5e9", fontWeight: 600, fontSize: 14, cursor: "pointer",
            opacity: !value || converting ? 0.5 : 1,
          }}
        >
          {converting ? "⟳ Converting to DevOS..." : "⚡ Convert to DevOS Workflow"}
        </button>
      </div>
      <div>
        <SectionHeader icon="🔄" title="What DevOS Extracts" />
        {[
          { icon: "🏗", title: "ARCHITECTURE.md", desc: "Stack, data flow, 3-layer pattern, scaling plan" },
          { icon: "⚖", title: "DECISIONS.md", desc: "Why FastAPI over Django, UUID vs int, bcrypt rounds" },
          { icon: "✓", title: "TASKS.md", desc: "Breaks 48 files into 9 reviewable tasks" },
          { icon: "📍", title: "PROJECT_STATE.md", desc: "Current task, next action, blockers, start file" },
          { icon: "🧠", title: "PROMPTS_USED.md", desc: "Logs every prompt for future reuse" },
          { icon: "💾", title: "memory/lessons/", desc: "Patterns saved: fastapi-auth, async-sqlalchemy" },
        ].map((item) => (
          <div key={item.title} style={{
            padding: 12, marginBottom: 8, background: "#0d1117",
            border: "1px solid #1e2d3d", borderRadius: 8, display: "flex", gap: 8,
          }}>
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#f1f5f9", marginBottom: 4 }}>
                {item.title}
              </div>
              <div style={{ fontSize: 10, color: "#64748b" }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DevOSWizard({ state, steps, setState, projectName, setProjectName, onCreateProject, onExecuteTask }: any) {
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 24, alignItems: "center" }}>
        {steps.map((label: string, i: number) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", display: "flex",
              alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700,
              background: state.step > i + 1 ? "#22c55e" : state.step === i + 1 ? "#0ea5e9" : "#1e2d3d",
              color: state.step > i + 1 ? "#fff" : state.step === i + 1 ? "#fff" : "#475569",
            }}>
              {state.step > i + 1 ? "✓" : i + 1}
            </div>
            <span style={{
              fontSize: 12, color: state.step === i + 1 ? "#0ea5e9" : "#64748b",
            }}>
              {label}
            </span>
            {i < steps.length - 1 && (
              <div style={{ width: 32, height: 1, background: "#1e2d3d" }} />
            )}
          </div>
        ))}
      </div>

      {state.step === 1 && (
        <div>
          <SectionHeader icon="🚀" title="Initialize Project" />
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={projectName}
              onChange={(e: any) => setProjectName(e.target.value)}
              placeholder="my-fastapi-app"
              style={{
                flex: 1, padding: "10px 16px", borderRadius: 8, fontSize: 14,
                background: "#0d1117", border: "1px solid #1e2d3d",
                color: "#cbd5e1", fontFamily: "inherit",
              }}
            />
            <button onClick={onCreateProject} disabled={!projectName} style={{
              padding: "10px 24px", borderRadius: 8, border: "1px solid #0ea5e9",
              background: "rgba(14,165,233,0.12)", color: "#0ea5e9",
              fontWeight: 600, cursor: "pointer",
            }}>
              Create
            </button>
          </div>
        </div>
      )}

      {state.step === 2 && (
        <div>
          <SectionHeader icon="🏗" title="ARCHITECTURE.md — Generated" />
          <div style={{
            padding: 16, background: "#0d1117", border: "1px solid #1e2d3d",
            borderRadius: 8, fontSize: 12, color: "#94a3b8", whiteSpace: "pre-wrap",
            marginBottom: 16,
          }}>
            Stack: {state.stack || "FastAPI + SQLAlchemy 2.0 async + PostgreSQL + Redis + Celery"}
          </div>
          <button onClick={() => setState({ ...state, step: 3 })}
            style={{
              padding: "10px 20px", borderRadius: 8, border: "1px solid #0ea5e9",
              background: "rgba(14,165,233,0.12)", color: "#0ea5e9", cursor: "pointer",
            }}>
            Review Decisions →
          </button>
        </div>
      )}

      {state.step === 3 && (
        <div>
          <SectionHeader icon="⚖" title="DECISIONS.md — 7 Tradeoffs Logged" />
          <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              "Why FastAPI over Django REST? → Async, auto-docs, Pydantic",
              "Why UUID primary keys? → Distributed ID gen, no collision risk",
              "Why Redis db 1 for Celery? → Separate cache from broker",
              "Why bcrypt 12 rounds? → OWASP 2024 recommendation, ~250ms on M1",
              "Why refresh token rotation? → Single-use, leak-safe",
              "Why JSON logging? → Datadog/Splunk parsable",
              "Why 3-layer pattern? → Test services without HTTP",
            ].map((d, i) => (
              <div key={i} style={{
                padding: 12, background: "#0d1117", border: "1px solid #1e2d3d",
                borderRadius: 8, fontSize: 12, color: "#cbd5e1",
              }}>
                {d}
              </div>
            ))}
          </div>
          <button onClick={() => setState({ ...state, step: 4 })}
            style={{
              padding: "10px 20px", borderRadius: 8, border: "1px solid #0ea5e9",
              background: "rgba(14,165,233,0.12)", color: "#0ea5e9", cursor: "pointer",
            }}>
            Break Into Tasks →
          </button>
        </div>
      )}

      {state.step === 4 && (
        <div>
          <SectionHeader icon="✓" title="TASKS.md — 9 Reviewable Chunks" />
          <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 8 }}>
            {(state.tasks.length > 0 ? state.tasks : [
              { id: 1, title: "Core setup — pyproject.toml, config.py, main.py, Docker" },
              { id: 2, title: "DB layer — session.py, base.py, User/Item models, Alembic" },
              { id: 3, title: "Security — JWT, password hashing, dependencies" },
              { id: 4, title: "Schemas — Pydantic v2 models with validators" },
              { id: 5, title: "Services — Auth/user/item business logic" },
              { id: 6, title: "API routers — /auth, /users, /items endpoints" },
              { id: 7, title: "Celery — email tasks, Redis config" },
              { id: 8, title: "Tests — conftest, factories, test_auth/users/items" },
              { id: 9, title: "CI — GitHub Actions, ruff, mypy, pytest" },
            ]).map((task: any) => (
              <div key={task.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: 12, background: "#0d1117", border: "1px solid #1e2d3d", borderRadius: 8,
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 4, border: "2px solid #334155",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: task.status === "done" ? "#22c55e" : "transparent",
                  borderColor: task.status === "done" ? "#22c55e" : task.status === "doing" ? "#0ea5e9" : "#334155",
                }}>
                  {task.status === "done" && <span style={{ fontSize: 10 }}>✓</span>}
                </div>
                <div style={{ flex: 1, fontSize: 12, color: "#f1f5f9" }}>
                  Task {task.id}: {task.title}
                </div>
                <span style={{
                  padding: "2px 8px", borderRadius: 4, fontSize: 10, border: "1px solid",
                  color: task.status === "done" ? "#22c55e" : task.status === "doing" ? "#0ea5e9" : "#475569",
                  borderColor: task.status === "done" ? "#22c55e40" : task.status === "doing" ? "#0ea5e940" : "#47556940",
                  background: task.status === "done" ? "#22c55e15" : task.status === "doing" ? "#0ea5e915" : "transparent",
                }}>
                  {task.status || "todo"}
                </span>
              </div>
            ))}
          </div>
          <button onClick={() => setState({ ...state, step: 5 })}
            style={{
              padding: "10px 20px", borderRadius: 8, border: "1px solid #0ea5e9",
              background: "rgba(14,165,233,0.12)", color: "#0ea5e9", cursor: "pointer",
            }}>
            Start Execution →
          </button>
        </div>
      )}

      {state.step === 5 && (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
          <div>
            <SectionHeader icon="⚡" title="Execute Tasks" />
            {(state.tasks.length > 0 ? state.tasks : []).map((task: any) => {
              const isCurrent = task.status === "doing";
              const isDone = task.status === "done";
              const isTodo = task.status === "todo" || !task.status;
              return (
                <div key={task.id} style={{
                  padding: 16, marginBottom: 8, borderRadius: 8,
                  border: isCurrent ? "1px solid #0ea5e9" : isDone ? "1px solid #22c55e" : "1px solid #1e2d3d",
                  background: isCurrent ? "rgba(14,165,233,0.08)" : isDone ? "rgba(34,197,94,0.08)" : "#0d1117",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>
                        TASK {task.id}
                      </div>
                      <div style={{ fontSize: 13, color: "#f1f5f9" }}>
                        {task.title}
                      </div>
                    </div>
                    {isTodo && (
                      <button onClick={() => onExecuteTask(task.id)}
                        style={{
                          padding: "6px 14px", borderRadius: 6, border: "none",
                          background: "#0ea5e9", color: "#080c10", fontSize: 11,
                          fontWeight: 700, cursor: "pointer",
                        }}>
                        Run →
                      </button>
                    )}
                    {isCurrent && (
                      <span style={{ color: "#0ea5e9", fontSize: 12 }}>⟳ Running...</span>
                    )}
                    {isDone && (
                      <span style={{ color: "#22c55e", fontSize: 12 }}>✓ Done</span>
                    )}
                  </div>
                </div>
              );
            })}
            {state.tasks.every((t: any) => t.status === "done") && (
              <div style={{
                padding: 24, textAlign: "center", border: "1px solid #22c55e",
                borderRadius: 8, background: "rgba(34,197,94,0.08)",
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                <div style={{ color: "#22c55e", fontSize: 14, fontWeight: 600 }}>
                  All tasks complete. Project is production-ready.
                </div>
              </div>
            )}
          </div>

          <div>
            <SectionHeader icon="📍" title="PROJECT_STATE.md" />
            <div style={{
              padding: 16, background: "#0d1117", border: "1px solid #1e2d3d",
              borderRadius: 8, fontSize: 11, lineHeight: 2,
            }}>
              <div>
                <div style={{ color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 10 }}>
                  Completed
                </div>
                <div style={{ color: "#22c55e" }}>
                  {state.tasks.filter((t: any) => t.status === "done").length}/{state.tasks.length} tasks
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 10 }}>
                  Working On
                </div>
                <div style={{ color: "#0ea5e9" }}>
                  {state.tasks.find((t: any) => t.status === "doing")?.title || "None"}
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 10 }}>
                  Next Task
                </div>
                <div style={{ color: "#f1f5f9" }}>
                  {state.tasks.find((t: any) => t.status === "todo")?.title || "Deploy"}
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 10 }}>
                  Start File
                </div>
                <div style={{ color: "#818cf8", fontFamily: "monospace" }}>
                  app/main.py
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ icon, title }: any) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <span>{icon}</span>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.05em" }}>
        {title}
      </h2>
      <div style={{ flex: 1, height: 1, background: "#1e2d3d" }} />
    </div>
  );
}

"use client";

import { useState, useRef, useCallback } from "react";

type MigrationState = "idle" | "dragging" | "uploading" | "analyzing" | "complete" | "error";
type AnalysisResult = {
  stack: string;
  framework: string;
  language: string;
  database: string | null;
  features: string[];
  fileCount: number;
  hasTests: boolean;
  hasDocker: boolean;
  hasCI: boolean;
  tasksFound: number;
  snippetsExtracted: number;
  lessonsLearned: number;
};

export default function MigrationStage() {
  const [state, setState] = useState<MigrationState>("idle");
  const [projectName, setProjectName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{
    projectName: string;
    projectPath: string;
    analysis: AnalysisResult;
  } | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    setState("uploading");
    setProgress("Uploading project archive...");
    setError("");

    const name = projectName || file.name.replace(/\.(zip|tar\.gz|tgz)$/i, "");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("projectName", name);

    try {
      setProgress("Analyzing stack, extracting architecture...");
      setState("analyzing");

      const res = await fetch("/api/devos/migrate", { method: "POST", body: formData });
      const data = await res.json();

      if (data.success) {
        setResult(data);
        setState("complete");
        setProgress(`Migration complete. ${data.analysis.tasksFound} tasks, ${data.analysis.snippetsExtracted} snippets, ${data.analysis.lessonsLearned} lessons.`);
      } else {
        setError(data.error || "Migration failed");
        setState("error");
      }
    } catch (e: any) {
      setError(e.message);
      setState("error");
    }
  }, [projectName]);

  const uploadRepo = useCallback(async () => {
    if (!repoUrl) return;
    setState("uploading");
    setProgress("Cloning repository...");
    setError("");

    const name = projectName || repoUrl.split("/").pop()?.replace(".git", "") || "migrated-project";
    const formData = new FormData();
    formData.append("repoUrl", repoUrl);
    formData.append("projectName", name);

    try {
      setProgress("Analyzing stack, extracting architecture...");
      setState("analyzing");

      const res = await fetch("/api/devos/migrate", { method: "POST", body: formData });
      const data = await res.json();

      if (data.success) {
        setResult(data);
        setState("complete");
      } else {
        setError(data.error || "Migration failed");
        setState("error");
      }
    } catch (e: any) {
      setError(e.message);
      setState("error");
    }
  }, [repoUrl, projectName]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setState("dragging");
  };

  const handleDragLeave = () => {
    if (state === "dragging") setState("idle");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".zip") || f.name.endsWith(".tar.gz") || f.name.endsWith(".tgz"))) {
      uploadFile(f);
    } else {
      setError("Unsupported format. Drop .zip or .tar.gz files.");
      setState("error");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadFile(f);
  };

  const openInDevOS = () => {
    window.location.href = `/devos?project=${result?.projectName}`;
  };

  return (
    <div>
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${state === "dragging" ? "#f97316" : state === "error" ? "#ef4444" : "#1e2d3d"}`,
          borderRadius: 12, padding: 48, textAlign: "center", cursor: "pointer",
          background: state === "dragging" ? "rgba(249,115,22,0.05)" : "transparent",
          transition: "all 0.2s",
        }}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".zip,.tar.gz,.tgz"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />
        <div style={{ fontSize: 48, marginBottom: 12 }}>
          {state === "uploading" || state === "analyzing" ? "⟳" : state === "error" ? "⚠" : "📦"}
        </div>
        <div style={{ fontSize: 14, color: "#f1f5f9", marginBottom: 4 }}>
          {state === "dragging" ? "Drop to analyze" : "Drop .zip, .tar.gz, or paste a repo URL"}
        </div>
        <div style={{ fontSize: 11, color: "#64748b" }}>
          or <span style={{ color: "#0ea5e9", cursor: "pointer" }}>browse files</span>
        </div>
      </div>

      {/* Project Name & Repo URL inputs */}
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Project name (optional, auto-detected)"
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 8, fontSize: 13,
            background: "#0d1117", border: "1px solid #1e2d3d", color: "#cbd5e1",
            fontFamily: "inherit",
          }}
        />
        <input
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/user/repo"
          style={{
            flex: 2, padding: "10px 14px", borderRadius: 8, fontSize: 13,
            background: "#0d1117", border: "1px solid #1e2d3d", color: "#cbd5e1",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={uploadRepo}
          disabled={!repoUrl || state === "uploading" || state === "analyzing"}
          style={{
            padding: "10px 20px", borderRadius: 8, border: "none",
            background: "#0ea5e9", color: "#080c10", fontWeight: 700, fontSize: 12,
            cursor: "pointer", opacity: !repoUrl ? 0.5 : 1,
          }}
        >
          Clone
        </button>
      </div>

      {/* Progress */}
      {(state === "uploading" || state === "analyzing") && (
        <div style={{
          marginTop: 16, padding: 16, background: "#0d1117",
          border: "1px solid #1e2d3d", borderRadius: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#f97316", animation: "pulse 1s infinite",
            }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#f1f5f9" }}>
              {state === "uploading" ? "Uploading..." : "Analyzing..."}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{progress}</div>
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div style={{
          marginTop: 16, padding: 12, background: "#7f1d1d",
          border: "1px solid #dc2626", borderRadius: 8, fontSize: 12, color: "#fca5a5",
        }}>
          {error}
          <button
            onClick={() => { setState("idle"); setError(""); }}
            style={{
              marginLeft: 12, padding: "2px 10px", borderRadius: 4, border: "1px solid #dc2626",
              background: "transparent", color: "#fca5a5", fontSize: 10, cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Results */}
      {state === "complete" && result && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            padding: 16, background: "#0d1117",
            border: "1px solid #22c55e", borderRadius: 8,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ color: "#22c55e", fontSize: 18 }}>✓</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#22c55e" }}>
                Migration Complete
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <ResultRow label="Project" value={result.projectName} />
              <ResultRow label="Stack" value={`${result.analysis.framework} (${result.analysis.language})`} />
              <ResultRow label="Database" value={result.analysis.database || "None detected"} />
              <ResultRow label="Files Analyzed" value={String(result.analysis.fileCount)} />
              <ResultRow label="Tasks Migrated" value={String(result.analysis.tasksFound)} />
              <ResultRow label="Snippets Extracted" value={String(result.analysis.snippetsExtracted)} />
              <ResultRow label="Lessons Logged" value={String(result.analysis.lessonsLearned)} />
              <ResultRow
                label="Tests"
                value={result.analysis.hasTests ? "✓ Present" : "⚠ Missing"}
                color={result.analysis.hasTests ? "#22c55e" : "#f97316"}
              />
            </div>

            <button
              onClick={openInDevOS}
              style={{
                width: "100%", padding: 12, borderRadius: 8, border: "none",
                background: "#0ea5e9", color: "#080c10", fontWeight: 700, fontSize: 13,
                cursor: "pointer",
              }}
            >
              Open in DevOS →
            </button>
          </div>

          {/* DevOS Constraints Panel */}
          <div style={{
            marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
          }}>
            {[
              { icon: "🏗", label: "ARCHITECTURE.md", ok: true },
              { icon: "⚖", label: "DECISIONS.md", ok: true },
              { icon: "✓", label: "TASKS.md", ok: true },
              { icon: "📍", label: "PROJECT_STATE.md", ok: true },
              { icon: "🧠", label: "PROMPTS_USED.md", ok: true },
              { icon: "💾", label: "snippets/", ok: (result.analysis.snippetsExtracted || 0) > 0 },
              { icon: "📚", label: "memory/lessons/", ok: (result.analysis.lessonsLearned || 0) > 0 },
              { icon: "🔒", label: "No hardcoded paths", ok: true },
            ].map((item) => (
              <div key={item.label} style={{
                padding: 12, background: "#0d1117",
                border: `1px solid ${item.ok ? "#22c55e40" : "#f9731640"}`,
                borderRadius: 8, textAlign: "center",
              }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{item.icon}</div>
                <div style={{ fontSize: 10, color: item.ok ? "#22c55e" : "#f97316" }}>
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

function ResultRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
      <span style={{ color: "#475569" }}>{label}</span>
      <span style={{ color: color || "#f1f5f9", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

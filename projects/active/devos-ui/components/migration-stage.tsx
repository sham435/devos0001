"use client";

import { useState } from "react";
import { useDropzone } from "react-dropzone";

export default function MigrationStage() {
  const [file, setFile] = useState<File | null>(null);
  const [projectName, setProjectName] = useState("");
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/zip": [".zip"], "application/x-tar": [".tar", ".tar.gz"] },
    maxFiles: 1,
    onDrop: (files) => {
      setFile(files[0]);
      setError("");
      setResult(null);
    },
  });

  const runMigration = async () => {
    setMigrating(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    if (file) formData.append("file", file);
    formData.append("projectName", projectName || file?.name.replace(/\.(zip|tar\.gz)$/i, "") || "migrated-project");

    try {
      const res = await fetch("/api/devos/migrate", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) setResult(data);
      else setError(data.error || "Migration failed");
    } catch (e: any) {
      setError(e.message);
    }
    setMigrating(false);
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>
          Migrate Legacy Project to DevOS
        </div>
        <div style={{ fontSize: 12, color: "#64748b" }}>
          Drop a zip or point to a local path. DevOS will analyze code, detect stack, and generate
          ARCHITECTURE.md, DECISIONS.md, TASKS.md.
        </div>
      </div>

      {error && (
        <div style={{
          padding: 12, marginBottom: 16, background: "#7f1d1d",
          border: "1px solid #dc2626", borderRadius: 8, fontSize: 12, color: "#fca5a5",
        }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Left: Form */}
        <div>
          <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
            Project Name
          </div>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="my-legacy-app"
            style={{
              width: "100%", padding: "10px 12px", marginBottom: 16,
              background: "#0d1117", border: "1px solid #1e2d3d", borderRadius: 6,
              fontSize: 12, color: "#cbd5e1", fontFamily: "inherit",
            }}
          />

          <div
            {...getRootProps()}
            style={{
              border: `2px dashed ${isDragActive ? "#0ea5e9" : "#1e2d3d"}`,
              borderRadius: 8, padding: 32, textAlign: "center", cursor: "pointer",
              background: isDragActive ? "rgba(14,165,233,0.05)" : "transparent",
            }}
          >
            <input {...getInputProps()} />
            {file ? (
              <div style={{ fontSize: 12, color: "#22c55e" }}>
                ✓ {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {isDragActive ? "Drop zip here..." : "Drag legacy project zip here, or click to select"}
              </div>
            )}
          </div>

          <button
            onClick={runMigration}
            disabled={(!file && !projectName) || migrating}
            style={{
              width: "100%", marginTop: 16, padding: 12, borderRadius: 8, border: "none",
              background: "#0ea5e9", color: "#080c10", fontWeight: 700, fontSize: 13,
              cursor: "pointer", opacity: (!file && !projectName) || migrating ? 0.5 : 1,
            }}
          >
            {migrating ? "⟳ Analyzing & Generating DevOS Artifacts..." : "⚡ Migrate to DevOS"}
          </button>
        </div>

        {/* Right: Output */}
        <div style={{
          background: "#0d1117", border: "1px solid #1e2d3d", borderRadius: 8, padding: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 12 }}>
            Migration Output
          </div>

          {result?.success ? (
            <div style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ color: "#22c55e", fontWeight: 600 }}>✓ Migration complete</div>
              <div style={{ color: "#64748b" }}>
                Stack detected: <span style={{ color: "#f1f5f9" }}>{result.analysis.stack}/{result.analysis.framework}</span>
              </div>
              <div style={{ color: "#64748b" }}>
                Files: <span style={{ color: "#f1f5f9" }}>{result.analysis.fileCount}</span>
              </div>
              <div style={{ color: "#64748b" }}>
                Features: <span style={{ color: "#f1f5f9" }}>{result.analysis.features?.join(", ") || "none"}</span>
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ color: "#94a3b8", marginBottom: 4, fontWeight: 600 }}>Generated:</div>
                {[
                  "ARCHITECTURE.md", "DECISIONS.md", "TASKS.md",
                  "PROJECT_STATE.md", "PROMPTS_USED.md",
                  `snippets/${result.analysis.stack || "unknown"}/`,
                  `memory/lessons/`,
                ].map((a: string) => (
                  <div key={a} style={{ color: "#22c55e", paddingLeft: 8 }}>✓ {a}</div>
                ))}
              </div>
              <div style={{
                marginTop: 12, padding: 12, background: "rgba(14,165,233,0.1)",
                border: "1px solid rgba(14,165,233,0.3)", borderRadius: 6,
              }}>
                <div style={{ color: "#0ea5e9", fontSize: 10, fontWeight: 600, marginBottom: 4 }}>Next steps:</div>
                <div style={{ color: "#cbd5e1", fontSize: 10, fontFamily: "monospace", lineHeight: 1.8 }}>
                  cd {result.projectPath}<br />
                  devos task {result.projectName} 1
                </div>
              </div>
            </div>
          ) : migrating ? (
            <div style={{ fontSize: 11, color: "#64748b" }}>
              <div style={{ marginBottom: 8 }}>⟳ Analyzing project structure...</div>
              <div style={{ fontSize: 10, color: "#475569" }}>
                Detecting stack, extracting architecture, generating artifacts
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#475569" }}>
              Migration log will appear here...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

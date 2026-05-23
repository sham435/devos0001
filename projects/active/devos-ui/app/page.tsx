"use client";

import { useState } from "react";
import DevOSConverter from "@/components/devos-converter";
import MigrationStage from "@/components/migration-stage";

type Tab = "converter" | "migration";

export default function Home() {
  const [tab, setTab] = useState<Tab>("converter");

  return (
    <div style={{ minHeight: "100vh", background: "#080c10", color: "#e2e8f0" }}>
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
                AI Engineering OS
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <TabBtn active={tab === "converter"} onClick={() => setTab("converter")}>
              ⚡ Mega-Prompt Converter
            </TabBtn>
            <TabBtn active={tab === "migration"} onClick={() => setTab("migration")}>
              📦 Migration Stage
            </TabBtn>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: 24 }}>
        {tab === "converter" ? (
          <DevOSConverter />
        ) : (
          <div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#f97316", marginBottom: 4 }}>
                📦 Legacy Project Migration
              </div>
              <div style={{ fontSize: 11, color: "#64748b" }}>
                Drop any existing project (.zip / .tar.gz) or paste a GitHub URL. DevOS reverse-engineers ARCHITECTURE.md,
                DECISIONS.md, TASKS.md, extracts reusable snippets to snippets/, and logs anti-patterns to memory/lessons/.
              </div>
            </div>
            <MigrationStage />
          </div>
        )}
      </main>
    </div>
  );
}

function TabBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
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

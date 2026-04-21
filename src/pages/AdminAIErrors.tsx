import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminData } from "@/hooks/useAdminQuery";
import { C, mono, sans, AdminSkeleton, EmptyState, StatusPill, Card } from "@/components/admin-dashboard/shared";
import { Loader2 } from "lucide-react";

const ADMIN_USER_ID = import.meta.env.VITE_ADMIN_USER_ID || "1d5b21fe-f74c-429b-8d9d-938a4f295013";

interface ErrorRow {
  id: string;
  created_at: string;
  user_id: string | null;
  display_name: string;
  destination: string | null;
  step: string | null;
  error_message: string | null;
  error_raw: Record<string, unknown> | null;
  duration_ms: number | null;
}

function stepColor(step: string | null): string {
  if (!step) return C.muted;
  if (step === "timeout") return C.red;
  if (step.startsWith("rank") || step === "parseIntent") return C.amber;
  return C.blue;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toISOString().split("T")[0];
}

function ErrorDetail({ row }: { row: ErrorRow }) {
  return (
    <div style={{
      padding: 16,
      background: C.bg,
      borderTop: `1px solid ${C.border}`,
      fontFamily: mono,
      fontSize: 12,
      color: C.text,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    }}>
      <div style={{ color: C.muted, marginBottom: 8 }}>ERROR MESSAGE</div>
      <div style={{ marginBottom: 16 }}>{row.error_message || "(none)"}</div>
      <div style={{ color: C.muted, marginBottom: 8 }}>RAW</div>
      <pre style={{ margin: 0, fontSize: 11, lineHeight: 1.5 }}>
        {JSON.stringify(row.error_raw, null, 2)}
      </pre>
    </div>
  );
}

export default function AdminAIErrors() {
  const { user, loading } = useAuth();
  const { data, isLoading, refetch } = useAdminData("ai_generation_errors_feed", {}, { refetchInterval: 30_000 });
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user || user.id !== ADMIN_USER_ID) return <div />;

  const rows = (data || []) as ErrorRow[];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, padding: "32px 24px", fontFamily: sans }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: mono, fontSize: 20, color: C.tealLight, margin: 0, letterSpacing: 1 }}>
              AI TRIP BUILDER ERRORS
            </h1>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, marginTop: 4 }}>
              Last 50 failed generations — auto-refresh 30s
            </div>
          </div>
          <button
            onClick={() => refetch()}
            style={{
              fontFamily: mono,
              fontSize: 12,
              background: "transparent",
              color: C.tealLight,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>

        <Card style={{ padding: 0, overflow: "hidden" }}>
          {isLoading ? (
            <div style={{ padding: 20 }}><AdminSkeleton rows={5} /></div>
          ) : rows.length === 0 ? (
            <EmptyState message="No AI trip generation errors recorded. 🎉" />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: mono, fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.elevated, color: C.muted, textAlign: "left" }}>
                  <th style={{ padding: "10px 12px", fontWeight: 500, letterSpacing: 1, fontSize: 10, textTransform: "uppercase" }}>When</th>
                  <th style={{ padding: "10px 12px", fontWeight: 500, letterSpacing: 1, fontSize: 10, textTransform: "uppercase" }}>User</th>
                  <th style={{ padding: "10px 12px", fontWeight: 500, letterSpacing: 1, fontSize: 10, textTransform: "uppercase" }}>Destination</th>
                  <th style={{ padding: "10px 12px", fontWeight: 500, letterSpacing: 1, fontSize: 10, textTransform: "uppercase" }}>Step</th>
                  <th style={{ padding: "10px 12px", fontWeight: 500, letterSpacing: 1, fontSize: 10, textTransform: "uppercase" }}>Duration</th>
                  <th style={{ padding: "10px 12px", fontWeight: 500, letterSpacing: 1, fontSize: 10, textTransform: "uppercase" }}>Message</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const open = expanded === row.id;
                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        onClick={() => setExpanded(open ? null : row.id)}
                        style={{
                          borderTop: `1px solid ${C.border}`,
                          cursor: "pointer",
                          background: open ? C.elevated : "transparent",
                        }}
                      >
                        <td style={{ padding: "10px 12px", color: C.muted, whiteSpace: "nowrap" }}>{formatWhen(row.created_at)}</td>
                        <td style={{ padding: "10px 12px", color: C.text, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.display_name}
                        </td>
                        <td style={{ padding: "10px 12px", color: C.text, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.destination || <span style={{ color: C.muted }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <StatusPill label={row.step || "unknown"} color={stepColor(row.step)} />
                        </td>
                        <td style={{ padding: "10px 12px", color: C.muted, whiteSpace: "nowrap" }}>{formatDuration(row.duration_ms)}</td>
                        <td style={{ padding: "10px 12px", color: C.text, maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.error_message || <span style={{ color: C.muted }}>(no message)</span>}
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={6} style={{ padding: 0 }}>
                            <ErrorDetail row={row} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

import React, { useState } from "react";
import { useAdminData, useAdminMutation } from "@/hooks/useAdminQuery";
import { SectionHeader, Card, AdminSkeleton, EmptyState, StatusPill, C, mono, sans } from "./shared";

const FILTERS = ["all", "unresolved", "bugs", "suggestions", "critical", "high"] as const;

export function FeedbackInbox() {
  const [filter, setFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: items, isLoading } = useAdminData("feedback_list", { filter });

  const selected = selectedId ? (items || []).find((f: any) => f.id === selectedId) : null;

  return (
    <div style={{ display: "flex", gap: 0, height: "calc(100vh - 40px)" }}>
      {/* Left: inbox list */}
      <div style={{ width: 420, borderRight: `1px solid ${C.border}`, overflowY: "auto", paddingRight: 16 }}>
        <h1 style={{ fontFamily: mono, fontSize: 18, color: C.text, fontWeight: 600, marginBottom: 16 }}>Feedback Inbox</h1>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "4px 10px", borderRadius: 4, border: `1px solid ${C.border}`,
              background: filter === f ? C.elevated : "transparent",
              color: filter === f ? C.tealLight : C.muted,
              fontFamily: mono, fontSize: 11, cursor: "pointer", textTransform: "capitalize",
            }}>{f}</button>
          ))}
        </div>

        {isLoading ? <AdminSkeleton rows={10} /> : !items?.length ? <EmptyState message="No feedback matches filter" /> : (
          items.map((f: any) => {
            const sevColor = f.ai_severity === "critical" ? C.red : f.ai_severity === "high" ? C.amber : C.muted;
            return (
              <div key={f.id} onClick={() => setSelectedId(f.id)} style={{
                padding: "10px 12px", borderBottom: `1px solid ${C.border}`, cursor: "pointer",
                background: selectedId === f.id ? C.elevated : "transparent",
              }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                  {f.ai_severity && <StatusPill label={f.ai_severity} color={sevColor} />}
                  {f.ai_category && <StatusPill label={f.ai_category} color={C.blue} />}
                  <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginLeft: "auto" }}>
                    {f.status === "done" ? "●" : "○"}
                  </span>
                </div>
                <div style={{ fontFamily: sans, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {(f.body || "").substring(0, 60) || `Rating: ${f.rating}`}
                </div>
                <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginTop: 2 }}>
                  {f.route || "—"} · {timeAgo(f.created_at)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Right: detail */}
      <div style={{ flex: 1, padding: "0 20px", overflowY: "auto" }}>
        {selected ? <FeedbackDetail item={selected} /> : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.muted, fontFamily: sans }}>
            Select an item
          </div>
        )}
      </div>
    </div>
  );
}

function FeedbackDetail({ item }: { item: any }) {
  const updateMutation = useAdminMutation("feedback_update");
  const [notes, setNotes] = useState(item.admin_notes || "");
  const [status, setStatus] = useState(item.status || "new");
  const [saved, setSaved] = useState(false);

  React.useEffect(() => {
    setNotes(item.admin_notes || "");
    setStatus(item.status || "new");
  }, [item.id]);

  const saveNotes = () => {
    updateMutation.mutate({ feedback_id: item.id, admin_notes: notes });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateStatus = (s: string) => {
    setStatus(s);
    updateMutation.mutate({ feedback_id: item.id, status: s });
  };

  const copyPrompt = () => {
    const text = `Fix this ${item.ai_category || "issue"} on ${item.route || "unknown route"}: ${item.ai_summary || ""}. Suggested fix: ${item.ai_fix || "N/A"}. User reported: ${item.body || ""}`;
    navigator.clipboard.writeText(text);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontFamily: sans, fontSize: 14, color: C.text, fontWeight: 600 }}>Feedback Detail</div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={status} onChange={(e) => updateStatus(e.target.value)}
            style={{ padding: "4px 8px", background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: mono, fontSize: 11 }}>
            <option value="new">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
          <button onClick={copyPrompt} style={{ padding: "4px 10px", background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 4, color: C.tealLight, fontFamily: mono, fontSize: 11, cursor: "pointer" }}>
            Copy as Lovable prompt
          </button>
        </div>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: sans, fontSize: 13, color: C.text, whiteSpace: "pre-wrap", marginBottom: 12 }}>{item.body || "No message"}</div>
        <div style={{ display: "flex", gap: 16, fontFamily: mono, fontSize: 11, color: C.muted }}>
          <span>User: <span style={{ color: C.text }}>{item.display_name}</span></span>
          <span>Route: {item.route || "—"}</span>
          <span>v{item.app_version || "—"}</span>
          <span>{item.created_at?.slice(0, 16)}</span>
        </div>
      </Card>

      {item.screenshot_url && (
        <Card style={{ marginBottom: 16 }}>
          <img src={item.screenshot_url} alt="Screenshot" style={{ maxWidth: "100%", borderRadius: 4 }} />
        </Card>
      )}

      <SectionHeader>AI Analysis</SectionHeader>
      <Card style={{ marginBottom: 16 }}>
        {[
          { label: "Summary", value: item.ai_summary },
          { label: "Severity", value: item.ai_severity },
          { label: "Category", value: item.ai_category },
          { label: "Suggested Fix", value: item.ai_fix },
        ].map((r) => (
          <div key={r.label} style={{ marginBottom: 8 }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", marginBottom: 2 }}>{r.label}</div>
            <div style={{ fontFamily: sans, fontSize: 13, color: C.text }}>{r.value || "—"}</div>
          </div>
        ))}
        {item.hint_rating && (
          <div style={{ fontFamily: mono, fontSize: 12, color: item.hint_rating === "helpful" ? C.green : C.red }}>
            {item.hint_rating === "helpful" ? "👍" : "👎"} {item.hint_rating}
          </div>
        )}
      </Card>

      <SectionHeader>Admin Notes</SectionHeader>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes}
        style={{ width: "100%", minHeight: 80, padding: 8, background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: sans, fontSize: 12, resize: "vertical" }} />
      {saved && <div style={{ fontFamily: mono, fontSize: 11, color: C.green, marginTop: 4 }}>Saved ✓</div>}
    </div>
  );
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

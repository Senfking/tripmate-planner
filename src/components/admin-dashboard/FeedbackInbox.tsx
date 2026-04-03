import React, { useState, useContext } from "react";
import { useAdminData, useAdminMutation } from "@/hooks/useAdminQuery";
import { SectionHeader, Card, AdminSkeleton, EmptyState, StatusPill, C, mono, sans, AdminNavContext } from "./shared";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "unresolved", label: "Unresolved" },
  { key: "new", label: "Open" },
  { key: "reviewing", label: "Reviewing" },
  { key: "done", label: "Done" },
  { key: "dismissed", label: "Dismissed" },
] as const;

const CATEGORY_FILTERS = [
  { key: "all", label: "All" },
  { key: "ui", label: "UI" },
  { key: "logic", label: "Logic" },
  { key: "performance", label: "Perf" },
  { key: "content", label: "Content" },
  { key: "feature", label: "Feature" },
  { key: "other", label: "Other" },
] as const;

const SEVERITY_FILTERS = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
] as const;

function FilterRow({ label, options, value, onChange }: {
  label: string;
  options: readonly { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, minWidth: 56 }}>{label}</span>
      {options.map((o) => (
        <button key={o.key} onClick={() => onChange(o.key)} style={{
          padding: "3px 8px", borderRadius: 4, border: `1px solid ${C.border}`,
          background: value === o.key ? C.elevated : "transparent",
          color: value === o.key ? C.tealLight : C.muted,
          fontFamily: mono, fontSize: 10, cursor: "pointer",
        }}>{o.label}</button>
      ))}
    </div>
  );
}

export function FeedbackInbox() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: items, isLoading } = useAdminData("feedback_list", {
    status_filter: statusFilter,
    category_filter: categoryFilter,
    severity_filter: severityFilter,
  });

  const selected = selectedId ? (items || []).find((f: any) => f.id === selectedId) : null;

  return (
    <div style={{ display: "flex", gap: 0, height: "calc(100vh - 40px)" }}>
      {/* Left: inbox list */}
      <div style={{ width: 540, minWidth: 420, borderRight: `1px solid ${C.border}`, overflowY: "auto", paddingRight: 16 }}>
        <h1 style={{ fontFamily: mono, fontSize: 18, color: C.text, fontWeight: 600, marginBottom: 16 }}>Feedback Inbox</h1>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          <FilterRow label="Status" options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
          <FilterRow label="Type" options={CATEGORY_FILTERS} value={categoryFilter} onChange={setCategoryFilter} />
          <FilterRow label="Severity" options={SEVERITY_FILTERS} value={severityFilter} onChange={setSeverityFilter} />
        </div>

        {isLoading ? <AdminSkeleton rows={10} /> : !items?.length ? <EmptyState message="No feedback matches filter" /> : (
          items.map((f: any) => {
            const sevColor = f.ai_severity === "critical" ? C.red : f.ai_severity === "high" ? C.amber : C.muted;
            const statusLabel = f.status === "done" ? "done" : f.status === "reviewing" ? "reviewing" : f.status === "dismissed" ? "dismissed" : "open";
            const statusColor = f.status === "done" ? C.green : f.status === "reviewing" ? C.amber : f.status === "dismissed" ? C.muted : C.blue;
            return (
              <div key={f.id} onClick={() => setSelectedId(f.id)} style={{
                padding: "10px 12px", borderBottom: `1px solid ${C.border}`, cursor: "pointer",
                background: selectedId === f.id ? C.elevated : "transparent",
              }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                  {f.ai_severity && <StatusPill label={f.ai_severity} color={sevColor} />}
                  {f.ai_category && <StatusPill label={f.ai_category} color={C.blue} />}
                  <span style={{ marginLeft: "auto" }}>
                    <StatusPill label={statusLabel} color={statusColor} />
                  </span>
                </div>
                <div style={{ fontFamily: sans, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {(f.ai_summary || f.body || "").substring(0, 80) || `Rating: ${f.rating}`}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 10, color: C.muted, marginTop: 2 }}>
                  <span>{f.route || "—"}</span>
                  <span>{f.display_name || "Unknown"} · {timeAgo(f.created_at)}</span>
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
  const { navigateTo } = useContext(AdminNavContext);
  const [notes, setNotes] = useState(item.admin_notes || "");
  const [status, setStatus] = useState(item.status || "new");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  React.useEffect(() => {
    setNotes(item.admin_notes || "");
    setStatus(item.status || "new");
  }, [item.id, item.status, item.admin_notes]);

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
    // Use ai_prompt if available (generated by Claude), otherwise build from AI fields
    let text: string;
    if (item.ai_prompt) {
      text = item.ai_prompt;
    } else {
      const category = item.ai_category || "issue";
      const route = item.route || "unknown route";
      const summary = item.ai_summary || "No summary available";
      const fix = item.ai_fix || "No fix suggested";
      const severity = item.ai_severity || "unknown";
      text = [
        `Fix this ${severity}-severity ${category} issue on route \`${route}\`:`,
        ``,
        `**Problem:** ${summary}`,
        ``,
        `**Suggested approach:** ${fix}`,
      ].join("\n");
    }
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUserClick = () => {
    if (item.user_id) {
      navigateTo("all_users", { selectedUserId: item.user_id });
    }
  };

  const statusColor = status === "done" ? C.green : status === "reviewing" ? C.amber : status === "dismissed" ? C.muted : C.blue;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontFamily: sans, fontSize: 14, color: C.text, fontWeight: 600 }}>Feedback Detail</div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={status} onChange={(e) => updateStatus(e.target.value)}
            style={{ padding: "4px 8px", background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 4, color: statusColor, fontFamily: mono, fontSize: 11 }}>
            <option value="new">Open</option>
            <option value="reviewing">Reviewing</option>
            <option value="done">Done</option>
            <option value="dismissed">Dismissed</option>
          </select>
          <button onClick={copyPrompt} style={{ padding: "4px 10px", background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 4, color: copied ? C.green : C.tealLight, fontFamily: mono, fontSize: 11, cursor: "pointer" }}>
            {copied ? "Copied!" : "Copy as Lovable prompt"}
          </button>
        </div>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: sans, fontSize: 13, color: C.text, whiteSpace: "pre-wrap", marginBottom: 12 }}>{item.body || "No message"}</div>
        <div style={{ display: "flex", gap: 16, fontFamily: mono, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
          <span>User: <span
            onClick={handleUserClick}
            style={{ color: C.tealLight, cursor: item.user_id ? "pointer" : "default", textDecoration: item.user_id ? "underline" : "none" }}
          >{item.display_name}</span></span>
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

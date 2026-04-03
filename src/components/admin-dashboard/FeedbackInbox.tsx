import React, { useState, useContext } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
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

function FilterDropdown({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: readonly { key: string; label: string }[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
      <label style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase" }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: C.elevated, color: C.text, border: `1px solid ${C.border}`,
          borderRadius: 4, padding: "5px 8px", fontFamily: mono, fontSize: 12,
          cursor: "pointer", outline: "none", appearance: "auto", width: "100%",
        }}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function FilterBar({ statusFilter, setStatusFilter, categoryFilter, setCategoryFilter, severityFilter, setSeverityFilter }: {
  statusFilter: string; setStatusFilter: (v: string) => void;
  categoryFilter: string; setCategoryFilter: (v: string) => void;
  severityFilter: string; setSeverityFilter: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, padding: "6px 0", flexWrap: "wrap" }}>
      <FilterDropdown label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTERS} />
      <FilterDropdown label="Severity" value={severityFilter} onChange={setSeverityFilter} options={SEVERITY_FILTERS} />
      <FilterDropdown label="Category" value={categoryFilter} onChange={setCategoryFilter} options={CATEGORY_FILTERS} />
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
  }, { refetchInterval: 15000 });

  const selected = selectedId ? (items || []).find((f: any) => f.id === selectedId) : null;

  return (
    <PanelGroup direction="horizontal" style={{ height: "calc(100vh - 40px)" }}>
      <Panel defaultSize={42} minSize={28}>
        <div style={{ height: "100%", overflowY: "auto", paddingRight: 12 }}>
          <h1 style={{ fontFamily: mono, fontSize: 18, color: C.text, fontWeight: 600, marginBottom: 8 }}>Feedback Inbox</h1>

          <FilterBar
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
            severityFilter={severityFilter} setSeverityFilter={setSeverityFilter}
          />

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
      </Panel>

      <PanelResizeHandle style={{ width: 6, background: "transparent", cursor: "col-resize", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 2, width: 1, background: C.border }} />
      </PanelResizeHandle>

      <Panel defaultSize={58} minSize={30}>
        <div style={{ height: "100%", padding: "0 20px", overflowY: "auto" }}>
          {selected ? <FeedbackDetail item={selected} /> : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.muted, fontFamily: sans }}>
              Select an item
            </div>
          )}
        </div>
      </Panel>
    </PanelGroup>
  );
}

function FeedbackDetail({ item }: { item: any }) {
  const updateMutation = useAdminMutation("feedback_update");
  const deleteMutation = useAdminMutation("feedback_delete");
  const { navigateTo } = useContext(AdminNavContext);
  const [notes, setNotes] = useState(item.admin_notes || "");
  const [status, setStatus] = useState(item.status || "new");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  React.useEffect(() => {
    setNotes(item.admin_notes || "");
    setStatus(item.status || "new");
    setConfirmDelete(false);
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

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteMutation.mutate({ feedback_id: item.id });
  };

  const copyPrompt = () => {
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
          <button onClick={handleDelete} onBlur={() => setConfirmDelete(false)} style={{
            padding: "4px 10px", background: confirmDelete ? C.red : C.elevated,
            border: `1px solid ${confirmDelete ? C.red : C.border}`, borderRadius: 4,
            color: confirmDelete ? "#fff" : C.red, fontFamily: mono, fontSize: 11, cursor: "pointer",
          }}>
            {deleteMutation.isPending ? "Deleting…" : confirmDelete ? "Confirm delete" : "Delete"}
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

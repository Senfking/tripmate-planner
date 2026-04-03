import React, { useState } from "react";
import { C, mono, sans, StatusPill, SectionHeader, EmptyState, AdminSkeleton, Card } from "./shared";
import { useAdminData, useAdminMutation } from "@/hooks/useAdminQuery";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "critical", label: "Critical" },
  { key: "feedback", label: "Feedback" },
  { key: "users", label: "Users" },
  { key: "errors", label: "Errors" },
] as const;

type Filter = typeof FILTERS[number]["key"];

const SEVERITY_COLOR: Record<string, string> = {
  info: C.blue,
  warning: C.amber,
  critical: C.red,
};

const TYPE_LABELS: Record<string, string> = {
  new_feedback: "Feedback",
  new_user: "New User",
  error_spike: "Error Spike",
  daily_digest: "Digest",
};

function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationsModule() {
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isLoading, refetch } = useAdminData("notifications_list", {}, { refetchInterval: 60000 });
  const markRead = useAdminMutation("notifications_mark_read");
  const markAllRead = useAdminMutation("notifications_mark_all_read");

  const notifications = (data || []) as any[];

  const filtered = notifications.filter((n: any) => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.read;
    if (filter === "critical") return n.severity === "critical";
    if (filter === "feedback") return n.type === "new_feedback";
    if (filter === "users") return n.type === "new_user";
    if (filter === "errors") return n.type === "error_spike";
    return true;
  });

  const handleExpand = async (n: any) => {
    if (expanded === n.id) {
      setExpanded(null);
      return;
    }
    setExpanded(n.id);
    if (!n.read) {
      await markRead.mutateAsync({ id: n.id });
      refetch();
    }
  };

  const handleMarkAllRead = async () => {
    await markAllRead.mutateAsync({});
    refetch();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: C.tealLight }}>Notifications</h1>
        <button
          onClick={handleMarkAllRead}
          style={{
            fontFamily: mono, fontSize: 12, padding: "6px 14px",
            background: C.elevated, color: C.muted, border: `1px solid ${C.border}`,
            borderRadius: 6, cursor: "pointer",
          }}
        >
          Mark all as read
        </button>
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              fontFamily: mono, fontSize: 11, padding: "5px 12px",
              background: filter === f.key ? `${C.teal}25` : "transparent",
              color: filter === f.key ? C.tealLight : C.muted,
              border: `1px solid ${filter === f.key ? C.teal : C.border}`,
              borderRadius: 4, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.5,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? <AdminSkeleton rows={5} /> : filtered.length === 0 ? (
        <EmptyState message="No notifications" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {filtered.map((n: any) => {
            const isExpanded = expanded === n.id;
            return (
              <div key={n.id}>
                <button
                  onClick={() => handleExpand(n)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%",
                    textAlign: "left", padding: "12px 16px", border: "none", cursor: "pointer",
                    background: isExpanded ? C.elevated : "transparent",
                    borderBottom: `1px solid ${C.border}`,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = C.surface; }}
                  onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}
                >
                  {/* Unread dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: n.read ? "transparent" : C.tealLight,
                  }} />

                  {/* Severity pill */}
                  <StatusPill label={n.severity} color={SEVERITY_COLOR[n.severity] || C.blue} />

                  {/* Type pill */}
                  <StatusPill label={TYPE_LABELS[n.type] || n.type} color={C.muted} />

                  {/* Title + message */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: sans, fontSize: 13, color: C.text, fontWeight: n.read ? 400 : 600 }}>
                      {n.title}
                    </div>
                    <div style={{ fontFamily: sans, fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {(n.body || "").substring(0, 100)}
                    </div>
                  </div>

                  {/* Time */}
                  <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, flexShrink: 0 }}>
                    {timeAgo(n.created_at)}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: "16px 16px 16px 36px", background: C.elevated, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily: sans, fontSize: 13, color: C.text, marginBottom: 12, lineHeight: 1.5 }}>
                      {n.body}
                    </div>
                    {n.properties && Object.keys(n.properties).length > 0 && (
                      <div>
                        <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                          Metadata
                        </div>
                        <pre style={{
                          fontFamily: mono, fontSize: 11, color: C.muted, background: C.surface,
                          border: `1px solid ${C.border}`, borderRadius: 4, padding: 12,
                          overflow: "auto", maxHeight: 200, whiteSpace: "pre-wrap",
                        }}>
                          {JSON.stringify(n.properties, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

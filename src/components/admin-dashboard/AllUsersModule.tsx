import React, { useState, useContext, useEffect, useMemo } from "react";
import { useAdminData, useAdminMutation } from "@/hooks/useAdminQuery";
import { SectionHeader, Card, AdminSkeleton, EmptyState, StatusPill, C, mono, sans, AdminNavContext } from "./shared";
import { ChevronUp, ChevronDown } from "lucide-react";

type SortKey = "display_name" | "created_at" | "last_active_at" | "source" | "trips" | "ai_calls" | "subscription_tier";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "display_name", label: "User" },
  { key: "created_at", label: "Joined" },
  { key: "last_active_at", label: "Last Active" },
  { key: "source", label: "Source" },
  { key: "trips", label: "Trips" },
  { key: "ai_calls", label: "AI" },
  { key: "subscription_tier", label: "Tier" },
];

function sortUsers(users: any[], key: SortKey, dir: SortDir) {
  return [...users].sort((a, b) => {
    let av: any, bv: any;
    switch (key) {
      case "display_name":
        av = (a.display_name || "").toLowerCase();
        bv = (b.display_name || "").toLowerCase();
        break;
      case "created_at":
        av = a.created_at || "";
        bv = b.created_at || "";
        break;
      case "last_active_at":
        av = a.last_active_at || "";
        bv = b.last_active_at || "";
        break;
      case "source":
        av = a.source || "organic";
        bv = b.source || "organic";
        break;
      case "trips":
        av = a.trips || 0;
        bv = b.trips || 0;
        break;
      case "ai_calls":
        av = a.ai_calls || 0;
        bv = b.ai_calls || 0;
        break;
      case "subscription_tier":
        av = a.subscription_tier || "";
        bv = b.subscription_tier || "";
        break;
    }
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

export function AllUsersModule() {
  const { navParams } = useContext(AdminNavContext);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedUser, setSelectedUser] = useState<string | null>(navParams.selectedUserId || null);

  useEffect(() => {
    if (navParams.selectedUserId) setSelectedUser(navParams.selectedUserId);
  }, [navParams.selectedUserId]);

  const { data, isLoading } = useAdminData("all_users", { search, sort: "created_at" });
  const rawUsers = data?.users || [];

  const users = useMemo(() => sortUsers(rawUsers, sortKey, sortDir), [rawUsers, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "display_name" || key === "source" || key === "subscription_tier" ? "asc" : "desc");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: window.innerWidth < 768 ? "column" : "row", gap: 0, height: window.innerWidth < 768 ? "auto" : "calc(100vh - 40px)" }}>
      <div style={{ flex: 1, overflow: "auto", paddingRight: selectedUser && window.innerWidth >= 768 ? 16 : 0 }}>
        <h1 style={{ fontFamily: mono, fontSize: 18, color: C.text, fontWeight: 600, marginBottom: 16 }}>All Users</h1>

        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name..."
            style={{ flex: 1, padding: "8px 12px", background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: sans, fontSize: 13, outline: "none" }}
          />
        </div>

        {isLoading ? <AdminSkeleton rows={10} /> : !users.length ? <EmptyState /> : (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", minWidth: 700, fontFamily: sans, fontSize: 13, borderCollapse: "collapse" }}>
            <thead><tr>
              {COLUMNS.map(col => (
                <th key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    textAlign: "left", padding: 8, cursor: "pointer", userSelect: "none",
                    color: sortKey === col.key ? C.tealLight : C.muted,
                    fontFamily: mono, fontSize: 10, textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                    {col.label}
                    {sortKey === col.key ? (
                      sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                    ) : (
                      <span style={{ width: 12, display: "inline-block" }} />
                    )}
                  </span>
                </th>
              ))}
              <th style={{ textAlign: "left", padding: 8, color: C.muted, fontFamily: mono, fontSize: 10, textTransform: "uppercase" }}>Stripe</th>
            </tr></thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id} onClick={() => setSelectedUser(u.id)}
                  style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer", background: selectedUser === u.id ? C.elevated : "transparent" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = C.elevated}
                  onMouseLeave={(e) => e.currentTarget.style.background = selectedUser === u.id ? C.elevated : "transparent"}>
                  <td style={{ padding: 8, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
                    {u.avatar_url ? <img src={u.avatar_url} style={{ width: 24, height: 24, borderRadius: 12 }} /> : <div style={{ width: 24, height: 24, borderRadius: 12, background: C.teal }} />}
                    {u.display_name || "—"}
                  </td>
                  <td style={{ padding: 8, color: C.muted, fontFamily: mono, fontSize: 11 }}>{u.created_at?.slice(0, 10)}</td>
                  <td style={{ padding: 8, color: u.last_active_at ? C.text : C.muted, fontFamily: mono, fontSize: 11 }}>{u.last_active_at ? timeAgo(u.last_active_at) : "Never"}</td>
                  <td style={{ padding: 8 }}>{u.referred_by ? <StatusPill label="Referred" color={C.green} /> : <StatusPill label="Organic" color={C.muted} />}</td>
                  <td style={{ padding: 8, color: C.text, fontFamily: mono }}>{u.trips}</td>
                  <td style={{ padding: 8, color: C.text, fontFamily: mono }}>{u.ai_calls}</td>
                  <td style={{ padding: 8 }}><StatusPill label={u.subscription_tier} color={u.subscription_tier === "pro" ? C.tealLight : C.muted} /></td>
                  <td style={{ padding: 8, color: C.muted, fontFamily: mono, fontSize: 11, cursor: "copy" }}
                    onClick={(e) => { e.stopPropagation(); if (u.stripe_customer_id) navigator.clipboard.writeText(u.stripe_customer_id); }}>
                    {u.stripe_customer_id?.slice(0, 14) || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {selectedUser && <UserDetailDrawer userId={selectedUser} onClose={() => setSelectedUser(null)} />}
    </div>
  );
}

function UserDetailDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data, isLoading } = useAdminData("user_detail", { user_id: userId });
  const notesMutation = useAdminMutation("profile_update_notes");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"profile" | "activity" | "trips" | "engagement">("profile");

  React.useEffect(() => {
    if (data?.profile?.admin_notes) setNotes(data.profile.admin_notes);
    else setNotes("");
  }, [data]);

  // Reset tab when switching users
  React.useEffect(() => { setTab("profile"); }, [userId]);

  if (isLoading) return (
    <div style={{ width: window.innerWidth < 768 ? "100%" : 400, borderLeft: window.innerWidth >= 768 ? `1px solid ${C.border}` : "none", padding: 20, background: C.surface, overflowY: "auto" }}>
      <AdminSkeleton rows={8} />
    </div>
  );

  if (!data?.profile) return null;
  const p = data.profile;

  const handleSaveNotes = () => {
    notesMutation.mutate({ user_id: userId, admin_notes: notes });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs: { key: typeof tab; label: string }[] = [
    { key: "profile", label: "Profile" },
    { key: "activity", label: "Activity" },
    { key: "trips", label: "Trips" },
    { key: "engagement", label: "Engage" },
  ];

  return (
    <div style={{ width: window.innerWidth < 768 ? "100%" : 400, borderLeft: window.innerWidth >= 768 ? `1px solid ${C.border}` : "none", borderTop: window.innerWidth < 768 ? `1px solid ${C.border}` : "none", padding: 20, background: C.surface, overflowY: "auto", maxHeight: window.innerWidth < 768 ? "60vh" : "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontFamily: mono, fontSize: 14, color: C.text, fontWeight: 600 }}>User Detail</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18 }}>×</button>
      </div>

      {/* User header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        {p.avatar_url ? <img src={p.avatar_url} style={{ width: 40, height: 40, borderRadius: 20 }} /> : <div style={{ width: 40, height: 40, borderRadius: 20, background: C.teal }} />}
        <div>
          <div style={{ fontFamily: sans, fontSize: 15, color: C.text, fontWeight: 600 }}>{p.display_name || "—"}</div>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, cursor: "copy" }} onClick={() => navigator.clipboard.writeText(p.id)}>{p.id.slice(0, 20)}…</div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: `1px solid ${C.border}` }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: "6px 12px", fontFamily: mono, fontSize: 10, textTransform: "uppercase",
              background: "none", border: "none", cursor: "pointer",
              color: tab === t.key ? C.tealLight : C.muted,
              borderBottom: tab === t.key ? `2px solid ${C.tealLight}` : "2px solid transparent",
              fontWeight: tab === t.key ? 600 : 400,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "profile" && <ProfileTab data={data} />}
      {tab === "activity" && <ActivityTab data={data} />}
      {tab === "trips" && <TripsTab data={data} />}
      {tab === "engagement" && <EngagementTab data={data} />}

      {/* Admin Notes — always visible */}
      <SectionHeader>Admin Notes</SectionHeader>
      <textarea
        value={notes} onChange={(e) => setNotes(e.target.value)}
        onBlur={handleSaveNotes}
        style={{ width: "100%", minHeight: 80, padding: 8, background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: sans, fontSize: 12, resize: "vertical" }}
      />
      {saved && <div style={{ fontFamily: mono, fontSize: 11, color: C.green, marginTop: 4 }}>Saved ✓</div>}
    </div>
  );
}

function ProfileTab({ data }: { data: any }) {
  const p = data.profile;
  return (
    <>
      <Detail label="Email" value={data.email || "—"} />
      <Detail label="Auth provider" value={data.auth_provider || "email"} />
      <Detail label="Joined" value={p.created_at ? new Date(p.created_at).toLocaleString() : "—"} />
      <Detail label="Last active" value={data.last_active_at ? new Date(data.last_active_at).toLocaleString() : "Never"} />
      <Detail label="Last sign-in" value={data.last_sign_in_at ? new Date(data.last_sign_in_at).toLocaleString() : "—"} />
      <Detail label="Currency" value={p.default_currency || "EUR"} />

      <SectionHeader>Subscription</SectionHeader>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <StatusPill label={p.subscription_tier} color={p.subscription_tier === "pro" ? C.tealLight : C.muted} />
        <StatusPill label={p.subscription_status} color={p.subscription_status === "active" ? C.green : C.amber} />
      </div>
      {p.subscription_expires_at && <Detail label="Expires" value={p.subscription_expires_at.slice(0, 10)} />}

      <SectionHeader>Referral</SectionHeader>
      <Detail label="Code" value={p.referral_code || "—"} />
      <Detail label="Referred by" value={data.referrer_name || "—"} />
      <Detail label="Referred count" value={data.referral_count} />
    </>
  );
}

function ActivityTab({ data }: { data: any }) {
  const activity = data.activity || {};
  return (
    <>
      <SectionHeader>Usage Stats</SectionHeader>
      <Detail label="Expenses created" value={activity.expenses_created ?? "—"} />
      <Detail label="Total spent" value={activity.total_amount_spent != null ? `€${Number(activity.total_amount_spent).toFixed(2)}` : "—"} />
      <Detail label="Polls created" value={activity.polls_created ?? "—"} />
      <Detail label="Poll votes cast" value={activity.poll_votes ?? "—"} />
      <Detail label="Itinerary items added" value={activity.itinerary_items ?? "—"} />
      <Detail label="Feedback submitted" value={data.feedback_count ?? "—"} />

      <SectionHeader>AI Usage</SectionHeader>
      {Object.entries(data.ai_usage || {}).length === 0 ? (
        <div style={{ fontFamily: sans, fontSize: 12, color: C.muted, padding: "4px 0" }}>No AI usage</div>
      ) : (
        Object.entries(data.ai_usage || {}).map(([k, v]) => (
          <Detail key={k} label={k.replace("ai_", "")} value={String(v)} />
        ))
      )}
    </>
  );
}

function TripsTab({ data }: { data: any }) {
  const trips = data.trips || [];
  const now = new Date();

  const getTripStatus = (t: any) => {
    if (!t.trip_start_date && !t.trip_end_date) return "—";
    const end = t.trip_end_date ? new Date(t.trip_end_date) : null;
    const start = t.trip_start_date ? new Date(t.trip_start_date) : null;
    if (end && end < now) return "past";
    if (start && start <= now && (!end || end >= now)) return "active";
    if (start && start > now) return "upcoming";
    return "—";
  };

  const statusColor = (s: string) => {
    if (s === "active") return C.green;
    if (s === "upcoming") return C.tealLight;
    if (s === "past") return C.muted;
    return C.muted;
  };

  return (
    <>
      <SectionHeader>Trips ({trips.length})</SectionHeader>
      {trips.length === 0 && <div style={{ fontFamily: sans, fontSize: 12, color: C.muted }}>No trips</div>}
      {trips.map((t: any) => {
        const status = getTripStatus(t);
        return (
          <div key={t.trip_id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: sans, fontSize: 13, color: C.text, fontWeight: 500 }}>{t.trip_name}</span>
              <div style={{ display: "flex", gap: 4 }}>
                {status !== "—" && <StatusPill label={status} color={statusColor(status)} />}
                <StatusPill label={t.role} color={t.role === "owner" ? C.tealLight : C.muted} />
              </div>
            </div>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginTop: 2 }}>
              Joined {t.joined_at?.slice(0, 10)} · {t.member_count} members
            </div>
          </div>
        );
      })}
    </>
  );
}

function EngagementTab({ data }: { data: any }) {
  const engagement = data.engagement || {};
  const notifPrefs = data.profile?.notification_preferences || {};

  return (
    <>
      <SectionHeader>Push Notifications</SectionHeader>
      <Detail label="Push subscribed" value={engagement.push_subscribed ? "Yes ✓" : "No"} />
      <Detail label="Devices" value={engagement.push_device_count ?? 0} />

      <SectionHeader>Notification Preferences</SectionHeader>
      {Object.entries(notifPrefs).map(([k, v]) => (
        <Detail key={k} label={k.replace(/_/g, " ")} value={v ? "✓" : "✗"} />
      ))}

      <SectionHeader>Activity</SectionHeader>
      <Detail label="Days since last active" value={engagement.days_since_last_active != null ? `${engagement.days_since_last_active}d` : "—"} />
      <Detail label="Days since signup" value={engagement.days_since_signup != null ? `${engagement.days_since_signup}d` : "—"} />
      <Detail label="Last trip created" value={data.last_trip_created_at ? new Date(data.last_trip_created_at).toLocaleString() : "—"} />
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontFamily: sans, fontSize: 12 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: C.text, fontFamily: mono }}>{value}</span>
    </div>
  );
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toISOString().slice(0, 10);
}

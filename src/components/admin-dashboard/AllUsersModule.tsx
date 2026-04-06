import React, { useState, useContext, useEffect } from "react";
import { useAdminData, useAdminMutation } from "@/hooks/useAdminQuery";
import { SectionHeader, Card, AdminSkeleton, EmptyState, StatusPill, C, mono, sans, AdminNavContext } from "./shared";

export function AllUsersModule() {
  const { navParams } = useContext(AdminNavContext);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("created_at");
  const [selectedUser, setSelectedUser] = useState<string | null>(navParams.selectedUserId || null);

  // Auto-select user when navigated from another module
  useEffect(() => {
    if (navParams.selectedUserId) {
      setSelectedUser(navParams.selectedUserId);
    }
  }, [navParams.selectedUserId]);

  const { data, isLoading } = useAdminData("all_users", { search, sort });
  const users = data?.users || [];

  return (
    <div style={{ display: "flex", gap: 0, height: "calc(100vh - 40px)" }}>
      <div style={{ flex: 1, overflow: "auto", paddingRight: selectedUser ? 16 : 0 }}>
        <h1 style={{ fontFamily: mono, fontSize: 18, color: C.text, fontWeight: 600, marginBottom: 16 }}>All Users</h1>

        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name..."
            style={{ flex: 1, padding: "8px 12px", background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: sans, fontSize: 13, outline: "none" }}
          />
          <select value={sort} onChange={(e) => setSort(e.target.value)}
            style={{ padding: "8px 12px", background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: mono, fontSize: 12 }}>
            <option value="created_at">Joined</option>
            <option value="last_login">Last Login</option>
            <option value="trips">Trips</option>
            <option value="ai">AI Usage</option>
          </select>
        </div>

        {isLoading ? <AdminSkeleton rows={10} /> : !users.length ? <EmptyState /> : (
          <table style={{ width: "100%", fontFamily: sans, fontSize: 13, borderCollapse: "collapse" }}>
            <thead><tr style={{ color: C.muted, fontFamily: mono, fontSize: 10, textTransform: "uppercase" as const }}>
              {["User", "Joined", "Last Active", "Source", "Trips", "AI", "Tier", "Stripe"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: 8 }}>{h}</th>
              ))}
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

  React.useEffect(() => {
    if (data?.profile?.admin_notes) setNotes(data.profile.admin_notes);
  }, [data]);

  if (isLoading) return (
    <div style={{ width: 360, borderLeft: `1px solid ${C.border}`, padding: 20, background: C.surface, overflowY: "auto" }}>
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

  return (
    <div style={{ width: 360, borderLeft: `1px solid ${C.border}`, padding: 20, background: C.surface, overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontFamily: mono, fontSize: 14, color: C.text, fontWeight: 600 }}>User Detail</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18 }}>×</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        {p.avatar_url ? <img src={p.avatar_url} style={{ width: 40, height: 40, borderRadius: 20 }} /> : <div style={{ width: 40, height: 40, borderRadius: 20, background: C.teal }} />}
        <div>
          <div style={{ fontFamily: sans, fontSize: 15, color: C.text, fontWeight: 600 }}>{p.display_name || "—"}</div>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, cursor: "copy" }} onClick={() => navigator.clipboard.writeText(p.id)}>{p.id.slice(0, 20)}…</div>
        </div>
      </div>

      <Detail label="Email" value={data.email || "—"} />
      <Detail label="Joined" value={p.created_at?.slice(0, 10)} />
      <Detail label="Last active" value={data.last_active_at ? timeAgo(data.last_active_at) : "Never"} />
      <Detail label="Last trip created" value={data.last_trip_created_at ? timeAgo(data.last_trip_created_at) : "—"} />
      <Detail label="Currency" value={p.default_currency} />

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

      <SectionHeader>Trips ({data.trips?.length || 0})</SectionHeader>
      {(data.trips || []).map((t: any) => (
        <div key={t.trip_id} style={{ padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontFamily: sans, fontSize: 12 }}>
          <span style={{ color: C.text }}>{t.trip_name}</span>
          <StatusPill label={t.role} color={t.role === "owner" ? C.tealLight : C.muted} />
          <span style={{ color: C.muted, marginLeft: 8, fontFamily: mono, fontSize: 10 }}>{t.member_count} members</span>
        </div>
      ))}

      <SectionHeader>AI Usage</SectionHeader>
      {Object.entries(data.ai_usage || {}).map(([k, v]) => (
        <Detail key={k} label={k.replace("ai_", "")} value={String(v)} />
      ))}

      <Detail label="Feedback submissions" value={data.feedback_count} />

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

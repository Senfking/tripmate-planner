import React from "react";
import { useAdminData } from "@/hooks/useAdminQuery";
import { SectionHeader, Card, AdminSkeleton, EmptyState, C, mono, sans } from "./shared";

export function RetentionModule() {
  const { data: activation, isLoading: al } = useAdminData("retention_activation");
  const { data: cohorts, isLoading: cl } = useAdminData("retention_cohorts");
  const { data: dormant, isLoading: dl } = useAdminData("retention_dormant");

  return (
    <div>
      <h1 style={{ fontFamily: mono, fontSize: 18, color: C.text, fontWeight: 600, marginBottom: 24 }}>Retention</h1>

      <SectionHeader>Activation Rates</SectionHeader>
      {al ? <AdminSkeleton /> : !activation ? <EmptyState /> : (
        <Card>
          {[
            { label: "Created/joined a trip", pct: activation.trip_rate, count: activation.users_with_trips, total: activation.total_users },
            { label: "Logged an expense", pct: activation.expense_rate, count: activation.users_with_expenses, total: activation.total_users },
            { label: "Added itinerary item", pct: activation.itinerary_rate, count: activation.users_with_itinerary, total: activation.total_users },
          ].map((r) => (
            <div key={r.label} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontFamily: sans, fontSize: 13, color: C.text }}>{r.label}</span>
                <span style={{ fontFamily: mono, fontSize: 12, color: C.tealLight }}>{r.pct}% ({r.count}/{r.total})</span>
              </div>
              <div style={{ background: C.elevated, borderRadius: 4, height: 8 }}>
                <div style={{ background: C.tealLight, borderRadius: 4, height: 8, width: `${Math.min(100, parseFloat(r.pct))}%`, transition: "width 0.5s" }} />
              </div>
            </div>
          ))}
        </Card>
      )}

      <SectionHeader>Weekly Cohorts</SectionHeader>
      {cl ? <AdminSkeleton rows={8} /> : !cohorts?.length ? <EmptyState /> : (
        <Card>
          <table style={{ width: "100%", fontFamily: sans, fontSize: 13, borderCollapse: "collapse" }}>
            <thead><tr style={{ color: C.muted, fontFamily: mono, fontSize: 10, textTransform: "uppercase" as const }}>
              <th style={{ textAlign: "left", padding: 8 }}>Week</th>
              <th style={{ textAlign: "right", padding: 8 }}>Size</th>
              <th style={{ textAlign: "right", padding: 8 }}>Activated (7d)</th>
              <th style={{ textAlign: "right", padding: 8 }}>Rate</th>
            </tr></thead>
            <tbody>
              {cohorts.map((c: any) => (
                <tr key={c.week} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: 8, color: C.text, fontFamily: mono }}>{c.week}</td>
                  <td style={{ padding: 8, color: C.text, textAlign: "right", fontFamily: mono }}>{c.size}</td>
                  <td style={{ padding: 8, color: C.tealLight, textAlign: "right", fontFamily: mono }}>{c.activated}</td>
                  <td style={{ padding: 8, color: parseFloat(c.rate) > 50 ? C.green : C.amber, textAlign: "right", fontFamily: mono }}>{c.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <SectionHeader>Dormant Users</SectionHeader>
      {dl ? <AdminSkeleton rows={5} /> : !dormant ? <EmptyState /> : (
        <Card>
          <div style={{ fontFamily: mono, fontSize: 22, color: C.red, marginBottom: 12 }}>{dormant.count} dormant users</div>
          <div style={{ fontFamily: sans, fontSize: 12, color: C.muted, marginBottom: 12 }}>Signed up 14+ days ago, never joined a trip</div>
          {dormant.users?.slice(0, 20).map((u: any) => (
            <div key={u.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${C.border}`, fontFamily: sans, fontSize: 12 }}>
              <span style={{ color: C.text }}>{u.display_name || "—"}</span>
              <span style={{ color: C.muted, fontFamily: mono }}>{u.days_since_signup}d ago</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

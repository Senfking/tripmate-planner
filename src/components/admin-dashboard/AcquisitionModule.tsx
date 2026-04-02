import React, { useState } from "react";
import { useAdminData } from "@/hooks/useAdminQuery";
import { StatCard, DateRangeFilter, Period, SectionHeader, Card, AdminSkeleton, EmptyState, C, mono, sans } from "./shared";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

export function AcquisitionModule() {
  const [period, setPeriod] = useState<Period>("30d");
  const { data: stats, isLoading: sl } = useAdminData("acquisition_stats", { period });
  const { data: funnel, isLoading: fl } = useAdminData("acquisition_funnel", { period });
  const { data: utm, isLoading: ul } = useAdminData("acquisition_utm", { period });
  const { data: chart, isLoading: cl } = useAdminData("acquisition_chart", { period });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontFamily: mono, fontSize: 18, color: C.text, fontWeight: 600 }}>Acquisition</h1>
        <DateRangeFilter value={period} onChange={setPeriod} />
      </div>

      {sl ? <AdminSkeleton rows={2} /> : stats ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          <StatCard label="Landing Views" value={stats.landing_views} />
          <StatCard label="Conversion %" value={`${stats.conversion_rate}%`} />
          <StatCard label="Referral Shares" value={stats.referral_shared} />
          <StatCard label="Codes Copied" value={stats.referral_copied} />
          <StatCard label="Invites Sent" value={stats.invites_sent} />
          <StatCard label="Join Codes" value={stats.join_copied} />
          <StatCard label="PWA Prompted" value={stats.pwa_prompted} />
          <StatCard label="PWA Triggered" value={stats.pwa_triggered} />
        </div>
      ) : null}

      <SectionHeader>Conversion Funnel</SectionHeader>
      {fl ? <AdminSkeleton /> : funnel?.stages ? (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {funnel.stages.map((s: any, i: number) => {
              const prev = i > 0 ? funnel.stages[i - 1].count : s.count;
              const dropoff = prev > 0 ? ((1 - s.count / prev) * 100).toFixed(0) : "0";
              return (
                <React.Fragment key={s.name}>
                  <div style={{ flex: 1, textAlign: "center", padding: 16, background: `${C.teal}${Math.max(10, 40 - i * 10).toString(16)}`, borderRadius: 6 }}>
                    <div style={{ fontFamily: mono, fontSize: 22, color: C.text, fontWeight: 600 }}>{s.count}</div>
                    <div style={{ fontFamily: sans, fontSize: 12, color: C.muted, marginTop: 4 }}>{s.name}</div>
                    {i > 0 && <div style={{ fontFamily: mono, fontSize: 11, color: C.red, marginTop: 4 }}>-{dropoff}%</div>}
                  </div>
                  {i < funnel.stages.length - 1 && <div style={{ color: C.muted, padding: "0 8px", fontSize: 18 }}>→</div>}
                </React.Fragment>
              );
            })}
          </div>
        </Card>
      ) : <EmptyState />}

      <SectionHeader>Traffic Sources</SectionHeader>
      {ul ? <AdminSkeleton /> : !utm?.length ? (
        <Card><div style={{ color: C.muted, fontFamily: sans, fontSize: 13, padding: 16 }}>No UTM data yet — append ?utm_source=whatsapp to your referral links</div></Card>
      ) : (
        <Card>
          <table style={{ width: "100%", fontFamily: sans, fontSize: 13, borderCollapse: "collapse" }}>
            <thead><tr style={{ color: C.muted, fontFamily: mono, fontSize: 11, textTransform: "uppercase" as const }}>
              <th style={{ textAlign: "left", padding: 8 }}>Source</th>
              <th style={{ textAlign: "right", padding: 8 }}>Views</th>
            </tr></thead>
            <tbody>
              {utm.map((row: any) => (
                <tr key={row.source} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: 8, color: C.text }}>{row.source}</td>
                  <td style={{ padding: 8, color: C.text, textAlign: "right", fontFamily: mono }}>{row.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <SectionHeader>Acquisition Over Time</SectionHeader>
      {cl ? <AdminSkeleton /> : !chart?.length ? <EmptyState /> : (
        <Card>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chart}>
              <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10, fontFamily: mono }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fill: C.muted, fontSize: 10, fontFamily: mono }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: C.elevated, border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 12, color: C.text }} />
              <Legend wrapperStyle={{ fontFamily: mono, fontSize: 11 }} />
              <Line type="monotone" dataKey="landing" stroke={C.tealLight} strokeWidth={2} dot={false} name="Landing Views" />
              <Line type="monotone" dataKey="referral" stroke={C.green} strokeWidth={2} dot={false} name="Referral Shares" />
              <Line type="monotone" dataKey="invite" stroke={C.blue} strokeWidth={2} dot={false} name="Invites Sent" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

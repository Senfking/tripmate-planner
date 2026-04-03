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

      {/* KPI Cards */}
      {sl ? <AdminSkeleton rows={2} /> : stats ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          <StatCard label="Landing Views" value={stats.landing_views} />
          <StatCard label="Page → Intent" value={`${stats.get_started_rate}%`} />
          <StatCard label="Intent → Signup" value={`${stats.signup_rate}%`} />
          <StatCard label="Signup → Activated" value={`${stats.activation_rate}%`} />
          <StatCard label="Referral Shares" value={stats.referral_shared} />
          <StatCard label="Invites Sent" value={stats.invites_sent} />
        </div>
      ) : null}

      {/* 5-Stage Funnel */}
      <SectionHeader>Conversion Funnel</SectionHeader>
      {fl ? <AdminSkeleton /> : funnel?.stages ? (
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {funnel.stages.map((s: any, i: number) => {
              const prev = i > 0 ? funnel.stages[i - 1].count : null;
              const convPct = prev && prev > 0 ? ((s.count / prev) * 100).toFixed(1) : null;
              const barWidth = funnel.stages[0].count > 0
                ? Math.max(8, (s.count / funnel.stages[0].count) * 100)
                : 100;

              return (
                <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < funnel.stages.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  {/* Stage number */}
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: `${C.teal}33`, color: C.tealLight,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: mono, fontSize: 13, fontWeight: 600, flexShrink: 0,
                  }}>{i + 1}</div>

                  {/* Bar + label */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                      <span style={{ fontFamily: sans, fontSize: 13, color: C.text }}>{s.name}</span>
                      <span style={{ fontFamily: mono, fontSize: 15, color: C.tealLight, fontWeight: 600 }}>{s.count}</span>
                    </div>
                    <div style={{ background: C.elevated, borderRadius: 3, height: 6, overflow: "hidden" }}>
                      <div style={{
                        width: `${barWidth}%`, height: "100%",
                        background: `linear-gradient(90deg, ${C.teal}, ${C.tealLight})`,
                        borderRadius: 3, transition: "width 0.4s ease",
                      }} />
                    </div>
                  </div>

                  {/* Conversion % from previous */}
                  <div style={{ width: 64, textAlign: "right", flexShrink: 0 }}>
                    {convPct !== null ? (
                      <span style={{ fontFamily: mono, fontSize: 12, color: Number(convPct) >= 50 ? C.green : Number(convPct) >= 20 ? C.amber : C.red }}>
                        {convPct}%
                      </span>
                    ) : (
                      <span style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : <EmptyState />}

      {/* Traffic Sources */}
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

      {/* Chart */}
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

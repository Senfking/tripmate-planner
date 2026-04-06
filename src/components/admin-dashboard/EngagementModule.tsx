import React, { useState } from "react";
import { useAdminData } from "@/hooks/useAdminQuery";
import { StatCard, DateRangeFilter, Period, SectionHeader, Card, AdminSkeleton, EmptyState, C, mono, sans } from "./shared";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

export function EngagementModule() {
  const [period, setPeriod] = useState<Period>("30d");
  const { data: dau, isLoading: dl } = useAdminData("engagement_dau_wau_mau");
  const { data: chart, isLoading: cl } = useAdminData("engagement_activity_chart", { period });
  const { data: topTrips, isLoading: tl } = useAdminData("engagement_top_trips", { period });
  const { data: dist, isLoading: dil } = useAdminData("engagement_distribution");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontFamily: mono, fontSize: 18, color: C.text, fontWeight: 600 }}>Engagement</h1>
        <DateRangeFilter value={period} onChange={setPeriod} />
      </div>

      {dl ? <AdminSkeleton rows={1} /> : dau ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
          <StatCard label="DAU" value={dau.dau} />
          <StatCard label="WAU" value={dau.wau} />
          <StatCard label="MAU" value={dau.mau} />
          <StatCard label="Stickiness (DAU/MAU)" value={`${dau.stickiness}%`} />
        </div>
      ) : null}

      <SectionHeader>Activity Over Time</SectionHeader>
      {cl ? <AdminSkeleton /> : !chart?.length ? <EmptyState /> : (
        <Card>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chart}>
              <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10, fontFamily: mono }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fill: C.muted, fontSize: 10, fontFamily: mono }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: C.elevated, border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 12, color: C.text }} />
              <Legend wrapperStyle={{ fontFamily: mono, fontSize: 11 }} />
              <Line type="monotone" dataKey="expenses" stroke={C.tealLight} strokeWidth={2} dot={false} name="Expenses" />
              <Line type="monotone" dataKey="itinerary" stroke={C.blue} strokeWidth={2} dot={false} name="Itinerary" />
              <Line type="monotone" dataKey="feedback" stroke={C.amber} strokeWidth={2} dot={false} name="Feedback" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <div>
          <SectionHeader>Top Active Trips</SectionHeader>
          {tl ? <AdminSkeleton rows={5} /> : !topTrips?.length ? <EmptyState /> : (
            <Card>
              <table style={{ width: "100%", fontFamily: sans, fontSize: 12, borderCollapse: "collapse" }}>
                <thead><tr style={{ color: C.muted, fontFamily: mono, fontSize: 10, textTransform: "uppercase" as const }}>
                  {["Trip", "Members", "Expenses", "Items"].map(h => (
                    <th key={h} style={{ textAlign: h === "Trip" ? "left" : "right", padding: 6 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {topTrips.map((t: any) => (
                    <tr key={t.trip_id} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: 6, color: C.text }}>{t.name}</td>
                      <td style={{ padding: 6, color: C.muted, textAlign: "right", fontFamily: mono }}>{t.members}</td>
                      <td style={{ padding: 6, color: C.text, textAlign: "right", fontFamily: mono }}>{t.expenses}</td>
                      <td style={{ padding: 6, color: C.text, textAlign: "right", fontFamily: mono }}>{t.itinerary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <div>
          <SectionHeader>User Trip Distribution</SectionHeader>
          {dil ? <AdminSkeleton /> : !dist?.length ? <EmptyState /> : (
            <Card>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dist}>
                  <XAxis dataKey="bucket" tick={{ fill: C.muted, fontSize: 11, fontFamily: mono }} />
                  <YAxis tick={{ fill: C.muted, fontSize: 10, fontFamily: mono }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: C.elevated, border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 12, color: C.text }} />
                  <Bar dataKey="count" fill={C.tealLight} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

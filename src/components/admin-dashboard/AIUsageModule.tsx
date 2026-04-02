import React, { useState } from "react";
import { useAdminData } from "@/hooks/useAdminQuery";
import { DateRangeFilter, Period, SectionHeader, Card, AdminSkeleton, EmptyState, C, mono, sans } from "./shared";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

export function AIUsageModule() {
  const [period, setPeriod] = useState<Period>("30d");
  const { data: summary, isLoading: sl } = useAdminData("ai_usage_summary", { period });
  const { data: daily, isLoading: dl } = useAdminData("ai_usage_daily", { period });
  const { data: power, isLoading: pl } = useAdminData("ai_power_users", { period });

  const TOKEN_COSTS: Record<string, number> = { receipt_scan: 300, feedback_hint: 400, itinerary_import: 1500, booking_extract: 1200 };

  const totalCalls = (summary || []).reduce((a: number, r: any) => a + r.period_calls, 0);
  const totalTokens = (summary || []).reduce((a: number, r: any) => a + r.period_calls * (TOKEN_COSTS[r.feature] || 500), 0);
  const costEstimate = (totalTokens * 3 / 1000000).toFixed(2);
  const daysInPeriod = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 365;
  const projectedMonthly = ((totalTokens / daysInPeriod) * 30 * 3 / 1000000).toFixed(2);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontFamily: mono, fontSize: 18, color: C.text, fontWeight: 600 }}>AI Usage</h1>
        <DateRangeFilter value={period} onChange={setPeriod} />
      </div>

      <SectionHeader>Feature Summary</SectionHeader>
      {sl ? <AdminSkeleton rows={4} /> : !summary?.length ? <EmptyState /> : (
        <Card>
          <table style={{ width: "100%", fontFamily: sans, fontSize: 13, borderCollapse: "collapse" }}>
            <thead><tr style={{ color: C.muted, fontFamily: mono, fontSize: 11, textTransform: "uppercase" as const }}>
              {["Feature", "Total", "Period", "Success %", "Users", "Avg/User"].map(h => (
                <th key={h} style={{ textAlign: h === "Feature" ? "left" : "right", padding: 8 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {summary.map((r: any) => (
                <tr key={r.feature} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: 8, color: C.text }}>{r.feature.replace(/_/g, " ")}</td>
                  <td style={{ padding: 8, color: C.text, textAlign: "right", fontFamily: mono }}>{r.total_calls}</td>
                  <td style={{ padding: 8, color: C.tealLight, textAlign: "right", fontFamily: mono }}>{r.period_calls}</td>
                  <td style={{ padding: 8, color: C.text, textAlign: "right", fontFamily: mono }}>
                    {r.success_count !== null && r.period_calls > 0 ? `${((r.success_count / r.period_calls) * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td style={{ padding: 8, color: C.text, textAlign: "right", fontFamily: mono }}>{r.unique_users}</td>
                  <td style={{ padding: 8, color: C.text, textAlign: "right", fontFamily: mono }}>{r.avg_per_user}</td>
                </tr>
              ))}
              <tr style={{ borderTop: `2px solid ${C.border}`, fontWeight: 600 }}>
                <td style={{ padding: 8, color: C.text }}>TOTAL</td>
                <td style={{ padding: 8, color: C.text, textAlign: "right", fontFamily: mono }}>{summary.reduce((a: number, r: any) => a + r.total_calls, 0)}</td>
                <td style={{ padding: 8, color: C.tealLight, textAlign: "right", fontFamily: mono }}>{totalCalls}</td>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
        </Card>
      )}

      <SectionHeader>Daily Usage</SectionHeader>
      {dl ? <AdminSkeleton /> : !daily?.length ? <EmptyState /> : (
        <Card>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={daily}>
              <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10, fontFamily: mono }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fill: C.muted, fontSize: 10, fontFamily: mono }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: C.elevated, border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 12, color: C.text }} />
              <Legend wrapperStyle={{ fontFamily: mono, fontSize: 11 }} />
              <Bar dataKey="receipt_scan" stackId="a" fill={C.tealLight} name="Receipt Scan" />
              <Bar dataKey="feedback_hint" stackId="a" fill={C.blue} name="Feedback Hint" />
              <Bar dataKey="itinerary_import" stackId="a" fill={C.amber} name="Itinerary Import" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <SectionHeader>Power Users</SectionHeader>
          {pl ? <AdminSkeleton rows={5} /> : !power?.length ? <EmptyState /> : (
            <Card>
              <table style={{ width: "100%", fontFamily: sans, fontSize: 12, borderCollapse: "collapse" }}>
                <thead><tr style={{ color: C.muted, fontFamily: mono, fontSize: 10, textTransform: "uppercase" as const }}>
                  {["User", "Scans", "Hints", "Imports", "Total"].map(h => (
                    <th key={h} style={{ textAlign: h === "User" ? "left" : "right", padding: 6 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {power.map((r: any) => (
                    <tr key={r.user_id} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: 6, color: C.text }}>{r.display_name || "—"}</td>
                      <td style={{ padding: 6, color: C.text, textAlign: "right", fontFamily: mono }}>{r.receipt_scans}</td>
                      <td style={{ padding: 6, color: C.text, textAlign: "right", fontFamily: mono }}>{r.feedback_hints}</td>
                      <td style={{ padding: 6, color: C.text, textAlign: "right", fontFamily: mono }}>{r.itinerary_imports}</td>
                      <td style={{ padding: 6, color: C.tealLight, textAlign: "right", fontFamily: mono, fontWeight: 600 }}>{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <div>
          <SectionHeader>Cost Estimator</SectionHeader>
          <Card style={{ background: `${C.teal}15`, borderColor: `${C.teal}33` }}>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, marginBottom: 12, textTransform: "uppercase" }}>
              Estimate only — based on average observed usage
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>Period calls × avg tokens</div>
                <div style={{ fontFamily: mono, fontSize: 18, color: C.tealLight }}>{totalCalls} × ~{Math.round(totalTokens / Math.max(totalCalls, 1))} = {totalTokens.toLocaleString()} tokens</div>
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>Period cost ($3/1M tokens)</div>
                <div style={{ fontFamily: mono, fontSize: 22, color: C.text, fontWeight: 600 }}>${costEstimate}</div>
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>Projected monthly</div>
                <div style={{ fontFamily: mono, fontSize: 22, color: C.amber, fontWeight: 600 }}>${projectedMonthly}</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

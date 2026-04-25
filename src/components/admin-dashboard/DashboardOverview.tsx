import React, { useState, useMemo } from "react";
import { useAdminData } from "@/hooks/useAdminQuery";
import { StatCard, DateRangeFilter, Period, SectionHeader, Card, AdminSkeleton, EmptyState, C, mono, sans } from "./shared";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const PERIOD_DAYS: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90, "all": 365 };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Fill the entire period range with 0s for any missing days, ending today. */
function fillRange(data: any[] | undefined, valueKeys: string[], period: string): any[] {
  const days = PERIOD_DAYS[period] ?? 30;
  const byDate = new Map<string, any>();
  (data ?? []).forEach((row) => {
    if (row?.date) byDate.set(row.date, row);
  });
  // For "all", anchor start to earliest data point if older than default window
  let start: Date;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (period === "all" && data && data.length > 0) {
    const earliest = data.reduce((min, r) => (r.date < min ? r.date : min), data[0].date);
    start = new Date(earliest + "T00:00:00Z");
  } else {
    start = new Date(today);
    start.setUTCDate(start.getUTCDate() - (days - 1));
  }
  const zeroes = Object.fromEntries(valueKeys.map((k) => [k, 0]));
  const out: any[] = [];
  for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = isoDate(d);
    out.push(byDate.get(key) ?? { date: key, ...zeroes });
  }
  return out;
}

export function DashboardOverview() {
  const [period, setPeriod] = useState<Period>("30d");
  const { data: kpis, isLoading: kpiLoading } = useAdminData("dashboard_kpis", { period });
  const { data: rawGrowth, isLoading: growthLoading } = useAdminData("user_growth_chart", { period });
  const { data: rawDau, isLoading: dauLoading } = useAdminData("dau_chart", { period });
  const { data: rawLanding, isLoading: landingLoading } = useAdminData("landing_views_chart", { period });
  const { data: activity, isLoading: actLoading } = useAdminData("recent_activity", {}, { refetchInterval: 60000 });

  const growth = useMemo(() => fillRange(rawGrowth, ["count"], period), [rawGrowth, period]);
  const dauChart = useMemo(() => fillRange(rawDau, ["dau"], period), [rawDau, period]);
  const landingChart = useMemo(() => fillRange(rawLanding, ["count"], period), [rawLanding, period]);

  const trend = (current: number, prior: number) => prior > 0 ? Math.round(((current - prior) / prior) * 100) : null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontFamily: mono, fontSize: 18, color: C.text, fontWeight: 600 }}>Dashboard</h1>
        <DateRangeFilter value={period} onChange={setPeriod} />
      </div>

      {kpiLoading ? <AdminSkeleton rows={4} /> : kpis ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 32 }}>
          <StatCard label="Total Users" value={kpis.total_users} />
          <StatCard label={`New Users (${period})`} value={kpis.new_users} trend={trend(kpis.new_users, kpis.new_users_prior)} />
          <StatCard label="Total Trips" value={kpis.total_trips} />
          <StatCard label={`Active Trips (${period})`} value={kpis.active_trips} />
          <StatCard label="Total Expenses" value={kpis.total_expenses} />
          <StatCard label="Open Feedback" value={kpis.open_feedback} />
          <StatCard label={`AI Calls (${period})`} value={kpis.ai_calls} trend={trend(kpis.ai_calls, kpis.ai_calls_prior)} />
          <StatCard label={`Landing Views (${period})`} value={kpis.landing_views} trend={trend(kpis.landing_views, kpis.landing_views_prior)} />
          <StatCard label={`Referral Shares (${period})`} value={kpis.referral_shares} trend={trend(kpis.referral_shares, kpis.referral_shares_prior)} />
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionHeader>User Growth</SectionHeader>
          {growthLoading ? <AdminSkeleton /> : !growth?.length ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={growth}>
                <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10, fontFamily: mono }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: C.muted, fontSize: 10, fontFamily: mono }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: C.elevated, border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 12, color: C.text }} />
                <Line type="monotone" dataKey="count" stroke={C.tealLight} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <SectionHeader>Daily Active Users</SectionHeader>
          {dauLoading ? <AdminSkeleton /> : !dauChart?.length ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={dauChart}>
                <defs>
                  <linearGradient id="dauGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.blue} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C.blue} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10, fontFamily: mono }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: C.muted, fontSize: 10, fontFamily: mono }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: C.elevated, border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 12, color: C.text }} />
                <Area type="monotone" dataKey="dau" stroke={C.blue} strokeWidth={2} fill="url(#dauGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionHeader>Landing Page Visitors</SectionHeader>
          {landingLoading ? <AdminSkeleton /> : !landingChart?.length ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={landingChart}>
                <defs>
                  <linearGradient id="landingGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.amber} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C.amber} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10, fontFamily: mono }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: C.muted, fontSize: 10, fontFamily: mono }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: C.elevated, border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 12, color: C.text }} />
                <Area type="monotone" dataKey="count" stroke={C.amber} strokeWidth={2} fill="url(#landingGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <SectionHeader>Recent Activity</SectionHeader>
          {actLoading ? <AdminSkeleton rows={8} /> : !activity?.length ? <EmptyState /> : (
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              {activity.map((item: any, i: number) => {
                const typeColor = item.type === "signup" ? C.green : item.type === "trip_created" ? C.blue : item.type === "ai_usage" ? C.tealLight : C.amber;
                const ago = timeAgo(item.time);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontFamily: mono, fontSize: 10, padding: "2px 6px", borderRadius: 3, background: `${typeColor}1f`, color: typeColor, border: `1px solid ${typeColor}33`, whiteSpace: "nowrap" }}>
                      {item.type}
                    </span>
                    <span style={{ fontFamily: sans, fontSize: 13, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.description}
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>{ago}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
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
import React, { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminData } from "@/hooks/useAdminQuery";
import { Card, AdminSkeleton, StatusPill, EmptyState, SectionHeader, C, mono, sans } from "./shared";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

// ─── Error Overview Section ───
function ErrorOverview() {
  const { data, isLoading } = useAdminData("error_overview", {}, { refetchInterval: 60000 });

  if (isLoading) return <AdminSkeleton rows={3} />;
  if (!data) return null;

  const { errors_24h, critical_24h, trend_pct, prior_24h } = data;
  const trend = parseFloat(trend_pct);
  const increasing = trend > 0;

  const errColor = errors_24h < 5 ? C.green : errors_24h <= 20 ? C.amber : C.red;
  const critColor = critical_24h === 0 ? C.green : critical_24h <= 2 ? C.amber : C.red;
  const trendColor = increasing ? C.red : C.green;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
      <Card>
        <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Errors (24h)</div>
        <div style={{ fontFamily: mono, fontSize: 28, color: errColor, fontWeight: 600 }}>{errors_24h}</div>
      </Card>
      <Card>
        <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Critical (24h)</div>
        <div style={{ fontFamily: mono, fontSize: 28, color: critColor, fontWeight: 600 }}>{critical_24h}</div>
      </Card>
      <Card>
        <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Error Trend</div>
        <div style={{ fontFamily: mono, fontSize: 28, color: trendColor, fontWeight: 600 }}>
          {increasing ? "↑" : "↓"}{Math.abs(trend).toFixed(1)}%
        </div>
        <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>{errors_24h} vs {prior_24h} prior 24h</div>
      </Card>
    </div>
  );
}

// ─── Error Spike Chart ───
function ErrorSpikeChart() {
  const [chartPeriod, setChartPeriod] = useState<"24h" | "30d">("24h");
  const { data, isLoading } = useAdminData("error_chart", { chart_period: chartPeriod }, { refetchInterval: 60000 });

  if (isLoading) return <AdminSkeleton rows={5} />;

  const chartData = data || [];
  if (chartData.length === 0) return <EmptyState message="No errors recorded yet" />;

  const avg = chartData.reduce((s: number, d: any) => s + d.count, 0) / chartData.length;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, textTransform: "uppercase" }}>Error Spike Chart</div>
        <div style={{ display: "flex", gap: 0, fontFamily: mono, fontSize: 12 }}>
          {(["24h", "30d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setChartPeriod(p)}
              style={{
                padding: "4px 12px",
                background: chartPeriod === p ? C.elevated : "transparent",
                color: chartPeriod === p ? C.tealLight : C.muted,
                border: `1px solid ${C.border}`,
                borderRight: p === "24h" ? "none" : `1px solid ${C.border}`,
                borderRadius: p === "24h" ? "6px 0 0 6px" : "0 6px 6px 0",
                cursor: "pointer",
              }}
            >
              {p === "24h" ? "24h (hourly)" : "30d (daily)"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <XAxis
              dataKey="label"
              tickFormatter={(v: string) => chartPeriod === "24h" ? v.substring(11, 16) : v.substring(5)}
              tick={{ fill: C.muted, fontSize: 10, fontFamily: mono }}
              axisLine={{ stroke: C.border }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: C.muted, fontSize: 10, fontFamily: mono }}
              axisLine={{ stroke: C.border }}
              tickLine={false}
              width={30}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {chartData.map((entry: any, idx: number) => (
                <Cell key={idx} fill={entry.count > avg * 2 ? C.red : C.teal} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const breakdown = d.breakdown || {};
  return (
    <div style={{ background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, fontFamily: mono, fontSize: 11 }}>
      <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>{d.label} — {d.count} error{d.count !== 1 ? "s" : ""}</div>
      {Object.entries(breakdown).map(([type, count]) => (
        <div key={type} style={{ color: C.muted }}>{type}: {count as number}</div>
      ))}
    </div>
  );
}

// ─── Recent Errors Feed ───
const FEED_FILTERS = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "react_crash", label: "React Crashes" },
  { key: "query_error", label: "Query Errors" },
];

function RecentErrorsFeed() {
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading } = useAdminData("error_feed", { error_filter: filter }, { refetchInterval: 60000 });

  if (isLoading) return <AdminSkeleton rows={6} />;

  const errors = data || [];
  if (errors.length === 0) return <EmptyState message="No errors recorded yet" />;

  return (
    <Card style={{ padding: 0 }}>
      {/* Filter pills */}
      <div style={{ display: "flex", gap: 6, padding: "16px 20px 12px", flexWrap: "wrap", borderBottom: `1px solid ${C.border}` }}>
        {FEED_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              fontFamily: mono, fontSize: 11, padding: "4px 10px", borderRadius: 4, cursor: "pointer",
              background: filter === f.key ? `${C.teal}22` : "transparent",
              color: filter === f.key ? C.tealLight : C.muted,
              border: `1px solid ${filter === f.key ? `${C.teal}44` : C.border}`,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Error list */}
      <div style={{ maxHeight: 500, overflowY: "auto" }}>
        {errors.map((err: any) => {
          const props = err.properties || {};
          const severity = props.severity || "medium";
          const errType = props.type || "unknown";
          const message = props.message || "—";
          const route = props.route || "";
          const timeAgo = getTimeAgo(err.created_at);
          const isExpanded = expandedId === err.id;

          const sevColor = severity === "critical" ? C.red : severity === "high" ? C.amber : C.blue;

          return (
            <div
              key={err.id}
              onClick={() => setExpandedId(isExpanded ? null : err.id)}
              style={{
                padding: "12px 20px",
                borderBottom: `1px solid ${C.border}`,
                cursor: "pointer",
                background: isExpanded ? C.elevated : "transparent",
              }}
            >
              {/* Summary row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <StatusPill label={severity} color={sevColor} />
                <StatusPill label={errType.replace(/_/g, " ")} color={C.muted} />
                <span style={{ fontFamily: sans, fontSize: 12, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {message.length > 80 ? message.substring(0, 80) + "…" : message}
                </span>
                {route && <span style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>{route}</span>}
                <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>{timeAgo}</span>
                <span style={{ fontFamily: sans, fontSize: 10, color: C.muted }}>{err.display_name}</span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                  <DetailRow label="Full message" value={message} />
                  {props.stack && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginBottom: 4 }}>Stack trace</div>
                      <pre style={{
                        fontFamily: mono, fontSize: 10, color: C.text, background: C.bg,
                        border: `1px solid ${C.border}`, borderRadius: 4, padding: 10,
                        overflowX: "auto", whiteSpace: "pre-wrap", maxHeight: 200,
                      }}>
                        {props.stack}
                      </pre>
                    </div>
                  )}
                  {props.queryKey && <DetailRow label="Query key" value={props.queryKey} />}
                  {props.component && <DetailRow label="Component" value={props.component} />}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginBottom: 4 }}>Full properties</div>
                    <pre style={{
                      fontFamily: mono, fontSize: 10, color: C.muted, background: C.bg,
                      border: `1px solid ${C.border}`, borderRadius: 4, padding: 10,
                      overflowX: "auto", whiteSpace: "pre-wrap", maxHeight: 160,
                    }}>
                      {JSON.stringify(props, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>{label}: </span>
      <span style={{ fontFamily: sans, fontSize: 12, color: C.text }}>{value}</span>
    </div>
  );
}

function getTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Main SystemStatus Component ───
export function SystemStatus() {
  const { data, isLoading, dataUpdatedAt } = useAdminData("system_status", {}, { refetchInterval: 60000 });

  const lastRefresh = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontFamily: mono, fontSize: 18, color: C.text, fontWeight: 600 }}>System Status</h1>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>Last refreshed: {lastRefresh}</span>
      </div>

      {/* NEW: Error Overview */}
      <SectionHeader>Error Overview</SectionHeader>
      <ErrorOverview />

      {/* NEW: Error Spike Chart */}
      <SectionHeader>Error Spike Chart</SectionHeader>
      <ErrorSpikeChart />

      {/* NEW: Recent Errors Feed */}
      <SectionHeader>Recent Errors</SectionHeader>
      <RecentErrorsFeed />

      {/* EXISTING: System health checks */}
      <SectionHeader>System Health</SectionHeader>
      {isLoading ? <AdminSkeleton rows={6} /> : data ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {/* Exchange Rate */}
          <Card>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Exchange Rate</div>
            <StatusPill label={data.exchange_rate.status} color={data.exchange_rate.status === "fresh" ? C.green : data.exchange_rate.status === "stale" ? C.amber : C.red} />
            <div style={{ fontFamily: mono, fontSize: 12, color: C.muted, marginTop: 8 }}>
              {data.exchange_rate.hours_ago !== null ? `Updated ${data.exchange_rate.hours_ago}h ago` : "Never fetched"}
            </div>
          </Card>

          {/* Feedback Backlog */}
          <Card>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Feedback Backlog</div>
            <div style={{ fontFamily: mono, fontSize: 28, color: data.feedback_backlog < 5 ? C.green : data.feedback_backlog < 20 ? C.amber : C.red, fontWeight: 600 }}>
              {data.feedback_backlog}
            </div>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>unresolved items</div>
          </Card>

          {/* Critical Feedback */}
          <Card>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Critical Unresolved</div>
            <div style={{ fontFamily: mono, fontSize: 28, color: data.critical_feedback.length > 0 ? C.red : C.green, fontWeight: 600 }}>
              {data.critical_feedback.length}
            </div>
            {data.critical_feedback.slice(0, 3).map((f: any) => (
              <div key={f.id} style={{ fontFamily: sans, fontSize: 11, color: C.text, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.ai_summary || f.body?.substring(0, 50) || "—"}
              </div>
            ))}
          </Card>

          {/* Growth Momentum */}
          <Card>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Growth Momentum</div>
            <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 600, color: parseFloat(data.growth_momentum.pct) >= 0 ? C.green : C.red }}>
              {parseFloat(data.growth_momentum.pct) >= 0 ? "↑" : "↓"}{data.growth_momentum.pct}%
            </div>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>{data.growth_momentum.recent} vs {data.growth_momentum.prior} prior week</div>
          </Card>

          {/* AI Anomaly */}
          <Card>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>AI Usage Anomaly</div>
            <StatusPill label={data.ai_anomaly.is_anomaly ? "ALERT" : "Normal"} color={data.ai_anomaly.is_anomaly ? C.red : C.green} />
            <div style={{ fontFamily: mono, fontSize: 12, color: C.muted, marginTop: 8 }}>
              Today: {data.ai_anomaly.today} · Avg: {data.ai_anomaly.weekly_avg}/day
            </div>
          </Card>

          {/* Dormant Users */}
          <Card>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Dormant Users</div>
            <div style={{ fontFamily: mono, fontSize: 28, color: C.amber, fontWeight: 600 }}>{data.dormant_users}</div>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>14d+ no trip</div>
          </Card>
        </div>
      ) : null}

      {/* Debug: test error button */}
      <DebugTestErrorButton />
    </div>
  );
}

function DebugTestErrorButton() {
  const { user } = useAuth();
  const [sent, setSent] = useState(false);

  const handleClick = async () => {
    await trackEvent("app_error", {
      type: "test_error",
      message: "Manual test error triggered from admin dashboard",
      severity: "medium",
      route: "/app/admin",
    }, user?.id);
    setSent(true);
    setTimeout(() => setSent(false), 4000);
  };

  return (
    <div style={{ marginTop: 32, textAlign: "right" }}>
      <button
        onClick={handleClick}
        style={{
          fontFamily: mono, fontSize: 10, color: C.muted, background: "transparent",
          border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer",
          opacity: 0.6,
        }}
      >
        Trigger test error
      </button>
      {sent && (
        <div style={{ fontFamily: mono, fontSize: 10, color: C.green, marginTop: 4 }}>
          Test error sent — check analytics_events table
        </div>
      )}
    </div>
  );
}

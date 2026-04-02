import React from "react";
import { useAdminData } from "@/hooks/useAdminQuery";
import { Card, AdminSkeleton, StatusPill, C, mono, sans } from "./shared";

export function SystemStatus() {
  const { data, isLoading, dataUpdatedAt } = useAdminData("system_status", {}, { refetchInterval: 60000 });

  if (isLoading) return <AdminSkeleton rows={6} />;
  if (!data) return null;

  const lastRefresh = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontFamily: mono, fontSize: 18, color: C.text, fontWeight: 600 }}>System Status</h1>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>Last refreshed: {lastRefresh}</span>
      </div>

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
    </div>
  );
}

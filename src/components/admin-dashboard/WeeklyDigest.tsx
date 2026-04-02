import React from "react";
import { useAdminData } from "@/hooks/useAdminQuery";
import { Card, AdminSkeleton, EmptyState, C, mono, sans } from "./shared";

export function WeeklyDigest() {
  const { data, isLoading } = useAdminData("weekly_digest");

  const copyDigest = () => {
    if (!data) return;
    const d = data;
    const text = [
      `JUNTO Weekly Digest — ${new Date().toISOString().slice(0, 10)}`,
      ``,
      `GROWTH`,
      `${d.growth.new_users} new users this week (${d.growth.pct_change >= 0 ? "+" : ""}${d.growth.pct_change}% vs prior). ${d.growth.organic} organic, ${d.growth.referred} referred.`,
      ``,
      `ACTIVATION`,
      `${d.activation.rate}% of new users created/joined a trip (${d.activation.activated}/${d.activation.new_users}).`,
      ``,
      `ENGAGEMENT`,
      `${d.engagement.expenses} expenses logged. ${d.engagement.itinerary_items} itinerary items created.`,
      ``,
      `AI USAGE`,
      `${d.ai.total} total AI calls. Estimated cost: $${d.ai.estimated_cost}.`,
      ...Object.entries(d.ai.by_feature || {}).map(([k, v]) => `  ${k}: ${v}`),
      ``,
      `ACQUISITION`,
      `${d.acquisition.landing_views} landing views. ${d.acquisition.referral_shares} referral shares. ${d.acquisition.invites_sent} invites sent.`,
      d.acquisition.top_utm ? `Top source: ${d.acquisition.top_utm.source} (${d.acquisition.top_utm.count})` : "",
      ``,
      `FEEDBACK`,
      `${d.feedback.total} submissions. ${d.feedback.critical} critical, ${d.feedback.high} high. ${d.feedback.unresolved_critical} unresolved critical.`,
      ``,
      `HEALTH`,
      `Exchange rates: ${d.health.exchange_rate_status} (${d.health.exchange_rate_hours}h ago).`,
    ].filter(Boolean).join("\n");

    navigator.clipboard.writeText(text);
  };

  if (isLoading) return <AdminSkeleton rows={12} />;
  if (!data) return <EmptyState />;

  const d = data;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontFamily: mono, fontSize: 18, color: C.text, fontWeight: 600 }}>Weekly Digest</h1>
        <button onClick={copyDigest} style={{ padding: "6px 14px", background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 6, color: C.tealLight, fontFamily: mono, fontSize: 12, cursor: "pointer" }}>
          Copy digest as text
        </button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Section title="Growth">
          <P><B>{d.growth.new_users}</B> new users this week ({d.growth.pct_change >= 0 ? "+" : ""}{d.growth.pct_change}% vs prior week). <B>{d.growth.organic}</B> organic, <B>{d.growth.referred}</B> referred.</P>
        </Section>
        <Section title="Activation">
          <P><B>{d.activation.rate}%</B> of new users created or joined a trip within the week ({d.activation.activated}/{d.activation.new_users}).</P>
        </Section>
        <Section title="Engagement">
          <P><B>{d.engagement.expenses}</B> expenses logged. <B>{d.engagement.itinerary_items}</B> itinerary items created.</P>
        </Section>
        <Section title="AI Usage">
          <P><B>{d.ai.total}</B> total AI calls. Estimated cost: <B>${d.ai.estimated_cost}</B>.</P>
          {Object.entries(d.ai.by_feature || {}).map(([k, v]) => (
            <P key={k} style={{ paddingLeft: 16 }}>• {k.replace("ai_", "")}: {String(v)}</P>
          ))}
        </Section>
        <Section title="Acquisition">
          <P><B>{d.acquisition.landing_views}</B> landing views. <B>{d.acquisition.referral_shares}</B> referral shares. <B>{d.acquisition.invites_sent}</B> invites sent.</P>
          {d.acquisition.top_utm && <P>Top source: <B>{d.acquisition.top_utm.source}</B> ({d.acquisition.top_utm.count} views)</P>}
        </Section>
        <Section title="Feedback">
          <P><B>{d.feedback.total}</B> submissions. <B>{d.feedback.critical}</B> critical, <B>{d.feedback.high}</B> high severity.</P>
          {d.feedback.unresolved_critical > 0 && <P style={{ color: C.red }}>⚠️ {d.feedback.unresolved_critical} unresolved critical items</P>}
        </Section>
        <Section title="Health">
          <P>Exchange rates: <B>{d.health.exchange_rate_status}</B> ({d.health.exchange_rate_hours !== null ? `${d.health.exchange_rate_hours}h ago` : "never fetched"}).</P>
        </Section>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function P({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <p style={{ fontFamily: sans, fontSize: 14, color: C.text, lineHeight: 1.7, margin: "4px 0", ...style }}>{children}</p>;
}

function B({ children }: { children: React.ReactNode }) {
  return <span style={{ fontWeight: 600, color: C.tealLight }}>{children}</span>;
}

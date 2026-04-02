import React from "react";

// ─── Design Tokens ───
export const C = {
  bg: "#0b0e0e",
  surface: "#131918",
  elevated: "#1a2120",
  border: "rgba(255,255,255,0.07)",
  text: "#e8f0ef",
  muted: "#7a9490",
  teal: "#0D9488",
  tealLight: "#14b8a6",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  blue: "#3b82f6",
};

export const mono = "'IBM Plex Mono', monospace";
export const sans = "'IBM Plex Sans', sans-serif";

// ─── Stat Card ───
export function StatCard({ label, value, trend, trendLabel }: {
  label: string;
  value: string | number;
  trend?: number | null;
  trendLabel?: string;
}) {
  const trendColor = trend && trend > 0 ? C.green : trend && trend < 0 ? C.red : C.muted;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "16px 20px", fontFamily: mono }}>
      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{label}</div>
      <div style={{ color: C.tealLight, fontSize: 28, fontWeight: 600, lineHeight: 1.1 }}>{value}</div>
      {(trend !== null && trend !== undefined) && (
        <div style={{ color: trendColor, fontSize: 12, marginTop: 6 }}>
          {trend > 0 ? "+" : ""}{trend}% {trendLabel || "vs prior"}
        </div>
      )}
    </div>
  );
}

// ─── Date Range Filter ───
const periods = ["7d", "30d", "90d", "all"] as const;
export type Period = typeof periods[number];

export function DateRangeFilter({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div style={{ display: "flex", gap: 0, fontFamily: mono, fontSize: 13 }}>
      {periods.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          style={{
            padding: "6px 14px",
            background: value === p ? C.elevated : "transparent",
            color: value === p ? C.tealLight : C.muted,
            border: `1px solid ${C.border}`,
            borderRight: p !== "all" ? "none" : `1px solid ${C.border}`,
            borderRadius: p === "7d" ? "6px 0 0 6px" : p === "all" ? "0 6px 6px 0" : 0,
            cursor: "pointer",
            borderBottom: value === p ? `2px solid ${C.tealLight}` : `1px solid ${C.border}`,
          }}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

// ─── Status Pill ───
export function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontFamily: mono,
      fontSize: 11,
      padding: "3px 8px",
      borderRadius: 4,
      background: `${color}1f`,
      color,
      border: `1px solid ${color}33`,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    }}>
      {label}
    </span>
  );
}

// ─── Section Header ───
export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: mono, fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: 2, margin: "32px 0 16px" }}>
      {children}
    </h2>
  );
}

// ─── Loading Skeleton ───
export function AdminSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ background: C.elevated, borderRadius: 6, height: 20, animation: "pulse 1.5s infinite", opacity: 0.4 }} />
      ))}
    </div>
  );
}

// ─── Empty State ───
export function EmptyState({ message = "No data yet" }: { message?: string }) {
  return (
    <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: sans, fontSize: 14 }}>
      {message}
    </div>
  );
}

// ─── Card wrapper ───
export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20, ...style }}>
      {children}
    </div>
  );
}

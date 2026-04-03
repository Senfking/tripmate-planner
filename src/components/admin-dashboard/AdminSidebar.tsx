import React from "react";
import { C, mono, sans, AdminModule } from "./shared";

export type { AdminModule };

const NAV: { section: string; items: { key: AdminModule; label: string }[] }[] = [
  { section: "OVERVIEW", items: [
    { key: "dashboard", label: "Dashboard" },
    { key: "acquisition", label: "Acquisition" },
    { key: "ai_usage", label: "AI Usage" },
  ]},
  { section: "USERS", items: [
    { key: "all_users", label: "All Users" },
    { key: "retention", label: "Retention" },
    { key: "referrals", label: "Referrals" },
  ]},
  { section: "PRODUCT", items: [
    { key: "engagement", label: "Engagement" },
    { key: "feature_adoption", label: "Feature Adoption" },
  ]},
  { section: "FEEDBACK", items: [
    { key: "feedback_inbox", label: "Inbox" },
  ]},
  { section: "HEALTH", items: [
    { key: "system_status", label: "System Status" },
  ]},
  { section: "REPORTS", items: [
    { key: "weekly_digest", label: "Weekly Digest" },
  ]},
];

export function AdminSidebar({ active, onNavigate, userName }: {
  active: AdminModule;
  onNavigate: (m: AdminModule) => void;
  userName?: string;
}) {
  return (
    <div style={{
      width: 220, minHeight: "100vh", background: C.surface,
      borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column",
      position: "fixed", left: 0, top: 0, zIndex: 50,
    }}>
      <div style={{ padding: "24px 20px 16px" }}>
        <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: C.tealLight, letterSpacing: 2 }}>JUNTO</div>
        <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, letterSpacing: 3, marginTop: 2 }}>ADMIN</div>
      </div>
      <nav style={{ flex: 1, padding: "0 0 16px" }}>
        {NAV.map((section) => (
          <div key={section.section} style={{ marginBottom: 8 }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, letterSpacing: 2, padding: "8px 20px 4px", textTransform: "uppercase" }}>
              {section.section}
            </div>
            {section.items.map((item) => {
              const isActive = active === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "8px 20px", border: "none", cursor: "pointer",
                    fontFamily: sans, fontSize: 13,
                    color: isActive ? C.tealLight : C.muted,
                    background: isActive ? `${C.teal}15` : "transparent",
                    borderLeft: isActive ? `3px solid ${C.tealLight}` : "3px solid transparent",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = C.text; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = C.muted; }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: sans, fontSize: 12, color: C.muted }}>{userName || "Admin"}</div>
        <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, opacity: 0.6 }}>Admin</div>
      </div>
    </div>
  );
}

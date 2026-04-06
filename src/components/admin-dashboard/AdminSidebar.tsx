import React from "react";
import { C, mono, sans, AdminModule } from "./shared";
import { useAdminData } from "@/hooks/useAdminQuery";
import { Bell } from "lucide-react";

export type { AdminModule };

const NAV: { section: string; items: { key: AdminModule; label: string }[] }[] = [
  { section: "OVERVIEW", items: [
    { key: "dashboard", label: "Dashboard" },
    { key: "notifications", label: "Notifications" },
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

const ICE_BLUE = "rgba(96, 165, 250, 0.85)";

export function AdminSidebar({ active, onNavigate, userName, isMobile }: {
  active: AdminModule;
  onNavigate: (m: AdminModule) => void;
  userName?: string;
  isMobile?: boolean;
}) {
  const { data: feedbackData } = useAdminData("feedback_unread_count", {}, { refetchInterval: 60000 });
  const feedbackUnread = (feedbackData as any)?.count ?? 0;
  const { data: notifData } = useAdminData("notifications_unread_count", {}, { refetchInterval: 10000 });
  const unreadCount = (notifData as any)?.count ?? 0;

  return (
    <div style={{
      width: 220, minHeight: "100vh", background: C.surface,
      borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column",
      ...(isMobile ? {} : { position: "fixed", left: 0, top: 0, zIndex: 50 }),
    }}>
      <div style={{ padding: "24px 20px 8px" }}>
        <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: C.tealLight, letterSpacing: 2 }}>JUNTO</div>
        <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, letterSpacing: 3, marginTop: 2 }}>ADMIN</div>
      </div>

      {/* Bell icon */}
      <button
        onClick={() => onNavigate("notifications")}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 20px", border: "none", cursor: "pointer",
          background: active === "notifications" ? `${C.teal}15` : "transparent",
          borderLeft: active === "notifications" ? `3px solid ${C.tealLight}` : "3px solid transparent",
          position: "relative",
        }}
      >
        <Bell size={16} color={active === "notifications" ? C.tealLight : C.muted} />
        <span style={{ fontFamily: sans, fontSize: 13, color: active === "notifications" ? C.tealLight : C.muted }}>
          Notifications
        </span>
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: 4, left: 30,
            background: "rgba(59, 130, 246, 0.15)", color: "rgba(96, 165, 250, 0.95)",
            border: "1px solid rgba(59, 130, 246, 0.4)",
            fontFamily: mono, fontSize: 9, fontWeight: 700,
            borderRadius: "50%", width: 16, height: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 8px rgba(59, 130, 246, 0.3)",
            lineHeight: 1,
          }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <nav style={{ flex: 1, padding: "0 0 16px" }}>
        {NAV.map((section) => (
          <div key={section.section} style={{ marginBottom: 8 }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, letterSpacing: 2, padding: "8px 20px 4px", textTransform: "uppercase" }}>
              {section.section}
            </div>
            {section.items.map((item) => {
              if (item.key === "notifications") return null; // shown as bell above
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
                  {item.key === "feedback_inbox" && feedbackUnread > 0 && (
                    <span style={{
                      marginLeft: 6,
                      background: "rgba(59, 130, 246, 0.15)",
                      color: "rgba(96, 165, 250, 0.95)",
                      border: "1px solid rgba(59, 130, 246, 0.4)",
                      fontFamily: mono,
                      fontSize: 10,
                      fontWeight: 700,
                      borderRadius: 50,
                      padding: "2px 7px",
                      minWidth: 20,
                      height: 20,
                      textAlign: "center" as const,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      lineHeight: 1,
                      verticalAlign: "middle",
                      boxShadow: "0 0 8px rgba(59, 130, 246, 0.3)",
                    }}>
                      {feedbackUnread > 99 ? "99+" : feedbackUnread}
                    </span>
                  )}
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

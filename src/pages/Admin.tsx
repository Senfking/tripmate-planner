import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AdminSidebar } from "@/components/admin-dashboard/AdminSidebar";
import { DashboardOverview } from "@/components/admin-dashboard/DashboardOverview";
import { AcquisitionModule } from "@/components/admin-dashboard/AcquisitionModule";
import { AIUsageModule } from "@/components/admin-dashboard/AIUsageModule";
import { AllUsersModule } from "@/components/admin-dashboard/AllUsersModule";
import { RetentionModule } from "@/components/admin-dashboard/RetentionModule";
import { ReferralsModule } from "@/components/admin-dashboard/ReferralsModule";
import { EngagementModule } from "@/components/admin-dashboard/EngagementModule";
import { FeatureAdoptionModule } from "@/components/admin-dashboard/FeatureAdoptionModule";
import { FeedbackInbox } from "@/components/admin-dashboard/FeedbackInbox";
import { SystemStatus } from "@/components/admin-dashboard/SystemStatus";
import { WeeklyDigest } from "@/components/admin-dashboard/WeeklyDigest";
import { NotificationsModule } from "@/components/admin-dashboard/NotificationsModule";
import { C, AdminModule, AdminNavContext } from "@/components/admin-dashboard/shared";
import { useAdminNotificationsRealtime } from "@/hooks/useAdminQuery";
import { Loader2, Menu } from "lucide-react";

const ADMIN_USER_ID = import.meta.env.VITE_ADMIN_USER_ID || "1d5b21fe-f74c-429b-8d9d-938a4f295013";

const MODULE_MAP: Record<AdminModule, React.FC> = {
  dashboard: DashboardOverview,
  notifications: NotificationsModule,
  acquisition: AcquisitionModule,
  ai_usage: AIUsageModule,
  all_users: AllUsersModule,
  retention: RetentionModule,
  referrals: ReferralsModule,
  engagement: EngagementModule,
  feature_adoption: FeatureAdoptionModule,
  feedback_inbox: FeedbackInbox,
  system_status: SystemStatus,
  weekly_digest: WeeklyDigest,
};

function useIsMobileAdmin() {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return mobile;
}

export default function Admin() {
  const { user, loading } = useAuth();
  useAdminNotificationsRealtime();
  const [activeModule, setActiveModule] = useState<AdminModule>("dashboard");
  const [navParams, setNavParams] = useState<Record<string, string>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobileAdmin();

  const navigateTo = useCallback((module: AdminModule, params?: Record<string, string>) => {
    setNavParams(params || {});
    setActiveModule(module);
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  const navCtx = useMemo(() => ({ navigateTo, navParams }), [navigateTo, navParams]);

  const handleSidebarNav = useCallback((module: AdminModule) => {
    setNavParams({});
    setActiveModule(module);
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user || user.id !== ADMIN_USER_ID) return <div />;

  const ActiveComponent = MODULE_MAP[activeModule];

  return (
    <AdminNavContext.Provider value={navCtx}>
      <div style={{ background: C.bg, minHeight: "100vh", color: C.text }}>
        {/* Mobile header */}
        {isMobile && (
          <header style={{
            position: "sticky", top: 0, zIndex: 40,
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 16px", background: C.surface,
            borderBottom: `1px solid ${C.border}`,
          }}>
            <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", color: C.text, cursor: "pointer", padding: 4 }}>
              <Menu size={22} />
            </button>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600, color: C.tealLight }}>JUNTO ADMIN</span>
          </header>
        )}

        {/* Backdrop for mobile sidebar */}
        {isMobile && sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 49,
              background: "rgba(0,0,0,0.6)",
            }}
          />
        )}

        {/* Sidebar: always visible on desktop, slide-over on mobile */}
        <div style={{
          ...(isMobile ? {
            position: "fixed", left: 0, top: 0, zIndex: 50,
            transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.2s ease",
          } : {}),
        }}>
          <AdminSidebar
            active={activeModule}
            onNavigate={handleSidebarNav}
            userName={user.user_metadata?.display_name || user.email}
            isMobile={isMobile}
          />
        </div>

        <main style={{
          marginLeft: isMobile ? 0 : 220,
          padding: isMobile ? "16px 12px" : "24px 32px",
          minHeight: isMobile ? "auto" : "100vh",
        }}>
          <ActiveComponent />
        </main>
      </div>
    </AdminNavContext.Provider>
  );
}

import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AdminSidebar, AdminModule } from "@/components/admin-dashboard/AdminSidebar";
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
import { C } from "@/components/admin-dashboard/shared";
import { Loader2 } from "lucide-react";

const ADMIN_USER_ID = import.meta.env.VITE_ADMIN_USER_ID || "1d5b21fe-f74c-429b-8d9d-938a4f295013";

const MODULE_MAP: Record<AdminModule, React.FC> = {
  dashboard: DashboardOverview,
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

export default function Admin() {
  const { user, loading } = useAuth();
  const [activeModule, setActiveModule] = useState<AdminModule>("dashboard");

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
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text }}>
      <AdminSidebar
        active={activeModule}
        onNavigate={setActiveModule}
        userName={user.user_metadata?.display_name || user.email}
      />
      <main style={{ marginLeft: 220, padding: "24px 32px", minHeight: "100vh" }}>
        <ActiveComponent />
      </main>
    </div>
  );
}

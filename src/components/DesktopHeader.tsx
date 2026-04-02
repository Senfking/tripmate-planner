import { Map, Vote, CalendarDays, DollarSign, Plus, Hash } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalDecisions } from "@/hooks/useGlobalDecisions";

const tabs = [
  { label: "Trips", to: "/app/trips", icon: Map },
  { label: "Decisions", to: "/app/decisions", icon: Vote },
  { label: "Itinerary", to: "/app/itinerary", icon: CalendarDays },
  { label: "Expenses", to: "/app/expenses", icon: DollarSign },
];

function HeaderAvatar() {
  const { profile, user } = useAuth();
  const initials = (() => {
    if (profile?.display_name) return profile.display_name.charAt(0).toUpperCase();
    if (user?.email) return user.email.charAt(0).toUpperCase();
    return "?";
  })();

  return (
    <Link
      to="/app/more"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 overflow-hidden transition-colors hover:bg-white/30"
    >
      {profile?.avatar_url ? (
        <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
      ) : (
        <span className="text-white text-sm font-semibold">{initials}</span>
      )}
    </Link>
  );
}

export function DesktopHeader() {
  const { pathname } = useLocation();
  const { data } = useGlobalDecisions();
  const pendingCount = data?.pendingCount ?? 0;

  return (
    <header
      className="hidden md:block sticky top-0 z-50 mx-4 mt-2 rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0f766e 0%, #0D9488 45%, #0891b2 100%)",
      }}
    >
      {/* Glass shine */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.04) 100%)",
        }}
      />

      {/* Row 1 — Brand + Avatar */}
      <div className="relative z-10 flex items-center justify-between h-[44px] px-6 max-w-[1200px] mx-auto">
        <div className="w-9" /> {/* spacer to center wordmark */}
        <span
          className="text-white font-bold"
          style={{ fontSize: 18, letterSpacing: "0.18em" }}
        >
          JUNTO
        </span>
        <HeaderAvatar />
      </div>

      {/* Divider */}
      <div className="h-px bg-white/10" />

      {/* Row 2 — Nav tabs */}
      <div className="relative z-10 flex items-center h-[40px] px-6 max-w-[1200px] mx-auto">
        {/* Centered tabs */}
        <nav className="flex items-center justify-center flex-1 gap-0">
          {tabs.map((tab) => {
            const isActive = pathname === tab.to || pathname.startsWith(tab.to + "/");
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`relative flex items-center gap-1.5 px-5 h-[40px] text-[13px] transition-colors ${
                  isActive
                    ? "text-white font-semibold"
                    : "text-white/60 hover:text-white/80 font-medium"
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                {tab.to === "/app/decisions" && pendingCount > 0 && (
                  <span className="ml-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white/90 px-1.5 text-[10px] font-bold text-[#0D9488]">
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
                {/* Active indicator */}
                {isActive && (
                  <span className="absolute bottom-0 left-5 right-5 h-[2px] bg-white rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

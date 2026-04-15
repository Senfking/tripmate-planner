import { Map, Vote, CalendarDays, DollarSign } from "lucide-react";
import { BetaBadge } from "@/components/BetaBadge";
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
      className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden transition-all hover:ring-2 hover:ring-white/30"
      style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}
    >
      {profile?.avatar_url ? (
        <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
      ) : (
        <span className="text-white/90 text-xs font-semibold">{initials}</span>
      )}
    </Link>
  );
}

export function DesktopHeader() {
  const { pathname } = useLocation();
  const { data } = useGlobalDecisions();
  const pendingCount = data?.pendingCount ?? 0;

  // Inside a trip detail → slim mode (no nav tabs)
  const isTripDetail = /^\/app\/trips\/[^/]+/.test(pathname) && pathname !== "/app/trips/new";

  return (
    <header
      className="hidden md:block sticky top-0 left-0 right-0 z-50"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/* Backdrop layer */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, #0a3d38 0%, #0f766e 40%, #0e7490 100%)",
        }}
      />

      {/* Subtle noise / texture overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
        }}
      />

      {/* Bottom border glow */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(94,234,212,0.25) 50%, transparent 100%)" }}
      />

      {/* Content: single row */}
      <div className="relative z-10 flex items-center h-[48px] px-6 max-w-[1400px] mx-auto gap-6">
        {/* Brand — left */}
        <Link to="/app/trips" className="flex items-center gap-2 shrink-0 group">
          <span
            className="font-bold tracking-[0.2em] text-[15px] transition-opacity group-hover:opacity-80"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #5eead4 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            JUNTO
          </span>
          <BetaBadge />
        </Link>

        {/* Nav tabs — center (hidden on trip detail) */}
        {!isTripDetail && (
          <nav className="flex items-center justify-center flex-1">
            <div className="flex items-center gap-1 rounded-full px-1 py-0.5" style={{ background: "rgba(255,255,255,0.06)" }}>
              {tabs.map((tab) => {
                const isActive = pathname === tab.to || pathname.startsWith(tab.to + "/");
                return (
                  <Link
                    key={tab.to}
                    to={tab.to}
                    className={`relative flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] transition-all duration-200 ${
                      isActive
                        ? "text-white font-semibold"
                        : "text-white/50 hover:text-white/75 font-medium"
                    }`}
                    style={isActive ? { background: "rgba(255,255,255,0.12)", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" } : {}}
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                    {tab.to === "/app/decisions" && pendingCount > 0 && (
                      <span className="ml-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-emerald-400 px-1 text-[9px] font-bold text-emerald-950">
                        {pendingCount > 99 ? "99+" : pendingCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}

        {/* Spacer when tabs hidden */}
        {isTripDetail && <div className="flex-1" />}

        {/* Avatar — right */}
        <HeaderAvatar />
      </div>
    </header>
  );
}

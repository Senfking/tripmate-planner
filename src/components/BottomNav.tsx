import { Map, Vote, CalendarDays, DollarSign, Plus, type LucideIcon } from "lucide-react";
import { NavLink as RouterNavLink, useLocation, Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useGlobalDecisions } from "@/hooks/useGlobalDecisions";

const leftTabs: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/app/trips", label: "Trips", icon: Map },
  { to: "/app/decisions", label: "Decisions", icon: Vote },
];

const rightTabs: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/app/itinerary", label: "Itinerary", icon: CalendarDays },
  { to: "/app/expenses", label: "Expenses", icon: DollarSign },
];

function NavTab({ to, label, icon: Icon, badge }: { to: string; label: string; icon: LucideIcon; badge?: number }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isActive = pathname.startsWith(to);

  const handleClick = (e: React.MouseEvent) => {
    if (isActive) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <RouterNavLink
      to={to}
      onClick={handleClick}
      className="relative flex min-w-0 flex-1 flex-col items-center justify-end pb-1 pt-2 transition-all duration-300"
    >
      <div
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 active:scale-90",
          isActive && "bg-primary/10"
        )}
      >
        <Icon
          className={cn(
            "transition-all duration-300",
            isActive ? "h-[22px] w-[22px] text-primary" : "h-5 w-5 text-muted-foreground/60"
          )}
        />
        {badge != null && badge > 0 && (
          <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#0D9488] px-1 text-[10px] font-bold text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      <span
        className={cn(
          "mt-0.5 text-[10px] font-semibold transition-colors duration-300",
          isActive ? "text-primary" : "text-muted-foreground/70"
        )}
      >
        {label}
      </span>
    </RouterNavLink>
  );
}

export function BottomNav() {
  const { data } = useGlobalDecisions();
  const pendingCount = data?.pendingCount ?? 0;

  return (
    <nav className="fixed inset-x-4 z-50 bg-transparent md:hidden" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}>
      <div
        className="relative overflow-hidden rounded-[28px]"
        style={{
          background: "rgba(255, 255, 255, 0.55)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255, 255, 255, 0.4)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.06)",
        }}
      >

        <div className="flex items-end justify-between px-3 pb-1.5 pt-1">
          {/* Left tabs */}
          {leftTabs.map((tab) => (
            <NavTab
              key={tab.to}
              {...tab}
              badge={tab.to === "/app/decisions" ? pendingCount : undefined}
            />
          ))}

          {/* Center FAB */}
          <div className="flex flex-col items-center -mt-6 px-2">
            <Link
              to="/app/trips/new"
              className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-background bg-gradient-primary text-primary-foreground shadow-lg transition-transform duration-300 active:scale-95"
            >
              <Plus className="h-7 w-7" strokeWidth={2.5} />
            </Link>
          </div>

          {/* Right tabs */}
          {rightTabs.map((tab) => (
            <NavTab key={tab.to} {...tab} />
          ))}
        </div>
      </div>
    </nav>
  );
}

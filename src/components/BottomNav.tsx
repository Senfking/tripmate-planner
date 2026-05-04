import { Map, CalendarDays, Lightbulb, DollarSign, Plus, type LucideIcon } from "lucide-react";
import { NavLink as RouterNavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useGlobalExpenses } from "@/hooks/useGlobalExpenses";

const leftTabs: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/app/trips", label: "Trips", icon: Map },
  { to: "/app/itinerary", label: "Itinerary", icon: CalendarDays },
];

const rightTabs: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/app/ideas", label: "Ideas", icon: Lightbulb },
  { to: "/app/expenses", label: "Expenses", icon: DollarSign },
];

function NavTab({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  const { pathname } = useLocation();
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
          "relative flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 active:opacity-80",
          isActive && "bg-primary/10"
        )}
      >
        <Icon
          className={cn(
            "transition-all duration-300",
            isActive ? "h-[22px] w-[22px] text-primary" : "h-5 w-5 text-muted-foreground/60"
          )}
          strokeWidth={1.5}
        />
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
  const navigate = useNavigate();

  // Prefetch global expenses so the data is ready when the user taps the Expenses tab
  useGlobalExpenses();

  return (
    <nav className="fixed inset-x-4 z-50 bg-transparent md:hidden" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}>
      <div
        className="relative overflow-hidden rounded-[28px]"
        style={{
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderTop: "1px solid rgba(255, 255, 255, 0.3)",
          boxShadow: "0 -4px 24px rgba(0, 0, 0, 0.06)",
          WebkitTransform: "translateZ(0)",
          transform: "translateZ(0)",
          WebkitBackfaceVisibility: "hidden",
          backfaceVisibility: "hidden",
          willChange: "transform",
        }}
      >

        <div className="flex items-end justify-between px-3 pb-1.5 pt-1">
          {/* Left tabs */}
          {leftTabs.map((tab) => (
            <NavTab key={tab.to} {...tab} />
          ))}

          {/* Center FAB */}
          <div className="flex flex-col items-center -mt-6 px-2">
            <button
              onClick={() => navigate("/app/trips/new")}
              className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-background bg-gradient-primary text-primary-foreground shadow-lg transition-transform duration-300 active:opacity-80"
              aria-label="Start a new trip"
            >
              <Plus className="h-7 w-7" strokeWidth={2.5} />
            </button>
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

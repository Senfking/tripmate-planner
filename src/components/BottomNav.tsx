import { Map, Vote, CalendarDays, DollarSign, MoreHorizontal, Plus, type LucideIcon } from "lucide-react";
import { NavLink as RouterNavLink, useLocation, Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const leftTabs: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/app/trips", label: "Trips", icon: Map },
  { to: "/app/decisions", label: "Decisions", icon: Vote },
];

const rightTabs: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/app/itinerary", label: "Itinerary", icon: CalendarDays },
  { to: "/app/expenses", label: "Expenses", icon: DollarSign },
];

function NavTab({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  const { pathname } = useLocation();
  const isActive = pathname.startsWith(to);

  return (
    <RouterNavLink
      to={to}
      className="relative flex min-w-0 flex-1 flex-col items-center justify-end pb-1 pt-2 transition-all duration-300"
    >
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300",
          isActive && "bg-primary/10"
        )}
      >
        <Icon
          className={cn(
            "transition-all duration-300",
            isActive ? "h-[22px] w-[22px] text-primary" : "h-5 w-5 text-muted-foreground/60"
          )}
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
  return (
    <nav className="fixed inset-x-4 bottom-4 z-50 md:hidden">
      <div className="relative rounded-[28px] border border-border/60 bg-background/95 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        {/* Subtle top accent */}
        <div className="pointer-events-none absolute inset-x-16 top-0 h-[1.5px] rounded-full bg-gradient-primary opacity-50" />

        <div className="flex items-end justify-between px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.35rem)] pt-1">
          {/* Left tabs */}
          {leftTabs.map((tab) => (
            <NavTab key={tab.to} {...tab} />
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

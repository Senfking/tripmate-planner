import { Map, Vote, CalendarDays, DollarSign, MoreHorizontal, type LucideIcon } from "lucide-react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const tabs: { to: string; label: string; icon: LucideIcon; featured?: boolean }[] = [
  { to: "/app/trips", label: "Trips", icon: Map },
  { to: "/app/decisions", label: "Decisions", icon: Vote },
  { to: "/app/itinerary", label: "Itinerary", icon: CalendarDays, featured: true },
  { to: "/app/expenses", label: "Expenses", icon: DollarSign },
  { to: "/app/more", label: "More", icon: MoreHorizontal },
];

function NavTab({ to, label, icon: Icon, featured = false }: { to: string; label: string; icon: LucideIcon; featured?: boolean }) {
  const { pathname } = useLocation();
  const isActive = pathname.startsWith(to);

  return (
    <RouterNavLink
      to={to}
      className={cn(
        "relative flex min-w-0 flex-1 flex-col items-center justify-end pb-1 pt-2 transition-all duration-300",
        featured && "-mt-5"
      )}
    >
      {!featured && (
        <div
          className={cn(
            "absolute inset-x-1 top-2 h-11 rounded-[20px] bg-primary/10 opacity-0 transition-opacity duration-300",
            isActive && "opacity-100"
          )}
        />
      )}

      <div
        className={cn(
          "relative flex items-center justify-center transition-all duration-300",
          featured
            ? "h-14 w-14 rounded-full border-4 border-background bg-gradient-primary shadow-xl"
            : isActive
              ? "h-11 w-14 rounded-[18px]"
              : "h-11 w-11 rounded-full"
        )}
      >
        <Icon
          className={cn(
            "transition-all duration-300",
            featured
              ? "h-6 w-6 text-primary-foreground"
              : isActive
                ? "h-[22px] w-[22px] text-primary"
                : "h-5 w-5 text-muted-foreground/75"
          )}
        />
      </div>
      <span
        className={cn(
          "mt-1.5 text-[10px] font-semibold transition-colors duration-300",
          featured ? "text-foreground" : isActive ? "text-primary" : "text-muted-foreground/80"
        )}
      >
        {label}
      </span>
    </RouterNavLink>
  );
}

export function BottomNav() { 
  return (
    <nav className="fixed inset-x-3 bottom-3 z-50 md:hidden">
      <div className="relative overflow-visible rounded-[30px] border border-border/70 bg-background/95 px-2 pt-2 shadow-xl backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-primary opacity-60" />

        <div className="flex items-end justify-between gap-1 pb-[calc(env(safe-area-inset-bottom,0px)+0.35rem)]">
          {tabs.map((tab) => (
            <NavTab key={tab.to} {...tab} />
          ))}
        </div>
      </div>
    </nav>
  );
}

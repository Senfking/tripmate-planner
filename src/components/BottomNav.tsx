import { Map, Vote, CalendarDays, DollarSign, MoreHorizontal } from "lucide-react";
import { NavLink } from "@/components/NavLink";

const tabs = [
  { to: "/app/trips", label: "Trips", icon: Map },
  { to: "/app/decisions", label: "Decisions", icon: Vote },
  { to: "/app/itinerary", label: "Itinerary", icon: CalendarDays },
  { to: "/app/expenses", label: "Expenses", icon: DollarSign },
  { to: "/app/more", label: "More", icon: MoreHorizontal },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      {/* Frosted glass background */}
      <div className="relative bg-white/80 backdrop-blur-xl border-t border-border/50 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        {/* Subtle top gradient accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-primary opacity-40" />

        <div className="flex h-[68px] items-end justify-around pb-2 pt-1.5">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              className="group flex flex-col items-center gap-0.5 px-3 py-1.5 text-muted-foreground/70 transition-all duration-200"
              activeClassName="text-primary"
            >
              {({ isActive }: { isActive: boolean }) => (
                <>
                  <div
                    className={`flex items-center justify-center rounded-2xl transition-all duration-200 ${
                      isActive
                        ? "bg-primary/10 w-12 h-8"
                        : "w-8 h-8 group-hover:bg-muted/50"
                    }`}
                  >
                    <Icon
                      className={`transition-all duration-200 ${
                        isActive ? "h-[22px] w-[22px]" : "h-5 w-5"
                      }`}
                    />
                  </div>
                  <span
                    className={`text-[10px] transition-all duration-200 ${
                      isActive ? "font-semibold" : "font-medium"
                    }`}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Home indicator safe area for iOS */}
        <div className="h-[env(safe-area-inset-bottom,0px)]" />
      </div>
    </nav>
  );
}

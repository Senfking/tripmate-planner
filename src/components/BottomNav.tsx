import { useState } from "react";
import { Map, Vote, CalendarDays, DollarSign, Plus, Sparkles, PenLine, type LucideIcon } from "lucide-react";
import { NavLink as RouterNavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useGlobalDecisions } from "@/hooks/useGlobalDecisions";
import { useGlobalExpenses } from "@/hooks/useGlobalExpenses";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";

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
          strokeWidth={1.5}
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
  const navigate = useNavigate();
  const [newTripOpen, setNewTripOpen] = useState(false);

  // Prefetch global expenses so the data is ready when the user taps the Expenses tab
  useGlobalExpenses();

  return (
    <>
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
              <NavTab
                key={tab.to}
                {...tab}
                badge={tab.to === "/app/decisions" ? pendingCount : undefined}
              />
            ))}

            {/* Center FAB */}
            <div className="flex flex-col items-center -mt-6 px-2">
              <button
                onClick={() => setNewTripOpen(true)}
                className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-background bg-gradient-primary text-primary-foreground shadow-lg transition-transform duration-300 active:scale-95"
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

      {/* New Trip Drawer */}
      <Drawer open={newTripOpen} onOpenChange={setNewTripOpen}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Start a new trip</DrawerTitle>
            <DrawerDescription className="sr-only">Choose how to create your trip</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-2.5">
            {/* AI option - primary */}
            <button
              onClick={() => {
                setNewTripOpen(false);
                navigate("/app/trips/new?mode=ai");
              }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-[#0D9488]/30 bg-[#0D9488]/5 hover:bg-[#0D9488]/10 transition-all active:scale-[0.98] text-left"
            >
              <div
                className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg, #0f766e 0%, #0D9488 50%, #0891b2 100%)" }}
              >
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground text-[15px]">Plan with Junto AI</p>
                <p className="text-xs text-muted-foreground mt-0.5">Describe your dream trip and get a full itinerary</p>
              </div>
            </button>

            {/* Manual option - secondary */}
            <button
              onClick={() => {
                setNewTripOpen(false);
                navigate("/app/trips/new?mode=manual");
              }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-border bg-card hover:bg-accent/50 transition-all active:scale-[0.98] text-left"
            >
              <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 bg-muted">
                <PenLine className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-[14px]">Create trip manually</p>
                <p className="text-xs text-muted-foreground mt-0.5">Set up name, dates, and details yourself</p>
              </div>
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

import { Map, Vote, CalendarDays, DollarSign, MoreHorizontal } from "lucide-react";
import { NavLink } from "@/components/NavLink";

const tabs = [
  { to: "/trips", label: "Trips", icon: Map },
  { to: "/decisions", label: "Decisions", icon: Vote },
  { to: "/itinerary", label: "Itinerary", icon: CalendarDays },
  { to: "/expenses", label: "Expenses", icon: DollarSign },
  { to: "/more", label: "More", icon: MoreHorizontal },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden">
      <div className="flex h-16 items-center justify-around">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className="flex flex-col items-center gap-0.5 px-2 py-1 text-muted-foreground transition-colors"
            activeClassName="text-primary"
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

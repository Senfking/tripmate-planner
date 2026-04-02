import { Map, Vote, CalendarDays, DollarSign, MoreHorizontal } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useGlobalDecisions } from "@/hooks/useGlobalDecisions";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Trips", url: "/app/trips", icon: Map },
  { title: "Decisions", url: "/app/decisions", icon: Vote },
  { title: "Itinerary", url: "/app/itinerary", icon: CalendarDays },
  { title: "Expenses", url: "/app/expenses", icon: DollarSign },
  { title: "More", url: "/app/more", icon: MoreHorizontal },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { data } = useGlobalDecisions();
  const pendingCount = data?.pendingCount ?? 0;

  return (
    <Sidebar collapsible="icon" className="hidden md:flex border-r border-sidebar-border">
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
          <Map className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-[15px] font-bold tracking-tight text-foreground">Junto</span>
        )}
      </div>
      <SidebarContent className="pt-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive = pathname === item.url || pathname.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        className={`relative rounded-md px-3 py-2 text-[14px] transition-colors ${
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                            : "text-sidebar-foreground hover:bg-muted/60"
                        }`}
                        activeClassName=""
                      >
                        <item.icon className="mr-2.5 h-[18px] w-[18px]" />
                        {!collapsed && <span>{item.title}</span>}
                        {item.url === "/app/decisions" && pendingCount > 0 && (
                          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                            {pendingCount > 99 ? "99+" : pendingCount}
                          </span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

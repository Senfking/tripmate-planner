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
    <Sidebar collapsible="icon" className="hidden md:flex">
      <div className="flex h-14 items-center gap-2 border-b bg-gradient-primary px-4 text-white">
        <Map className="h-6 w-6" />
        {!collapsed && <span className="text-lg font-bold">Junto</span>}
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-accent/50 relative"
                      activeClassName="bg-accent text-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                      {item.url === "/app/decisions" && pendingCount > 0 && (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0D9488] px-1.5 text-[11px] font-bold text-white">
                          {pendingCount > 99 ? "99+" : pendingCount}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

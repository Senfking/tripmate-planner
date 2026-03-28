import { Map, Vote, CalendarDays, DollarSign, MoreHorizontal } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
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
  { title: "Trips", url: "/trips", icon: Map },
  { title: "Decisions", url: "/decisions", icon: Vote },
  { title: "Itinerary", url: "/itinerary", icon: CalendarDays },
  { title: "Expenses", url: "/expenses", icon: DollarSign },
  { title: "More", url: "/more", icon: MoreHorizontal },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon" className="hidden md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <Map className="h-6 w-6 text-primary" />
        {!collapsed && <span className="text-lg font-bold text-primary">TripCrew</span>}
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
                      className="hover:bg-accent/50"
                      activeClassName="bg-accent text-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
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

import { Outlet, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { Map, UserCircle } from "lucide-react";

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          {/* Header */}
          <header className="sticky top-0 z-40 flex h-16 items-center border-b bg-gradient-primary px-4 text-white">
            <SidebarTrigger className="hidden md:inline-flex text-white" />

            <div className="absolute left-1/2 flex -translate-x-1/2 items-center justify-center pointer-events-none md:hidden">
              <div className="flex items-center gap-2.5">
                <Map className="h-6 w-6" />
                <span className="text-xl font-bold tracking-tight">Junto</span>
              </div>
            </div>

            <Link to="/app/more" className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/30">
              <UserCircle className="h-5 w-5" />
            </Link>
          </header>

          {/* Page content */}
          <main className="flex-1 pb-24 md:pb-0">
            <div className="animate-fade-in">
              <Outlet />
            </div>
          </main>
        </div>

        <BottomNav />
        <InstallPrompt />
      </div>
    </SidebarProvider>
  );
}

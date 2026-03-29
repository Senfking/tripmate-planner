import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { useAuth } from "@/contexts/AuthContext";
import { Map } from "lucide-react";

export function AppLayout() {
  const { profile } = useAuth();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          {/* Header */}
          <header className="sticky top-0 z-40 flex h-14 items-center border-b bg-gradient-primary px-4 text-white">
            <SidebarTrigger className="hidden md:inline-flex text-white" />

            {/* Centered logo — absolute so it stays centered regardless of left/right content */}
            <div className="absolute inset-x-0 flex items-center justify-center pointer-events-none md:hidden">
              <div className="flex items-center gap-2">
                <Map className="h-6 w-6" />
                <span className="text-lg font-bold tracking-tight">Junto</span>
              </div>
            </div>

            {profile?.display_name && (
              <span className="ml-auto text-sm font-medium opacity-90 truncate max-w-[140px]">
                {profile.display_name}
              </span>
            )}
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

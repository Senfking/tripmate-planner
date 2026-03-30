import { Outlet, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { UserCircle } from "lucide-react";

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0 overflow-x-hidden">
          {/* Header */}
          <header className="sticky top-0 z-40 flex h-[52px] items-center border-b bg-gradient-primary px-4 text-white relative overflow-hidden">
            {/* Diagonal shine */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.07) 50%, transparent 60%)",
              }}
            />

            <SidebarTrigger className="hidden md:inline-flex text-white relative z-10" />

            <div className="absolute left-1/2 flex -translate-x-1/2 items-center justify-center pointer-events-none md:hidden">
              <span
                className="text-white font-bold"
                style={{ fontSize: 18, letterSpacing: "0.18em" }}
              >
                JUNTO
              </span>
            </div>

            <Link
              to="/app/more"
              className="ml-auto relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/30"
            >
              <UserCircle className="h-[22px] w-[22px] text-white" />
            </Link>
          </header>

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0 overflow-x-hidden">
          {/* Header */}
          <header className="sticky top-0 z-40 flex h-[52px] items-center border-b bg-gradient-primary px-4 text-white relative overflow-hidden">
            {/* Diagonal shine */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.07) 50%, transparent 60%)",
              }}
            />

            <SidebarTrigger className="hidden md:inline-flex text-white relative z-10" />

            <div className="absolute left-1/2 flex -translate-x-1/2 items-center justify-center pointer-events-none md:hidden">
              <span
                className="text-white font-bold"
                style={{ fontSize: 18, letterSpacing: "0.18em" }}
              >
                JUNTO
              </span>
            </div>

            <ProfileButton />
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

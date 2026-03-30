import { Outlet, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { UserCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

function ProfileButton() {
  const { profile } = useAuth();
  const initial = profile?.display_name?.charAt(0)?.toUpperCase();

  return (
    <Link
      to="/app/more"
      className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/30"
    >
      {initial ? (
        <span className="text-sm font-semibold text-white" style={{ fontSize: 14 }}>
          {initial}
        </span>
      ) : (
        <UserCircle className="h-5 w-5" />
      )}
    </Link>
  );
}

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

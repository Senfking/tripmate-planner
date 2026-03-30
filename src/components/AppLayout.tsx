import { useState, useEffect } from "react";
import { Outlet, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { UserCircle } from "lucide-react";

function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      setShowBackOnline(true);
      setTimeout(() => setShowBackOnline(false), 2000);
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!isOffline && !showBackOnline) return null;

  return (
    <div
      className="w-full text-center text-[13px] text-white py-1.5 transition-all duration-300"
      style={{ backgroundColor: "#1e293b" }}
    >
      {isOffline ? "You're offline — showing cached content" : "Back online"}
    </div>
  );
}

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0 overflow-x-hidden">
          {/* Header */}
          <header className="sticky top-0 z-40 flex h-[52px] items-center border-b bg-gradient-primary px-4 text-white relative overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
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

          <OfflineBanner />

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

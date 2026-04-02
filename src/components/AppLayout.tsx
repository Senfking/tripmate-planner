import { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useAuth } from "@/contexts/AuthContext";

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

function HeaderAvatar() {
  const { profile, user } = useAuth();

  const initials = (() => {
    if (profile?.display_name) return profile.display_name.charAt(0).toUpperCase();
    if (user?.email) return user.email.charAt(0).toUpperCase();
    return "?";
  })();

  return (
    <Link
      to="/app/more"
      className="ml-auto relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/30 overflow-hidden"
    >
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt="Profile"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-white text-sm font-semibold">{initials}</span>
      )}
    </Link>
  );
}

export function AppLayout() {
  const location = useLocation();

  // Global tabs use their own TabHeroHeader — hide the app header
  const globalTabPaths = ["/app/trips", "/app/trips/new", "/app/decisions", "/app/itinerary", "/app/expenses"];
  const hideHeader = globalTabPaths.includes(location.pathname) || location.pathname === "/app/more";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0 overflow-x-hidden md:bg-muted/30">
          {!hideHeader && (
            <header
              className="sticky top-0 z-40 flex h-[52px] items-center px-4 text-white relative overflow-hidden border-b bg-gradient-primary"
              style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
            >
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

              <HeaderAvatar />
            </header>
          )}

          <OfflineBanner />

          <main className="flex-1 pb-24 md:pb-0">
            <PullToRefresh>
              <div className="animate-fade-in w-full max-w-[860px] mx-auto">
                <Outlet />
              </div>
            </PullToRefresh>
          </main>
        </div>

        <BottomNav />
        <InstallPrompt />
      </div>
    </SidebarProvider>
  );
}

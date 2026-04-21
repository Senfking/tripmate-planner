import { useEffect, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";
import ScrollToTop from "@/components/ScrollToTop";
import { Loader2 } from "lucide-react";

// Eagerly loaded (critical path)
import AuthCallback from "./pages/AuthCallback";

// Lazy loaded routes
const TripList = lazy(() => import("./pages/TripList"));
const TripNew = lazy(() => import("./pages/TripNew"));
const TripOnboarding = lazy(() => import("./pages/TripOnboarding"));
const TripHome = lazy(() => import("./pages/TripHome"));
const TripSection = lazy(() => import("./pages/TripSection"));
const AIPlan = lazy(() => import("./pages/AIPlan"));
const Decisions = lazy(() => import("./pages/Decisions"));
const Itinerary = lazy(() => import("./pages/Itinerary"));
const Ideas = lazy(() => import("./pages/Ideas"));
const Expenses = lazy(() => import("./pages/Expenses"));
const More = lazy(() => import("./pages/More"));
const InviteRedeem = lazy(() => import("./pages/InviteRedeem"));
const JoinByCode = lazy(() => import("./pages/JoinByCode"));
const ShareView = lazy(() => import("./pages/ShareView"));
const ReferralLanding = lazy(() => import("./pages/ReferralLanding"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminAIErrors = lazy(() => import("./pages/AdminAIErrors"));
const Templates = lazy(() => import("./pages/Templates"));
const TemplateDetail = lazy(() => import("./pages/TemplateDetail"));
const Landing = lazy(() => import("./pages/Landing"));
const DesignSystem = lazy(() => import("./pages/DesignSystem"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

function PageLoader() {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 2, // 2 min default
      throwOnError: false,
    },
    mutations: {
      retry: 0,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      trackEvent("app_error", {
        type: "query_error",
        message: error.message,
        query_key: JSON.stringify(query.queryKey).slice(0, 100),
        route: window.location.pathname,
        severity: "medium",
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      trackEvent("app_error", {
        type: "mutation_error",
        message: error.message,
        mutation_key: JSON.stringify(mutation.options.mutationKey || "unknown").slice(0, 100),
        route: window.location.pathname,
        severity: "medium",
      });
    },
  }),
});

/** Pre-warm exchange rate cache after auth is ready. */
function ExchangeRatePrefetch() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    // Only prefetch after auth - firing before risks caching empty {} for
    // 1 hour if the table has RLS or the request fails without a valid JWT.
    // Key on userId (string), not user (object) — a stable identity shouldn't
    // retrigger this effect when the User reference changes on TOKEN_REFRESHED.
    if (!userId) return;

    qc.prefetchQuery({
      queryKey: ["exchange-rates", "EUR"],
      queryFn: async (): Promise<Record<string, number>> => {
        const { data } = await supabase
          .from("exchange_rate_cache")
          .select("rates")
          .eq("base_currency", "EUR")
          .maybeSingle();
        if (data?.rates && typeof data.rates === "object") {
          return data.rates as Record<string, number>;
        }
        return {};
      },
      staleTime: 1000 * 60 * 60,
    });
  }, [qc, userId]);

  return null;
}

function AppInner() {

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
          <ExchangeRatePrefetch />
          <ErrorBoundaryWithUser>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Navigate to="/ref" replace />} />
            <Route path="/signup" element={<Navigate to="/ref" replace />} />
            <Route path="/share/:token" element={<ShareView />} />
            <Route path="/app/invite/:token" element={<InviteRedeem />} />
            <Route path="/i/:token" element={<InviteRedeem />} />
            <Route path="/join" element={<JoinByCode />} />
            <Route path="/join/:code" element={<JoinByCode />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/ref" element={<ReferralLanding />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/design-system" element={<DesignSystem />} />
            <Route path="/templates/:slug" element={<TemplateDetail />} />
            
            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/app/admin" element={<Admin />} />
              <Route path="/app/admin/ai-errors" element={<AdminAIErrors />} />
              <Route element={<AppLayout />}>
                <Route path="/app/trips" element={<TripList />} />
                <Route path="/app/trips/new" element={<TripNew />} />
                <Route path="/app/trips/:tripId" element={<TripHome />} />
                <Route path="/app/trips/:tripId/onboarding" element={<TripOnboarding />} />
                <Route path="/app/trips/:tripId/ai-plan/:planId" element={<AIPlan />} />
                <Route path="/app/trips/:tripId/:section" element={<TripSection />} />
                <Route path="/app/decisions" element={<Decisions />} />
                <Route path="/app/itinerary" element={<Itinerary />} />
                <Route path="/app/ideas" element={<Ideas />} />
                <Route path="/app/expenses" element={<Expenses />} />
                <Route path="/app/more" element={<More />} />
              </Route>
            </Route>

            {/* Redirects */}
            <Route path="/" element={<RootRoute />} />
            <Route path="/app" element={<Navigate to="/app/trips" replace />} />
            <Route path="/trips" element={<Navigate to="/app/trips" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </ErrorBoundaryWithUser>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  );
}

function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to="/app/trips" replace />;
  // Show landing page for unauthenticated users
  return <LandingPage />;
}

// Lazy wrapper for Landing to avoid circular deps
function LandingPage() {
  const LandingComp = Landing;
  return <LandingComp />;
}

function ErrorBoundaryWithUser({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <ErrorBoundary userId={user?.id}>{children}</ErrorBoundary>;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;

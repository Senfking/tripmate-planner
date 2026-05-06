import { useEffect, lazy, Suspense } from "react";
import { QueryClient, QueryCache, MutationCache, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
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
import { pushError } from "@/lib/errorBuffer";
import { captureSupabaseFailure } from "@/lib/sentry";
import ScrollToTop from "@/components/ScrollToTop";
import { Loader2 } from "lucide-react";

// Eagerly loaded (critical path)
import AuthCallback from "./pages/AuthCallback";

// Lazy loaded routes
const TripList = lazy(() => import("./pages/TripList"));
// TripNew (lazy import) removed: /app/trips/new now redirects to /trips/new (PublicTripBuilder).
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
const AnonItineraryView = lazy(() => import("./pages/AnonItineraryView"));
const ReferralLanding = lazy(() => import("./pages/ReferralLanding"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminAIErrors = lazy(() => import("./pages/AdminAIErrors"));
const AdminTemplates = lazy(() => import("./pages/AdminTemplates"));
const Templates = lazy(() => import("./pages/Templates"));
const TemplateDetail = lazy(() => import("./pages/TemplateDetail"));
const TemplatePersonalize = lazy(() => import("./pages/TemplatePersonalize"));
const Landing = lazy(() => import("./pages/Landing"));
const PublicLanding = lazy(() => import("./pages/PublicLanding"));
const PublicTripBuilder = lazy(() => import("./pages/PublicTripBuilder"));
const AnonTripView = lazy(() => import("./pages/AnonTripView"));
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
      // Hold cached data for 24h so an offline cold start has something to
      // render. React Query GCs entries after gcTime; we want them to survive
      // long tab closures so the persister can rehydrate them.
      gcTime: 1000 * 60 * 60 * 24,
      throwOnError: false,
    },
    mutations: {
      retry: 0,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      const queryKey = JSON.stringify(query.queryKey).slice(0, 100);
      trackEvent("app_error", {
        type: "query_error",
        message: error.message,
        query_key: queryKey,
        route: window.location.pathname,
        severity: "medium",
      });
      pushError({
        source: "query_cache",
        name: queryKey,
        message: error.message?.slice(0, 300) ?? null,
        route: window.location.pathname,
      });
    },
  }),
  mutationCache: new MutationCache({
    // Catch-all logger for any mutation that ISN'T already wrapped in
    // withAuthRetry (which has its own richer log via supabase_op_error).
    // Captures the full Postgres/PostgREST error shape so we can diagnose
    // failures from analytics_events without console access.
    onError: (error, _variables, _context, mutation) => {
      const e = error as unknown as Record<string, unknown> | null;
      const code = typeof e?.code === "string" ? e.code : null;
      const status = typeof e?.status === "number" ? e.status : null;
      const message = typeof e?.message === "string" ? e.message.slice(0, 300) : null;
      const mutation_key = JSON.stringify(mutation.options.mutationKey || "unknown").slice(0, 100);
      trackEvent("app_error", {
        type: "mutation_error",
        mutation_key,
        route: window.location.pathname,
        severity: "medium",
        code,
        status,
        name: typeof e?.name === "string" ? e.name : null,
        message,
        details: typeof e?.details === "string" ? e.details.slice(0, 300) : null,
        hint: typeof e?.hint === "string" ? e.hint.slice(0, 200) : null,
        online: typeof navigator !== "undefined" ? navigator.onLine : null,
        display_mode:
          typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches
            ? "standalone"
            : "browser",
      });
      pushError({
        source: "mutation_cache",
        name: mutation_key,
        message,
        code,
        status,
        route: window.location.pathname,
      });
      captureSupabaseFailure(error, {
        op: `mutation:${mutation_key}`,
        code,
        status,
        name: typeof e?.name === "string" ? e.name : null,
        message,
        details: typeof e?.details === "string" ? e.details.slice(0, 300) : null,
        hint: typeof e?.hint === "string" ? e.hint.slice(0, 200) : null,
        mutation_key,
      });
    },
  }),
});

// localStorage persister — survives reloads and offline cold starts.
// Bumping `buster` invalidates all stored entries on app upgrade.
const persister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
  key: "junto-rq-cache-v1",
  throttleTime: 1000,
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
            <Route path="/share/:token/itinerary" element={<AnonItineraryView />} />
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
            <Route path="/templates/:slug/personalize" element={<TemplatePersonalize />} />

            {/* /trips/new is reachable by everyone, but logged-in visitors
                see it wrapped in the app shell so the sidebar/header stay
                consistent with the rest of the authenticated app. */}
            <Route path="/trips/new" element={<TripsNewRoute />} />
            <Route path="/trips/anon/:id" element={<AnonTripView />} />
            
            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/app/admin" element={<Admin />} />
              <Route path="/app/admin/ai-errors" element={<AdminAIErrors />} />
              <Route path="/app/admin/templates" element={<AdminTemplates />} />
              <Route element={<AppLayout />}>
                <Route path="/app/trips" element={<TripList />} />
                <Route path="/app/trips/new" element={<Navigate to="/trips/new" replace />} />
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
            <Route path="/landing-old" element={<Landing />} />
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
  // Installed PWA users skip the marketing landing and go straight to login.
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);
  if (isStandalone) return <Navigate to="/ref" replace />;
  // Unauthenticated visitors land on the Hero-led public landing.
  return <PublicLanding />;
}

/**
 * /trips/new gateway: anonymous visitors see the standalone PublicTripBuilder
 * (atmospheric public-variant Hero, no app shell). Authenticated users see
 * the same page rendered inside AppLayout so sidebar + headers match the
 * rest of the app.
 */
function TripsNewRoute() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <PublicTripBuilder />;
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<PublicTripBuilder />} />
      </Route>
    </Routes>
  );
}

function ErrorBoundaryWithUser({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <ErrorBoundary userId={user?.id}>{children}</ErrorBoundary>;
}

const App = () => (
  <ErrorBoundary>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24, // 24h
        buster: "v2",
        dehydrateOptions: {
          // Don't persist failed/empty queries — they'd just rehydrate to nothing.
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" && query.state.data !== undefined,
        },
      }}
    >
      <AppInner />
    </PersistQueryClientProvider>
  </ErrorBoundary>
);

export default App;

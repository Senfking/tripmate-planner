import { useEffect } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import TripList from "./pages/TripList";
import TripNew from "./pages/TripNew";
import TripOnboarding from "./pages/TripOnboarding";
import TripHome from "./pages/TripHome";
import TripSection from "./pages/TripSection";
import Decisions from "./pages/Decisions";
import Itinerary from "./pages/Itinerary";
import Expenses from "./pages/Expenses";
import More from "./pages/More";
import InviteRedeem from "./pages/InviteRedeem";
import JoinByCode from "./pages/JoinByCode";
import ShareView from "./pages/ShareView";
import AuthCallback from "./pages/AuthCallback";
import ReferralLanding from "./pages/ReferralLanding";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";

const queryClient = new QueryClient();

function AppInner() {
  const qc = useQueryClient();

  useEffect(() => {
    // Pre-warm the EUR exchange rate cache on app startup.
    // Must return Record<string, number> to match the shape expected by
    // useExpenses and useGlobalExpenses via qc.fetchQuery(["exchange-rates", "EUR"]).
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
  }, [qc]);

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/share/:token" element={<ShareView />} />
            <Route path="/app/invite/:token" element={<InviteRedeem />} />
            <Route path="/i/:token" element={<InviteRedeem />} />
            <Route path="/join" element={<JoinByCode />} />
            <Route path="/join/:code" element={<JoinByCode />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/ref" element={<ReferralLanding />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/app/trips" element={<TripList />} />
                <Route path="/app/trips/new" element={<TripNew />} />
                <Route path="/app/trips/:tripId" element={<TripHome />} />
                <Route path="/app/trips/:tripId/onboarding" element={<TripOnboarding />} />
                <Route path="/app/trips/:tripId/:section" element={<TripSection />} />
                <Route path="/app/decisions" element={<Decisions />} />
                <Route path="/app/itinerary" element={<Itinerary />} />
                <Route path="/app/expenses" element={<Expenses />} />
                <Route path="/app/more" element={<More />} />
              </Route>
            </Route>

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/app/trips" replace />} />
            <Route path="/trips" element={<Navigate to="/app/trips" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppInner />
  </QueryClientProvider>
);

export default App;

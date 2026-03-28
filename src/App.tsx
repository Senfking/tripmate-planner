import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import TripList from "./pages/TripList";
import TripNew from "./pages/TripNew";
import TripHome from "./pages/TripHome";
import Decisions from "./pages/Decisions";
import Itinerary from "./pages/Itinerary";
import Expenses from "./pages/Expenses";
import More from "./pages/More";
import InviteRedeem from "./pages/InviteRedeem";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/share/:token" element={<div>Share placeholder</div>} />
            <Route path="/app/invite/:token" element={<InviteRedeem />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/app/trips" element={<TripList />} />
                <Route path="/app/trips/new" element={<TripNew />} />
                <Route path="/app/decisions" element={<Decisions />} />
                <Route path="/app/itinerary" element={<Itinerary />} />
                <Route path="/app/expenses" element={<Expenses />} />
                <Route path="/app/more" element={<More />} />
              </Route>
              {/* TripHome without AppLayout bottom nav */}
              <Route path="/app/trips/:tripId" element={<TripHome />} />
            </Route>

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/app/trips" replace />} />
            <Route path="/trips" element={<Navigate to="/app/trips" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

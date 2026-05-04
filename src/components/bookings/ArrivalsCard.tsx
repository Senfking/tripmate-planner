import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Plane, ArrowRight } from "lucide-react";
import { ArrivalsSection } from "./ArrivalsSection";
import type { AttachmentRow } from "@/hooks/useAttachments";

interface Props {
  tripId: string;
}

export function ArrivalsCard({ tripId }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: flightAttachments } = useQuery({
    queryKey: ["flight-arrivals", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attachments")
        .select("*, profiles(display_name)")
        .eq("trip_id", tripId)
        .eq("type", "flight")
        .not("booking_data", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as AttachmentRow[];
    },
    enabled: !!user,
  });

  if (!flightAttachments || flightAttachments.length === 0) return null;

  const hasFlightData = flightAttachments.some((a) => {
    const bd = a.booking_data as Record<string, unknown> | null;
    return bd?.destination || bd?.departure;
  });

  if (!hasFlightData) return null;

  return (
    <button
      onClick={() => navigate(`/app/trips/${tripId}/bookings`)}
      className="w-full text-left rounded-2xl border bg-card p-4 space-y-2 transition-all active:opacity-80 hover:shadow-md"
    >
      <div className="flex items-center gap-2">
        <Plane className="h-4 w-4 text-[#0D9488]" />
        <span className="text-sm font-semibold flex-1">Flights</span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <ArrivalsSection attachments={flightAttachments} compact />
    </button>
  );
}

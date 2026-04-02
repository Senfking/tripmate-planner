import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CurrencyPicker } from "@/components/expenses/CurrencyPicker";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { ChevronLeft, CheckSquare, Map, Receipt, FileText, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

const TOTAL_STEPS = 4;

export default function TripOnboarding() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  const { data: trip, isLoading } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("name, emoji, trip_code, settlement_currency")
        .eq("id", tripId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!tripId,
  });

  // Step 2 state
  const [currency, setCurrency] = useState("EUR");
  const [destination, setDestination] = useState("");

  // Step 3 state
  const [modules, setModules] = useState({
    decisions: true,
    itinerary: true,
    expenses: true,
    bookings: true,
  });

  useEffect(() => {
    if (trip?.settlement_currency) setCurrency(trip.settlement_currency);
  }, [trip?.settlement_currency]);

  const goNext = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const goBack = () => setStep((s) => Math.max(s - 1, 1));

  const saveStep2 = async () => {
    const updates: Record<string, any> = { settlement_currency: currency };
    if (destination.trim()) updates.destination = destination.trim();
    await supabase.from("trips").update(updates as any).eq("id", tripId!);
    goNext();
  };

  const saveStep3 = async () => {
    await supabase
      .from("trips")
      .update({ enabled_modules: modules } as any)
      .eq("id", tripId!);
    goNext();
  };

  const joinUrl = `https://junto.pro/join/${trip?.trip_code}`;

  const copyCode = () => {
    navigator.clipboard.writeText(joinUrl);
    toast.success("Code copied!");
  };

  const shareWhatsApp = () => {
    const text = `Hey! I created a trip on Junto 🌍\nJoin with code ${trip?.trip_code} or tap here:\n${joinUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  if (isLoading || !trip) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-[#0D9488]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center px-4 pt-4 pb-2">
        {step > 1 ? (
          <button onClick={goBack} className="p-1 -ml-1">
            <ChevronLeft className="h-5 w-5 text-foreground" />
          </button>
        ) : (
          <div className="w-7" />
        )}
        <div className="flex-1 flex justify-center gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full transition-colors ${
                i + 1 === step ? "bg-[#0D9488]" : "border border-muted-foreground/30"
              }`}
            />
          ))}
        </div>
        <div className="w-7" />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-5 pb-6 max-w-lg mx-auto w-full">
        {step === 1 && <Step1 trip={trip} copyCode={copyCode} shareWhatsApp={shareWhatsApp} joinUrl={joinUrl} />}
        {step === 2 && <Step2 currency={currency} setCurrency={setCurrency} destination={destination} setDestination={setDestination} />}
        {step === 3 && <Step3 modules={modules} setModules={setModules} />}
        {step === 4 && <Step4 trip={trip} />}

        <div className={step === 1 ? "pt-8" : "mt-auto pt-6"}>
          {step === 1 && (
            <>
              <Button
                className="w-full h-12 rounded-xl text-[15px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #0f766e 0%, #0D9488 50%, #0891b2 100%)" }}
                onClick={goNext}
              >
                Next →
              </Button>
              <button onClick={goNext} className="w-full text-center text-sm text-muted-foreground mt-3 bg-transparent border-none cursor-pointer">
                I'll invite them later
              </button>
            </>
          )}
          {step === 2 && (
            <Button
              className="w-full h-12 rounded-xl text-[15px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #0f766e 0%, #0D9488 50%, #0891b2 100%)" }}
              onClick={saveStep2}
            >
              Next →
            </Button>
          )}
          {step === 3 && (
            <Button
              className="w-full h-12 rounded-xl text-[15px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #0f766e 0%, #0D9488 50%, #0891b2 100%)" }}
              onClick={saveStep3}
            >
              Next →
            </Button>
          )}
          {step === 4 && (
            <Button
              className="w-full h-12 rounded-xl text-[15px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #0f766e 0%, #0D9488 50%, #0891b2 100%)" }}
              onClick={() => navigate(`/app/trips/${tripId}`)}
            >
              Let's go →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Step Components ─── */

function Step1({ trip, copyCode, shareWhatsApp, joinUrl }: {
  trip: { name: string; emoji: string | null; trip_code: string };
  copyCode: () => void;
  shareWhatsApp: () => void;
  joinUrl: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <p className="text-4xl mt-4">{trip.emoji || "✈️"}</p>
      <p className="text-xl font-bold mt-2 text-center">{trip.name}</p>

      <h2 className="text-[22px] font-bold mt-6">Invite your crew</h2>
      <p className="text-sm text-muted-foreground mt-1">Share the code so friends can join</p>

      <button
        onClick={copyCode}
        className="mt-6 w-full bg-[#0D9488]/[0.08] rounded-2xl py-4 px-6 text-center cursor-pointer border-none"
      >
        <span className="text-[36px] font-bold tracking-[0.2em] text-[#0D9488]">{trip.trip_code}</span>
        <p className="text-xs text-muted-foreground mt-1">Tap to copy</p>
      </button>

      <div className="w-full mt-6 space-y-3">
        <Button
          className="w-full h-12 rounded-xl text-[15px] font-semibold text-white gap-2"
          style={{ background: "#25D366" }}
          onClick={shareWhatsApp}
        >
          <WhatsAppIcon className="h-5 w-5" />
          Share via WhatsApp
        </Button>
        <Button
          variant="outline"
          className="w-full h-12 rounded-xl text-[15px] font-semibold gap-2"
          style={{ color: "#0D9488", borderColor: "#0D9488" }}
          onClick={() => {
            navigator.clipboard.writeText(joinUrl);
            toast.success("Link copied!");
          }}
        >
          <Copy className="h-4 w-4" />
          Copy invite link
        </Button>
      </div>
    </div>
  );
}

function Step2({ currency, setCurrency, destination, setDestination }: {
  currency: string;
  setCurrency: (v: string) => void;
  destination: string;
  setDestination: (v: string) => void;
}) {
  return (
    <div>
      <h2 className="text-[22px] font-bold mt-4">A few quick settings</h2>
      <p className="text-sm text-muted-foreground mt-1">You can change these any time</p>

      <div className="mt-6 space-y-6">
        <div className="space-y-2">
          <Label className="text-[13px] font-semibold">Settlement currency</Label>
          <p className="text-xs text-muted-foreground">Expenses will be totalled in this currency</p>
          <CurrencyPicker value={currency} onChange={setCurrency} />
        </div>

        <div className="space-y-2">
          <Label className="text-[13px] font-semibold">Where are you going?</Label>
          <p className="text-xs text-muted-foreground">Helps personalise your trip</p>
          <Input
            placeholder="e.g. Bangkok, Bali, Ibiza"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>
      </div>
    </div>
  );
}

const MODULE_DEFS = [
  { key: "decisions" as const, icon: CheckSquare, name: "Decisions & Polls", desc: "Vote on options and make group decisions" },
  { key: "itinerary" as const, icon: Map, name: "Itinerary", desc: "Plan your day-by-day schedule together" },
  { key: "expenses" as const, icon: Receipt, name: "Expenses", desc: "Track costs and split them fairly" },
  { key: "bookings" as const, icon: FileText, name: "Bookings & Docs", desc: "Store flights, hotels, visas and more" },
];

function Step3({ modules, setModules }: {
  modules: { decisions: boolean; itinerary: boolean; expenses: boolean; bookings: boolean };
  setModules: (m: { decisions: boolean; itinerary: boolean; expenses: boolean; bookings: boolean }) => void;
}) {
  return (
    <div>
      <h2 className="text-[22px] font-bold mt-4">What does this trip need?</h2>
      <p className="text-sm text-muted-foreground mt-1">Turn off anything you don't need — you can change this later in Admin</p>

      <div className="mt-6">
        {MODULE_DEFS.map((mod, i) => (
          <div key={mod.key}>
            {i > 0 && <Separator />}
            <div className="flex items-center gap-3 py-4">
              <mod.icon className="h-5 w-5 text-[#0D9488] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{mod.name}</p>
                <p className="text-xs text-muted-foreground">{mod.desc}</p>
              </div>
              <Switch
                checked={modules[mod.key]}
                onCheckedChange={(v) => setModules({ ...modules, [mod.key]: v })}
                className="data-[state=checked]:bg-[#0D9488]"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Step4({ trip }: { trip: { name: string; emoji: string | null; trip_code: string } }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <p className="text-6xl">{trip.emoji || "✈️"}</p>
      <h2 className="text-[26px] font-bold mt-4">You're all set!</h2>
      <p className="text-lg mt-1" style={{ color: "#0D9488" }}>{trip.name}</p>

      <Separator className="mt-6 w-full" />

      <div className="mt-6">
        <p className="text-xs text-muted-foreground">Your invite code</p>
        <p className="text-[22px] font-bold tracking-[0.15em] text-[#0D9488] mt-1">{trip.trip_code}</p>
      </div>
    </div>
  );
}

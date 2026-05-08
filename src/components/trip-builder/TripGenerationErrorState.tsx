import { Compass, RefreshCw, Clock, MapPin, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export type TripGenErrorKind =
  | "unknown_destination"
  | "thin_pool"
  | "rate_limited"
  | "timeout"
  | "generic";

interface Props {
  kind: TripGenErrorKind;
  /** Original user-typed destination, if any — used in copy. */
  destinationInput?: string | null;
  /** Override the message (e.g. server-provided rate-limit time remaining). */
  message?: string | null;
  onTryAgain?: () => void;
  onChangeDestination?: () => void;
}

interface Spec {
  Icon: typeof Compass;
  heading: string;
  body: (input: string) => string;
  primaryLabel: string;
  primaryAction: "retry" | "change";
  secondaryLabel?: string;
}

const SPECS: Record<TripGenErrorKind, Spec> = {
  unknown_destination: {
    Icon: Compass,
    heading: "We couldn't find that destination",
    body: (input) =>
      input
        ? `We couldn't find “${input}”. Try being more specific — e.g. “Tokyo, Japan” or “Paris, France”.`
        : "Try being more specific — e.g. “Tokyo, Japan” or “Paris, France”.",
    primaryLabel: "Try a different destination",
    primaryAction: "change",
  },
  thin_pool: {
    Icon: MapPin,
    heading: "Not enough places to plan a trip here",
    body: (input) =>
      input
        ? `We had trouble finding enough places for ${input}. Try being more specific (a city instead of a region) or pick a different destination.`
        : "We had trouble finding enough places. Try a more specific city, or pick a different destination.",
    primaryLabel: "Try again",
    primaryAction: "retry",
    secondaryLabel: "Change destination",
  },
  rate_limited: {
    Icon: Clock,
    heading: "You've hit the trip limit",
    body: () => "You've reached the trip-generation limit for this hour. Give it a few minutes and try again.",
    primaryLabel: "OK",
    primaryAction: "change",
  },
  timeout: {
    Icon: Clock,
    heading: "That took too long",
    body: () => "Junto AI took longer than expected to plan this one. Try a shorter trip or a more specific destination.",
    primaryLabel: "Try again",
    primaryAction: "retry",
    secondaryLabel: "Change destination",
  },
  generic: {
    Icon: AlertTriangle,
    heading: "Something went wrong",
    body: () => "Something went wrong building this trip. That's on us — give it another try?",
    primaryLabel: "Try again",
    primaryAction: "retry",
    secondaryLabel: "Start over",
  },
};

/** Map server `step` / `code` / message to a friendly error kind. */
export function classifyTripGenError(opts: {
  step?: string | null;
  code?: string | null;
  message?: string | null;
}): TripGenErrorKind {
  const { step, code, message } = opts;
  if (code === "rate_limited") return "rate_limited";
  if (step === "geocodeDestination" || step === "parseIntent") return "unknown_destination";
  if (step === "thin_pool") return "thin_pool";
  if (step === "timeout") return "timeout";
  const m = (message ?? "").toLowerCase();
  if (/couldn'?t find|could not resolve|unknown destination/.test(m)) return "unknown_destination";
  if (/pool too thin|not enough places|0 activities/.test(m)) return "thin_pool";
  if (/took too long|timeout|timed out/.test(m)) return "timeout";
  if (/rate.?limit|too many|429/.test(m)) return "rate_limited";
  return "generic";
}

export function TripGenerationErrorState({
  kind,
  destinationInput,
  message,
  onTryAgain,
  onChangeDestination,
}: Props) {
  const spec = SPECS[kind];
  const { Icon } = spec;
  const body = message ?? spec.body(destinationInput ?? "");

  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card shadow-xl p-7 text-center space-y-5 animate-fade-in">
        <div
          className="mx-auto h-12 w-12 rounded-full flex items-center justify-center"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Icon className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground leading-tight">{spec.heading}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <Button
            onClick={spec.primaryAction === "retry" ? onTryAgain : onChangeDestination}
            className="w-full h-11 rounded-xl font-semibold text-primary-foreground gap-2"
            style={{ background: "var(--gradient-primary)" }}
          >
            {spec.primaryAction === "retry" && <RefreshCw className="h-4 w-4" />}
            {spec.primaryLabel}
          </Button>
          {spec.secondaryLabel && (
            <Button
              variant="ghost"
              onClick={spec.primaryAction === "retry" ? onChangeDestination : onTryAgain}
              className="w-full h-10 rounded-xl text-sm text-muted-foreground"
            >
              {spec.secondaryLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

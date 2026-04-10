import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  destination: string;
  error: string | null;
  onRetry: () => void;
};

const BASE_MESSAGES = [
  "Building your day-by-day plan...",
  "Checking restaurant reviews...",
  "Finding hidden gems...",
  "Almost ready...",
];

export function GeneratingScreen({ destination, error, onRetry }: Props) {
  const [msgIdx, setMsgIdx] = useState(0);

  const messages = destination
    ? [`Finding the best spots in ${destination}...`, ...BASE_MESSAGES]
    : BASE_MESSAGES;

  useEffect(() => {
    if (error) return;
    const timer = setInterval(() => {
      setMsgIdx((i) => (i + 1) % messages.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [error, messages.length]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8 text-center">
        <div className="text-4xl mb-4">😔</div>
        <h3 className="text-xl font-bold text-foreground mb-2">Something went wrong</h3>
        <p className="text-sm text-muted-foreground mb-6">{error}</p>
        <Button
          onClick={onRetry}
          className="h-12 px-8 rounded-xl font-semibold text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          Try again ✨
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      {/* Animated globe */}
      <div className="relative h-28 w-28 mb-8">
        <div
          className="absolute inset-0 rounded-full animate-spin"
          style={{
            background: "var(--gradient-primary)",
            animationDuration: "3s",
            opacity: 0.15,
          }}
        />
        <div
          className="absolute inset-2 rounded-full"
          style={{
            background: "var(--gradient-primary)",
            opacity: 0.25,
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-5xl animate-bounce" style={{ animationDuration: "2s" }}>
          🌍
        </div>
        {/* Orbiting pins */}
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: "4s" }}>
          <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-lg">📍</span>
        </div>
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: "6s", animationDirection: "reverse" }}>
          <span className="absolute top-1/2 -right-1 text-lg">✈️</span>
        </div>
      </div>

      <p className="text-lg font-semibold text-foreground mb-2 transition-all duration-500">
        {messages[msgIdx]}
      </p>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Generating your itinerary</span>
      </div>
    </div>
  );
}

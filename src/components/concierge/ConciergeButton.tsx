import { useState, useEffect } from "react";
import { MessageCircle, Sparkles } from "lucide-react";

interface Props {
  onClick: () => void;
}

export function ConciergeButton({ onClick }: Props) {
  const [pulse, setPulse] = useState(true);

  // Stop pulse after 5s
  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <button
      onClick={onClick}
      className={`fixed bottom-20 right-4 z-30 w-12 h-12 rounded-full bg-[#0D9488] text-white shadow-lg flex items-center justify-center transition-transform hover:scale-110 active:scale-95 ${
        pulse ? "animate-pulse" : ""
      }`}
      aria-label="Ask Junto concierge"
    >
      <MessageCircle className="h-5 w-5" />
      <Sparkles className="h-2.5 w-2.5 absolute top-2 right-2 text-amber-300" />
    </button>
  );
}

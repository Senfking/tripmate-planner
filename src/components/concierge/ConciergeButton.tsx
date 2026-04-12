import { Compass } from "lucide-react";

interface Props {
  onClick: () => void;
}

export function ConciergeButton({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-20 right-4 z-30 flex items-center gap-1.5 rounded-full bg-[#0D9488] text-white shadow-lg px-4 py-2.5 text-xs font-semibold transition-transform hover:scale-105 active:scale-95"
      aria-label="Discover activities"
    >
      <Compass className="h-4 w-4" />
      What to do?
    </button>
  );
}

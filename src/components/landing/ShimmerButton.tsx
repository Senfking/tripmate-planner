import { Sparkles } from "lucide-react";

export function ShimmerButton({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative overflow-hidden flex items-center justify-center gap-2 text-white font-semibold rounded-xl py-3.5 text-[15px] transition-all hover:scale-[1.02] active:opacity-80 ${className}`}
      style={{
        background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)",
        boxShadow: "0 4px 20px rgba(13,148,136,0.35)",
      }}
    >
      <span className="landing-shimmer" />
      <Sparkles className="h-4 w-4 relative z-10" />
      <span className="relative z-10">{children}</span>
    </button>
  );
}

import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SectionCardProps {
  icon: string;
  title: string;
  summary: string;
  subline?: string;
  to: string;
  badgeCount?: number;
}

export function SectionCard({ icon, title, summary, subline, to, badgeCount }: SectionCardProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(to)}
      className="w-full text-left rounded-[14px] p-4 transition-all duration-200 active:scale-[0.98]"
      style={{
        background: "rgba(255, 255, 255, 0.85)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        border: "1px solid rgba(204, 251, 241, 0.8)",
        borderLeft: "3px solid #0D9488",
        boxShadow: "0 2px 12px rgba(13, 148, 136, 0.06)",
      }}
      onPointerDown={(e) => {
        const el = e.currentTarget;
        el.style.background = "rgba(255, 255, 255, 0.95)";
        el.style.boxShadow = "0 4px 20px rgba(13, 148, 136, 0.12)";
      }}
      onPointerUp={(e) => {
        const el = e.currentTarget;
        el.style.background = "rgba(255, 255, 255, 0.85)";
        el.style.boxShadow = "0 2px 12px rgba(13, 148, 136, 0.06)";
      }}
      onPointerLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = "rgba(255, 255, 255, 0.85)";
        el.style.boxShadow = "0 2px 12px rgba(13, 148, 136, 0.06)";
      }}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <span className="text-2xl leading-none">{icon}</span>
          {badgeCount != null && badgeCount > 0 && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-foreground">{title}</p>
          <p className="text-[13px] text-muted-foreground mt-0.5 truncate">{summary}</p>
          {subline && (
            <p className="text-[13px] text-muted-foreground/70 mt-0.5 truncate">{subline}</p>
          )}
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground/50 shrink-0 mt-0.5" />
      </div>
    </button>
  );
}

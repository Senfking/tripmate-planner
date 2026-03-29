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
      className="w-full text-left bg-card rounded-[14px] border border-[hsl(var(--accent))] border-l-[3px] border-l-[hsl(var(--primary))] p-4 active:bg-muted/50 transition-colors"
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

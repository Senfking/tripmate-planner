import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SectionCardProps {
  icon: string;
  title: string;
  summary: string;
  subline?: string;
  to: string;
  badgeCount?: number;
  variant?: "decisions" | "itinerary" | "bookings" | "expenses" | "admin";
}

const CARD_STYLES: Record<string, {
  bg: string;
  border: string;
  shadow: string;
  iconBg: string;
  iconShadow: string;
  accentColor: string;
  badgeBg: string;
  badgeText: string;
}> = {
  decisions: {
    bg: "linear-gradient(135deg, rgba(13,148,136,0.12) 0%, rgba(14,165,233,0.08) 100%)",
    border: "1px solid rgba(13,148,136,0.2)",
    shadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 20px rgba(13,148,136,0.08), 0 1px 3px rgba(0,0,0,0.06)",
    iconBg: "rgba(204,251,241,0.8)",
    iconShadow: "0 2px 8px rgba(13,148,136,0.2)",
    accentColor: "rgba(13,148,136,0.4)",
    badgeBg: "rgba(13,148,136,0.15)",
    badgeText: "#0D9488",
  },
  itinerary: {
    bg: "linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(251,191,36,0.06) 100%)",
    border: "1px solid rgba(245,158,11,0.2)",
    shadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 20px rgba(245,158,11,0.08), 0 1px 3px rgba(0,0,0,0.06)",
    iconBg: "rgba(254,243,199,0.8)",
    iconShadow: "0 2px 8px rgba(245,158,11,0.2)",
    accentColor: "rgba(245,158,11,0.4)",
    badgeBg: "rgba(245,158,11,0.15)",
    badgeText: "#D97706",
  },
  bookings: {
    bg: "linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.06) 100%)",
    border: "1px solid rgba(99,102,241,0.2)",
    shadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 20px rgba(99,102,241,0.08), 0 1px 3px rgba(0,0,0,0.06)",
    iconBg: "rgba(224,231,255,0.8)",
    iconShadow: "0 2px 8px rgba(99,102,241,0.2)",
    accentColor: "rgba(99,102,241,0.4)",
    badgeBg: "rgba(99,102,241,0.15)",
    badgeText: "#6366F1",
  },
  expenses: {
    bg: "linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(5,150,105,0.06) 100%)",
    border: "1px solid rgba(16,185,129,0.2)",
    shadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 20px rgba(16,185,129,0.08), 0 1px 3px rgba(0,0,0,0.06)",
    iconBg: "rgba(209,250,229,0.8)",
    iconShadow: "0 2px 8px rgba(16,185,129,0.2)",
    accentColor: "rgba(16,185,129,0.4)",
    badgeBg: "rgba(16,185,129,0.15)",
    badgeText: "#059669",
  },
  admin: {
    bg: "linear-gradient(135deg, rgba(71,85,105,0.1) 0%, rgba(51,65,85,0.06) 100%)",
    border: "1px solid rgba(71,85,105,0.2)",
    shadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 20px rgba(71,85,105,0.08), 0 1px 3px rgba(0,0,0,0.06)",
    iconBg: "rgba(226,232,240,0.8)",
    iconShadow: "0 2px 8px rgba(71,85,105,0.2)",
    accentColor: "rgba(71,85,105,0.4)",
    badgeBg: "rgba(71,85,105,0.15)",
    badgeText: "#475569",
  },
};

export function SectionCard({ icon, title, summary, subline, to, badgeCount, variant = "decisions" }: SectionCardProps) {
  const navigate = useNavigate();
  const s = CARD_STYLES[variant] ?? CARD_STYLES.decisions;

  return (
    <button
      onClick={() => navigate(to)}
      className="w-full text-left rounded-2xl transition-transform duration-150 ease-out active:scale-[0.98]"
      style={{
        background: s.bg,
        border: s.border,
        boxShadow: s.shadow,
        padding: "18px 16px",
        minHeight: 90,
      }}
    >
      <div className="flex items-center gap-3.5">
        {/* Icon in rounded square */}
        <div
          className="relative shrink-0 flex items-center justify-center rounded-xl"
          style={{
            width: 48,
            height: 48,
            background: s.iconBg,
            boxShadow: s.iconShadow,
          }}
        >
          <span className="text-[28px] leading-none">{icon}</span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[16px] font-semibold text-foreground">{title}</p>
            {badgeCount != null && badgeCount > 0 && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: s.badgeBg, color: s.badgeText }}
              >
                {badgeCount}
              </span>
            )}
          </div>
          <p
            className="text-[13px] text-foreground mt-0.5 truncate"
            style={{ opacity: 0.65, letterSpacing: "0.01em" }}
          >
            {summary}
          </p>
          {subline && (
            <p
              className="text-[13px] text-foreground mt-0.5 truncate"
              style={{ opacity: 0.5, letterSpacing: "0.01em" }}
            >
              {subline}
            </p>
          )}
        </div>

        {/* Arrow */}
        <ArrowRight
          className="shrink-0"
          size={16}
          style={{ color: s.accentColor }}
        />
      </div>
    </button>
  );
}

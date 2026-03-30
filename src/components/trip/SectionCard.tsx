import { ArrowRight, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

const DOT_COLORS: Record<string, string> = {
  green: "#10B981",
  amber: "#F59E0B",
  red: "#EF4444",
  teal: "#0D9488",
  grey: "#94A3B8",
};

interface SectionCardProps {
  icon: LucideIcon;
  title: string;
  summary: string;
  summaryColor?: string;
  subline?: string;
  to: string;
  badge?: { label: string; color: "green" | "amber" | "red" | "teal" | "grey"; pulse?: boolean };
  imageUrl: string;
}

export function SectionCard({ icon: Icon, title, summary, summaryColor, subline, to, badge, imageUrl }: SectionCardProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(to)}
      className="relative w-full text-left overflow-hidden transition-transform duration-150 ease-out active:scale-[0.98]"
      style={{
        minHeight: 110,
        borderRadius: 16,
        boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
      }}
    >
      {/* Background image */}
      <img
        src={imageUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
      />

      {/* Dark gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to right, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0.1) 100%)",
        }}
      />

      {/* Status badge */}
      {badge && (
        <div
          className="absolute flex items-center gap-[5px]"
          style={{
            top: 12,
            right: 12,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 20,
            padding: "3px 8px",
            fontSize: 11,
            fontWeight: 500,
            color: "white",
          }}
        >
          <span
            className={badge.pulse ? "animate-pulse" : ""}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: DOT_COLORS[badge.color],
              flexShrink: 0,
            }}
          />
          {badge.label}
        </div>
      )}

      {/* Content */}
      <div className="relative h-full flex items-center px-4 py-[18px]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon size={18} className="shrink-0" style={{ color: "rgba(255,255,255,0.7)" }} />
            <p className="text-[17px] font-semibold text-white">{title}</p>
          </div>
          <p
            className="text-[13px] mt-1 truncate"
            style={{ color: summaryColor ?? "rgba(255,255,255,0.75)", letterSpacing: "0.01em" }}
          >
            {summary}
          </p>
          {subline && (
            <p
              className="text-[13px] text-white mt-0.5 truncate"
              style={{ opacity: 0.55, letterSpacing: "0.01em" }}
            >
              {subline}
            </p>
          )}
        </div>

        <ArrowRight
          className="shrink-0 ml-3"
          size={16}
          style={{ color: "rgba(255,255,255,0.5)" }}
        />
      </div>
    </button>
  );
}

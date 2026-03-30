// TODO Phase 2: replace static Unsplash images
// with dynamic trip cover photo set by the owner,
// or pull og_image_url from the trip's first
// confirmed booking attachment.

import { ArrowRight, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SectionCardProps {
  icon: LucideIcon;
  title: string;
  summary: string;
  summaryColor?: string;
  subline?: string;
  to: string;
  badgeCount?: number;
  imageUrl: string;
}

export function SectionCard({ icon: Icon, title, summary, summaryColor, subline, to, badgeCount, imageUrl }: SectionCardProps) {
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

      {/* Content */}
      <div className="relative h-full flex items-center px-4 py-[18px]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon size={18} className="shrink-0" style={{ color: "rgba(255,255,255,0.7)" }} />
            <p className="text-[17px] font-semibold text-white">{title}</p>
            {badgeCount != null && badgeCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-900">
                {badgeCount} pending
              </span>
            )}
          </div>
          <p
            className="text-[13px] text-white mt-1 truncate"
            style={{ opacity: 0.75, letterSpacing: "0.01em" }}
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

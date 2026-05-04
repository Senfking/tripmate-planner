import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import type { TripTemplate } from "@/hooks/useTripTemplates";

type Size = "grid" | "carousel";

/**
 * Unified trip-template card. Full-image overlay with neutral black gradient,
 * Junto AI badge, destination + duration, and a single non-wrapping row of chips.
 *
 * `variant`:
 *   - "grid"     → fills its parent (used in the /templates grid).
 *   - "carousel" → fixed width, used in horizontal scroll rows.
 */
export function TemplateCard({
  template,
  variant = "grid",
  className = "",
}: {
  template: TripTemplate;
  variant?: Size;
  className?: string;
}) {
  const c = template;

  // Chip overflow strategy — never wraps to a 2nd row.
  // mobile: 1 chip + overflow counter; sm+: 2 chips + counter.
  const mobileVisible = c.chips.slice(0, 1);
  const mobileExtra = c.chips.length - mobileVisible.length;
  const desktopVisible = c.chips.slice(0, 2);
  const desktopExtra = c.chips.length - desktopVisible.length;

  const sizing =
    variant === "carousel"
      ? "w-[280px] shrink-0 snap-start sm:w-[320px] aspect-[3/4]"
      : "block w-full aspect-[4/5] sm:aspect-[3/4]";

  return (
    <Link
      to={`/templates/${c.slug}`}
      data-carousel-card={variant === "carousel" ? "true" : undefined}
      className={`group/card relative block overflow-hidden rounded-[1.25rem] bg-muted shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08),0_8px_24px_-8px_rgba(0,0,0,0.06)] transition-all duration-300 [@media(hover:hover)]:hover:-translate-y-1 [@media(hover:hover)]:hover:shadow-[0_8px_28px_-6px_rgba(0,0,0,0.18),0_16px_40px_-10px_rgba(0,0,0,0.12)] focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 ${sizing} ${className}`}
    >
      {/* Inner wrapper isolates the transform from the rounded clip,
          eliminating the brief "sharp edge" flash on hover */}
      <div className="absolute inset-0 overflow-hidden rounded-[inherit] [transform:translateZ(0)] [backface-visibility:hidden]">
        <img
          src={c.cover_image_url}
          alt={c.destination}
          className="h-full w-full object-cover transition-transform duration-[900ms] ease-out [@media(hover:hover)]:group-hover/card:scale-[1.06] transform-gpu [backface-visibility:hidden]"
          loading="lazy"
        />
        {/* Strong bottom-up gradient for legibility on any image */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        {/* Subtle top vignette to balance + frame */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/20 to-transparent" />
      </div>

      {/* Junto AI badge top-right */}
      <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold text-foreground shadow-md backdrop-blur sm:text-[11px]">
        <Sparkles className="h-3 w-3 text-primary" />
        Junto AI
      </div>

      {/* Title + chips bottom */}
      <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
        <h4 className="text-[17px] font-bold leading-tight text-white drop-shadow-md sm:text-xl">
          {c.destination}
          <span className="ml-1.5 font-semibold text-white/85">· {c.duration_days}d</span>
        </h4>

        {/* Mobile: 1 chip + overflow */}
        <div className="mt-2 flex items-center gap-1.5 overflow-hidden sm:hidden">
          {mobileVisible.map((chip) => (
            <span
              key={chip}
              className="inline-flex shrink-0 items-center rounded-full bg-white/90 px-2 py-0.5 text-[10.5px] font-medium text-foreground shadow-sm backdrop-blur"
            >
              {chip}
            </span>
          ))}
          {mobileExtra > 0 && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-white/30 px-2 py-0.5 text-[10.5px] font-medium text-white shadow-sm backdrop-blur">
              +{mobileExtra}
            </span>
          )}
        </div>

        {/* sm+: 2 chips + overflow */}
        <div className="mt-2 hidden items-center gap-1.5 overflow-hidden sm:flex">
          {desktopVisible.map((chip) => (
            <span
              key={chip}
              className="inline-flex shrink-0 items-center rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm backdrop-blur"
            >
              {chip}
            </span>
          ))}
          {desktopExtra > 0 && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-white/30 px-2 py-0.5 text-[11px] font-medium text-white shadow-sm backdrop-blur">
              +{desktopExtra}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

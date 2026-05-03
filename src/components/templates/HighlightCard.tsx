import { useState } from "react";

export type HighlightCardData = {
  name: string;
  area?: string;
  description?: string;
  photo_url: string;
};

type Props = {
  highlight: HighlightCardData;
  /** Optional category badge (e.g. "Landmark", "Restaurant"). */
  category?: string;
};

/**
 * Premium full-bleed image card with bottom-left overlay (title + area)
 * and a description revealed on hover (desktop) or tap (mobile).
 *
 * Reusable: same pattern will be reused for trip cards.
 */
export function HighlightCard({ highlight, category }: Props) {
  const [tapped, setTapped] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setTapped((v) => !v)}
      className="group relative block w-full text-left rounded-2xl overflow-hidden shadow-sm bg-gray-100 aspect-[4/5] sm:aspect-[3/4] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={highlight.name}
    >
      <img
        src={highlight.photo_url}
        alt={highlight.name}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />

      {/* Always-on bottom gradient (neutral black) */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/30 to-transparent pointer-events-none" />

      {/* Optional glassmorphism category chip */}
      {category && (
        <span className="absolute top-3 left-3 inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-md text-white border border-white/20">
          {category}
        </span>
      )}

      {/* Bottom-left overlay content */}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <h3
          className="text-white font-semibold text-base sm:text-lg leading-snug line-clamp-2"
          style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
        >
          {highlight.name}
        </h3>
        {highlight.area && (
          <p className="mt-0.5 text-xs sm:text-sm text-white/70 line-clamp-1">
            {highlight.area}
          </p>
        )}

        {highlight.description && (
          <p
            className={[
              "mt-2 text-xs sm:text-sm text-white/85 leading-snug line-clamp-3 transition-all duration-300",
              tapped
                ? "opacity-100 max-h-32"
                : "opacity-0 max-h-0 group-hover:opacity-100 group-hover:max-h-32",
            ].join(" ")}
          >
            {highlight.description}
          </p>
        )}
      </div>
    </button>
  );
}

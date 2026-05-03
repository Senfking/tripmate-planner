import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowLeft, Search, X } from "lucide-react";
import { useTripTemplates, type TripTemplate } from "@/hooks/useTripTemplates";

function matchesQuery(t: TripTemplate, q: string) {
  if (!q) return true;
  const haystack = [
    t.destination,
    t.country,
    t.description,
    t.recommended_season ?? "",
    t.category,
    ...(t.chips ?? []),
    ...(t.default_vibes ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q.toLowerCase());
}

export default function Templates() {
  const { data, isLoading } = useTripTemplates();
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");

  const categories = useMemo(() => {
    if (!data) return ["All"];
    const set = new Set<string>();
    data.forEach((t) => set.add(t.category));
    return ["All", ...Array.from(set)];
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter(
      (t) => (filter === "All" || t.category === filter) && matchesQuery(t, query.trim())
    );
  }, [data, filter, query]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border px-5 py-4">
        <div className="max-w-[1200px] mx-auto flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold text-foreground">Trip templates</h1>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto px-5 py-6 sm:py-8">
        {/* Cooler search: larger, gradient focus ring, soft inner glow */}
        <div className="group/search relative mb-6 sm:mb-7">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-r from-primary/40 via-primary/10 to-primary/40 opacity-0 transition-opacity duration-300 group-focus-within/search:opacity-100"
          />
          <div className="relative flex items-center rounded-2xl border border-border/70 bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)] transition-shadow duration-300 group-focus-within/search:shadow-[0_8px_32px_-8px_hsl(var(--primary)/0.25)]">
            <Search className="ml-4 h-5 w-5 shrink-0 text-muted-foreground transition-colors group-focus-within/search:text-primary" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by destination, vibe, or season (e.g. December, beach)…"
              className="w-full bg-transparent px-3 py-3.5 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none sm:py-4"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="mr-2 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-8">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                filter === c
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] rounded-[1.25rem] bg-muted animate-pulse"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No templates match your search.</p>
            {query && (
              <button onClick={() => setQuery("")} className="mt-2 text-sm font-medium text-primary hover:underline">
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {filtered.map((c) => {
              const visibleCount = 2;
              const visibleChips = c.chips.slice(0, visibleCount);
              const extraChips = c.chips.length - visibleChips.length;
              // On mobile we only have ~165px of card width — show 1 chip + overflow.
              // On sm+ we have room for 2 + overflow.
              const mobileVisible = c.chips.slice(0, 1);
              const mobileExtra = c.chips.length - mobileVisible.length;
              return (
                <Link
                  key={c.slug}
                  to={`/templates/${c.slug}`}
                  className="group/card relative block aspect-[4/5] sm:aspect-[3/4] overflow-hidden rounded-[1.25rem] bg-muted shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08),0_8px_24px_-8px_rgba(0,0,0,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_28px_-6px_rgba(0,0,0,0.18),0_16px_40px_-10px_rgba(0,0,0,0.12)] focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
                >
                  {/* Inner wrapper isolates the transform from the rounded clip,
                      eliminating the brief "sharp edge" flash on hover */}
                  <div className="absolute inset-0 overflow-hidden rounded-[inherit] [transform:translateZ(0)] [backface-visibility:hidden]">
                    <img
                      src={c.cover_image_url}
                      alt={c.destination}
                      className="h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover/card:scale-[1.06] transform-gpu [backface-visibility:hidden]"
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
                    {/* Single row of chips, no wrap, ellipsis-style overflow */}
                    <div className="mt-2 flex items-center gap-1.5 overflow-hidden">
                      {visibleChips.map((chip) => (
                        <span
                          key={chip}
                          className="inline-flex shrink-0 items-center rounded-full bg-white/90 px-2 py-0.5 text-[10.5px] font-medium text-foreground shadow-sm backdrop-blur sm:text-[11px]"
                        >
                          {chip}
                        </span>
                      ))}
                      {extraChips > 0 && (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-white/30 px-2 py-0.5 text-[10.5px] font-medium text-white shadow-sm backdrop-blur sm:text-[11px]">
                          +{extraChips}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

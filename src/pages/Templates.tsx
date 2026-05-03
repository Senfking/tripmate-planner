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

      <div className="max-w-[1200px] mx-auto px-5 py-6">
        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by destination, vibe, or season (e.g. December, beach)…"
            className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-8">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                filter === c
                  ? "bg-primary text-primary-foreground"
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
              <div key={i} className="rounded-[1.25rem] overflow-hidden border border-border/40 bg-card">
                <div className="aspect-square sm:aspect-[3/2] bg-muted animate-pulse" />
                <div className="hidden sm:block p-4 space-y-2">
                  <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                </div>
              </div>
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
            {filtered.map((c) => (
              <Link key={c.slug} to={`/templates/${c.slug}`} className="group/card block">
                <div className="overflow-hidden rounded-[1.25rem] border border-border/40 bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08),0_8px_24px_-8px_rgba(0,0,0,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_-6px_rgba(0,0,0,0.12),0_12px_36px_-10px_rgba(0,0,0,0.1)]">
                  <div className="relative aspect-square overflow-hidden sm:aspect-[3/2]">
                    <img
                      src={c.cover_image_url}
                      alt={c.destination}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover/card:scale-[1.03]"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/15 to-transparent" />
                    <div className="absolute bottom-2 left-2 right-2 sm:bottom-3 sm:left-4 sm:right-4">
                      <h4 className="text-[15px] font-bold leading-tight text-background drop-shadow-lg sm:text-xl">
                        {c.destination} · {c.duration_days}d
                      </h4>
                      <div className="mt-2 flex flex-wrap items-center gap-1 sm:hidden">
                        {c.chips.slice(0, 2).map((chip) => (
                          <span key={chip} className="inline-flex items-center rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur">
                            {chip}
                          </span>
                        ))}
                        {c.chips.length > 2 && (
                          <span className="inline-flex items-center rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur">
                            +{c.chips.length - 2}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1 sm:hidden">
                        <Sparkles className="h-3 w-3 text-background" />
                        <span className="text-[10px] font-semibold text-background">Junto AI plan</span>
                      </div>
                    </div>
                  </div>
                  <div className="hidden px-3 py-3 sm:block sm:px-4 sm:py-3.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {c.chips.map((chip) => (
                        <span key={chip} className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-[11px] sm:text-xs text-gray-700">
                          {chip}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-primary" />
                      <span className="text-[11px] font-medium text-primary">Junto AI plan</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

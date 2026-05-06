import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, X } from "lucide-react";
import { useTripTemplates, type TripTemplate } from "@/hooks/useTripTemplates";
import { TemplateCard } from "@/components/templates/TemplateCard";
import { useCanonical } from "@/hooks/useCanonical";

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
  useCanonical("/templates");
  const { data, isLoading } = useTripTemplates();
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get("category") ?? "All";
  const [filter, setFilter] = useState(initialCategory);
  const [query, setQuery] = useState("");

  // Sync if URL param changes (e.g. clicking another category link from /)
  useEffect(() => {
    const c = searchParams.get("category");
    if (c) setFilter(c);
  }, [searchParams]);

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
            {filtered.map((c) => (
              <TemplateCard key={c.slug} template={c} variant="grid" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

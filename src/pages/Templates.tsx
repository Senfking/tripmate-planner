import { useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowLeft } from "lucide-react";
import { ALL_CARDS, SECTIONS } from "@/components/landing/TripCarousel";

const CATEGORIES = ["All", ...SECTIONS.map(s => s.title)];

// Map cards to their category
const cardCategoryMap = new Map<string, string>();
SECTIONS.forEach(s => s.cards.forEach(c => cardCategoryMap.set(c.slug, s.title)));

export default function Templates() {
  const [filter, setFilter] = useState("All");
  const filtered = filter === "All" ? ALL_CARDS : ALL_CARDS.filter(c => cardCategoryMap.get(c.slug) === filter);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-[#e5e5e5] px-5 py-4">
        <div className="max-w-[1200px] mx-auto flex items-center gap-3">
          <Link to="/" className="text-[#6b7280] hover:text-[#1a1a1a]"><ArrowLeft className="h-5 w-5" /></Link>
          <h1 className="text-xl font-bold text-[#1a1a1a]">Trip templates</h1>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto px-5 py-6">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-8">
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                filter === c
                  ? "bg-[#0D9488] text-white"
                  : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          {filtered.map(c => (
            <Link
              key={c.slug}
              to={`/templates/${c.slug}`}
              className="group/card block"
            >
              <div className="overflow-hidden rounded-[1.25rem] border border-border/40 bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08),0_8px_24px_-8px_rgba(0,0,0,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_-6px_rgba(0,0,0,0.12),0_12px_36px_-10px_rgba(0,0,0,0.1)]">
                <div className="relative aspect-[4/3] sm:aspect-[3/2] overflow-hidden">
                  <img
                    src={c.img}
                    alt={c.name}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover/card:scale-[1.03]"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                  <h4 className="absolute bottom-3 left-4 right-4 text-base sm:text-xl font-bold text-white drop-shadow-lg">
                    {c.name} · {c.duration}
                  </h4>
                </div>
                <div className="px-3 py-3 sm:px-4 sm:py-3.5">
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
      </div>
    </div>
  );
}

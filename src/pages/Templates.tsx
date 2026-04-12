import { useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowLeft } from "lucide-react";
import { SECTIONS } from "@/components/landing/TripCarousel";

const ALL_CARDS = SECTIONS.flatMap(s => s.cards.map(c => ({ ...c, category: s.title })));
const CATEGORIES = ["All", ...SECTIONS.map(s => s.title)];

export default function Templates() {
  const [filter, setFilter] = useState("All");
  const filtered = filter === "All" ? ALL_CARDS : ALL_CARDS.filter(c => c.category === filter);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-[#e5e5e5] px-5 py-4">
        <div className="max-w-[1200px] mx-auto flex items-center gap-3">
          <Link to="/" className="text-[#6b7280] hover:text-[#1a1a1a]"><ArrowLeft className="h-5 w-5" /></Link>
          <h1 className="text-xl font-bold text-[#1a1a1a]">Trip templates</h1>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto px-5 py-6">
        {/* Filters */}
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

        {/* Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
          {filtered.map(c => (
            <Link
              key={c.slug}
              to={`/templates/${c.slug}`}
              className="group rounded-2xl overflow-hidden border border-[#e5e5e5] bg-white shadow-sm hover:shadow-lg transition-shadow"
            >
              <div className="relative h-[180px] sm:h-[220px] overflow-hidden">
                <img src={c.img} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                <h3 className="absolute bottom-3 left-3 text-white font-bold text-lg drop-shadow-lg">{c.name}</h3>
              </div>
              <div className="p-3">
                <p className="text-[13px] text-[#6b7280]">{c.duration} · {c.vibe}</p>
                <div className="flex items-center gap-1 mt-1.5">
                  <Sparkles className="h-3 w-3 text-[#0D9488]" />
                  <span className="text-[11px] font-medium text-[#0D9488]">Junto AI plan</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

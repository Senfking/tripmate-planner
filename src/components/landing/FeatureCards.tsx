import { useRef, useState, useEffect, useCallback } from "react";
import { Sparkles, CheckSquare, DollarSign, Compass, ChevronLeft, ChevronRight, MapPin, Star, RefreshCw, FileText } from "lucide-react";

const FEATURES = [
  {
    category: "Trip planning",
    headline: "Junto plans your entire trip.",
    description: "Just tell Junto where you're going, when, and what your group is into. You'll get a full day-by-day plan with real places, photos, reviews, and cost estimates.",
    variant: 0,
  },
  {
    category: "Group decisions",
    headline: "Everyone gets a say.",
    description: "No more guessing what people want. Throw up a vote on where to go, when to fly, what vibe you're after. Everyone picks, Junto tallies.",
    variant: 1,
  },
  {
    category: "Expenses",
    headline: "Money stuff, sorted.",
    description: "Snap a photo of the receipt, Junto reads it. Track everything in whatever currency you're spending in. At the end, everyone knows who owes what.",
    variant: 2,
  },
  {
    category: "On-trip",
    headline: "Ask Junto, not the group chat.",
    description: "It's 8pm, everyone's hungry, nobody can pick a place. Ask Junto and get actual suggestions nearby with photos, ratings, and what to order.",
    variant: 3,
  },
  {
    category: "Real-time sync",
    headline: "Everyone sees the same plan.",
    description: "Changes sync instantly across the group. No more outdated screenshots in the group chat. Add an activity, swap a restaurant, upload a booking — everyone sees it live.",
    variant: 4,
  },
  {
    category: "Bookings & docs",
    headline: "Everything in one place.",
    description: "Flight confirmations, hotel bookings, visa docs, insurance. Upload once, the whole group can access. No more digging through emails.",
    variant: 5,
  },
];

function PhoneMockup({ variant }: { variant: number }) {
  const screens = [
    // 0: AI Plan
    <div className="space-y-2 px-3 w-full" key="plan">
      <div className="flex items-center gap-1.5 mb-1">
        <Sparkles className="h-3 w-3 text-[#2dd4bf]" />
        <span className="text-[8px] font-bold text-white/80">Bali Adventure</span>
      </div>
      <div className="flex gap-1">
        {["7d", "3 cities", "14 acts"].map(t => (
          <div key={t} className="px-1.5 py-0.5 rounded-full bg-[#0D9488]/20">
            <span className="text-[6px] text-[#2dd4bf] font-medium">{t}</span>
          </div>
        ))}
      </div>
      {[
        { name: "Tegallalang Terraces", time: "9 AM", cost: "$5" },
        { name: "Tirta Empul Temple", time: "1 PM", cost: "$3" },
        { name: "Monkey Forest", time: "4 PM", cost: "$7" },
      ].map((a, i) => (
        <div key={i} className="flex gap-2 items-center p-1.5 rounded-lg bg-white/[0.06]">
          <div className="w-7 h-7 rounded bg-[#0D9488]/15 flex items-center justify-center shrink-0">
            <MapPin className="h-2.5 w-2.5 text-[#2dd4bf]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[7px] text-white/80 font-medium truncate">{a.name}</div>
            <div className="flex gap-1.5 text-[6px] text-white/40">
              <span>{a.time}</span>
              <span className="text-[#2dd4bf]">{a.cost}</span>
            </div>
          </div>
        </div>
      ))}
    </div>,
    // 1: Voting
    <div className="space-y-2 px-3 w-full" key="voting">
      <div className="text-[8px] text-white/60 font-medium mb-1">Where should we go?</div>
      {["Bali 🏝️", "Japan 🏯", "Greece 🇬🇷"].map((o, i) => (
        <div key={o} className="flex items-center gap-2 p-1.5 rounded-lg" style={{ background: i === 0 ? "rgba(13,148,136,0.2)" : "rgba(255,255,255,0.04)" }}>
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${i === 0 ? "border-[#2dd4bf] bg-[#2dd4bf]/30" : "border-white/20"}`}>
            {i === 0 && <div className="w-1.5 h-1.5 rounded-full bg-[#2dd4bf]" />}
          </div>
          <span className="text-[7px] text-white/70 flex-1">{o}</span>
          {i === 0 && <div className="h-1.5 w-10 rounded bg-[#2dd4bf]/40" />}
          {i === 1 && <div className="h-1.5 w-5 rounded bg-white/10" />}
        </div>
      ))}
      <div className="flex items-center gap-1.5 mt-2">
        <div className="flex -space-x-1">
          {["#0D9488", "#f97316", "#8b5cf6"].map((c, i) => (
            <div key={i} className="w-4 h-4 rounded-full border border-[#111]" style={{ background: c }} />
          ))}
        </div>
        <span className="text-[6px] text-white/40">3 votes</span>
      </div>
    </div>,
    // 2: Expenses
    <div className="space-y-2 px-3 w-full" key="expenses">
      <div className="text-center py-2">
        <span className="text-[13px] font-bold text-[#2dd4bf]">$347.50</span>
        <div className="text-[6px] text-white/40 mt-0.5">Total group expenses</div>
      </div>
      <div className="h-px bg-white/10" />
      {[
        { name: "Dinner at Locavore", who: "Sarah paid", amt: "$142" },
        { name: "Surf lesson", who: "Mike paid", amt: "$90" },
      ].map((e, i) => (
        <div key={i} className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white/[0.04]">
          <div className="w-6 h-6 rounded-full bg-[#0D9488]/15 flex items-center justify-center">
            <DollarSign className="h-2.5 w-2.5 text-[#2dd4bf]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[7px] text-white/80 font-medium truncate">{e.name}</div>
            <div className="text-[6px] text-white/40">{e.who}</div>
          </div>
          <span className="text-[8px] text-white/60 font-medium">{e.amt}</span>
        </div>
      ))}
      <div className="rounded-lg bg-[#0D9488]/10 p-1.5 text-center">
        <span className="text-[6px] text-[#2dd4bf] font-medium">You owe Sarah $23.50</span>
      </div>
    </div>,
    // 3: Concierge
    <div className="space-y-2 px-3 w-full" key="concierge">
      <div className="rounded-lg bg-white/[0.06] p-2 ml-3">
        <div className="text-[7px] text-white/60">Where should we eat tonight?</div>
      </div>
      <div className="rounded-lg bg-[#0D9488]/15 p-2 mr-3">
        <div className="text-[7px] text-[#2dd4bf]/90">Here are 3 places nearby:</div>
      </div>
      {[
        { name: "Locavore", r: "4.8" },
        { name: "Mozaic", r: "4.7" },
      ].map((p, i) => (
        <div key={i} className="rounded-lg bg-white/[0.05] p-1.5">
          <div className="w-full h-8 rounded bg-white/[0.08] mb-1" />
          <div className="text-[7px] text-white/70 font-medium">{p.name}</div>
          <div className="flex items-center gap-0.5 mt-0.5">
            <Star className="h-2 w-2 fill-amber-400 text-amber-400" />
            <span className="text-[6px] text-white/40">{p.r}</span>
          </div>
        </div>
      ))}
    </div>,
    // 4: Real-time sync
    <div className="space-y-2 px-3 w-full" key="sync">
      <div className="flex items-center gap-1.5 mb-1">
        <RefreshCw className="h-3 w-3 text-[#2dd4bf]" />
        <span className="text-[8px] font-bold text-white/80">Live updates</span>
      </div>
      <div className="rounded-lg bg-[#0D9488]/10 p-2 border border-[#0D9488]/20">
        <div className="text-[7px] text-[#2dd4bf] font-medium">Sarah added an activity</div>
        <div className="text-[6px] text-white/40 mt-0.5">Tegallalang Rice Terraces · just now</div>
      </div>
      <div className="rounded-lg bg-white/[0.04] p-2">
        <div className="text-[7px] text-white/60">Mike updated the booking</div>
        <div className="text-[6px] text-white/30 mt-0.5">Hotel check-in · 2 min ago</div>
      </div>
      <div className="rounded-lg bg-white/[0.04] p-2">
        <div className="text-[7px] text-white/60">Alex swapped a restaurant</div>
        <div className="text-[6px] text-white/30 mt-0.5">Day 3 dinner · 5 min ago</div>
      </div>
      <div className="flex -space-x-1 mt-2">
        {["#0D9488", "#f97316", "#8b5cf6"].map((c, i) => (
          <div key={i} className="w-4 h-4 rounded-full border border-[#111]" style={{ background: c }} />
        ))}
        <span className="text-[6px] text-white/40 ml-2 self-center">3 online</span>
      </div>
    </div>,
    // 5: Bookings & docs
    <div className="space-y-2 px-3 w-full" key="docs">
      <div className="flex items-center gap-1.5 mb-1">
        <FileText className="h-3 w-3 text-[#2dd4bf]" />
        <span className="text-[8px] font-bold text-white/80">Bookings & docs</span>
      </div>
      {[
        { name: "Emirates EK357", sub: "Confirmed · Jul 15", emoji: "✈️" },
        { name: "The Slow Hotel", sub: "2 nights · Canggu", emoji: "🏨" },
        { name: "Travel insurance", sub: "PDF · 240 KB", emoji: "📄" },
      ].map((d, i) => (
        <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg bg-white/[0.04]">
          <span className="text-sm">{d.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[7px] text-white/80 font-medium truncate">{d.name}</div>
            <div className="text-[6px] text-white/40">{d.sub}</div>
          </div>
        </div>
      ))}
    </div>,
  ];

  return (
    <div className="mx-auto w-[140px]">
      <div className="rounded-[1.3rem] border-[3px] border-[#333] bg-[#18181b] p-0.5 shadow-2xl shadow-black/40">
        <div className="rounded-[1rem] bg-gradient-to-br from-[#1a1a1f] to-[#111114] aspect-[9/18] flex items-center justify-center overflow-hidden">
          {screens[variant] ?? screens[0]}
        </div>
      </div>
    </div>
  );
}

export function FeatureCards() {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const updateArrows = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows]);

  const scroll = (dir: number) => {
    ref.current?.scrollBy({ left: dir * 340, behavior: "smooth" });
  };

  return (
    <section className="py-16 sm:py-24 bg-white">
      <div className="px-5 sm:px-10 lg:px-16 mb-8">
        <h2 className="text-2xl sm:text-4xl font-bold text-[#1a1a1a]">Get to know Junto</h2>
      </div>

      <div className="relative group">
        {canLeft && (
          <button
            onClick={() => scroll(-1)}
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg border border-[#e5e5e5] items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="h-5 w-5 text-[#1a1a1a]" />
          </button>
        )}
        {canRight && (
          <button
            onClick={() => scroll(1)}
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg border border-[#e5e5e5] items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="h-5 w-5 text-[#1a1a1a]" />
          </button>
        )}

        <div ref={ref} className="flex gap-5 overflow-x-auto scrollbar-hide px-5 sm:px-10 lg:px-16">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="shrink-0 w-[280px] sm:w-[320px] rounded-[20px] overflow-hidden flex flex-col"
              style={{
                background: "#0f1f1d",
                border: "0.5px solid rgba(13, 148, 136, 0.15)",
                minHeight: "420px",
              }}
            >
              <div className="p-5 flex-1 flex flex-col">
                <span className="text-[12px] font-medium text-[#2dd4bf] mb-2">{f.category}</span>
                <h3 className="text-lg sm:text-xl font-bold text-white mb-2 leading-tight">{f.headline}</h3>
                <p className="text-[13px] text-[#9ca3af] leading-relaxed">{f.description}</p>
              </div>
              <div className="px-5 pb-5">
                <PhoneMockup variant={f.variant} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

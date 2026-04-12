import { useRef, useState, useEffect } from "react";
import { Sparkles, CheckSquare, DollarSign, Compass, ChevronLeft, ChevronRight, MapPin, Star } from "lucide-react";

const FEATURES = [
  {
    icon: Sparkles,
    category: "Trip planning",
    headline: "Junto plans your entire trip.",
    description: "Just tell Junto where you're going, when, and what your group is into. You'll get a full day-by-day plan with real places, photos, reviews, and cost estimates.",
    variant: 0,
  },
  {
    icon: CheckSquare,
    category: "Group decisions",
    headline: "Everyone gets a say.",
    description: "No more guessing what people want. Throw up a vote on where to go, when to fly, what vibe you're after. Everyone picks, Junto tallies.",
    variant: 1,
  },
  {
    icon: DollarSign,
    category: "Expenses",
    headline: "Money stuff, sorted.",
    description: "Snap a photo of the receipt, Junto reads it. Track everything in whatever currency you're spending in. At the end, everyone knows who owes what.",
    variant: 2,
  },
  {
    icon: Compass,
    category: "On-trip",
    headline: "Ask Junto, not the group chat.",
    description: "It's 8pm, everyone's hungry, nobody can pick a place. Ask Junto and get actual suggestions nearby with photos, ratings, and what to order.",
    variant: 3,
  },
];

function PhoneMockup({ variant }: { variant: number }) {
  const screens = [
    // AI Plan
    <div className="space-y-2.5 px-3 w-full" key="plan">
      <div className="flex items-center gap-1.5 mb-1">
        <Sparkles className="h-3 w-3 text-[#2dd4bf]" />
        <div className="h-2.5 w-24 rounded bg-white/15" />
      </div>
      <div className="flex gap-1.5">
        {["7d", "3 cities", "14 activities"].map(t => (
          <div key={t} className="h-5 px-2 rounded-full bg-[#0D9488]/20 flex items-center">
            <span className="text-[7px] text-[#2dd4bf] font-medium">{t}</span>
          </div>
        ))}
      </div>
      <div className="space-y-2 mt-3">
        {[
          { name: "Tegallalang Terraces", time: "9 AM", cost: "$5" },
          { name: "Tirta Empul Temple", time: "1 PM", cost: "$3" },
          { name: "Monkey Forest", time: "4 PM", cost: "$7" },
        ].map((a, i) => (
          <div key={i} className="flex gap-2 items-center p-2 rounded-lg bg-white/[0.06]">
            <div className="w-8 h-8 rounded-md bg-[#0D9488]/15 flex items-center justify-center shrink-0">
              <MapPin className="h-3 w-3 text-[#2dd4bf]" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="text-[8px] text-white/80 font-medium">{a.name}</div>
              <div className="flex items-center gap-2 text-[6px] text-white/40">
                <span>{a.time}</span>
                <span className="text-[#2dd4bf]">{a.cost}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>,
    // Voting
    <div className="space-y-2.5 px-3 w-full" key="voting">
      <div className="text-[9px] text-white/60 font-medium mb-2">Where should we go?</div>
      {["Bali 🏝️", "Japan 🏯", "Greece 🇬🇷"].map((o, i) => (
        <div key={o} className="flex items-center gap-2 p-2 rounded-lg transition-colors" style={{ background: i === 0 ? "rgba(13,148,136,0.2)" : "rgba(255,255,255,0.04)" }}>
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${i === 0 ? "border-[#2dd4bf] bg-[#2dd4bf]/30" : "border-white/20"}`}>
            {i === 0 && <div className="w-2 h-2 rounded-full bg-[#2dd4bf]" />}
          </div>
          <span className="text-[8px] text-white/70 flex-1">{o}</span>
          {i === 0 && <div className="h-2 w-12 rounded bg-[#2dd4bf]/40" />}
          {i === 1 && <div className="h-2 w-6 rounded bg-white/10" />}
        </div>
      ))}
      <div className="flex items-center gap-2 mt-3">
        <div className="flex -space-x-1.5">
          {[0,1,2].map(i => (
            <div key={i} className="w-5 h-5 rounded-full bg-[#0D9488]/30 border border-[#111]" />
          ))}
        </div>
        <span className="text-[7px] text-white/40">3 votes</span>
      </div>
    </div>,
    // Expenses
    <div className="space-y-2.5 px-3 w-full" key="expenses">
      <div className="text-center py-3">
        <span className="text-[14px] font-bold text-[#2dd4bf]">$347.50</span>
        <div className="text-[7px] text-white/40 mt-0.5">Total group expenses</div>
      </div>
      <div className="h-px bg-white/10" />
      {[
        { name: "Dinner at Locavore", who: "Sarah paid", amt: "$142" },
        { name: "Surf lesson", who: "Mike paid", amt: "$90" },
      ].map((e, i) => (
        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.04]">
          <div className="w-7 h-7 rounded-full bg-[#0D9488]/15 flex items-center justify-center">
            <DollarSign className="h-3 w-3 text-[#2dd4bf]" />
          </div>
          <div className="flex-1">
            <div className="text-[8px] text-white/80 font-medium">{e.name}</div>
            <div className="text-[6px] text-white/40">{e.who}</div>
          </div>
          <span className="text-[9px] text-white/60 font-medium">{e.amt}</span>
        </div>
      ))}
      <div className="rounded-lg bg-[#0D9488]/10 p-2 text-center">
        <span className="text-[7px] text-[#2dd4bf] font-medium">You owe Sarah $23.50</span>
      </div>
    </div>,
    // Concierge
    <div className="space-y-2.5 px-3 w-full" key="concierge">
      <div className="rounded-lg bg-white/[0.06] p-2.5 ml-4">
        <div className="text-[8px] text-white/60">Where should we eat tonight?</div>
      </div>
      <div className="rounded-lg bg-[#0D9488]/15 p-2.5 mr-4">
        <div className="text-[8px] text-[#2dd4bf]/90">Here are 3 places nearby:</div>
      </div>
      <div className="flex gap-2 mt-1">
        {[
          { name: "Locavore", r: "4.8" },
          { name: "Mozaic", r: "4.7" },
        ].map((p, i) => (
          <div key={i} className="flex-1 rounded-lg bg-white/[0.05] p-2">
            <div className="w-full h-10 rounded bg-white/[0.08] mb-1.5" />
            <div className="text-[7px] text-white/70 font-medium">{p.name}</div>
            <div className="flex items-center gap-0.5 mt-0.5">
              <Star className="h-2 w-2 fill-amber-400 text-amber-400" />
              <span className="text-[6px] text-white/40">{p.r}</span>
            </div>
          </div>
        ))}
      </div>
    </div>,
  ];

  return (
    <div className="mx-auto w-[160px]">
      <div className="rounded-[1.5rem] border-[3px] border-[#333] bg-[#18181b] p-0.5 shadow-2xl shadow-black/40">
        <div className="rounded-[1.2rem] bg-gradient-to-br from-[#1a1a1f] to-[#111114] aspect-[9/18] flex items-center justify-center overflow-hidden">
          {screens[variant]}
        </div>
      </div>
    </div>
  );
}

export function FeatureCards() {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const updateArrows = () => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    return () => el.removeEventListener("scroll", updateArrows);
  }, []);

  const scroll = (dir: number) => {
    ref.current?.scrollBy({ left: dir * 370, behavior: "smooth" });
  };

  return (
    <section className="py-16 sm:py-24 bg-[#111114]">
      <div className="px-10 lg:px-[calc((100vw-1160px)/2+2.5rem)] mb-8">
        <h2 className="text-2xl sm:text-4xl font-bold text-white">Get to know Junto</h2>
      </div>

      <div className="relative group">
        {canLeft && (
          <button
            onClick={() => scroll(-1)}
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 backdrop-blur-md items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="h-5 w-5 text-white" />
          </button>
        )}
        {canRight && (
          <button
            onClick={() => scroll(1)}
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 backdrop-blur-md items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="h-5 w-5 text-white" />
          </button>
        )}

        <div
          ref={ref}
          className="flex gap-5 overflow-x-auto scrollbar-hide snap-x snap-mandatory pl-10 sm:pl-10 lg:pl-[calc((100vw-1160px)/2+2.5rem)]"
          style={{ paddingRight: 0 }}
        >
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="snap-start shrink-0 w-[300px] sm:w-[350px] rounded-[20px] overflow-hidden flex flex-col"
              style={{ background: "#1a1a1e", minHeight: "420px" }}
            >
              <div className="p-6 flex-1 flex flex-col">
                <span className="text-[13px] font-medium text-[#2dd4bf] mb-3">{f.category}</span>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 leading-tight">{f.headline}</h3>
                <p className="text-[14px] text-[#9ca3af] leading-relaxed">{f.description}</p>
              </div>
              <div className="px-6 pb-6">
                <PhoneMockup variant={f.variant} />
              </div>
            </div>
          ))}
          <div className="shrink-0 w-5 sm:w-10" />
        </div>
      </div>
    </section>
  );
}

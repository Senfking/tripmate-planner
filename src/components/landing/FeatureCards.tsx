import { Sparkles, CheckSquare, DollarSign, Compass } from "lucide-react";

const FEATURES = [
  {
    icon: Sparkles,
    headline: "Junto plans your entire trip",
    description: "Just tell Junto where you're going, when, and what your group is into. You'll get a full day-by-day plan with real places, photos, reviews, and cost estimates. Send it to your group and let everyone weigh in.",
  },
  {
    icon: CheckSquare,
    headline: "Everyone gets a say",
    description: "No more guessing what people want. Throw up a vote on where to go, when to fly, what vibe you're after. Everyone picks, Junto tallies. The group decides together.",
  },
  {
    icon: DollarSign,
    headline: "Money stuff, sorted",
    description: "Snap a photo of the receipt, Junto reads it. Track everything in whatever currency you're spending in. At the end of the trip, everyone knows exactly who owes what.",
  },
  {
    icon: Compass,
    headline: "Ask Junto, not the group chat",
    description: "It's 8pm, everyone's hungry, nobody can pick a place. Ask Junto and get actual suggestions nearby with photos, ratings, and what to order. Works wherever you are.",
  },
];

function PhoneMockup({ variant }: { variant: number }) {
  // Different realistic-looking screens per feature
  const screens = [
    // AI Plan
    <div className="space-y-2 px-3 w-full">
      <div className="flex items-center gap-1.5 mb-1">
        <div className="w-3 h-3 rounded bg-[#0D9488]/30" />
        <div className="h-2 w-20 rounded bg-white/10" />
      </div>
      <div className="flex gap-1.5">
        {["7d", "3c", "14a"].map(t => <div key={t} className="h-4 px-2 rounded-full bg-[#0D9488]/15 flex items-center"><span className="text-[6px] text-[#2dd4bf]">{t}</span></div>)}
      </div>
      <div className="space-y-1.5 mt-2">
        {[1,2,3].map(i => (
          <div key={i} className="flex gap-2 items-center">
            <div className="w-7 h-7 rounded-md bg-[#0D9488]/10" />
            <div className="flex-1 space-y-1">
              <div className="h-1.5 w-3/4 rounded bg-white/10" />
              <div className="h-1 w-1/2 rounded bg-white/[0.06]" />
            </div>
          </div>
        ))}
      </div>
    </div>,
    // Voting
    <div className="space-y-2 px-3 w-full">
      <div className="h-2 w-24 rounded bg-white/10 mb-2" />
      {["Beach", "Mountains", "City"].map((o, i) => (
        <div key={o} className="flex items-center gap-2 p-1.5 rounded-lg" style={{ background: i === 0 ? "rgba(13,148,136,0.15)" : "rgba(255,255,255,0.04)" }}>
          <div className={`w-4 h-4 rounded-full border-2 ${i === 0 ? "border-[#2dd4bf] bg-[#2dd4bf]/30" : "border-white/20"}`} />
          <span className="text-[7px] text-white/70">{o}</span>
          {i === 0 && <div className="ml-auto h-1.5 w-8 rounded bg-[#2dd4bf]/40" />}
        </div>
      ))}
      <div className="h-6 w-full rounded-lg bg-[#0D9488]/20 mt-2 flex items-center justify-center">
        <span className="text-[6px] text-[#2dd4bf]">Vote</span>
      </div>
    </div>,
    // Expenses
    <div className="space-y-2 px-3 w-full">
      <div className="h-2 w-16 rounded bg-white/10 mb-1" />
      <div className="text-center py-2">
        <span className="text-[10px] font-bold text-[#2dd4bf]">$347.50</span>
        <div className="h-1 w-12 rounded bg-white/[0.06] mx-auto mt-1" />
      </div>
      {[1,2].map(i => (
        <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg bg-white/[0.04]">
          <div className="w-6 h-6 rounded-full bg-[#0D9488]/15" />
          <div className="flex-1 space-y-0.5">
            <div className="h-1.5 w-16 rounded bg-white/10" />
            <div className="h-1 w-10 rounded bg-white/[0.06]" />
          </div>
          <span className="text-[7px] text-white/50">$42</span>
        </div>
      ))}
    </div>,
    // Concierge
    <div className="space-y-2 px-3 w-full">
      <div className="flex items-center gap-1.5 mb-1">
        <div className="w-3 h-3 rounded-full bg-[#0D9488]/30" />
        <div className="h-2 w-14 rounded bg-white/10" />
      </div>
      <div className="rounded-lg bg-white/[0.04] p-2 space-y-1">
        <div className="h-1.5 w-full rounded bg-white/[0.08]" />
        <div className="h-1.5 w-3/4 rounded bg-white/[0.06]" />
      </div>
      <div className="rounded-lg bg-[#0D9488]/10 p-2 ml-4 space-y-1">
        <div className="h-1.5 w-full rounded bg-[#2dd4bf]/20" />
        <div className="h-1.5 w-2/3 rounded bg-[#2dd4bf]/15" />
      </div>
      <div className="flex gap-1.5 mt-1">
        {[1,2].map(i => (
          <div key={i} className="flex-1 rounded-md bg-white/[0.04] p-1.5">
            <div className="w-full h-5 rounded bg-white/[0.06] mb-1" />
            <div className="h-1 w-3/4 rounded bg-white/[0.06]" />
          </div>
        ))}
      </div>
    </div>,
  ];

  return (
    <div className="mx-auto w-[180px] sm:w-[200px]">
      <div className="rounded-[1.6rem] border-[3px] border-[#2a2a2e] bg-[#18181b] p-1 shadow-2xl shadow-black/40">
        <div className="rounded-[1.3rem] bg-gradient-to-br from-[#1a1a1f] to-[#111114] aspect-[9/19] flex items-center justify-center overflow-hidden">
          {screens[variant]}
        </div>
      </div>
    </div>
  );
}

export function FeatureCards() {
  return (
    <section className="py-12 sm:py-20 px-5 bg-[#0f1115]">
      <div className="mx-auto max-w-3xl space-y-5">
        {FEATURES.map((f, i) => {
          const phoneOnRight = i % 2 === 0;
          return (
            <div
              key={i}
              className="landing-reveal rounded-2xl p-5 sm:p-6 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className={`flex flex-col sm:flex-row sm:items-center gap-4 ${!phoneOnRight ? "sm:flex-row-reverse" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                    style={{ background: "rgba(13,148,136,0.15)" }}>
                    <f.icon className="h-5 w-5 text-[#2dd4bf]" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-white mb-2">{f.headline}</h3>
                  <p className="text-sm sm:text-[15px] text-[#9ca3af] leading-relaxed">{f.description}</p>
                </div>
                <div className="sm:shrink-0">
                  <PhoneMockup variant={i} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

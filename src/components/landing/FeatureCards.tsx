import { Sparkles, CheckSquare, DollarSign, Compass, MapPin, Star, RefreshCw, FileText } from "lucide-react";
import { LandingCarouselNav, useLandingCarousel } from "@/components/landing/useLandingCarousel";

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
    description: "It’s 8pm, everyone’s hungry, nobody can pick a place. Ask Junto and get actual suggestions nearby with photos, ratings, and what to order.",
    variant: 3,
  },
  {
    category: "Real-time sync",
    headline: "Everyone sees the same plan.",
    description: "Changes sync instantly across the group. Add an activity, swap a restaurant, upload a booking — everyone sees it live.",
    variant: 4,
  },
  {
    category: "Bookings & docs",
    headline: "Everything in one place.",
    description: "Flight confirmations, hotel bookings, visa docs and insurance all live in one shared trip workspace.",
    variant: 5,
  },
];

function PhoneMockup({ variant }: { variant: number }) {
  const screens = [
    <div className="w-full space-y-2 px-3" key="plan">
      <div className="mb-1 flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-primary" />
        <span className="text-[8px] font-bold text-white/85">Bali Adventure</span>
      </div>
      <div className="flex gap-1">
        {["7d", "3 cities", "14 acts"].map((item) => (
          <span key={item} className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[6px] font-medium text-primary-foreground/90">
            {item}
          </span>
        ))}
      </div>
      {[
        { name: "Tegallalang Terraces", time: "9 AM", cost: "$5" },
        { name: "Tirta Empul Temple", time: "1 PM", cost: "$3" },
        { name: "Monkey Forest", time: "4 PM", cost: "$7" },
      ].map((item) => (
        <div key={item.name} className="flex items-center gap-2 rounded-lg bg-white/[0.06] p-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 shrink-0">
            <MapPin className="h-2.5 w-2.5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[7px] font-medium text-white/85">{item.name}</div>
            <div className="flex gap-1.5 text-[6px] text-white/45">
              <span>{item.time}</span>
              <span className="text-primary">{item.cost}</span>
            </div>
          </div>
        </div>
      ))}
    </div>,
    <div className="w-full space-y-2 px-3" key="voting">
      <div className="text-[8px] font-medium text-white/60">Where should we go?</div>
      {["Bali 🏝️", "Japan 🏯", "Greece 🇬🇷"].map((item, index) => (
        <div key={item} className="flex items-center gap-2 rounded-lg p-1.5" style={{ background: index === 0 ? "hsl(var(--primary) / 0.2)" : "rgba(255,255,255,0.04)" }}>
          <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${index === 0 ? "border-primary bg-primary/30" : "border-white/20"}`}>
            {index === 0 ? <div className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
          </div>
          <span className="flex-1 text-[7px] text-white/75">{item}</span>
          <div className={`h-1.5 rounded ${index === 0 ? "w-10 bg-primary/45" : index === 1 ? "w-5 bg-white/10" : "w-3 bg-white/10"}`} />
        </div>
      ))}
      <div className="mt-2 flex items-center gap-1.5">
        <div className="flex -space-x-1">
          {[
            "bg-primary",
            "bg-orange-500",
            "bg-violet-500",
          ].map((className, index) => (
            <div key={index} className={`h-4 w-4 rounded-full border border-[#111] ${className}`} />
          ))}
        </div>
        <span className="text-[6px] text-white/45">3 votes</span>
      </div>
    </div>,
    <div className="w-full space-y-2 px-3" key="expenses">
      <div className="py-2 text-center">
        <span className="text-[13px] font-bold text-primary">$347.50</span>
        <div className="mt-0.5 text-[6px] text-white/45">Total group expenses</div>
      </div>
      <div className="h-px bg-white/10" />
      {[
        { name: "Dinner at Locavore", who: "Sarah paid", amount: "$142" },
        { name: "Surf lesson", who: "Mike paid", amount: "$90" },
      ].map((item) => (
        <div key={item.name} className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] p-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 shrink-0">
            <DollarSign className="h-2.5 w-2.5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[7px] font-medium text-white/85">{item.name}</div>
            <div className="text-[6px] text-white/45">{item.who}</div>
          </div>
          <span className="text-[8px] font-medium text-white/65">{item.amount}</span>
        </div>
      ))}
      <div className="rounded-lg bg-primary/10 p-1.5 text-center">
        <span className="text-[6px] font-medium text-primary">You owe Sarah $23.50</span>
      </div>
    </div>,
    <div className="w-full space-y-2 px-3" key="concierge">
      <div className="ml-3 rounded-lg bg-white/[0.06] p-2">
        <div className="text-[7px] text-white/65">Where should we eat tonight?</div>
      </div>
      <div className="mr-3 rounded-lg bg-primary/15 p-2">
        <div className="text-[7px] text-primary">Here are 3 places nearby:</div>
      </div>
      {[
        { name: "Locavore", rating: "4.8" },
        { name: "Mozaic", rating: "4.7" },
      ].map((item) => (
        <div key={item.name} className="rounded-lg bg-white/[0.05] p-1.5">
          <div className="mb-1 h-8 w-full rounded bg-white/[0.08]" />
          <div className="text-[7px] font-medium text-white/75">{item.name}</div>
          <div className="mt-0.5 flex items-center gap-0.5">
            <Star className="h-2 w-2 fill-amber-400 text-amber-400" />
            <span className="text-[6px] text-white/45">{item.rating}</span>
          </div>
        </div>
      ))}
    </div>,
    <div className="w-full space-y-2 px-3" key="sync">
      <div className="mb-1 flex items-center gap-1.5">
        <RefreshCw className="h-3 w-3 text-primary" />
        <span className="text-[8px] font-bold text-white/85">Live updates</span>
      </div>
      {[
        "Sarah added an activity",
        "Mike updated the booking",
        "Alex swapped a restaurant",
      ].map((line, index) => (
        <div key={line} className={`rounded-lg p-2 ${index === 0 ? "border border-primary/25 bg-primary/10" : "bg-white/[0.04]"}`}>
          <div className={`text-[7px] ${index === 0 ? "font-medium text-primary" : "text-white/65"}`}>{line}</div>
          <div className="mt-0.5 text-[6px] text-white/40">{index === 0 ? "just now" : `${index + 1} min ago`}</div>
        </div>
      ))}
    </div>,
    <div className="w-full space-y-2 px-3" key="docs">
      <div className="mb-1 flex items-center gap-1.5">
        <FileText className="h-3 w-3 text-primary" />
        <span className="text-[8px] font-bold text-white/85">Bookings & docs</span>
      </div>
      {[
        { label: "Emirates EK357", meta: "Confirmed · Jul 15", icon: "✈️" },
        { label: "The Slow Hotel", meta: "2 nights · Canggu", icon: "🏨" },
        { label: "Travel insurance", meta: "PDF · 240 KB", icon: "📄" },
      ].map((item) => (
        <div key={item.label} className="flex items-center gap-2 rounded-lg bg-white/[0.04] p-1.5">
          <span className="text-sm">{item.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[7px] font-medium text-white/85">{item.label}</div>
            <div className="text-[6px] text-white/45">{item.meta}</div>
          </div>
        </div>
      ))}
    </div>,
  ];

  return (
    <div className="mx-auto w-[148px]">
      <div className="rounded-[1.4rem] border-[3px] border-white/10 bg-[#17191b] p-0.5 shadow-[0_28px_60px_-30px_rgba(0,0,0,0.65)]">
        <div className="aspect-[9/18] overflow-hidden rounded-[1.05rem] bg-[linear-gradient(180deg,rgba(15,31,29,1)_0%,rgba(12,20,19,1)_100%)]">
          <div className="flex h-6 items-center justify-between px-3 text-[6px] font-semibold text-white/60">
            <span>9:41</span>
            <div className="h-3.5 w-10 rounded-full bg-black/60" />
            <CheckSquare className="h-2.5 w-2.5" />
          </div>
          <div className="px-3 pb-2 text-[7px] font-medium uppercase tracking-[0.18em] text-primary/90">{FEATURES[variant].category}</div>
          {screens[variant]}
        </div>
      </div>
    </div>
  );
}

export function FeatureCards() {
  const { containerRef, canLeft, canRight, isAtStart, scrollPrev, scrollNext } = useLandingCarousel();

  return (
    <section className="py-16 sm:py-24">
      <div className="mb-8 px-5 sm:px-10 lg:px-16">
        <h2 className="text-2xl font-bold text-foreground sm:text-4xl">Get to know Junto</h2>
      </div>

      <div className="group/carousel relative">
        <LandingCarouselNav canLeft={canLeft} canRight={canRight} onPrev={scrollPrev} onNext={scrollNext} />

        <div
          ref={containerRef}
          className={`scrollbar-hide flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth overscroll-x-contain pl-5 sm:pl-10 lg:pl-16 ${isAtStart ? "pr-5 sm:pr-10 lg:pr-16" : "pr-0"}`}
        >
          {FEATURES.map((feature) => (
            <article
              key={feature.headline}
              data-carousel-card="true"
              className="flex min-h-[440px] w-[288px] shrink-0 snap-start flex-col overflow-hidden rounded-[1.6rem] border border-primary/15 bg-[hsl(173_34%_9%)] shadow-[0_24px_56px_-30px_hsl(var(--foreground)/0.28)] sm:w-[330px]"
            >
              <div className="flex flex-1 flex-col p-6">
                <span className="mb-3 text-[12px] font-medium text-primary">{feature.category}</span>
                <h3 className="mb-3 text-xl font-bold leading-tight text-white sm:text-2xl">{feature.headline}</h3>
                <p className="text-[14px] leading-relaxed text-white/62">{feature.description}</p>
              </div>
              <div className="px-6 pb-6 pt-1">
                <PhoneMockup variant={feature.variant} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

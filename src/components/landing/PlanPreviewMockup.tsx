import { useEffect, useState } from "react";
import {
  CalendarDays,
  Clock,
  DollarSign,
  Heart,
  MapPin,
  MessageCircle,
  Navigation,
  Receipt,
  Search,
  Sparkles,
  Star,
  ThumbsUp,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SCENE_INTERVAL_MS = 4800;

function Dots({ active, count }: { active: number; count: number }) {
  return (
    <div className="mt-4 flex justify-center gap-1.5">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "h-1.5 rounded-full transition-all duration-500",
            index === active ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30",
          )}
        />
      ))}
    </div>
  );
}

function StatPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/15 bg-primary/5 px-2 py-0.5 text-[8px] font-medium text-primary">
      {children}
    </span>
  );
}

function MiniAvatar({ label, className }: { label: string; className: string }) {
  return (
    <div className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[7px] font-bold text-white", className)}>
      {label}
    </div>
  );
}

function TinyStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-px">
      {[1, 2, 3, 4, 5].map((index) => (
        <Star
          key={index}
          className={cn(
            "h-2.5 w-2.5",
            index <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/25",
          )}
        />
      ))}
    </div>
  );
}

function SceneShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="h-full bg-background px-3 py-3">
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold leading-none text-foreground">{title}</p>
          <p className="mt-1 text-[8px] leading-none text-muted-foreground">{subtitle}</p>
        </div>
        <span className="rounded-full bg-primary/8 px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.18em] text-primary">
          Live preview
        </span>
      </div>
      {children}
    </div>
  );
}

function ScenePlan({ active }: { active: boolean }) {
  const items = [
    {
      title: "Tegallalang Rice Terraces",
      time: "9:00 AM",
      price: "$5",
      image: "https://images.unsplash.com/photo-1558862107-d49ef2a04d72?w=160&q=80&auto=format&fit=crop",
    },
    {
      title: "Tirta Empul Temple",
      time: "12:00 PM",
      price: "$3",
      image: "https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=160&q=80&auto=format&fit=crop",
    },
    {
      title: "Echo Beach Sunset",
      time: "5:30 PM",
      price: "Free",
      image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=160&q=80&auto=format&fit=crop",
    },
  ];

  return (
    <SceneShell title="Bali Adventure" subtitle="7 days · 3 cities · 14 activities">
      <div className="space-y-2.5">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="relative h-[88px] overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=600&q=80&auto=format&fit=crop"
              alt="Bali destination"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
            <div className="absolute bottom-2 left-2.5 flex items-center gap-1.5 text-white">
              <Sparkles className="h-3 w-3" />
              <span className="text-[10px] font-semibold">AI itinerary overview</span>
            </div>
          </div>
          <div className="space-y-2 p-2.5">
            <div className="flex flex-wrap gap-1">
              <StatPill><CalendarDays className="h-2.5 w-2.5" />7 days</StatPill>
              <StatPill><MapPin className="h-2.5 w-2.5" />3 cities</StatPill>
              <StatPill><DollarSign className="h-2.5 w-2.5" />~$1,200</StatPill>
            </div>
            <div className={cn("rounded-xl border border-primary/10 bg-primary/5 p-2 transition-all duration-500", active && "landing-spotlight") }>
              <div className="mb-1.5 flex items-center gap-1 text-[8px] font-medium text-primary">
                <Navigation className="h-2.5 w-2.5" />
                Ubud → Canggu → Uluwatu
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 text-[8px] text-muted-foreground">
                <span>Route locked with your group</span>
                <span className="font-medium text-foreground">3 stops</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={item.title} className="flex items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm">
              <img src={item.image} alt={item.title} className="h-11 w-11 rounded-xl object-cover shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold text-foreground">{item.title}</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[8px] text-muted-foreground">
                  <span>{item.time}</span>
                  <span>·</span>
                  <span className="font-medium text-primary">{item.price}</span>
                </div>
              </div>
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                {index + 1}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SceneShell>
  );
}

function SceneDay({ active }: { active: boolean }) {
  return (
    <SceneShell title="Day 3 · Surf & Sunset" subtitle="Venue details, reviews, timing and cost">
      <div className="space-y-2.5">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <img
            src="https://images.unsplash.com/photo-1502680390548-bdbac40e4a4a?w=600&q=80&auto=format&fit=crop"
            alt="Surf lesson"
            className="h-[110px] w-full object-cover"
          />
          <div className="space-y-2 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-foreground">Echo Beach Surf Lesson</p>
                <div className="mt-1 flex items-center gap-1.5 text-[8px] text-muted-foreground">
                  <span className="inline-flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />8:00 AM</span>
                  <span>·</span>
                  <span className="font-medium text-primary">$30</span>
                </div>
              </div>
              <div className="rounded-full border border-border bg-background px-2 py-1 text-[8px] font-semibold text-foreground">
                4.6
              </div>
            </div>

            <div className={cn("rounded-xl border border-border bg-muted/50 p-2.5 transition-all duration-500", active && "landing-spotlight") }>
              <div className="mb-1 flex items-center gap-1.5">
                <TinyStars rating={4.6} />
                <span className="text-[8px] text-muted-foreground">Google rating</span>
              </div>
              <p className="text-[8px] leading-relaxed text-muted-foreground italic">
                “Amazing instructors, perfect waves for beginners. Highly recommend the morning slot if you want calmer water.”
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <img
              src="https://images.unsplash.com/photo-1519046904884-53103b34b206?w=160&q=80&auto=format&fit=crop"
              alt="Beach club"
              className="h-10 w-10 rounded-xl object-cover"
            />
            <div>
              <p className="text-[9px] font-semibold text-foreground">Next up · La Brisa Beach Club</p>
              <p className="text-[8px] text-muted-foreground">Sunset drinks · 4:00 PM</p>
            </div>
          </div>
        </div>
      </div>
    </SceneShell>
  );
}

function SceneGroup({ active }: { active: boolean }) {
  return (
    <SceneShell title="Group collaboration" subtitle="Reactions, comments and live decisions">
      <div className="space-y-2.5">
        <div className="rounded-2xl border border-border bg-card p-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <img
              src="https://images.unsplash.com/photo-1540541338287-41700207dee6?w=160&q=80&auto=format&fit=crop"
              alt="Beach club"
              className="h-12 w-12 rounded-xl object-cover shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-semibold text-foreground">La Brisa Beach Club</p>
              <p className="text-[8px] text-muted-foreground">Sunset table · Canggu · $25</p>
            </div>
          </div>

          <div className={cn("mt-2.5 flex items-center gap-1.5 rounded-xl border border-primary/10 bg-primary/5 px-2 py-2 transition-all duration-500", active && "landing-spotlight") }>
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[8px] font-medium text-sky-600"><ThumbsUp className="h-2.5 w-2.5" />3</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[8px] font-medium text-orange-500"><Flame className="h-2.5 w-2.5" />2</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[8px] font-medium text-pink-500"><Heart className="h-2.5 w-2.5" />1</span>
            <div className="ml-auto flex -space-x-1">
              <MiniAvatar label="S" className="bg-primary" />
              <MiniAvatar label="M" className="bg-orange-500" />
              <MiniAvatar label="A" className="bg-violet-500" />
            </div>
          </div>
        </div>

        <div className="flex items-start gap-1.5">
          <MiniAvatar label="M" className="bg-orange-500" />
          <div className="flex-1 rounded-2xl rounded-tl-sm bg-muted px-2.5 py-2">
            <p className="mb-0.5 text-[8px] font-semibold text-foreground">Maya</p>
            <p className="text-[8px] leading-relaxed text-muted-foreground">This place looks amazing! Can we go for sunset?</p>
          </div>
        </div>

        <div className="flex items-start gap-1.5">
          <MiniAvatar label="S" className="bg-primary" />
          <div className="flex-1 rounded-2xl rounded-tl-sm bg-muted px-2.5 py-2">
            <p className="mb-0.5 text-[8px] font-semibold text-foreground">Sarah</p>
            <p className="text-[8px] leading-relaxed text-muted-foreground">Yes — adding it to the route now 🙌</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-2 text-[8px] text-muted-foreground shadow-sm">
          <MessageCircle className="h-2.5 w-2.5" />
          Reply to the thread…
        </div>
      </div>
    </SceneShell>
  );
}

function SceneExpenses({ active }: { active: boolean }) {
  const rows = [
    { title: "Dinner at Locavore", note: "Sarah paid", amount: "$45", icon: "🍽️" },
    { title: "Surf lesson", note: "Mike paid", amount: "$30", icon: "🏄" },
    { title: "Scooter rental", note: "You paid", amount: "$15", icon: "🛵" },
  ];

  return (
    <SceneShell title="Trip expenses" subtitle="Balances, receipts and line items">
      <div className="space-y-2.5">
        <div className={cn("rounded-2xl bg-gradient-to-br from-primary to-primary/80 px-3 py-3 text-primary-foreground shadow-sm transition-all duration-500", active && "landing-spotlight-soft") }>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[8px] uppercase tracking-[0.18em] text-white/75">Your balance</p>
              <p className="mt-1 text-[22px] font-bold leading-none">You owe $180</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/16">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-[8px] text-white/70">Split across dinner, surf lesson and scooter rental.</p>
        </div>

        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.title} className="flex items-center gap-2 rounded-2xl border border-border bg-card px-2.5 py-2 shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-sm">{row.icon}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[9px] font-medium text-foreground">{row.title}</p>
                <p className="text-[8px] text-muted-foreground">{row.note}</p>
              </div>
              <span className="text-[9px] font-semibold text-foreground">{row.amount}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-primary/10 bg-primary/5 px-2.5 py-2 text-[8px] font-medium text-primary shadow-sm">
          <Receipt className="h-2.5 w-2.5" />
          Receipt scan picked up 3 items automatically
        </div>
      </div>
    </SceneShell>
  );
}

function SceneConcierge({ active }: { active: boolean }) {
  return (
    <SceneShell title="AI concierge" subtitle="Nearby recommendations, tailored to the group">
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 rounded-xl bg-muted px-2.5 py-2 text-[8px] text-muted-foreground">
          <Search className="h-2.5 w-2.5" />
          Where should we eat tonight?
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <img
            src="https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&q=80&auto=format&fit=crop"
            alt="Seafood restaurant"
            className="h-[96px] w-full object-cover"
          />
          <div className="space-y-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold text-foreground">Fishbone Local</p>
                <div className="mt-1 flex items-center gap-1.5 text-[8px] text-muted-foreground">
                  <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">Seafood</span>
                  <span className="inline-flex items-center gap-0.5"><Navigation className="h-2.5 w-2.5" />350m</span>
                </div>
              </div>
              <div className="inline-flex items-center gap-0.5 text-[8px] font-medium text-foreground">
                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />4.7
              </div>
            </div>

            <div className={cn("inline-flex items-center gap-1 rounded-full border border-primary/10 bg-primary/5 px-2 py-1 text-[8px] font-semibold text-primary transition-all duration-500", active && "landing-spotlight") }>
              <Sparkles className="h-2.5 w-2.5" />
              Recommended by Junto
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <img
              src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=160&q=80&auto=format&fit=crop"
              alt="Alternative restaurant"
              className="h-10 w-10 rounded-xl object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-semibold text-foreground">Ulu Garden</p>
              <p className="text-[8px] text-muted-foreground">Vegan · 500m · 4.5 stars</p>
            </div>
          </div>
        </div>
      </div>
    </SceneShell>
  );
}

const SCENES = [ScenePlan, SceneDay, SceneGroup, SceneExpenses, SceneConcierge];

export function PlanPreviewMockup({ onCTA }: { onCTA: () => void }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActive((previous) => (previous + 1) % SCENES.length);
    }, SCENE_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="mx-auto max-w-lg">
      <p className="mb-5 text-center text-sm font-medium text-muted-foreground">See what Junto AI builds for you</p>

      <div className="mx-auto max-w-[340px]">
        <div className="relative overflow-hidden rounded-[2.5rem] border-[6px] border-zinc-900 bg-background shadow-[0_32px_80px_-34px_hsl(var(--foreground)/0.4)]">
          <div className="flex items-center justify-between bg-card px-5 pb-2 pt-3">
            <span className="text-[11px] font-semibold text-foreground">9:41</span>
            <div className="h-5 w-20 rounded-full bg-zinc-950" />
            <div className="h-2 w-4 rounded-sm bg-foreground" />
          </div>

          <div className="border-b border-border bg-card px-4 pb-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-primary">Product showcase</span>
          </div>

          <div className="relative h-[392px] overflow-hidden bg-background">
            {SCENES.map((Scene, index) => {
              const isActive = index === active;
              return (
                <div
                  key={index}
                  className={cn(
                    "absolute inset-0 transition-all duration-700 ease-out",
                    isActive
                      ? "translate-y-0 scale-100 opacity-100"
                      : "pointer-events-none translate-y-2 scale-[0.985] opacity-0",
                  )}
                >
                  <Scene active={isActive} />
                </div>
              );
            })}
          </div>

          <div className="border-t border-border bg-background px-4 pb-4 pt-2">
            <button
              type="button"
              onClick={onCTA}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-[0_18px_32px_-20px_hsl(var(--primary)/0.9)] transition-transform duration-200 hover:translate-y-[-1px]"
            >
              Sign up free to unlock full plan
            </button>
          </div>
        </div>
      </div>

      <Dots active={active} count={SCENES.length} />

      <p className="mx-auto mt-5 max-w-md text-center text-sm leading-relaxed text-muted-foreground">
        Share this plan with your group → they vote, react, and customize it together.
      </p>
    </div>
  );
}

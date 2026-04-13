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
  Users,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SCENE_INTERVAL_MS = 5200;

function Dots({ active, count }: { active: number; count: number }) {
  return (
    <div className="mt-5 flex justify-center gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-500",
            i === active ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/25",
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
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("h-2.5 w-2.5", i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/25")} />
      ))}
    </div>
  );
}

/* ─── PHONE SCENES ─── */

function PhoneShell({ title, subtitle, badge, children }: { title: string; subtitle: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="h-full bg-background px-3 py-3">
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-semibold leading-none text-foreground">{title}</p>
          <p className="mt-1 text-[8px] leading-none text-muted-foreground">{subtitle}</p>
        </div>
        {badge && (
          <span className="shrink-0 rounded-full bg-primary/8 px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.14em] text-primary">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function PhoneScenePlan() {
  const items = [
    { title: "Tegallalang Rice Terraces", time: "9:00 AM", price: "$5", img: "https://images.unsplash.com/photo-1558862107-d49ef2a04d72?w=160&q=80&auto=format&fit=crop" },
    { title: "Tirta Empul Temple", time: "12:00 PM", price: "$3", img: "https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=160&q=80&auto=format&fit=crop" },
    { title: "Echo Beach Sunset", time: "5:30 PM", price: "Free", img: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=160&q=80&auto=format&fit=crop" },
  ];
  return (
    <PhoneShell title="Bali Adventure" subtitle="7 days · 3 cities · 14 activities" badge="Day 1">
      <div className="space-y-2">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="relative h-[80px] overflow-hidden">
            <img src="https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=600&q=80&auto=format&fit=crop" alt="Bali" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute bottom-2 left-2.5 flex items-center gap-1 text-white">
              <Sparkles className="h-2.5 w-2.5" />
              <span className="text-[9px] font-semibold">AI itinerary</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 p-2">
            <StatPill><CalendarDays className="h-2.5 w-2.5" />7 days</StatPill>
            <StatPill><MapPin className="h-2.5 w-2.5" />3 cities</StatPill>
            <StatPill><DollarSign className="h-2.5 w-2.5" />~$1,200</StatPill>
          </div>
        </div>
        {items.map((item, i) => (
          <div key={item.title} className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-sm">
            <img src={item.img} alt={item.title} className="h-10 w-10 rounded-lg object-cover shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[9px] font-semibold text-foreground">{item.title}</p>
              <div className="mt-0.5 flex items-center gap-1.5 text-[8px] text-muted-foreground">
                <span>{item.time}</span><span>·</span><span className="font-medium text-primary">{item.price}</span>
              </div>
            </div>
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">{i + 1}</div>
          </div>
        ))}
      </div>
    </PhoneShell>
  );
}

function PhoneSceneDay() {
  return (
    <PhoneShell title="Day 3 · Surf & Sunset" subtitle="Venue details, reviews & cost" badge="Live">
      <div className="space-y-2">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <img src="https://images.unsplash.com/photo-1502680390548-bdbac40e4a4a?w=600&q=80&auto=format&fit=crop" alt="Surf" className="h-[100px] w-full object-cover" />
          <div className="p-2.5 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold text-foreground">Echo Beach Surf Lesson</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[8px] text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" />8:00 AM · <span className="font-medium text-primary">$30</span>
                </div>
              </div>
              <div className="rounded-full border border-border px-1.5 py-0.5 text-[8px] font-semibold">4.6</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/50 p-2">
              <div className="mb-1 flex items-center gap-1"><TinyStars rating={4.6} /><span className="text-[7px] text-muted-foreground">Google</span></div>
              <p className="text-[7px] leading-relaxed text-muted-foreground italic">"Amazing instructors, perfect waves for beginners."</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-sm">
          <img src="https://images.unsplash.com/photo-1519046904884-53103b34b206?w=160&q=80&auto=format&fit=crop" alt="Beach club" className="h-9 w-9 rounded-lg object-cover" />
          <div>
            <p className="text-[9px] font-semibold text-foreground">Next · La Brisa Beach Club</p>
            <p className="text-[7px] text-muted-foreground">Sunset drinks · 4:00 PM</p>
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}

function PhoneSceneGroup() {
  return (
    <PhoneShell title="Group activity" subtitle="Reactions & comments">
      <div className="space-y-2">
        <div className="rounded-xl border border-border bg-card p-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <img src="https://images.unsplash.com/photo-1540541338287-41700207dee6?w=160&q=80&auto=format&fit=crop" alt="Beach" className="h-11 w-11 rounded-lg object-cover shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-semibold text-foreground">La Brisa Beach Club</p>
              <p className="text-[8px] text-muted-foreground">Sunset · Canggu · $25</p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[8px] font-medium text-blue-600"><ThumbsUp className="h-2.5 w-2.5" />3</span>
            <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-50 px-1.5 py-0.5 text-[8px] font-medium text-orange-500"><Flame className="h-2.5 w-2.5" />2</span>
            <span className="inline-flex items-center gap-0.5 rounded-full bg-pink-50 px-1.5 py-0.5 text-[8px] font-medium text-pink-500"><Heart className="h-2.5 w-2.5" />1</span>
            <div className="ml-auto flex -space-x-1">
              <MiniAvatar label="S" className="bg-primary" />
              <MiniAvatar label="M" className="bg-orange-500" />
              <MiniAvatar label="A" className="bg-violet-500" />
            </div>
          </div>
        </div>
        <div className="flex items-start gap-1.5">
          <MiniAvatar label="M" className="bg-orange-500" />
          <div className="flex-1 rounded-xl rounded-tl-sm bg-muted px-2.5 py-1.5">
            <p className="text-[7px] font-semibold text-foreground">Maya</p>
            <p className="text-[7px] text-muted-foreground">This place looks amazing! Can we go for sunset?</p>
          </div>
        </div>
        <div className="flex items-start gap-1.5">
          <MiniAvatar label="S" className="bg-primary" />
          <div className="flex-1 rounded-xl rounded-tl-sm bg-muted px-2.5 py-1.5">
            <p className="text-[7px] font-semibold text-foreground">Sarah</p>
            <p className="text-[7px] text-muted-foreground">Yes — adding it now 🙌</p>
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}

function PhoneSceneExpenses() {
  const rows = [
    { title: "Dinner at Locavore", note: "Sarah paid", amount: "$45", icon: "🍽️" },
    { title: "Surf lesson", note: "Mike paid", amount: "$30", icon: "🏄" },
    { title: "Scooter rental", note: "You paid", amount: "$15", icon: "🛵" },
  ];
  return (
    <PhoneShell title="Trip expenses" subtitle="Balances & receipts">
      <div className="space-y-2">
        <div className="rounded-xl bg-gradient-to-br from-primary to-primary/80 px-3 py-2.5 text-primary-foreground shadow-sm">
          <p className="text-[7px] uppercase tracking-[0.14em] text-white/70">Your balance</p>
          <p className="mt-0.5 text-[18px] font-bold leading-none">You owe $180</p>
          <p className="mt-1.5 text-[7px] text-white/65">Split across 3 expenses</p>
        </div>
        {rows.map((r) => (
          <div key={r.title} className="flex items-center gap-2 rounded-xl border border-border bg-card px-2 py-1.5 shadow-sm">
            <span className="text-sm">{r.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[9px] font-medium text-foreground">{r.title}</p>
              <p className="text-[7px] text-muted-foreground">{r.note}</p>
            </div>
            <span className="text-[9px] font-semibold text-foreground">{r.amount}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 rounded-lg bg-primary/5 px-2 py-1.5 text-[7px] font-medium text-primary">
          <Receipt className="h-2.5 w-2.5" />Receipt scan: 3 items auto-detected
        </div>
      </div>
    </PhoneShell>
  );
}

function PhoneSceneConcierge() {
  return (
    <PhoneShell title="AI concierge" subtitle="Nearby recommendations">
      <div className="space-y-2">
        <div className="rounded-lg bg-muted px-2.5 py-1.5 text-[8px] text-muted-foreground flex items-center gap-1.5">
          <Search className="h-2.5 w-2.5" />Where should we eat tonight?
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <img src="https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&q=80&auto=format&fit=crop" alt="Restaurant" className="h-[88px] w-full object-cover" />
          <div className="p-2.5 space-y-1.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold text-foreground">Fishbone Local</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[7px] text-muted-foreground">
                  <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-700 font-medium">Seafood</span>
                  <span><Navigation className="inline h-2 w-2" /> 350m</span>
                </div>
              </div>
              <div className="flex items-center gap-0.5 text-[8px] font-medium"><Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />4.7</div>
            </div>
            <div className="inline-flex items-center gap-1 rounded-full bg-primary/5 border border-primary/10 px-2 py-0.5 text-[7px] font-semibold text-primary">
              <Sparkles className="h-2 w-2" />Recommended by Junto
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-sm">
          <img src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=160&q=80&auto=format&fit=crop" alt="Restaurant" className="h-9 w-9 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold text-foreground">Ulu Garden</p>
            <p className="text-[7px] text-muted-foreground">Vegan · 500m · 4.5★</p>
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}

const PHONE_SCENES = [PhoneScenePlan, PhoneSceneDay, PhoneSceneGroup, PhoneSceneExpenses, PhoneSceneConcierge];

/* ─── LAPTOP SCENES (companion view) ─── */

function LaptopScenePlan() {
  return (
    <div className="h-full bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-bold text-foreground">Bali Adventure</span>
        <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium text-primary">7 days</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { name: "Ubud", img: "https://images.unsplash.com/photo-1558862107-d49ef2a04d72?w=300&q=80&auto=format&fit=crop", days: "Day 1–3" },
          { name: "Canggu", img: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&q=80&auto=format&fit=crop", days: "Day 4–5" },
          { name: "Uluwatu", img: "https://images.unsplash.com/photo-1519046904884-53103b34b206?w=300&q=80&auto=format&fit=crop", days: "Day 6–7" },
        ].map((d) => (
          <div key={d.name} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <img src={d.img} alt={d.name} className="h-[60px] w-full object-cover" />
            <div className="p-2">
              <p className="text-[10px] font-semibold text-foreground">{d.name}</p>
              <p className="text-[8px] text-muted-foreground">{d.days}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-primary/10 bg-primary/5 px-2.5 py-2 text-[9px] font-medium text-primary">
        <Navigation className="h-3 w-3" />
        Route: Ubud → Canggu → Uluwatu
        <ChevronRight className="ml-auto h-3 w-3" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex -space-x-1.5">
          <MiniAvatar label="S" className="bg-primary h-6 w-6 text-[9px]" />
          <MiniAvatar label="M" className="bg-orange-500 h-6 w-6 text-[9px]" />
          <MiniAvatar label="A" className="bg-violet-500 h-6 w-6 text-[9px]" />
        </div>
        <span className="text-[9px] text-muted-foreground">3 travellers</span>
      </div>
    </div>
  );
}

function LaptopSceneDay() {
  return (
    <div className="h-full bg-background p-4">
      <div className="mb-3">
        <p className="text-[13px] font-bold text-foreground">Day 3 — Surf & Sunset</p>
        <p className="text-[9px] text-muted-foreground">3 activities planned</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <img src="https://images.unsplash.com/photo-1502680390548-bdbac40e4a4a?w=400&q=80&auto=format&fit=crop" alt="Surf" className="h-[72px] w-full object-cover" />
          <div className="p-2">
            <p className="text-[10px] font-semibold text-foreground">Surf Lesson</p>
            <div className="mt-0.5 flex items-center gap-1 text-[8px] text-muted-foreground">
              <Clock className="h-2.5 w-2.5" />8:00 AM
              <span className="ml-1 font-medium text-primary">$30</span>
            </div>
            <div className="mt-1 flex items-center gap-0.5"><TinyStars rating={4.6} /><span className="text-[7px] text-muted-foreground ml-1">4.6</span></div>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <img src="https://images.unsplash.com/photo-1540541338287-41700207dee6?w=400&q=80&auto=format&fit=crop" alt="Beach" className="h-[72px] w-full object-cover" />
          <div className="p-2">
            <p className="text-[10px] font-semibold text-foreground">La Brisa Beach Club</p>
            <div className="mt-0.5 flex items-center gap-1 text-[8px] text-muted-foreground">
              <Clock className="h-2.5 w-2.5" />4:00 PM
              <span className="ml-1 font-medium text-primary">$25</span>
            </div>
            <div className="mt-1 flex items-center gap-0.5"><TinyStars rating={4.8} /><span className="text-[7px] text-muted-foreground ml-1">4.8</span></div>
          </div>
        </div>
      </div>
      <div className="mt-2.5 rounded-lg border border-border bg-muted/50 p-2">
        <p className="text-[8px] font-medium text-foreground mb-0.5">Google review</p>
        <p className="text-[8px] italic text-muted-foreground leading-relaxed">"Amazing instructors, perfect waves for beginners. Highly recommend the morning slot."</p>
      </div>
    </div>
  );
}

function LaptopSceneGroup() {
  return (
    <div className="h-full bg-background p-4">
      <div className="mb-3">
        <p className="text-[13px] font-bold text-foreground">Group decisions</p>
        <p className="text-[9px] text-muted-foreground">Where should we go next?</p>
      </div>
      <div className="space-y-2">
        {[
          { dest: "Bali 🏝️", votes: 3, pct: 60 },
          { dest: "Japan 🏯", votes: 1, pct: 20 },
          { dest: "Greece 🇬🇷", votes: 1, pct: 20 },
        ].map((o, i) => (
          <div key={o.dest} className={cn("flex items-center gap-2 rounded-lg px-3 py-2", i === 0 ? "bg-primary/10 border border-primary/20" : "bg-muted/50 border border-border")}>
            <span className="text-[11px] flex-1">{o.dest}</span>
            <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
              <div className={cn("h-full rounded-full", i === 0 ? "bg-primary" : "bg-muted-foreground/30")} style={{ width: `${o.pct}%` }} />
            </div>
            <span className="text-[9px] font-medium text-muted-foreground w-8 text-right">{o.votes}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex -space-x-1.5">
          <MiniAvatar label="S" className="bg-primary h-6 w-6 text-[9px]" />
          <MiniAvatar label="M" className="bg-orange-500 h-6 w-6 text-[9px]" />
          <MiniAvatar label="A" className="bg-violet-500 h-6 w-6 text-[9px]" />
          <MiniAvatar label="J" className="bg-sky-500 h-6 w-6 text-[9px]" />
          <MiniAvatar label="L" className="bg-pink-500 h-6 w-6 text-[9px]" />
        </div>
        <span className="text-[9px] text-muted-foreground">5 voted · Bali is leading!</span>
      </div>
    </div>
  );
}

function LaptopSceneExpenses() {
  return (
    <div className="h-full bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[13px] font-bold text-foreground">Expense summary</p>
          <p className="text-[9px] text-muted-foreground">Bali Adventure · 4 members</p>
        </div>
        <div className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">$347.50</div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-xl border border-border bg-card p-2.5 shadow-sm">
          <p className="text-[8px] text-muted-foreground">You owe</p>
          <p className="text-[16px] font-bold text-foreground mt-0.5">$87.50</p>
          <p className="text-[8px] text-primary mt-1">→ Sarah</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-2.5 shadow-sm">
          <p className="text-[8px] text-muted-foreground">You're owed</p>
          <p className="text-[16px] font-bold text-foreground mt-0.5">$45.00</p>
          <p className="text-[8px] text-primary mt-1">← Mike</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {[
          { t: "Dinner at Locavore", p: "Sarah", a: "$142", e: "🍽️" },
          { t: "Surf lesson", p: "Mike", a: "$90", e: "🏄" },
          { t: "Scooter rental", p: "You", a: "$60", e: "🛵" },
        ].map((r) => (
          <div key={r.t} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[9px]">
            <span>{r.e}</span>
            <span className="flex-1 font-medium text-foreground">{r.t}</span>
            <span className="text-muted-foreground">{r.p}</span>
            <span className="font-semibold text-foreground">{r.a}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LaptopSceneConcierge() {
  return (
    <div className="h-full bg-background p-4">
      <div className="mb-3">
        <p className="text-[13px] font-bold text-foreground">AI Concierge</p>
        <p className="text-[9px] text-muted-foreground">Recommendations near you</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { name: "Fishbone Local", type: "Seafood", dist: "350m", rating: "4.7", img: "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=300&q=80&auto=format&fit=crop" },
          { name: "Ulu Garden", type: "Vegan", dist: "500m", rating: "4.5", img: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=300&q=80&auto=format&fit=crop" },
        ].map((r) => (
          <div key={r.name} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <img src={r.img} alt={r.name} className="h-[64px] w-full object-cover" />
            <div className="p-2 space-y-1">
              <p className="text-[10px] font-semibold text-foreground">{r.name}</p>
              <div className="flex items-center gap-1 text-[8px] text-muted-foreground">
                <span className="rounded-full bg-emerald-50 px-1 py-0.5 text-emerald-700 font-medium">{r.type}</span>
                <span>{r.dist}</span>
              </div>
              <div className="flex items-center gap-0.5 text-[8px]">
                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                <span className="font-medium text-foreground">{r.rating}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-primary/5 border border-primary/10 px-2.5 py-2 text-[9px] font-medium text-primary">
        <Sparkles className="h-3 w-3" />
        Based on your group's preferences
      </div>
    </div>
  );
}

const LAPTOP_SCENES = [LaptopScenePlan, LaptopSceneDay, LaptopSceneGroup, LaptopSceneExpenses, LaptopSceneConcierge];

const SCENE_LABELS = ["Plan overview", "Day detail", "Collaboration", "Expenses", "AI Concierge"];

/* ─── MAIN COMPONENT ─── */

export function PlanPreviewMockup({ onCTA }: { onCTA: () => void }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setActive((p) => (p + 1) % PHONE_SCENES.length), SCENE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <p className="mb-8 text-center text-sm font-medium text-muted-foreground">See what Junto AI builds for you</p>

      <div className="flex items-center justify-center gap-6 lg:gap-10">
        {/* Laptop frame */}
        <div className="hidden md:block w-[480px] lg:w-[540px] shrink-0">
          <div className="rounded-2xl border-[4px] border-zinc-800 bg-zinc-900 p-1 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.45)]">
            <div className="overflow-hidden rounded-xl bg-background">
              {/* Browser chrome */}
              <div className="flex items-center gap-1.5 bg-muted/80 px-3 py-2 border-b border-border">
                <div className="flex gap-1">
                  <div className="h-2 w-2 rounded-full bg-red-400/70" />
                  <div className="h-2 w-2 rounded-full bg-yellow-400/70" />
                  <div className="h-2 w-2 rounded-full bg-green-400/70" />
                </div>
                <div className="flex-1 mx-8 rounded-md bg-background border border-border px-3 py-0.5 text-[9px] text-muted-foreground text-center">
                  juntotravel.app
                </div>
              </div>
              {/* Laptop scene content */}
              <div className="relative h-[280px] lg:h-[310px] overflow-hidden">
                {LAPTOP_SCENES.map((Scene, i) => (
                  <div
                    key={i}
                    className={cn(
                      "absolute inset-0 transition-all duration-700 ease-out",
                      i === active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none",
                    )}
                  >
                    <Scene />
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Laptop base */}
          <div className="mx-auto h-3 w-[60%] rounded-b-xl bg-zinc-800" />
        </div>

        {/* Phone frame */}
        <div className="w-[280px] sm:w-[300px] shrink-0">
          <div className="relative overflow-hidden rounded-[2.2rem] border-[5px] border-zinc-900 bg-background shadow-[0_32px_80px_-28px_rgba(0,0,0,0.4)]">
            {/* Status bar */}
            <div className="flex items-center justify-between bg-card px-4 pb-1.5 pt-2.5">
              <span className="text-[10px] font-semibold text-foreground">9:41</span>
              <div className="h-4 w-16 rounded-full bg-zinc-950" />
              <div className="h-2 w-3.5 rounded-sm bg-foreground" />
            </div>

            {/* Scene label */}
            <div className="border-b border-border bg-card px-3 pb-1.5">
              <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-primary">{SCENE_LABELS[active]}</span>
            </div>

            {/* Scenes */}
            <div className="relative h-[380px] sm:h-[400px] overflow-hidden">
              {PHONE_SCENES.map((Scene, i) => (
                <div
                  key={i}
                  className={cn(
                    "absolute inset-0 transition-all duration-700 ease-out",
                    i === active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none",
                  )}
                >
                  <Scene />
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="border-t border-border bg-background px-3 pb-3 pt-2">
              <button
                type="button"
                onClick={onCTA}
                className="w-full rounded-xl bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground shadow-[0_12px_24px_-14px_hsl(var(--primary)/0.8)] transition hover:-translate-y-px"
              >
                Sign up free to unlock full plan
              </button>
            </div>
          </div>
        </div>
      </div>

      <Dots active={active} count={PHONE_SCENES.length} />

      <p className="mx-auto mt-5 max-w-md text-center text-sm leading-relaxed text-muted-foreground">
        Share this plan with your group → they vote, react, and customize it together.
      </p>
    </div>
  );
}

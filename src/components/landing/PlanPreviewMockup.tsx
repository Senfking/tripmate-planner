import { useState, useEffect } from "react";
import {
  Sparkles, MapPin, CalendarDays, DollarSign, Star, Clock,
  ThumbsUp, Flame, Heart, MessageCircle, Receipt, Search, Navigation
} from "lucide-react";

/* ── Dots ── */
function Dots({ active, count }: { active: number; count: number }) {
  return (
    <div className="flex justify-center gap-1.5 mt-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-1.5 rounded-full transition-all duration-300"
          style={{
            width: i === active ? 16 : 6,
            background: i === active ? "#0D9488" : "#d1d5db",
          }}
        />
      ))}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[8px] font-medium px-1.5 py-0.5 rounded-full border border-[#0D9488]/20 text-[#0D9488] bg-[#0D9488]/5">
      {children}
    </span>
  );
}

function MiniAvatar({ color, letter }: { color: string; letter: string }) {
  return (
    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0" style={{ background: color }}>
      {letter}
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-px">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`h-2 w-2 ${i <= Math.floor(rating) ? "fill-amber-400 text-amber-400" : i - 0.5 <= rating ? "fill-amber-400/50 text-amber-400/50" : "fill-gray-200 text-gray-200"}`} />
      ))}
    </div>
  );
}

/* ── Scene 1: Plan Overview ── */
function ScenePlan() {
  return (
    <div className="space-y-2.5">
      {/* Hero banner */}
      <div className="relative h-[100px] overflow-hidden">
        <img src="https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=600&q=70&auto=format&fit=crop" alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#fafaf9] via-transparent to-transparent" />
        <div className="absolute bottom-2 left-3 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-[#0D9488]" />
          <span className="font-bold text-[13px] text-[#1a1a1a] drop-shadow">Bali Adventure</span>
        </div>
      </div>
      <div className="px-3 space-y-2.5">
        <div className="flex gap-1 flex-wrap">
          <Pill><CalendarDays className="h-2 w-2" />7 days</Pill>
          <Pill><MapPin className="h-2 w-2" />3 cities</Pill>
          <Pill><Sparkles className="h-2 w-2" />14 activities</Pill>
          <Pill><DollarSign className="h-2 w-2" />~$1,200</Pill>
        </div>
        {/* Activity cards with photos */}
        {[
          { name: "Tegallalang Rice Terraces", time: "9 AM", cost: "$5", img: "https://images.unsplash.com/photo-1558862107-d49ef2a04d72?w=120&q=70&auto=format&fit=crop" },
          { name: "Tirta Empul Temple", time: "12 PM", cost: "$3", img: "https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=120&q=70&auto=format&fit=crop" },
          { name: "Ubud Monkey Forest", time: "3 PM", cost: "$7", img: "https://images.unsplash.com/photo-1540979388789-6cee28a1cdc9?w=120&q=70&auto=format&fit=crop" },
        ].map((a) => (
          <div key={a.name} className="flex gap-2 items-center bg-white rounded-lg border border-[#e8e8e8] p-2 shadow-sm">
            <img src={a.img} alt={a.name} className="w-9 h-9 rounded-md object-cover shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-semibold text-[#1a1a1a] truncate">{a.name}</p>
              <div className="flex items-center gap-1.5 text-[7px] text-[#9ca3af]">
                <span>{a.time}</span><span>·</span><span className="text-[#0D9488] font-medium">{a.cost}</span>
              </div>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-[9px] font-medium text-[#6b7280]">
          <Navigation className="h-2.5 w-2.5 text-[#0D9488]" />
          Ubud <span className="text-[#d1d5db]">→</span> Canggu <span className="text-[#d1d5db]">→</span> Uluwatu
        </div>
      </div>
    </div>
  );
}

/* ── Scene 2: Day Detail ── */
function SceneDay() {
  return (
    <div className="px-3 py-2 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-[#0D9488] flex items-center justify-center">
          <span className="text-[8px] font-bold text-white">3</span>
        </div>
        <span className="text-[11px] font-semibold text-[#1a1a1a]">Day 3</span>
        <span className="text-[9px] text-[#9ca3af]">· Surf & Sunset</span>
      </div>

      <div className="bg-white rounded-xl border border-[#e8e8e8] overflow-hidden shadow-sm">
        <img src="https://images.unsplash.com/photo-1502680390548-bdbac40e4a4a?w=400&q=70&auto=format&fit=crop" alt="Bali surf" className="w-full h-[90px] object-cover" />
        <div className="p-2.5 space-y-1.5">
          <p className="text-[11px] font-semibold text-[#1a1a1a]">Echo Beach Surf Lesson</p>
          <div className="flex items-center gap-2 text-[8px] text-[#9ca3af]">
            <span className="flex items-center gap-0.5"><Clock className="h-2 w-2" />8:00 AM</span>
            <span>·</span>
            <span className="text-[#0D9488] font-medium">$30</span>
            <span>·</span>
            <span className="flex items-center gap-0.5"><Star className="h-2 w-2 fill-amber-400 text-amber-400" />4.6</span>
          </div>
          <Stars rating={4.6} />
          <div className="bg-[#f9fafb] rounded-lg px-2 py-1.5 border border-[#f0f0f0]">
            <p className="text-[8px] text-[#6b7280] italic leading-snug">"Amazing instructors, perfect waves for beginners. Highly recommend the morning session!"</p>
            <p className="text-[7px] text-[#9ca3af] mt-0.5">— Google Review</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#e8e8e8] p-2.5 shadow-sm">
        <div className="flex gap-2 items-center">
          <img src="https://images.unsplash.com/photo-1519046904884-53103b34b206?w=120&q=70&auto=format&fit=crop" alt="La Brisa" className="w-9 h-9 rounded-md object-cover shrink-0" />
          <div>
            <p className="text-[9px] font-semibold text-[#1a1a1a]">La Brisa Beach Club</p>
            <p className="text-[7px] text-[#9ca3af]">4:00 PM · $25</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Scene 3: Group Collaboration ── */
function SceneGroup() {
  return (
    <div className="px-3 py-2 space-y-2.5">
      <div className="text-[9px] font-medium text-[#9ca3af]">Group activity</div>
      <div className="bg-white rounded-xl border border-[#e8e8e8] p-2.5 shadow-sm space-y-2.5">
        <div className="flex gap-2 items-center">
          <img src="https://images.unsplash.com/photo-1540541338287-41700207dee6?w=120&q=70&auto=format&fit=crop" alt="Beach club" className="w-10 h-10 rounded-lg object-cover shrink-0" />
          <div>
            <p className="text-[10px] font-semibold text-[#1a1a1a]">La Brisa Beach Club</p>
            <p className="text-[8px] text-[#9ca3af]">4:00 PM · $25 · Canggu</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {[
            { Icon: ThumbsUp, count: 3, bg: "#dbeafe", color: "#3b82f6" },
            { Icon: Flame, count: 2, bg: "#ffedd5", color: "#f97316" },
            { Icon: Heart, count: 1, bg: "#fce7f3", color: "#ec4899" },
          ].map((r, i) => (
            <div key={i} className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-medium" style={{ background: r.bg, color: r.color }}>
              <r.Icon className="h-2 w-2" />{r.count}
            </div>
          ))}
          <div className="flex -space-x-1 ml-auto">
            <MiniAvatar color="#0D9488" letter="S" />
            <MiniAvatar color="#f97316" letter="M" />
            <MiniAvatar color="#8b5cf6" letter="A" />
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 items-start">
        <MiniAvatar color="#f97316" letter="M" />
        <div className="flex-1 bg-[#f3f4f6] rounded-xl rounded-tl-sm px-2.5 py-1.5">
          <p className="text-[8px] font-semibold text-[#1a1a1a] mb-0.5">Maya</p>
          <p className="text-[8px] text-[#4b5563] leading-snug">This place looks amazing! Can we go for sunset? 🌅</p>
        </div>
      </div>

      <div className="flex gap-1.5 items-start">
        <MiniAvatar color="#0D9488" letter="S" />
        <div className="flex-1 bg-[#f3f4f6] rounded-xl rounded-tl-sm px-2.5 py-1.5">
          <p className="text-[8px] font-semibold text-[#1a1a1a] mb-0.5">Sarah</p>
          <p className="text-[8px] text-[#4b5563] leading-snug">Yes! Let's book the sunset table 🙌</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 bg-white rounded-lg border border-[#e8e8e8] px-2.5 py-2">
        <MessageCircle className="h-2.5 w-2.5 text-[#9ca3af]" />
        <span className="text-[8px] text-[#9ca3af]">Reply…</span>
      </div>
    </div>
  );
}

/* ── Scene 4: Smart Expenses ── */
function SceneExpenses() {
  return (
    <div className="px-3 py-2 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <DollarSign className="h-3.5 w-3.5 text-[#0D9488]" />
        <span className="font-bold text-[12px] text-[#1a1a1a]">Trip expenses</span>
      </div>

      <div className="bg-gradient-to-br from-[#0D9488] to-[#0F766E] rounded-xl px-3 py-3 text-center">
        <p className="text-[8px] text-white/70 font-medium mb-0.5">Your balance</p>
        <p className="text-[20px] font-bold text-white">You owe $180</p>
        <p className="text-[7px] text-white/50 mt-0.5">Settle up with Sarah</p>
      </div>

      <div className="space-y-1.5">
        {[
          { title: "Dinner at Locavore", who: "Sarah paid", amount: "$45", emoji: "🍽️" },
          { title: "Surf lesson", who: "Mike paid", amount: "$30", emoji: "🏄" },
          { title: "Scooter rental", who: "You paid", amount: "$15", emoji: "🛵" },
        ].map((item) => (
          <div key={item.title} className="flex items-center gap-2 bg-white rounded-lg border border-[#e8e8e8] px-2.5 py-2">
            <span className="text-sm">{item.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-medium text-[#1a1a1a] truncate">{item.title}</p>
              <p className="text-[7px] text-[#9ca3af]">{item.who}</p>
            </div>
            <span className="text-[9px] font-semibold text-[#1a1a1a]">{item.amount}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 text-[8px] text-[#0D9488] font-medium bg-[#0D9488]/5 rounded-lg px-2.5 py-2 border border-[#0D9488]/10">
        <Receipt className="h-2.5 w-2.5" />
        Scan receipt to add automatically
      </div>
    </div>
  );
}

/* ── Scene 5: AI Concierge ── */
function SceneConcierge() {
  return (
    <div className="px-3 py-2 space-y-2.5">
      <div className="flex items-center gap-1.5 bg-[#f3f4f6] rounded-lg px-2.5 py-2">
        <Search className="h-3 w-3 text-[#9ca3af]" />
        <span className="text-[9px] text-[#1a1a1a]">Where should we eat tonight?</span>
      </div>

      <div className="bg-white rounded-xl border border-[#e8e8e8] overflow-hidden shadow-sm">
        <img src="https://images.unsplash.com/photo-1559339352-11d035aa65de?w=400&q=70&auto=format&fit=crop" alt="Seafood restaurant" className="w-full h-[80px] object-cover" />
        <div className="p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-[#1a1a1a]">Fishbone Local</p>
            <span className="flex items-center gap-0.5 text-[8px] font-medium">
              <Star className="h-2 w-2 fill-amber-400 text-amber-400" />4.7
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[7px] font-medium px-1.5 py-0.5 rounded-full bg-[#f0fdf4] text-[#15803d]">Seafood</span>
            <span className="text-[7px] text-[#9ca3af] flex items-center gap-0.5"><Navigation className="h-2 w-2" />350m</span>
          </div>
          <div className="flex items-center gap-1 bg-[#0D9488]/5 border border-[#0D9488]/10 rounded px-2 py-1">
            <Sparkles className="h-2 w-2 text-[#0D9488]" />
            <span className="text-[7px] font-medium text-[#0D9488]">Recommended by Junto</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#e8e8e8] p-2 shadow-sm">
        <div className="flex gap-2 items-center">
          <img src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=120&q=70&auto=format&fit=crop" alt="Restaurant" className="w-9 h-9 rounded-md object-cover shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-semibold text-[#1a1a1a]">Ulu Garden</p>
            <div className="flex items-center gap-1 text-[7px] text-[#9ca3af]">
              <span>Vegan</span><span>·</span><span>500m</span>
              <span>·</span><Star className="h-2 w-2 fill-amber-400 text-amber-400" /><span>4.5</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const SCENES = [ScenePlan, SceneDay, SceneGroup, SceneExpenses, SceneConcierge];
const LABELS = ["Plan overview", "Day detail", "Group collaboration", "Smart expenses", "AI concierge"];

export function PlanPreviewMockup({ onCTA }: { onCTA: () => void }) {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setActive((p) => (p + 1) % SCENES.length);
        setVisible(true);
      }, 400);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const Scene = SCENES[active];

  return (
    <div className="mx-auto max-w-lg">
      <p className="text-center text-sm font-medium text-[#9ca3af] mb-5">See what Junto AI builds for you</p>

      <div className="mx-auto max-w-[340px]">
        <div
          className="rounded-[2.5rem] border-[6px] border-[#1a1a1e] bg-[#fafaf9] overflow-hidden relative"
          style={{ boxShadow: "0 25px 60px -12px rgba(0,0,0,0.3)" }}
        >
          {/* Status bar */}
          <div className="bg-white px-5 pt-3 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#1a1a1a]">9:41</span>
            <div className="w-20 h-5 bg-black rounded-full" />
            <div className="flex gap-1"><div className="w-4 h-2 rounded-sm bg-[#1a1a1a]" /></div>
          </div>

          {/* Scene label */}
          <div className="bg-white px-4 pb-2 border-b border-[#e5e5e5]">
            <span className="text-[10px] font-medium text-[#0D9488] tracking-wide uppercase">{LABELS[active]}</span>
          </div>

          {/* Scene */}
          <div className="h-[380px] overflow-hidden bg-[#fafaf9]">
            <div className="h-full transition-opacity duration-400" style={{ opacity: visible ? 1 : 0 }}>
              <Scene />
            </div>
          </div>

          {/* CTA */}
          <div className="px-4 pb-4 pt-2 bg-[#fafaf9] border-t border-[#e5e5e5]">
            <button
              onClick={onCTA}
              className="w-full flex items-center justify-center gap-2 text-white font-semibold rounded-xl py-2.5 text-[13px]"
              style={{ background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)" }}
            >
              Sign up free to unlock full plan
            </button>
          </div>
        </div>
      </div>

      <Dots active={active} count={SCENES.length} />

      <p className="mt-5 text-center text-sm text-[#6b7280] leading-relaxed max-w-md mx-auto">
        Share this plan with your group → they vote, react, and customize it together.
      </p>
    </div>
  );
}

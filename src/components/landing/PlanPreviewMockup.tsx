import { useState, useEffect } from "react";
import {
  Sparkles, MapPin, CalendarDays, DollarSign, Star, Clock,
  ThumbsUp, Flame, Heart, MessageCircle, Receipt, Search, Navigation
} from "lucide-react";

/* ── Dot indicators ── */
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

/* ── Shared small components ── */
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full border border-[#0D9488]/20 text-[#0D9488] bg-[#0D9488]/5">
      {children}
    </span>
  );
}

function Avatar({ color, letter }: { color: string; letter: string }) {
  return (
    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0" style={{ background: color }}>
      {letter}
    </div>
  );
}

/* ── Scene 1: Plan Overview ── */
function ScenePlan() {
  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#0D9488]" />
        <span className="font-bold text-[14px] text-[#1a1a1a]">Bali Adventure</span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        <Pill><CalendarDays className="h-2.5 w-2.5" />7 days</Pill>
        <Pill><MapPin className="h-2.5 w-2.5" />3 cities</Pill>
        <Pill><Sparkles className="h-2.5 w-2.5" />14 activities</Pill>
        <Pill><DollarSign className="h-2.5 w-2.5" />~$1,200</Pill>
      </div>

      {/* Mini map */}
      <div className="relative rounded-xl overflow-hidden bg-[#e8f4f2] h-[120px]">
        <div className="absolute inset-0 opacity-30" style={{ background: "url('https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?w=600&q=60&auto=format&fit=crop') center/cover" }} />
        {[
          { top: "25%", left: "30%", label: "Ubud" },
          { top: "55%", left: "55%", label: "Canggu" },
          { top: "70%", left: "70%", label: "Uluwatu" },
        ].map((pin) => (
          <div key={pin.label} className="absolute flex flex-col items-center" style={{ top: pin.top, left: pin.left }}>
            <div className="w-5 h-5 rounded-full bg-[#0D9488] border-2 border-white shadow flex items-center justify-center">
              <MapPin className="h-2.5 w-2.5 text-white" />
            </div>
            <span className="text-[8px] font-semibold text-[#1a1a1a] mt-0.5 bg-white/80 rounded px-1">{pin.label}</span>
          </div>
        ))}
      </div>

      {/* Route */}
      <div className="flex items-center gap-2 text-[11px] font-medium text-[#1a1a1a]">
        <Navigation className="h-3 w-3 text-[#0D9488]" />
        <span>Ubud</span>
        <span className="text-[#9ca3af]">→</span>
        <span>Canggu</span>
        <span className="text-[#9ca3af]">→</span>
        <span>Uluwatu</span>
      </div>
    </div>
  );
}

/* ── Scene 2: Day Detail ── */
function SceneDay() {
  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-[#0D9488] flex items-center justify-center">
          <span className="text-[9px] font-bold text-white">3</span>
        </div>
        <span className="text-[12px] font-semibold text-[#1a1a1a]">Day 3</span>
        <span className="text-[10px] text-[#9ca3af]">· Surf & Sunset</span>
      </div>

      <div className="bg-white rounded-xl border border-[#e8e8e8] p-3 shadow-sm space-y-2.5">
        <div className="h-24 rounded-lg bg-[#0D9488]/10 flex items-center justify-center">
          <div className="text-center">
            <MapPin className="h-5 w-5 text-[#0D9488] mx-auto mb-1" />
            <span className="text-[9px] text-[#0D9488] font-medium">Echo Beach, Bali</span>
          </div>
        </div>
        <p className="text-[12px] font-semibold text-[#1a1a1a]">Echo Beach Surf Lesson</p>
        <div className="flex items-center gap-2 text-[9px] text-[#9ca3af]">
          <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />8:00 AM</span>
          <span>·</span>
          <span className="text-[#0D9488] font-medium">$30</span>
          <span>·</span>
          <span className="flex items-center gap-0.5">
            <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />4.6
          </span>
        </div>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4].map(i => <Star key={i} className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />)}
          <Star className="h-2.5 w-2.5 fill-amber-400/40 text-amber-400/40" />
        </div>
        <p className="text-[9px] text-[#6b7280] italic leading-snug">
          "Amazing instructors, perfect waves for beginners"
        </p>
      </div>
    </div>
  );
}

/* ── Scene 3: Group Collaboration ── */
function SceneGroup() {
  return (
    <div className="px-4 py-3 space-y-3">
      <div className="text-[11px] font-medium text-[#9ca3af]">Group activity</div>
      <div className="bg-white rounded-xl border border-[#e8e8e8] p-3 shadow-sm space-y-3">
        <div className="flex gap-2.5">
          <div className="w-11 h-11 rounded-lg bg-[#0D9488]/10 shrink-0 flex items-center justify-center">
            <MapPin className="h-3.5 w-3.5 text-[#0D9488]" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[#1a1a1a]">La Brisa Beach Club</p>
            <p className="text-[9px] text-[#9ca3af]">4:00 PM · $25 · Canggu</p>
          </div>
        </div>

        {/* Reactions */}
        <div className="flex items-center gap-3">
          {[
            { icon: ThumbsUp, count: 3, bg: "#dbeafe", color: "#3b82f6" },
            { icon: Flame, count: 2, bg: "#ffedd5", color: "#f97316" },
            { icon: Heart, count: 1, bg: "#fce7f3", color: "#ec4899" },
          ].map((r, i) => (
            <div key={i} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium" style={{ background: r.bg, color: r.color }}>
              <r.icon className="h-2.5 w-2.5" />{r.count}
            </div>
          ))}
          <div className="flex -space-x-1.5 ml-auto">
            <Avatar color="#0D9488" letter="S" />
            <Avatar color="#f97316" letter="M" />
            <Avatar color="#8b5cf6" letter="A" />
          </div>
        </div>
      </div>

      {/* Comment */}
      <div className="flex gap-2 items-start">
        <Avatar color="#f97316" letter="M" />
        <div className="flex-1 bg-[#f3f4f6] rounded-xl rounded-tl-sm px-3 py-2">
          <p className="text-[9px] font-semibold text-[#1a1a1a] mb-0.5">Maya</p>
          <p className="text-[10px] text-[#4b5563] leading-snug">
            This place looks amazing! Can we go for sunset? 🌅
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-[#f9fafb] rounded-lg px-3 py-2">
        <MessageCircle className="h-3 w-3 text-[#9ca3af]" />
        <span className="text-[9px] text-[#9ca3af]">Reply to Maya…</span>
      </div>
    </div>
  );
}

/* ── Scene 4: Smart Expenses ── */
function SceneExpenses() {
  const items = [
    { title: "Dinner at Locavore", amount: "$45" },
    { title: "Surf lesson", amount: "$30" },
    { title: "Scooter rental", amount: "$15" },
  ];
  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-[#0D9488]" />
        <span className="font-bold text-[13px] text-[#1a1a1a]">Trip expenses</span>
      </div>

      <div className="bg-[#0D9488]/5 border border-[#0D9488]/15 rounded-xl px-4 py-3 text-center">
        <p className="text-[9px] text-[#0D9488] font-medium mb-0.5">Your balance</p>
        <p className="text-[22px] font-bold text-[#0D9488]">You owe $180</p>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.title} className="flex items-center justify-between bg-white rounded-lg border border-[#e8e8e8] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#f3f4f6] flex items-center justify-center">
                <Receipt className="h-3 w-3 text-[#6b7280]" />
              </div>
              <span className="text-[11px] font-medium text-[#1a1a1a]">{item.title}</span>
            </div>
            <span className="text-[11px] font-semibold text-[#1a1a1a]">{item.amount}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-[9px] text-[#0D9488] font-medium">
        <Receipt className="h-3 w-3" />
        Scan a receipt to add automatically
      </div>
    </div>
  );
}

/* ── Scene 5: AI Concierge ── */
function SceneConcierge() {
  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center gap-2 bg-[#f3f4f6] rounded-xl px-3 py-2.5">
        <Search className="h-3.5 w-3.5 text-[#9ca3af]" />
        <span className="text-[11px] text-[#1a1a1a]">Where should we eat tonight?</span>
      </div>

      <div className="bg-white rounded-xl border border-[#e8e8e8] p-3 shadow-sm space-y-2.5">
        <div className="h-20 rounded-lg bg-[#0D9488]/10 flex items-center justify-center">
          <MapPin className="h-5 w-5 text-[#0D9488]" />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold text-[#1a1a1a]">Fishbone Local</p>
          <span className="flex items-center gap-0.5 text-[9px] font-medium text-[#1a1a1a]">
            <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />4.7
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-[#f0fdf4] text-[#15803d]">Seafood</span>
          <span className="text-[9px] text-[#9ca3af] flex items-center gap-0.5">
            <Navigation className="h-2 w-2" />350m
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-[#0D9488]/5 border border-[#0D9488]/15 rounded-lg px-3 py-2">
        <Sparkles className="h-3 w-3 text-[#0D9488]" />
        <span className="text-[9px] font-medium text-[#0D9488]">Recommended by Junto</span>
      </div>

      <div className="bg-white rounded-xl border border-[#e8e8e8] p-2.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0D9488]/10 flex items-center justify-center shrink-0">
            <MapPin className="h-3 w-3 text-[#0D9488]" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[#1a1a1a]">Ulu Garden</p>
            <p className="text-[8px] text-[#9ca3af]">Vegan · 500m · ⭐ 4.5</p>
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

      {/* Phone frame */}
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

          {/* Scene content */}
          <div className="h-[380px] overflow-hidden bg-[#fafaf9]">
            <div
              className="h-full transition-opacity duration-400"
              style={{ opacity: visible ? 1 : 0 }}
            >
              <Scene />
            </div>
          </div>

          {/* CTA inside phone */}
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

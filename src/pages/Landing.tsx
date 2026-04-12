import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Search,
  DollarSign,
  CheckSquare,
  Compass,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";


/* ------------------------------------------------------------------ */
/*  Scroll-reveal hook                                                 */
/* ------------------------------------------------------------------ */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add("landing-visible"); io.unobserve(el); } },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Reveal({ children, className = "", delay = "" }: { children: React.ReactNode; className?: string; delay?: string }) {
  const ref = useReveal();
  return (
    <div ref={ref} className={`landing-reveal ${className}`} style={delay ? { transitionDelay: delay } : undefined}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */
const QUICK_DESTINATIONS = ["Bali", "Japan", "Italy", "Thailand", "Greece", "Mexico"];

const SAMPLE_PLAN = {
  stats: ["7 days", "3 cities", "14 activities", "~$1,200"],
  days: [
    { label: "Day 1 · Ubud", activities: "Tegallalang Rice Terraces, Tirta Empul Temple, Ubud Monkey Forest" },
    { label: "Day 2 · Ubud", activities: "Mount Batur sunrise trek, Luwak coffee, Campuhan Ridge Walk" },
    { label: "Day 3 · Canggu", activities: "Echo Beach surf lesson, La Brisa sunset, night market" },
    { label: "Day 4-7", activities: "Nusa Penida island hop, snorkeling, Kelingking Beach, Uluwatu Temple..." },
  ],
};

const TRIP_TEMPLATES = [
  { name: "Bali 7 days", vibe: "Culture + beaches", color: "from-teal-700 to-emerald-600",
    img: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=600&q=80&auto=format&fit=crop" },
  { name: "Japan 10 days", vibe: "Tokyo to Kyoto", color: "from-rose-700 to-pink-500",
    img: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=600&q=80&auto=format&fit=crop" },
  { name: "Greece 5 days", vibe: "Island hopping", color: "from-blue-700 to-sky-500",
    img: "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=600&q=80&auto=format&fit=crop" },
  { name: "Thailand 8 days", vibe: "Bangkok + islands", color: "from-amber-700 to-yellow-500",
    img: "https://images.unsplash.com/photo-1528181304800-259b08848526?w=600&q=80&auto=format&fit=crop" },
  { name: "Italy 10 days", vibe: "Rome to Amalfi", color: "from-orange-700 to-amber-500",
    img: "https://images.unsplash.com/photo-1515859005217-8a1f08870f59?w=600&q=80&auto=format&fit=crop" },
  { name: "Portugal 7 days", vibe: "Lisbon + Porto", color: "from-indigo-700 to-blue-500",
    img: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=600&q=80&auto=format&fit=crop" },
  { name: "Colombia 9 days", vibe: "Cartagena to Medellín", color: "from-emerald-700 to-green-500",
    img: "https://images.unsplash.com/photo-1518638150340-f706e86654de?w=600&q=80&auto=format&fit=crop" },
  { name: "Morocco 6 days", vibe: "Marrakech + desert", color: "from-red-800 to-orange-600",
    img: "https://images.unsplash.com/photo-1489749798305-4fea3ae63d43?w=600&q=80&auto=format&fit=crop" },
];

const FEATURES = [
  {
    icon: Sparkles,
    headline: "AI plans your entire trip",
    description: "Tell us where, when, and your vibe. Junto AI generates a full day-by-day itinerary with real venues, photos, reviews, and cost estimates.",
  },
  {
    icon: DollarSign,
    headline: "Split expenses without the spreadsheet",
    description: "Scan receipts with AI, track in any currency, auto-calculate who owes what. No more awkward money conversations.",
  },
  {
    icon: CheckSquare,
    headline: "Decide as a group",
    description: "Polls, voting, and reactions so nobody's left out of the decision. Democracy, but for holidays.",
  },
  {
    icon: Compass,
    headline: "Your on-trip AI concierge",
    description: "Ask 'where should we eat tonight?' and get real, verified suggestions with photos, ratings, and pro tips.",
  },
];

const HOW_STEPS = [
  { num: 1, title: "Tell us your vibe", desc: "Destination, dates, budget, style" },
  { num: 2, title: "AI builds your plan", desc: "Full itinerary with real venues" },
  { num: 3, title: "Travel together", desc: "Share, vote, track expenses" },
];

/* ------------------------------------------------------------------ */
/*  Phone mockup placeholder                                           */
/* ------------------------------------------------------------------ */
function PhoneMockup() {
  return (
    <div className="mx-auto w-[180px] sm:w-[200px]">
      <div className="rounded-[1.8rem] border-[4px] border-[#2a2a2e] bg-[#18181b] p-1.5 shadow-2xl shadow-black/40">
        <div className="absolute left-1/2 top-1 -translate-x-1/2 w-16 h-3 bg-[#1e1e21] rounded-b-xl z-10" />
        <div className="rounded-[1.4rem] bg-gradient-to-br from-[#1a1a1f] to-[#111114] aspect-[9/19] flex items-center justify-center">
          <div className="space-y-2 px-3 w-full">
            <div className="h-2 w-3/4 rounded bg-white/[0.06]" />
            <div className="h-2 w-1/2 rounded bg-white/[0.04]" />
            <div className="h-8 w-full rounded-lg bg-primary/10 mt-3" />
            <div className="h-8 w-full rounded-lg bg-white/[0.04]" />
            <div className="h-8 w-full rounded-lg bg-white/[0.03]" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Header                                                             */
/* ------------------------------------------------------------------ */
function Header({ onGetStarted }: { onGetStarted: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <nav
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "backdrop-blur-xl bg-[#0f1115]/85 border-b border-white/[0.06] shadow-lg shadow-black/20"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-6xl flex items-center justify-between px-5 h-14">
        <Link to="/" className="text-[0.95rem] font-bold tracking-[0.28em] uppercase text-white/90">
          Junto
        </Link>
        <button
          onClick={onGetStarted}
          className="text-sm font-semibold px-5 py-2 rounded-full text-white transition-all hover:scale-105"
          style={{ background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)" }}
        >
          Get started
        </button>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/*  Main landing page                                                  */
/* ------------------------------------------------------------------ */
export default function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState("");

  // Redirect auth users
  useEffect(() => {
    if (!loading && user) navigate("/app/trips", { replace: true });
  }, [loading, user, navigate]);

  const openBuilder = useCallback((dest?: string) => {
    // Auth required for AI generation — send to signup, we'll handle post-auth redirect later
    navigate("/ref");
  }, [navigate]);

  const handleGetStarted = useCallback(() => {
    navigate("/ref");
  }, [navigate]);

  if (loading) return null;
  if (user) return null;

  return (
    <div className="bg-white text-[#1a1a1a] min-h-screen overflow-x-hidden">
      <Header onGetStarted={handleGetStarted} />

      {/* ─── HERO ─── */}
      <section className="relative min-h-dvh flex flex-col justify-end overflow-hidden">
        {/* Background photo */}
        <img
          src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80&auto=format&fit=crop"
          alt="Tropical beach destination"
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
        />
        {/* Dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 via-40% to-black/80" />

        <div className="relative z-10 mx-auto max-w-3xl w-full px-5 pb-8 pt-24 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium text-white/90 backdrop-blur-md mb-6"
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.15)" }}>
            <Sparkles className="h-3.5 w-3.5 text-[#2dd4bf]" />
            AI-powered trip planning
          </div>

          <h1 className="text-[2.2rem] sm:text-5xl lg:text-6xl font-bold text-white leading-[1.1] tracking-tight">
            Plan your group trip<br />in 30 seconds
          </h1>

          <p className="mt-4 text-[1rem] sm:text-lg text-white/70 max-w-lg mx-auto leading-relaxed">
            AI builds your itinerary. Split expenses.<br className="hidden sm:block" />
            Vote on decisions. All in one place.
          </p>

          {/* Frosted glass card */}
          <div className="mt-8 rounded-2xl p-5 text-left backdrop-blur-xl mx-auto max-w-lg"
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.15)" }}>
            {/* Search input */}
            <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3">
              <Search className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Where do you want to go?"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && searchValue.trim()) openBuilder(searchValue.trim()); }}
                className="flex-1 bg-transparent text-[#1a1a1a] placeholder:text-gray-400 text-[15px] outline-none"
              />
            </div>

            {/* Quick chips */}
            <div className="flex flex-wrap gap-2 mt-3">
              {QUICK_DESTINATIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => openBuilder(d)}
                  className="text-[13px] font-medium text-white/90 rounded-full px-3 py-1.5 transition-colors hover:bg-white/20"
                  style={{ background: "rgba(255,255,255,0.15)" }}
                >
                  {d}
                </button>
              ))}
            </div>

            {/* CTA */}
            <button
              onClick={() => openBuilder(searchValue.trim() || undefined)}
              className="w-full mt-4 flex items-center justify-center gap-2 text-white font-semibold rounded-xl py-3.5 text-[15px] transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)", boxShadow: "0 4px 20px rgba(13,148,136,0.35)" }}
            >
              <Sparkles className="h-4 w-4" />
              Plan with Junto AI
            </button>
          </div>
        </div>
      </section>

      {/* ─── PLAN PREVIEW ─── */}
      <section className="py-16 sm:py-24 px-5 bg-[#fafaf9]">
        <div className="mx-auto max-w-lg">
          <Reveal>
            <p className="text-center text-sm font-medium text-[#9ca3af] mb-6">See what Junto AI generates</p>
          </Reveal>

          <Reveal delay="0.1s">
            <div className="rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-sm">
              {/* Header */}
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-4 w-4 text-[#0D9488]" />
                <span className="text-sm font-semibold text-[#0D9488]">Junto AI plan preview</span>
              </div>

              {/* Stat pills */}
              <div className="flex flex-wrap gap-2 mb-5">
                {SAMPLE_PLAN.stats.map((s) => (
                  <span key={s} className="text-xs font-medium px-2.5 py-1 rounded-full border border-[#0D9488]/20 text-[#0D9488] bg-[#0D9488]/5">
                    {s}
                  </span>
                ))}
              </div>

              {/* Days */}
              <div className="space-y-4 relative">
                {SAMPLE_PLAN.days.map((day, i) => (
                  <div
                    key={i}
                    className="border-l-[3px] border-[#0D9488] pl-4 relative"
                    style={{
                      opacity: i >= 3 ? 0.25 : i >= 2 ? 0.5 : 1,
                      filter: i >= 3 ? "blur(3px)" : i >= 2 ? "blur(1.5px)" : "none",
                    }}
                  >
                    <p className="text-sm font-semibold text-[#0D9488]">{day.label}</p>
                    <p className="text-sm text-[#6b7280] mt-0.5">{day.activities}</p>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                onClick={handleGetStarted}
                className="w-full mt-6 flex items-center justify-center gap-2 text-white font-semibold rounded-xl py-3 text-[14px] transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)" }}
              >
                Sign up free to unlock full plan
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── TRIP TEMPLATES ─── */}
      <section className="py-16 sm:py-24 px-5">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-[#1a1a1a]">Popular trip plans</h2>
              <button className="text-sm font-medium text-[#0D9488] hover:underline">See all</button>
            </div>
          </Reveal>

          <Reveal delay="0.1s">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              {TRIP_TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  onClick={() => openBuilder(t.name.split(" ")[0])}
                  className="group rounded-xl overflow-hidden border border-[#e5e5e5] bg-white shadow-sm hover:shadow-md transition-shadow text-left"
                >
                  <div className="aspect-[4/3] relative overflow-hidden">
                    <img
                      src={t.img}
                      alt={t.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-3">
                    <p className="font-semibold text-sm text-[#1a1a1a]">{t.name}</p>
                    <p className="text-xs text-[#9ca3af] mt-0.5">{t.vibe}</p>
                  </div>
                </button>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── FEATURES (dark cards) ─── */}
      <section className="py-16 sm:py-24 px-5 bg-[#0f1115]">
        <div className="mx-auto max-w-3xl space-y-6">
          {FEATURES.map((f, i) => (
            <Reveal key={i} delay={`${i * 0.1}s`}>
              <div
                className="rounded-2xl p-6 sm:p-8 relative overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  boxShadow: "0 0 40px rgba(13,148,136,0.03)",
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                  <div className="flex-1">
                    {/* Icon */}
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                      style={{ background: "rgba(13,148,136,0.15)" }}>
                      <f.icon className="h-5 w-5 text-[#2dd4bf]" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-2">{f.headline}</h3>
                    <p className="text-sm sm:text-[15px] text-[#9ca3af] leading-relaxed">{f.description}</p>
                  </div>
                  {/* Phone mockup placeholder */}
                  <div className="sm:shrink-0">
                    <PhoneMockup />
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="py-16 sm:py-24 px-5 bg-[#fafaf9]">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#1a1a1a] mb-12">How it works</h2>
          </Reveal>

          <div className="grid sm:grid-cols-3 gap-8 sm:gap-6">
            {HOW_STEPS.map((s, i) => (
              <Reveal key={s.num} delay={`${i * 0.1}s`}>
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg mb-4"
                    style={{ background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)" }}>
                    {s.num}
                  </div>
                  <h3 className="font-semibold text-[#1a1a1a] text-[15px] mb-1">{s.title}</h3>
                  <p className="text-sm text-[#9ca3af]">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── EVERYTHING YOUR GROUP NEEDS ─── */}
      <section className="py-16 sm:py-24 px-5">
        <div className="mx-auto max-w-lg text-center">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#1a1a1a] mb-8">Everything your group needs</h2>
          </Reveal>
          <Reveal delay="0.1s">
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Sparkles, label: "AI planner", sub: "Full itinerary" },
                { icon: DollarSign, label: "Expenses", sub: "Auto-split bills" },
                { icon: CheckSquare, label: "Group votes", sub: "Decide together" },
                { icon: Compass, label: "Concierge", sub: "Find spots live" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-[#e5e5e5] bg-[#fafaf9] p-5 flex flex-col items-center">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                    style={{ background: "rgba(13,148,136,0.12)" }}>
                    <item.icon className="h-5 w-5 text-[#0D9488]" />
                  </div>
                  <p className="font-semibold text-sm text-[#1a1a1a]">{item.label}</p>
                  <p className="text-xs text-[#9ca3af] mt-0.5">{item.sub}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── BOTTOM CTA ─── */}
      <section className="py-16 sm:py-24 px-5 bg-[#fafaf9]">
        <div className="mx-auto max-w-md text-center">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#1a1a1a] mb-2">Ready to plan?</h2>
            <p className="text-sm text-[#9ca3af] mb-8">Free to use. No credit card needed.</p>
            <button
              onClick={() => openBuilder()}
              className="w-full sm:w-auto sm:px-12 flex items-center justify-center gap-2 text-white font-semibold rounded-2xl py-4 text-[16px] mx-auto transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)", boxShadow: "0 4px 24px rgba(13,148,136,0.35)" }}
            >
              <Sparkles className="h-4 w-4" />
              Start planning for free
            </button>
          </Reveal>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="py-8 px-5 border-t border-[#e5e5e5]">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#9ca3af]">
          <span className="font-bold tracking-[0.2em] uppercase text-[#1a1a1a] text-xs">Junto</span>
          <div className="flex items-center gap-6">
            <Link to="/privacy" className="hover:text-[#1a1a1a] transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-[#1a1a1a] transition-colors">Terms</Link>
          </div>
          <span className="text-xs">&copy; {new Date().getFullYear()} Junto</span>
        </div>
      </footer>
    </div>
  );
}

import { useEffect, useRef, useCallback, useState } from "react";
import { Link } from "react-router-dom";
import {
  Wallet,
  Vote,
  CalendarDays,
  ArrowRight,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Scroll-reveal                                                      */
/* ------------------------------------------------------------------ */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("landing-visible");
          io.unobserve(el);
        }
      },
      { threshold: 0.12 },
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
/*  Phone Frames with unique skeleton screens                          */
/* ------------------------------------------------------------------ */

// Generic phone chrome wrapper
function PhoneChrome({ children, className = "", tilt = false }: { children: React.ReactNode; className?: string; tilt?: boolean }) {
  return (
    <div className={`relative mx-auto ${className}`}>
      <div
        className={`rounded-[2.5rem] border-[6px] border-[#2a2a2e] bg-[#18181b] p-2 shadow-2xl shadow-black/40 ${
          tilt ? "transform rotate-[2deg] hover:rotate-0 transition-transform duration-500" : ""
        }`}
      >
        <div className="absolute left-1/2 top-2 -translate-x-1/2 w-24 h-5 bg-[#1e1e21] rounded-b-2xl z-10" />
        <div className="rounded-[2rem] bg-gradient-to-br from-[#1a1a1f] to-[#111114] aspect-[9/19] flex flex-col overflow-hidden relative">
          {children}
        </div>
      </div>
    </div>
  );
}

// Dashboard skeleton (hero)
function SkeletonDashboard({ className = "" }: { className?: string }) {
  return (
    <PhoneChrome className={className}>
      <div className="w-full px-4 pt-10 space-y-3 flex-1">
        <div className="h-3 w-3/4 rounded bg-white/[0.06]" />
        <div className="h-3 w-1/2 rounded bg-white/[0.04]" />
        <div className="h-16 w-full rounded-lg bg-white/[0.04] mt-4" />
        <div className="h-16 w-full rounded-lg bg-white/[0.03]" />
        <div className="h-10 w-full rounded-lg bg-primary/10 mt-4" />
      </div>
    </PhoneChrome>
  );
}

// Trip creation form skeleton
function SkeletonCreateTrip({ className = "", tilt = false }: { className?: string; tilt?: boolean }) {
  return (
    <PhoneChrome className={className} tilt={tilt}>
      <div className="w-full px-4 pt-10 space-y-4 flex-1">
        <div className="h-3 w-1/2 rounded bg-white/[0.07]" />
        {/* Destination input */}
        <div className="h-11 w-full rounded-lg bg-white/[0.05] border border-white/[0.06] flex items-center px-3">
          <div className="h-2.5 w-24 rounded bg-white/[0.08]" />
        </div>
        {/* Date picker row */}
        <div className="flex gap-2">
          <div className="h-11 flex-1 rounded-lg bg-white/[0.04] border border-white/[0.05]" />
          <div className="h-11 flex-1 rounded-lg bg-white/[0.04] border border-white/[0.05]" />
        </div>
        {/* Invite section */}
        <div className="h-3 w-1/3 rounded bg-white/[0.05] mt-2" />
        <div className="flex gap-2 mt-1">
          <div className="h-8 w-8 rounded-full bg-white/[0.06]" />
          <div className="h-8 w-8 rounded-full bg-white/[0.05]" />
          <div className="h-8 w-8 rounded-full bg-white/[0.04] border-2 border-dashed border-white/[0.08]" />
        </div>
        {/* CTA button */}
        <div className="h-11 w-full rounded-lg bg-primary/15 mt-4" />
      </div>
    </PhoneChrome>
  );
}

// Itinerary view skeleton
function SkeletonItinerary({ className = "", tilt = false }: { className?: string; tilt?: boolean }) {
  return (
    <PhoneChrome className={className} tilt={tilt}>
      <div className="w-full px-4 pt-10 space-y-3 flex-1">
        <div className="h-3 w-1/3 rounded bg-white/[0.07]" />
        {/* Day header */}
        <div className="h-6 w-24 rounded-full bg-primary/10 mt-2" />
        {/* Activity cards */}
        {[0.05, 0.04, 0.035].map((op, i) => (
          <div key={i} className={`rounded-lg bg-white/[${op}] border border-white/[0.04] p-3 space-y-2`} style={{ backgroundColor: `rgba(255,255,255,${op})` }}>
            <div className="flex items-center gap-2">
              <div className="h-2 w-12 rounded bg-primary/20" />
              <div className="h-2 w-20 rounded bg-white/[0.06]" />
            </div>
            <div className="h-2 w-3/4 rounded bg-white/[0.04]" />
          </div>
        ))}
        {/* Second day */}
        <div className="h-6 w-20 rounded-full bg-white/[0.06] mt-3" />
        <div className="rounded-lg border border-white/[0.04] p-3 space-y-2" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
          <div className="flex items-center gap-2">
            <div className="h-2 w-12 rounded bg-primary/20" />
            <div className="h-2 w-16 rounded bg-white/[0.06]" />
          </div>
          <div className="h-2 w-1/2 rounded bg-white/[0.04]" />
        </div>
      </div>
    </PhoneChrome>
  );
}

// Expense balance skeleton
function SkeletonExpenses({ className = "", tilt = false }: { className?: string; tilt?: boolean }) {
  return (
    <PhoneChrome className={className} tilt={tilt}>
      <div className="w-full px-4 pt-10 space-y-3 flex-1">
        <div className="h-3 w-1/3 rounded bg-white/[0.07]" />
        {/* Balance summary */}
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.05] p-4 space-y-3 mt-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-white/[0.06]" />
              <div className="flex-1">
                <div className="h-2.5 w-20 rounded bg-white/[0.06]" />
              </div>
              <div className={`h-2.5 w-14 rounded ${i === 2 ? "bg-red-400/15" : "bg-green-400/15"}`} />
            </div>
          ))}
        </div>
        {/* Settle up button */}
        <div className="h-11 w-full rounded-lg bg-primary/15 mt-3" />
        {/* Recent expenses */}
        <div className="h-2.5 w-24 rounded bg-white/[0.05] mt-3" />
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-white/[0.05]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2 w-24 rounded bg-white/[0.06]" />
            <div className="h-2 w-16 rounded bg-white/[0.04]" />
          </div>
          <div className="h-2.5 w-12 rounded bg-white/[0.06]" />
        </div>
      </div>
    </PhoneChrome>
  );
}

// Poll/voting skeleton
function SkeletonPoll({ className = "" }: { className?: string }) {
  return (
    <PhoneChrome className={className}>
      <div className="w-full px-4 pt-10 space-y-3 flex-1">
        <div className="h-3 w-2/3 rounded bg-white/[0.07]" />
        <div className="h-2.5 w-1/2 rounded bg-white/[0.04]" />
        {/* Poll options */}
        {[0.7, 0.45, 0.25].map((fill, i) => (
          <div key={i} className="rounded-lg bg-white/[0.04] border border-white/[0.05] p-3 mt-1 relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-primary/10 rounded-lg" style={{ width: `${fill * 100}%` }} />
            <div className="relative flex items-center justify-between">
              <div className="h-2.5 w-20 rounded bg-white/[0.06]" />
              <div className="flex -space-x-1.5">
                {Array.from({ length: Math.ceil(fill * 4) }).map((_, j) => (
                  <div key={j} className="h-5 w-5 rounded-full bg-white/[0.08] border border-[#1a1a1f]" />
                ))}
              </div>
            </div>
          </div>
        ))}
        {/* Vote button */}
        <div className="h-10 w-full rounded-lg bg-primary/15 mt-3" />
      </div>
    </PhoneChrome>
  );
}

/* ------------------------------------------------------------------ */
/*  Nav                                                                */
/* ------------------------------------------------------------------ */
function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  const scroll = useCallback((id: string) => {
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <nav
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "backdrop-blur-xl bg-[#0f1115]/80 border-b border-white/[0.06] shadow-lg shadow-black/20"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16 relative">
        <div className="hidden md:flex items-center gap-8 text-sm text-[#9ca3af]">
          <button onClick={() => scroll("how")} className="hover:text-[#f0ede8] transition-colors duration-200">How it works</button>
          <button onClick={() => scroll("features")} className="hover:text-[#f0ede8] transition-colors duration-200">Features</button>
        </div>

        <Link to="/" className="absolute left-1/2 -translate-x-1/2 text-[1.1rem] font-bold tracking-[0.25em] uppercase text-[#f0ede8]">
          JUNTO
        </Link>

        <div className="hidden md:block">
          <Link to="/ref">
            <Button size="sm" className="text-sm px-5 transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-primary/20">Start Planning</Button>
          </Link>
        </div>

        <button onClick={() => setOpen(!open)} className="md:hidden text-[#9ca3af]">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden px-6 pb-4 flex flex-col gap-3 text-sm text-[#9ca3af] backdrop-blur-xl bg-[#0f1115]/90">
          <button onClick={() => scroll("how")} className="text-left py-2 hover:text-[#f0ede8] transition-colors">How it works</button>
          <button onClick={() => scroll("features")} className="text-left py-2 hover:text-[#f0ede8] transition-colors">Features</button>
          <Link to="/ref" onClick={() => setOpen(false)}>
            <Button size="sm" className="w-full mt-1">Start Planning</Button>
          </Link>
        </div>
      )}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero                                                               */
/* ------------------------------------------------------------------ */
function Hero() {
  const scrollDown = useCallback(() => {
    document.getElementById("pain")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const bgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = () => {
      if (bgRef.current) bgRef.current.style.transform = `translateY(${window.scrollY * 0.3}px)`;
    };
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <section className="relative min-h-dvh flex items-center pt-16 overflow-hidden">
      <div ref={bgRef} className="absolute inset-0 -top-20 -bottom-20 will-change-transform">
        <img
          src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80&auto=format&fit=crop"
          alt=""
          className="w-full h-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0f1115]/90 via-[#0f1115]/30 via-30% to-[#0f1115]" />
        <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-[#0f1115] from-30% via-[#0f1115] via-50% to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f1115]/50 via-transparent to-transparent" />
      </div>

      <div className="pointer-events-none absolute inset-0">
        <div className="landing-blob landing-blob-1 opacity-15" />
        <div className="landing-blob landing-blob-2 opacity-10" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl w-full px-6 py-24 grid md:grid-cols-2 gap-16 md:gap-20 items-center">
        <div className="text-center md:text-left">
          <Reveal>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] text-[#f0ede8]">
              Plan trips{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                together.
              </span>
            </h1>
          </Reveal>
          <Reveal delay="0.1s">
            <p className="mt-7 text-[1.08rem] sm:text-lg text-[#9ca3af] leading-[1.8] max-w-md mx-auto md:mx-0">
              One shared space for your itinerary, expenses, and group decisions.
              No app download needed.
            </p>
          </Reveal>
          <Reveal delay="0.2s">
            <div className="mt-14 flex flex-col sm:flex-row items-center gap-4 justify-center md:justify-start">
              <Link to="/ref">
                <Button size="lg" className="text-base px-8 gap-2 shadow-lg shadow-primary/25 transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-primary/30">
                  Start Planning <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <button
                onClick={scrollDown}
                className="inline-flex items-center gap-1.5 text-sm text-[#9ca3af]/60 hover:text-[#9ca3af] transition-colors duration-200"
              >
                See how it works <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </Reveal>
        </div>

        {/* Phone mockup with float + shadow */}
        <Reveal delay="0.25s" className="flex justify-center">
          <div className="relative">
            <div className="landing-phone-float">
              <SkeletonDashboard className="w-56 sm:w-64 lg:w-72" />
            </div>
            {/* Soft shadow beneath */}
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-primary/10 rounded-full blur-2xl" />
          </div>
        </Reveal>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-[#9ca3af]/30">
        <ChevronDown className="h-6 w-6" />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Pain (chat bubbles with staggered reveal)                          */
/* ------------------------------------------------------------------ */
function ChatBubble({ text, align, delay }: { text: string; align: "left" | "right"; delay: string }) {
  const isLeft = align === "left";
  return (
    <Reveal delay={delay}>
      <div className={`flex ${isLeft ? "justify-start" : "justify-end"}`}>
        <div
          className={`relative max-w-[80%] sm:max-w-[75%] rounded-2xl px-5 py-3.5 text-[0.9rem] leading-relaxed shadow-lg
            ${isLeft
              ? "bg-white/[0.07] backdrop-blur-sm text-[#f0ede8]/75 rounded-bl-md border border-white/[0.05]"
              : "bg-primary/12 backdrop-blur-sm text-[#f0ede8]/75 rounded-br-md border border-primary/10"
            }`}
        >
          {text}
          <div className={`absolute bottom-0 ${isLeft ? "-left-1.5" : "-right-1.5"} w-3 h-3 ${
            isLeft ? "bg-white/[0.07]" : "bg-primary/12"
          } rounded-sm transform rotate-45 translate-y-1`} />
        </div>
      </div>
    </Reveal>
  );
}

function PainSection() {
  return (
    <section id="pain" className="landing-section-dark py-36 sm:py-44 px-6 relative">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-[#f0ede8]">Sound familiar?</h2>
        </Reveal>

        <div className="mt-16 space-y-5 mx-auto max-w-lg">
          <ChatBubble delay="0.1s" align="left" text="Who's paying for dinner? I'll Venmo you… wait, do you have Revolut? 💸" />
          <ChatBubble delay="0.25s" align="right" text="Can everyone fill in this Google Sheet with your flight times? ✈️" />
          <ChatBubble delay="0.4s" align="left" text="36 unread messages and we still don't know where we're staying 😩" />
        </div>

        <Reveal delay="0.5s">
          <div className="mt-14 text-center">
            <p className="text-[#9ca3af]/50 line-through text-sm mb-3">Scattered chats, spreadsheets & payment apps</p>
            <p className="text-[1.05rem] sm:text-lg text-[#9ca3af]">
              With <span className="text-primary font-semibold">Junto</span>, everything lives in{" "}
              <span className="text-[#f0ede8] font-medium">one shared space</span>.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  How It Works                                                       */
/* ------------------------------------------------------------------ */
function HowItWorks() {
  const steps = [
    { num: "1", title: "Create your trip", desc: "Pick a destination and dates. Add your crew with a single link.", Skeleton: SkeletonCreateTrip },
    { num: "2", title: "Plan together", desc: "Build the itinerary, vote on ideas, and track who's paying what, all in real time.", Skeleton: SkeletonItinerary },
    { num: "3", title: "Stay in sync", desc: "Real-time updates, push notifications, and everyone on the same page, even mid-trip.", Skeleton: SkeletonExpenses },
  ];

  return (
    <section id="how" className="landing-section-light py-36 sm:py-44 px-6 relative">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-[#f0ede8]">Ready in minutes</h2>
        </Reveal>

        <div className="mt-28 space-y-32 relative">
          <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px border-l-2 border-dashed border-primary/15 -translate-x-1/2" />

          {steps.map((s, i) => {
            const reverse = i % 2 === 1;
            return (
              <Reveal key={s.num}>
                <div className="grid md:grid-cols-2 gap-12 md:gap-20 items-center">
                  <div className={`text-center md:text-left ${reverse ? "md:order-2" : ""}`}>
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary text-lg font-bold text-primary-foreground mb-6 shadow-lg shadow-primary/20">
                      {s.num}
                    </div>
                    <h3 className="text-xl font-semibold text-[#f0ede8]">{s.title}</h3>
                    <p className="mt-4 text-[0.95rem] leading-[1.8] text-[#9ca3af] max-w-sm mx-auto md:mx-0">{s.desc}</p>
                  </div>
                  <div className={`relative ${reverse ? "md:order-1" : ""}`}>
                    <s.Skeleton className="w-48 sm:w-56" tilt={i !== 1} />
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Features — 3 large showcase cards                                  */
/* ------------------------------------------------------------------ */
const featureCards = [
  {
    icon: Wallet,
    title: "Split expenses instantly",
    desc: "Multi-currency tracking with Junto AI receipt scanning. Everyone sees who owes what, in real time.",
    gradient: "from-[#1e1a20] via-[#191520] to-[#14111a]",
    Skeleton: SkeletonExpenses,
  },
  {
    icon: Vote,
    title: "Decide as a group",
    desc: "Polls, voting, and reactions so nobody's left out of the decision. Democracy, but for holidays.",
    gradient: "from-[#171c22] via-[#141920] to-[#10151c]",
    Skeleton: SkeletonPoll,
  },
  {
    icon: CalendarDays,
    title: "Build the itinerary together",
    desc: "Add activities, set times, and drag to reorder. Synced in real-time for everyone in the group.",
    gradient: "from-[#1a1e1a] via-[#161a18] to-[#111513]",
    Skeleton: SkeletonItinerary,
  },
];

function Features() {
  return (
    <section id="features" className="landing-section-dark py-36 sm:py-44 px-6 relative">
      {/* Warm accent glow behind section */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-primary/[0.04] blur-[180px]" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-[#f0ede8]">Built for the way groups actually travel</h2>
          <p className="mt-6 text-center text-[#9ca3af] max-w-lg mx-auto text-[1.05rem] leading-relaxed">All the tools to plan, decide, and split in one beautiful app.</p>
        </Reveal>

        <div className="mt-20 grid gap-8 lg:grid-cols-3">
          {featureCards.map((f, i) => (
            <Reveal key={i} delay={`${i * 0.12}s`}>
              <div className={`group relative rounded-3xl bg-gradient-to-br ${f.gradient} border border-white/[0.06] p-8 pb-0 min-h-[480px] sm:min-h-[520px] flex flex-col overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/15`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 transition-colors duration-200 group-hover:bg-primary/25">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-[#f0ede8] mb-2">{f.title}</h3>
                <p className="text-[0.9rem] leading-[1.75] text-[#9ca3af] mb-8 max-w-xs">{f.desc}</p>

                <div className="mt-auto flex-1 flex items-end justify-center relative">
                  <div className="translate-y-8">
                    <f.Skeleton className="w-40 sm:w-48" />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#141416] to-transparent pointer-events-none" />
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* PWA mention */}
        <Reveal delay="0.4s">
          <p className="mt-14 text-center text-[#9ca3af]/60 text-sm tracking-wide">
            No app store. No download. Just share a link.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Final CTA                                                          */
/* ------------------------------------------------------------------ */
function FinalCta() {
  return (
    <section className="landing-section-light relative py-24 sm:py-32 px-6 text-center overflow-hidden">
      {/* Teal radial glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-primary/[0.06] blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto">
        <Reveal>
          <h2 className="text-3xl font-bold sm:text-5xl text-[#f0ede8] leading-tight">Your next trip starts here</h2>
        </Reveal>
        <Reveal delay="0.1s">
          <p className="mt-6 text-[#9ca3af] text-[1.05rem] sm:text-lg">Free forever. No credit card. No app download.</p>
        </Reveal>
        <Reveal delay="0.2s">
          <Link to="/ref" className="mt-10 inline-block">
            <div className="relative">
              <div className="absolute -inset-4 rounded-2xl bg-primary/20 blur-2xl opacity-60" />
              <Button size="lg" className="relative text-base px-12 py-6 gap-2 text-lg shadow-xl shadow-primary/25 transition-all duration-200 hover:scale-105 hover:shadow-2xl hover:shadow-primary/30">
                Start Planning <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
          </Link>
        </Reveal>
        <Reveal delay="0.25s">
          <p className="mt-8 text-[#9ca3af]/40 text-sm">Join the early access.</p>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer                                                             */
/* ------------------------------------------------------------------ */
function Footer() {
  return (
    <footer className="py-12 px-6 bg-[#0f1115]">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-xs text-[#9ca3af]/40 sm:flex-row sm:justify-between">
        <div className="flex gap-6">
          <Link to="/privacy" className="hover:text-[#9ca3af]/70 transition-colors duration-200">Privacy Notice</Link>
          <Link to="/terms" className="hover:text-[#9ca3af]/70 transition-colors duration-200">Terms & Conditions</Link>
          <a href="mailto:hello@junto.pro" className="hover:text-[#9ca3af]/70 transition-colors duration-200">hello@junto.pro</a>
        </div>
        <span>Made with ☀️ in Dubai</span>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function Landing() {
  return (
    <div className="landing-page dark min-h-dvh text-[#f0ede8] antialiased overflow-x-hidden">
      <Nav />
      <Hero />
      <PainSection />
      <HowItWorks />
      <Features />
      <FinalCta />
      <Footer />
    </div>
  );
}

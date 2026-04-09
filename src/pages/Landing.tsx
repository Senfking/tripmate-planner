import { useEffect, useRef, useCallback, useState } from "react";
import { Link } from "react-router-dom";
import {
  Wallet,
  Vote,
  CalendarDays,
  Smartphone,
  Tablet,
  ArrowRight,
  Play,
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
/*  Phone Frame (warm neutral)                                         */
/* ------------------------------------------------------------------ */
function PhoneFrame({ label, className = "", tilt = false }: { label: string; className?: string; tilt?: boolean }) {
  return (
    <div className={`relative mx-auto ${className}`}>
      <div
        className={`rounded-[2.5rem] border-[6px] border-[#2a2a2e] bg-[#18181b] p-2 shadow-2xl shadow-black/40 ${
          tilt ? "transform rotate-[2deg] hover:rotate-0 transition-transform duration-500" : ""
        }`}
      >
        {/* Notch */}
        <div className="absolute left-1/2 top-2 -translate-x-1/2 w-24 h-5 bg-[#1e1e21] rounded-b-2xl z-10" />
        {/* Screen */}
        <div className="rounded-[2rem] bg-gradient-to-br from-[#1a1a1f] to-[#111114] aspect-[9/19] flex flex-col items-center justify-center overflow-hidden relative">
          <div className="w-full px-4 space-y-3">
            <div className="h-3 w-3/4 rounded bg-white/[0.06]" />
            <div className="h-3 w-1/2 rounded bg-white/[0.04]" />
            <div className="h-16 w-full rounded-lg bg-white/[0.04] mt-4" />
            <div className="h-16 w-full rounded-lg bg-white/[0.03]" />
            <div className="h-10 w-full rounded-lg bg-primary/10 mt-4" />
          </div>
          <span className="text-white/20 text-[10px] font-medium text-center px-4 mt-4">{label}</span>
        </div>
      </div>
    </div>
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
        {/* Left nav links */}
        <div className="hidden md:flex items-center gap-8 text-sm text-white/50">
          <button onClick={() => scroll("how")} className="hover:text-white transition-colors duration-200">How it works</button>
          <button onClick={() => scroll("features")} className="hover:text-white transition-colors duration-200">Features</button>
        </div>

        {/* Center wordmark */}
        <Link to="/" className="absolute left-1/2 -translate-x-1/2 text-[1.1rem] font-bold tracking-[0.25em] uppercase text-white">
          JUNTO
        </Link>

        {/* Right CTA */}
        <div className="hidden md:block">
          <Link to="/ref">
            <Button size="sm" className="text-sm px-5 transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-primary/20">Start Planning</Button>
          </Link>
        </div>

        <button onClick={() => setOpen(!open)} className="md:hidden text-white/70">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden px-6 pb-4 flex flex-col gap-3 text-sm text-white/50 backdrop-blur-xl bg-[#0f1115]/90">
          <button onClick={() => scroll("how")} className="text-left py-2 hover:text-white transition-colors">How it works</button>
          <button onClick={() => scroll("features")} className="text-left py-2 hover:text-white transition-colors">Features</button>
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
      {/* Hero bg image with parallax */}
      <div ref={bgRef} className="absolute inset-0 -top-20 -bottom-20 will-change-transform">
        <img
          src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80&auto=format&fit=crop"
          alt=""
          className="w-full h-full object-cover"
          loading="eager"
        />
        {/* Gradient overlays — bottom 60% is fully opaque for seamless blend */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0f1115]/90 via-[#0f1115]/30 via-30% to-[#0f1115]" />
        <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-[#0f1115] from-30% via-[#0f1115] via-50% to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f1115]/50 via-transparent to-transparent" />
      </div>

      {/* Floating blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="landing-blob landing-blob-1 opacity-15" />
        <div className="landing-blob landing-blob-2 opacity-10" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl w-full px-6 py-24 grid md:grid-cols-2 gap-12 md:gap-16 items-center">
        {/* Left — copy */}
        <div className="text-center md:text-left">
          <Reveal>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] text-white">
              Plan trips{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                together.
              </span>
            </h1>
          </Reveal>
          <Reveal delay="0.1s">
            <p className="mt-7 text-[1.05rem] sm:text-lg text-white/65 leading-[1.75] max-w-md mx-auto md:mx-0">
              One shared space for your itinerary, expenses, and group decisions.
              No app download needed.
            </p>
          </Reveal>
          <Reveal delay="0.2s">
            <div className="mt-12 flex flex-col sm:flex-row items-center gap-4 justify-center md:justify-start">
              <Link to="/ref">
                <Button size="lg" className="text-base px-8 gap-2 shadow-lg shadow-primary/25 transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-primary/30">
                  Start Planning <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <button
                onClick={scrollDown}
                className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors duration-200"
              >
                See how it works <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </Reveal>
        </div>

        {/* Right — phone mockup */}
        <Reveal delay="0.25s" className="flex justify-center">
          <div className="landing-phone-float">
            <PhoneFrame label="[Trip Dashboard]" className="w-56 sm:w-64 lg:w-72" />
          </div>
        </Reveal>
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-white/15">
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
          className={`relative max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-3.5 text-[0.9rem] leading-relaxed shadow-lg
            ${isLeft
              ? "bg-white/[0.07] backdrop-blur-sm text-white/75 rounded-bl-md border border-white/[0.05]"
              : "bg-primary/12 backdrop-blur-sm text-white/75 rounded-br-md border border-primary/10"
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
    <section id="pain" className="py-32 sm:py-36 px-6 relative">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-white">Sound familiar?</h2>
        </Reveal>

        <div className="mt-16 space-y-5 mx-auto max-w-lg">
          <ChatBubble delay="0.1s" align="left" text="Who's paying for dinner? I'll Venmo you… wait, do you have Revolut? 💸" />
          <ChatBubble delay="0.25s" align="right" text="Can everyone fill in this Google Sheet with your flight times? ✈️" />
          <ChatBubble delay="0.4s" align="left" text="36 unread messages and we still don't know where we're staying 😩" />
        </div>

        <Reveal delay="0.5s">
          <div className="mt-14 text-center">
            <p className="text-white/35 line-through text-sm mb-3">Scattered chats, spreadsheets & payment apps</p>
            <p className="text-[1.05rem] sm:text-lg text-white/65">
              With <span className="text-primary font-semibold">Junto</span>, everything lives in{" "}
              <span className="text-white font-medium">one shared space</span>.
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
    { num: "1", title: "Create your trip", desc: "Pick a destination and dates. Add your crew with a single link.", screenshot: "[Create Trip]" },
    { num: "2", title: "Plan together", desc: "Build the itinerary, vote on ideas, and track who's paying what — all in real time.", screenshot: "[Itinerary]" },
    { num: "3", title: "Just travel", desc: "Everything in one place. No more switching between apps, docs, and group chats.", screenshot: "[Trip Overview]" },
  ];

  return (
    <section id="how" className="py-32 sm:py-36 px-6 relative">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-white">Three taps to a planned trip</h2>
        </Reveal>

        <div className="mt-24 space-y-28 relative">
          {/* Connecting dotted line */}
          <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px border-l-2 border-dashed border-primary/15 -translate-x-1/2" />

          {steps.map((s, i) => {
            const reverse = i % 2 === 1;
            return (
              <Reveal key={s.num}>
                <div className={`grid md:grid-cols-2 gap-10 md:gap-16 items-center`}>
                  <div className={`text-center md:text-left ${reverse ? "md:order-2" : ""}`}>
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary text-lg font-bold text-primary-foreground mb-5 shadow-lg shadow-primary/20">
                      {s.num}
                    </div>
                    <h3 className="text-xl font-semibold text-white">{s.title}</h3>
                    <p className="mt-3 text-[0.9rem] leading-[1.75] text-white/50 max-w-sm mx-auto md:mx-0">{s.desc}</p>
                  </div>
                  <div className={`relative ${reverse ? "md:order-1" : ""}`}>
                    <PhoneFrame label={s.screenshot} className="w-48 sm:w-56" tilt={i !== 1} />
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
/*  Features — large showcase cards                                    */
/* ------------------------------------------------------------------ */
const featureCards = [
  {
    icon: Wallet,
    title: "Split expenses instantly",
    desc: "Multi-currency. AI receipt scanning. Everyone sees who owes what.",
    screenshot: "[Expense Split]",
    gradient: "from-[#1a1820] to-[#14121a]",
  },
  {
    icon: Vote,
    title: "Decide as a group",
    desc: "Polls and voting so nobody's left out of the decision.",
    screenshot: "[Group Poll]",
    gradient: "from-[#171a1f] to-[#111418]",
  },
  {
    icon: CalendarDays,
    title: "Build the itinerary together",
    desc: "Add activities, set times, drag and drop. Real-time for everyone.",
    screenshot: "[Itinerary Builder]",
    gradient: "from-[#181b18] to-[#121413]",
  },
  {
    icon: Smartphone,
    title: "Works on any phone",
    desc: "No app store download. Share a link, open in browser, done.",
    screenshot: "[Mobile PWA]",
    gradient: "from-[#1a1818] to-[#141212]",
    multiDevice: true,
  },
];

function Features() {
  return (
    <section id="features" className="py-32 sm:py-36 px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-white">Everything your group needs</h2>
          <p className="mt-5 text-center text-white/40 max-w-lg mx-auto text-[1.05rem] leading-relaxed">All the tools to plan, decide, and split — in one beautiful app.</p>
        </Reveal>

        <div className="mt-20 grid gap-8 sm:grid-cols-2">
          {featureCards.map((f, i) => (
            <Reveal key={i} delay={`${i * 0.1}s`}>
              <div className={`group relative rounded-3xl bg-gradient-to-br ${f.gradient} border border-white/[0.06] p-8 pb-0 min-h-[420px] sm:min-h-[460px] flex flex-col overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/20`}>
                {/* Icon + text */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 transition-colors duration-200 group-hover:bg-primary/25">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-[0.9rem] leading-[1.75] text-white/45 mb-8 max-w-xs">{f.desc}</p>

                {/* Phone mockup area */}
                <div className="mt-auto flex-1 flex items-end justify-center relative">
                  {f.multiDevice ? (
                    <div className="flex items-end gap-4 pb-0 translate-y-6">
                      <PhoneFrame label={f.screenshot} className="w-28 sm:w-32" />
                      <div className="hidden sm:block rounded-2xl border-[4px] border-[#2a2a2e] bg-[#18181b] p-1.5 shadow-xl shadow-black/30 w-44 aspect-[4/3]">
                        <div className="rounded-xl bg-gradient-to-br from-[#1a1a1f] to-[#111114] w-full h-full flex items-center justify-center">
                          <Tablet className="h-6 w-6 text-white/10" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="translate-y-8">
                      <PhoneFrame label={f.screenshot} className="w-40 sm:w-48" />
                    </div>
                  )}
                  {/* Bottom fade */}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#141416] to-transparent pointer-events-none" />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Demo Video                                                         */
/* ------------------------------------------------------------------ */
function DemoVideo() {
  return (
    <section className="py-32 sm:py-36 px-6">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-white">See Junto in action</h2>
          <p className="mt-5 text-center text-white/40 text-[1.05rem]">Watch how easy it is to plan your next group trip.</p>
        </Reveal>

        <Reveal delay="0.15s">
          <div className="mt-14 relative rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#1a1a1f] to-[#111114] aspect-video flex items-center justify-center overflow-hidden shadow-2xl shadow-black/40 group cursor-pointer transition-all duration-300 hover:border-white/[0.12] hover:shadow-3xl">
            <div className="absolute top-0 left-0 right-0 h-8 bg-white/[0.03] flex items-center px-4 gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400/50" />
            </div>
            <div className="flex flex-col items-center gap-4">
              <div className="landing-play-glow h-16 w-16 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center group-hover:bg-primary/25 transition-all duration-300 group-hover:scale-110">
                <Play className="h-7 w-7 text-primary fill-primary" />
              </div>
              <span className="text-white/25 text-sm">[Demo video coming soon]</span>
            </div>
          </div>
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
    <section className="relative py-36 sm:py-44 px-6 text-center overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-primary/8" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full bg-primary/8 blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto">
        <Reveal>
          <h2 className="text-3xl font-bold sm:text-5xl text-white leading-tight">Your next trip starts here</h2>
        </Reveal>
        <Reveal delay="0.1s">
          <p className="mt-6 text-white/50 text-[1.05rem] sm:text-lg">Free forever. No credit card. No app download.</p>
          <p className="mt-2 text-white/30 text-sm">Join 10+ groups already planning with Junto</p>
        </Reveal>
        <Reveal delay="0.2s">
          <Link to="/ref" className="mt-12 inline-block">
            <div className="relative">
              <div className="absolute -inset-4 rounded-2xl bg-primary/20 blur-2xl opacity-60" />
              <Button size="lg" className="relative text-base px-12 py-6 gap-2 text-lg shadow-xl shadow-primary/25 transition-all duration-200 hover:scale-105 hover:shadow-2xl hover:shadow-primary/30">
                Start Planning <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
          </Link>
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
    <footer className="py-12 px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-xs text-white/30 sm:flex-row sm:justify-between">
        <div className="flex gap-6">
          <Link to="/privacy" className="hover:text-white/60 transition-colors duration-200">Privacy Notice</Link>
          <Link to="/terms" className="hover:text-white/60 transition-colors duration-200">Terms & Conditions</Link>
          <a href="mailto:hello@junto.pro" className="hover:text-white/60 transition-colors duration-200">hello@junto.pro</a>
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
    <div className="landing-page dark min-h-dvh text-white antialiased overflow-x-hidden">
      <Nav />
      <Hero />
      <PainSection />
      <HowItWorks />
      <Features />
      <DemoVideo />
      <FinalCta />
      <Footer />
    </div>
  );
}

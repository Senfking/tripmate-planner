import { useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Wallet,
  Vote,
  CalendarDays,
  Smartphone,
  ArrowRight,
  Play,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

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
/*  Phone Frame                                                        */
/* ------------------------------------------------------------------ */
function PhoneFrame({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`relative mx-auto ${className}`}>
      {/* Phone bezel */}
      <div className="rounded-[2.5rem] border-[6px] border-gray-800 bg-gray-900 p-2 shadow-2xl shadow-black/30">
        {/* Notch */}
        <div className="absolute left-1/2 top-2 -translate-x-1/2 w-24 h-5 bg-gray-800 rounded-b-2xl z-10" />
        {/* Screen */}
        <div className="rounded-[2rem] bg-gradient-to-br from-[hsl(176,25%,14%)] to-[hsl(176,30%,10%)] aspect-[9/19] flex items-center justify-center overflow-hidden">
          <span className="text-white/30 text-xs font-medium text-center px-4">{label}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Screenshot placeholder (landscape for feature cards)              */
/* ------------------------------------------------------------------ */
function ScreenshotPlaceholder({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-white/10 bg-gradient-to-br from-[hsl(176,25%,14%)] to-[hsl(176,30%,10%)] aspect-video flex items-center justify-center shadow-lg ${className}`}>
      {/* Fake title bar */}
      <div className="absolute top-0 left-0 right-0 h-7 bg-white/5 rounded-t-xl flex items-center px-3 gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
      </div>
      <span className="text-white/30 text-sm font-medium text-center px-4">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Nav                                                                */
/* ------------------------------------------------------------------ */
function Nav() {
  const [open, setOpen] = useState(false);
  const scroll = useCallback((id: string) => {
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-[hsl(176,30%,8%)]/80 border-b border-white/5">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
        {/* Logo */}
        <Link to="/" className="text-xl font-bold tracking-tight text-white">
          junto<span className="text-primary">.</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8 text-sm text-white/60">
          <button onClick={() => scroll("how")} className="hover:text-white transition-colors">How it works</button>
          <button onClick={() => scroll("features")} className="hover:text-white transition-colors">Features</button>
          <Link to="/ref">
            <Button size="sm" className="text-sm px-5">Start Planning</Button>
          </Link>
        </div>

        {/* Mobile toggle */}
        <button onClick={() => setOpen(!open)} className="md:hidden text-white/70">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden px-6 pb-4 flex flex-col gap-3 text-sm text-white/60 bg-[hsl(176,30%,8%)]/95 backdrop-blur-md">
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

  return (
    <section className="relative min-h-dvh flex items-center pt-16 overflow-hidden">
      {/* Animated bg blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="landing-blob landing-blob-1" />
        <div className="landing-blob landing-blob-2" />
        <div className="landing-blob landing-blob-3" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl w-full px-6 py-20 grid md:grid-cols-2 gap-12 md:gap-16 items-center">
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
            <p className="mt-6 text-base sm:text-lg text-white/55 leading-relaxed max-w-md mx-auto md:mx-0">
              One shared space for your itinerary, expenses, and group decisions.
              No app download needed.
            </p>
          </Reveal>
          <Reveal delay="0.2s">
            <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 justify-center md:justify-start">
              <Link to="/ref">
                <Button size="lg" className="text-base px-8 gap-2">
                  Start Planning <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <button
                onClick={scrollDown}
                className="inline-flex items-center gap-1.5 text-sm text-white/45 hover:text-white/75 transition-colors"
              >
                See how it works <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </Reveal>
        </div>

        {/* Right — phone mockup */}
        <Reveal delay="0.25s" className="flex justify-center">
          <PhoneFrame label="[Trip Dashboard Screenshot]" className="w-56 sm:w-64 lg:w-72" />
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Pain (chat bubbles)                                                */
/* ------------------------------------------------------------------ */
function ChatBubble({ text, align }: { text: string; align: "left" | "right" }) {
  const isLeft = align === "left";
  return (
    <div className={`flex ${isLeft ? "justify-start" : "justify-end"}`}>
      <div
        className={`relative max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-3 text-sm leading-relaxed
          ${isLeft
            ? "bg-white/10 text-white/80 rounded-bl-md"
            : "bg-primary/20 text-white/80 rounded-br-md"
          }`}
      >
        {text}
      </div>
    </div>
  );
}

function PainSection() {
  return (
    <section id="pain" className="py-28 px-6">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-white">Sound familiar?</h2>
        </Reveal>

        <Reveal delay="0.1s">
          <div className="mt-14 space-y-4 mx-auto max-w-lg">
            <ChatBubble align="left" text="Who's paying for dinner? I'll Venmo you… wait, do you have Revolut? 💸" />
            <ChatBubble align="right" text="Can everyone fill in this Google Sheet with your flight times? ✈️" />
            <ChatBubble align="left" text="36 unread messages and we still don't know where we're staying 😩" />
          </div>
        </Reveal>

        <Reveal delay="0.2s">
          <div className="mt-12 text-center">
            <p className="text-white/40 line-through text-sm mb-3">Scattered chats, spreadsheets & payment apps</p>
            <p className="text-base sm:text-lg text-white/70">
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
    {
      num: "1",
      title: "Create your trip",
      desc: "Pick a destination and dates. Add your crew with a single link.",
      screenshot: "[Create Trip Screenshot]",
    },
    {
      num: "2",
      title: "Plan together",
      desc: "Build the itinerary, vote on ideas, and track who's paying what — all in real time.",
      screenshot: "[Itinerary Screenshot]",
    },
    {
      num: "3",
      title: "Just travel",
      desc: "Everything in one place. No more switching between apps, docs, and group chats.",
      screenshot: "[Trip Overview Screenshot]",
    },
  ];

  return (
    <section id="how" className="py-28 px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-white">Three taps to a planned trip</h2>
        </Reveal>

        <div className="mt-20 space-y-24">
          {steps.map((s, i) => {
            const reverse = i % 2 === 1;
            return (
              <Reveal key={s.num}>
                <div className={`grid md:grid-cols-2 gap-10 md:gap-16 items-center ${reverse ? "md:direction-rtl" : ""}`}>
                  {/* Text */}
                  <div className={`text-center md:text-left ${reverse ? "md:order-2 md:text-left" : ""}`} style={{ direction: "ltr" }}>
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary text-lg font-bold text-primary-foreground mb-4">
                      {s.num}
                    </div>
                    <h3 className="text-xl font-semibold text-white">{s.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-white/55 max-w-sm mx-auto md:mx-0">{s.desc}</p>
                  </div>
                  {/* Screenshot */}
                  <div className={`relative ${reverse ? "md:order-1" : ""}`} style={{ direction: "ltr" }}>
                    <PhoneFrame label={s.screenshot} className="w-48 sm:w-56" />
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
/*  Features                                                           */
/* ------------------------------------------------------------------ */
function Features() {
  const features = [
    { icon: Wallet, title: "Split expenses instantly", desc: "Multi-currency. AI receipt scanning. Everyone sees who owes what.", screenshot: "[Expense Split Screenshot]" },
    { icon: Vote, title: "Decide as a group", desc: "Polls and voting so nobody's left out of the decision.", screenshot: "[Group Poll Screenshot]" },
    { icon: CalendarDays, title: "Build the itinerary together", desc: "Add activities, set times, drag and drop. Real-time for everyone.", screenshot: "[Itinerary Builder Screenshot]" },
    { icon: Smartphone, title: "Works on any phone", desc: "No app store download. Share a link, open in browser, done.", screenshot: "[Mobile PWA Screenshot]" },
  ];

  return (
    <section id="features" className="py-28 px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-white">Everything your group needs</h2>
          <p className="mt-4 text-center text-white/45 max-w-lg mx-auto">All the tools to plan, decide, and split — in one beautiful app.</p>
        </Reveal>

        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          {features.map((f, i) => (
            <Reveal key={i} delay={`${i * 0.08}s`}>
              <div className="group rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors p-6 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">{f.title}</h3>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-white/50 mb-5">{f.desc}</p>
                {/* Screenshot placeholder */}
                <div className="relative flex-1 min-h-[160px] rounded-xl bg-gradient-to-br from-[hsl(176,25%,12%)] to-[hsl(176,30%,8%)] border border-white/5 flex items-center justify-center overflow-hidden">
                  <span className="text-white/20 text-xs font-medium">{f.screenshot}</span>
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
    <section className="py-28 px-6">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-white">See Junto in action</h2>
          <p className="mt-4 text-center text-white/45">Watch how easy it is to plan your next group trip.</p>
        </Reveal>

        <Reveal delay="0.15s">
          <div className="mt-12 relative rounded-2xl border border-white/10 bg-gradient-to-br from-[hsl(176,25%,12%)] to-[hsl(176,30%,8%)] aspect-video flex items-center justify-center overflow-hidden shadow-2xl shadow-black/20 group cursor-pointer">
            {/* Fake title bar */}
            <div className="absolute top-0 left-0 right-0 h-8 bg-white/5 flex items-center px-4 gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
            </div>
            {/* Play button */}
            <div className="flex flex-col items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                <Play className="h-7 w-7 text-primary fill-primary" />
              </div>
              <span className="text-white/30 text-sm">[Demo video coming soon]</span>
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
    <section className="relative py-32 px-6 text-center overflow-hidden">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-primary/10" />
        <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary/10 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto">
        <Reveal>
          <h2 className="text-3xl font-bold sm:text-5xl text-white leading-tight">Your next trip starts here</h2>
        </Reveal>
        <Reveal delay="0.1s">
          <p className="mt-5 text-white/50 text-base sm:text-lg">Free forever. No credit card. No app download.</p>
          <p className="mt-2 text-white/35 text-sm">Join 10+ groups already planning with Junto</p>
        </Reveal>
        <Reveal delay="0.2s">
          <Link to="/ref" className="mt-10 inline-block">
            <Button size="lg" className="text-base px-12 py-6 gap-2 text-lg">
              Start Planning <ArrowRight className="h-5 w-5" />
            </Button>
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
    <footer className="border-t border-white/10 py-10 px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-xs text-white/40 sm:flex-row sm:justify-between">
        <div className="flex gap-6">
          <Link to="/privacy" className="hover:text-white/70 transition-colors">Privacy Notice</Link>
          <Link to="/terms" className="hover:text-white/70 transition-colors">Terms & Conditions</Link>
          <a href="mailto:hello@junto.pro" className="hover:text-white/70 transition-colors">hello@junto.pro</a>
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
    <div className="dark min-h-dvh bg-[hsl(176,30%,8%)] text-white antialiased overflow-x-hidden">
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

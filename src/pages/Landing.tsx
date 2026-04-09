import { useEffect, useRef, useCallback, useState } from "react";
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
function PhoneFrame({ label, className = "", tilt = false }: { label: string; className?: string; tilt?: boolean }) {
  return (
    <div className={`relative mx-auto ${className}`}>
      <div
        className={`rounded-[2.5rem] border-[6px] border-gray-700/80 bg-gray-900 p-2 shadow-2xl shadow-primary/10 ${
          tilt ? "transform rotate-[2deg] hover:rotate-0 transition-transform duration-500" : ""
        }`}
      >
        {/* Notch */}
        <div className="absolute left-1/2 top-2 -translate-x-1/2 w-24 h-5 bg-gray-800 rounded-b-2xl z-10" />
        {/* Screen */}
        <div className="rounded-[2rem] bg-gradient-to-br from-[hsl(176,20%,16%)] to-[hsl(176,25%,10%)] aspect-[9/19] flex flex-col items-center justify-center overflow-hidden relative">
          {/* Skeleton UI pattern */}
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
          ? "backdrop-blur-xl bg-black/30 border-b border-white/[0.06] shadow-lg shadow-black/10"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
        <Link to="/" className="text-xl font-bold tracking-tight text-white">
          junto<span className="text-primary">.</span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-white/60">
          <button onClick={() => scroll("how")} className="hover:text-white transition-colors">How it works</button>
          <button onClick={() => scroll("features")} className="hover:text-white transition-colors">Features</button>
          <Link to="/ref">
            <Button size="sm" className="text-sm px-5">Start Planning</Button>
          </Link>
        </div>

        <button onClick={() => setOpen(!open)} className="md:hidden text-white/70">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden px-6 pb-4 flex flex-col gap-3 text-sm text-white/60 backdrop-blur-xl bg-black/40">
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
      {/* Hero bg image with overlay */}
      <div ref={bgRef} className="absolute inset-0 -top-20 -bottom-20 will-change-transform">
        <img
          src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80&auto=format&fit=crop"
          alt=""
          className="w-full h-full object-cover"
          loading="eager"
        />
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(200,15%,8%)/0.7] via-[hsl(200,15%,8%)/0.6] to-[hsl(200,15%,10%)]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[hsl(200,15%,8%)/0.8] via-transparent to-transparent" />
      </div>

      {/* Floating shapes */}
      <div className="pointer-events-none absolute inset-0">
        <div className="landing-blob landing-blob-1 opacity-20" />
        <div className="landing-blob landing-blob-2 opacity-15" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl w-full px-6 py-20 grid md:grid-cols-2 gap-12 md:gap-16 items-center">
        {/* Left — copy */}
        <div className="text-center md:text-left">
          <Reveal>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] text-white drop-shadow-lg">
              Plan trips{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                together.
              </span>
            </h1>
          </Reveal>
          <Reveal delay="0.1s">
            <p className="mt-6 text-base sm:text-lg text-white/70 leading-relaxed max-w-md mx-auto md:mx-0 drop-shadow">
              One shared space for your itinerary, expenses, and group decisions.
              No app download needed.
            </p>
          </Reveal>
          <Reveal delay="0.2s">
            <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 justify-center md:justify-start">
              <Link to="/ref">
                <Button size="lg" className="text-base px-8 gap-2 shadow-lg shadow-primary/20">
                  Start Planning <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <button
                onClick={scrollDown}
                className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors"
              >
                See how it works <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </Reveal>
        </div>

        {/* Right — phone mockup with float animation */}
        <Reveal delay="0.25s" className="flex justify-center">
          <div className="landing-phone-float">
            <PhoneFrame label="[Trip Dashboard]" className="w-56 sm:w-64 lg:w-72" />
          </div>
        </Reveal>
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-white/20">
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
          className={`relative max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-lg
            ${isLeft
              ? "bg-white/[0.08] backdrop-blur-sm text-white/80 rounded-bl-md border border-white/[0.06]"
              : "bg-primary/15 backdrop-blur-sm text-white/80 rounded-br-md border border-primary/10"
            }`}
        >
          {text}
          {/* Chat tail */}
          <div className={`absolute bottom-0 ${isLeft ? "-left-1.5" : "-right-1.5"} w-3 h-3 ${
            isLeft ? "bg-white/[0.08]" : "bg-primary/15"
          } rounded-sm transform rotate-45 translate-y-1`} />
        </div>
      </div>
    </Reveal>
  );
}

function PainSection() {
  return (
    <section id="pain" className="landing-section-alt py-28 px-6">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-white">Sound familiar?</h2>
        </Reveal>

        <div className="mt-14 space-y-5 mx-auto max-w-lg">
          <ChatBubble delay="0.1s" align="left" text="Who's paying for dinner? I'll Venmo you… wait, do you have Revolut? 💸" />
          <ChatBubble delay="0.25s" align="right" text="Can everyone fill in this Google Sheet with your flight times? ✈️" />
          <ChatBubble delay="0.4s" align="left" text="36 unread messages and we still don't know where we're staying 😩" />
        </div>

        <Reveal delay="0.5s">
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
    { num: "1", title: "Create your trip", desc: "Pick a destination and dates. Add your crew with a single link.", screenshot: "[Create Trip]" },
    { num: "2", title: "Plan together", desc: "Build the itinerary, vote on ideas, and track who's paying what — all in real time.", screenshot: "[Itinerary]" },
    { num: "3", title: "Just travel", desc: "Everything in one place. No more switching between apps, docs, and group chats.", screenshot: "[Trip Overview]" },
  ];

  return (
    <section id="how" className="py-28 px-6 relative">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-white">Three taps to a planned trip</h2>
        </Reveal>

        <div className="mt-20 space-y-24 relative">
          {/* Connecting dotted line */}
          <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px border-l-2 border-dashed border-primary/15 -translate-x-1/2" />

          {steps.map((s, i) => {
            const reverse = i % 2 === 1;
            return (
              <Reveal key={s.num}>
                <div className={`grid md:grid-cols-2 gap-10 md:gap-16 items-center`}>
                  <div className={`text-center md:text-left ${reverse ? "md:order-2" : ""}`}>
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary text-lg font-bold text-primary-foreground mb-4 shadow-lg shadow-primary/20">
                      {s.num}
                    </div>
                    <h3 className="text-xl font-semibold text-white">{s.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-white/55 max-w-sm mx-auto md:mx-0">{s.desc}</p>
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
/*  Features                                                           */
/* ------------------------------------------------------------------ */
function Features() {
  const features = [
    { icon: Wallet, title: "Split expenses instantly", desc: "Multi-currency. AI receipt scanning. Everyone sees who owes what.", screenshot: "[Expense Split]" },
    { icon: Vote, title: "Decide as a group", desc: "Polls and voting so nobody's left out of the decision.", screenshot: "[Group Poll]" },
    { icon: CalendarDays, title: "Build the itinerary together", desc: "Add activities, set times, drag and drop. Real-time for everyone.", screenshot: "[Itinerary Builder]" },
    { icon: Smartphone, title: "Works on any phone", desc: "No app store download. Share a link, open in browser, done.", screenshot: "[Mobile PWA]" },
  ];

  return (
    <section id="features" className="landing-section-alt py-28 px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-white">Everything your group needs</h2>
          <p className="mt-4 text-center text-white/45 max-w-lg mx-auto">All the tools to plan, decide, and split — in one beautiful app.</p>
        </Reveal>

        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          {features.map((f, i) => (
            <Reveal key={i} delay={`${i * 0.08}s`}>
              <div className="landing-feature-card group rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 h-full flex flex-col transition-all duration-300 hover:bg-white/[0.06] hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold text-white">{f.title}</h3>
                </div>
                <p className="text-sm leading-relaxed text-white/50 mb-5">{f.desc}</p>
                {/* Skeleton screenshot */}
                <div className="relative flex-1 min-h-[160px] rounded-xl bg-gradient-to-br from-[hsl(176,20%,14%)] to-[hsl(176,25%,9%)] border border-white/5 overflow-hidden">
                  {/* Skeleton rows */}
                  <div className="p-4 space-y-2.5">
                    <div className="h-2.5 w-2/3 rounded bg-white/[0.05]" />
                    <div className="h-2.5 w-1/2 rounded bg-white/[0.04]" />
                    <div className="h-10 w-full rounded-lg bg-white/[0.03] mt-3" />
                    <div className="h-10 w-full rounded-lg bg-white/[0.025]" />
                    <div className="h-8 w-1/3 rounded-lg bg-primary/[0.08] mt-3" />
                  </div>
                  <span className="absolute bottom-3 right-3 text-white/15 text-[10px] font-medium">{f.screenshot}</span>
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
          <div className="mt-12 relative rounded-2xl border border-white/10 bg-gradient-to-br from-[hsl(176,20%,14%)] to-[hsl(176,25%,9%)] aspect-video flex items-center justify-center overflow-hidden shadow-2xl shadow-black/30 group cursor-pointer">
            <div className="absolute top-0 left-0 right-0 h-8 bg-white/5 flex items-center px-4 gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
            </div>
            <div className="flex flex-col items-center gap-4">
              <div className="landing-play-glow h-16 w-16 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
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
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-primary/10" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full bg-primary/10 blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto">
        <Reveal>
          <h2 className="text-3xl font-bold sm:text-5xl text-white leading-tight">Your next trip starts here</h2>
        </Reveal>
        <Reveal delay="0.1s">
          <p className="mt-5 text-white/55 text-base sm:text-lg">Free forever. No credit card. No app download.</p>
          <p className="mt-2 text-white/35 text-sm">Join 10+ groups already planning with Junto</p>
        </Reveal>
        <Reveal delay="0.2s">
          <Link to="/ref" className="mt-10 inline-block">
            <div className="relative">
              {/* CTA glow */}
              <div className="absolute -inset-4 rounded-2xl bg-primary/20 blur-2xl opacity-60" />
              <Button size="lg" className="relative text-base px-12 py-6 gap-2 text-lg shadow-xl shadow-primary/25">
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
    <footer className="border-t border-white/[0.06] py-10 px-6">
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

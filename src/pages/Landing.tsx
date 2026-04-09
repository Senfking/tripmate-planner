import { useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Wallet,
  Vote,
  CalendarDays,
  Smartphone,
  ArrowRight,
  CreditCard,
  FileSpreadsheet,
  MessageSquare,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Scroll-reveal hook                                                 */
/* ------------------------------------------------------------------ */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("landing-visible");
          io.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return ref;
}

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useReveal();
  return (
    <div ref={ref} className={`landing-reveal ${className}`}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Glassmorphic card                                                  */
/* ------------------------------------------------------------------ */
function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 ${className}`}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sections                                                           */
/* ------------------------------------------------------------------ */

function Hero() {
  const scrollDown = useCallback(() => {
    document.getElementById("pain")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <section className="relative flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      {/* Gradient blob */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-[520px] w-[520px] rounded-full bg-gradient-to-br from-primary/30 to-secondary/20 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
          Plan trips together.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base sm:text-lg text-white/60 leading-relaxed">
          One shared space for your itinerary, expenses, and group decisions.
          No app download needed.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/ref">
            <Button size="lg" className="text-base px-8 gap-2">
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
      </div>
    </section>
  );
}

function PainSection() {
  const cards = [
    {
      icon: CreditCard,
      quote: "Who's paying for dinner? I'll Venmo you… wait, do you have Revolut?",
    },
    {
      icon: FileSpreadsheet,
      quote: "Can everyone fill in this Google Sheet with your flight times?",
    },
    {
      icon: MessageSquare,
      quote: "36 unread messages in the group chat and we still don't know where we're staying.",
    },
  ];

  return (
    <section id="pain" className="py-24 px-6">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-white">Sound familiar?</h2>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {cards.map((c, i) => (
            <Reveal key={i}>
              <GlassCard className="flex flex-col gap-4 h-full">
                <c.icon className="h-6 w-6 text-primary" />
                <p className="text-sm leading-relaxed text-white/70 italic">"{c.quote}"</p>
              </GlassCard>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <p className="mt-12 text-center text-base sm:text-lg text-white/60 max-w-2xl mx-auto">
            Junto replaces the chaos with <span className="text-white font-medium">one shared space</span> for your entire trip.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      num: "1",
      title: "Create your trip",
      desc: "Pick a destination and dates. Add your crew with a single link.",
    },
    {
      num: "2",
      title: "Plan together",
      desc: "Build the itinerary, vote on ideas, and track who's paying what — all in real time.",
    },
    {
      num: "3",
      title: "Just travel",
      desc: "Everything in one place. No more switching between apps, docs, and group chats.",
    },
  ];

  return (
    <section className="py-24 px-6">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-white">Three taps to a planned trip</h2>
        </Reveal>

        <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map((s) => (
            <Reveal key={s.num} className="text-center md:text-left">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary text-lg font-bold text-primary-foreground mx-auto md:mx-0">
                {s.num}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{s.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    { icon: Wallet, title: "Split expenses instantly", desc: "Multi-currency. AI receipt scanning. Everyone sees who owes what." },
    { icon: Vote, title: "Decide as a group", desc: "Polls and voting so nobody's left out of the decision." },
    { icon: CalendarDays, title: "Build the itinerary together", desc: "Add activities, set times, drag and drop. Real-time for everyone." },
    { icon: Smartphone, title: "Works on any phone", desc: "No app store download. Share a link, open in browser, done." },
  ];

  return (
    <section className="py-24 px-6">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-white">Everything your group needs</h2>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {features.map((f, i) => (
            <Reveal key={i}>
              <GlassCard className="flex items-start gap-4 h-full">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/60">{f.desc}</p>
                </div>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function SocialProof() {
  const testimonials = [
    { initials: "AB", name: "Early adopter", text: "Be one of our first users — your feedback shapes what we build next." },
    { initials: "CD", name: "Early adopter", text: "We're building Junto with real travellers. Join us and help define the future of group trips." },
    { initials: "EF", name: "Early adopter", text: "Spot reserved for you. Try Junto on your next trip and let us know what you think." },
  ];

  return (
    <section className="py-24 px-6">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold sm:text-4xl text-white">Built for groups like yours</h2>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {testimonials.map((t, i) => (
            <Reveal key={i}>
              <GlassCard className="flex flex-col items-center text-center gap-4 h-full">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                  {t.initials}
                </div>
                <p className="text-sm leading-relaxed text-white/60 italic">"{t.text}"</p>
                <span className="text-xs text-white/40">{t.name}</span>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="py-28 px-6 text-center">
      <Reveal>
        <h2 className="text-3xl font-bold sm:text-4xl text-white">Your next trip starts here</h2>
        <p className="mt-4 text-white/50">Free forever. No credit card. No app download.</p>
        <Link to="/ref" className="mt-8 inline-block">
          <Button size="lg" className="text-base px-10 gap-2">
            Start Planning <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 py-10 px-6">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-xs text-white/40 sm:flex-row sm:justify-between">
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
      <Hero />
      <PainSection />
      <HowItWorks />
      <Features />
      <SocialProof />
      <FinalCta />
      <Footer />
    </div>
  );
}

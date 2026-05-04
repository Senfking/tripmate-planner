import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Calendar, MapPin, Users, Plus, Minus, Trash2, Pencil, Search,
  ChevronRight, ArrowLeft, Settings, Share2, Heart, Star, Check,
  X, Loader2, Bell, Home, Receipt, Map, MoreHorizontal, Copy,
  Sparkles, Globe, Clock, DollarSign, Camera, Upload, Plane,
  TrendingUp, TrendingDown, ArrowUpRight,
} from "lucide-react";

/* ── helpers ─────────────────────────────────────────────── */
function CodeSnippet({ children }: { children: string }) {
  return (
    <div className="relative group mt-3">
      <pre className="rounded-xl bg-[#0c1117] text-gray-300 text-[11px] p-4 overflow-x-auto font-mono leading-relaxed border border-white/[0.06]">
        <code>{children.trim()}</code>
      </pre>
      <button
        onClick={() => { navigator.clipboard.writeText(children.trim()); toast.success("Copied to clipboard"); }}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-gray-400"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}

function SectionHeader({ id, title, subtitle }: { id: string; title: string; subtitle: string }) {
  return (
    <div id={id} className="scroll-mt-24 mb-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary mb-2">{id.replace(/-/g, " ")}</p>
      <h2 className="text-3xl font-bold tracking-tight text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">{subtitle}</p>
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-3">{children}</h3>;
}

function Swatch({ color, name, hex, dark }: { color: string; name: string; hex: string; dark?: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className={cn("h-14 rounded-xl border border-black/[0.06]", color)} />
      <p className={cn("text-[10px] font-mono", dark ? "text-foreground font-medium" : "text-muted-foreground")}>{name}</p>
      <p className="text-[9px] font-mono text-muted-foreground/60">{hex}</p>
    </div>
  );
}

/* ── section data ────────────────────────────────────────── */
const SECTIONS = [
  { id: "colors", label: "Color" },
  { id: "typography", label: "Typography" },
  { id: "motion", label: "Motion" },
  { id: "cards", label: "Cards" },
  { id: "components", label: "Components" },
  { id: "photo-forward", label: "Photo-Forward" },
  { id: "financial", label: "Financial" },
  { id: "icons", label: "Icons" },
  { id: "patterns", label: "Patterns" },
];

/* ── main page ───────────────────────────────────────────── */
export default function DesignSystem() {
  const [activeSection, setActiveSection] = useState("colors");
  const [stepperVal, setStepperVal] = useState(2);
  const [hoverCard, setHoverCard] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        }
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 }
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* ── Hero header ── */}
      <header className="relative overflow-hidden border-b border-gray-100">
        <div className="absolute inset-0" style={{
          background: "linear-gradient(135deg, #0D9488 0%, #0F766E 40%, #115E59 100%)",
        }} />
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse at 70% 0%, rgba(14,165,233,0.15) 0%, transparent 60%)",
        }} />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />

        <div className="relative z-10 max-w-6xl mx-auto px-6 py-16 lg:py-20">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center">
              <span className="text-white text-sm font-bold tracking-tight">J</span>
            </div>
            <div className="h-px flex-1 max-w-[60px] bg-white/20" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/50">Design System</span>
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold text-white tracking-tight leading-[1.1]">
            Visual Language
          </h1>
          <p className="text-base text-white/60 mt-3 max-w-md leading-relaxed">
            The building blocks behind Junto's interface. Every color, type scale, motion curve, and component pattern — documented for consistency.
          </p>
          <div className="flex items-center gap-2 mt-6">
            <span className="text-[10px] font-mono text-white/30">v2.0</span>
            <span className="text-white/20">·</span>
            <span className="text-[10px] font-mono text-white/30">Internal only</span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto flex">
        {/* ── Sidebar ── */}
        <nav className="hidden lg:block sticky top-0 h-screen w-52 shrink-0 pt-8 pb-8 pr-6 overflow-y-auto">
          <div className="space-y-0.5">
            {SECTIONS.map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                className={cn(
                  "block rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
                  activeSection === id
                    ? "text-primary bg-primary/[0.06]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </a>
            ))}
          </div>
        </nav>

        {/* ── Content ── */}
        <main className="flex-1 min-w-0 px-4 py-12 lg:px-8 lg:py-16 space-y-24">

          {/* ═══════════════════════════════════════════════════
               1. COLORS — DEPTH NOT FLATNESS
              ═══════════════════════════════════════════════════ */}
          <section>
            <SectionHeader
              id="colors"
              title="Color with Depth"
              subtitle="Junto's palette is built around teal gradients and warm neutrals. Flat color is for data — gradients are for surfaces and CTAs."
            />

            {/* Hero gradient showcase */}
            <div className="mb-10">
              <SubLabel>Junto Teal Gradient</SubLabel>
              <div className="rounded-2xl overflow-hidden" style={{
                background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)",
                padding: "48px 32px",
              }}>
                <p className="text-white/50 text-[11px] font-mono mb-2">linear-gradient(135deg, #0D9488, #0F766E)</p>
                <p className="text-white text-2xl font-bold tracking-tight">Hero surfaces, CTAs, and primary actions</p>
                <p className="text-white/60 text-sm mt-2">Used for header gradients, gradient buttons, and feature highlights.</p>
                <div className="flex gap-3 mt-6">
                  <button className="px-5 py-2.5 rounded-xl bg-white text-teal-700 text-sm font-semibold hover:bg-white/90 transition-colors">
                    White on gradient
                  </button>
                  <button className="px-5 py-2.5 rounded-xl bg-white/15 text-white text-sm font-medium border border-white/20 hover:bg-white/25 transition-colors">
                    Glass button
                  </button>
                </div>
              </div>
              <CodeSnippet>{`// Hero gradient surface
style={{ background: "linear-gradient(135deg, #0D9488, #0F766E)" }}

// Tailwind gradient button
className="bg-gradient-primary text-primary-foreground"

// Glass button on gradient
className="bg-white/15 text-white border border-white/20"`}</CodeSnippet>
            </div>

            {/* Teal scale */}
            <div className="mb-10">
              <SubLabel>Primary — Junto Teal</SubLabel>
              <p className="text-xs text-muted-foreground mb-4">
                <strong className="text-foreground">teal-600 (#0D9488)</strong> is the primary accent. teal-700 (#0F766E) is the gradient endpoint. Use the full scale for states and tints.
              </p>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {[
                  { n: "50", hex: "#F0FDFA", bg: "bg-teal-50" },
                  { n: "100", hex: "#CCFBF1", bg: "bg-teal-100" },
                  { n: "200", hex: "#99F6E4", bg: "bg-teal-200" },
                  { n: "300", hex: "#5EEAD4", bg: "bg-teal-300" },
                  { n: "400", hex: "#2DD4BF", bg: "bg-teal-400" },
                  { n: "500", hex: "#14B8A6", bg: "bg-teal-500" },
                  { n: "600", hex: "#0D9488", bg: "bg-teal-600" },
                  { n: "700", hex: "#0F766E", bg: "bg-teal-700" },
                  { n: "800", hex: "#115E59", bg: "bg-teal-800" },
                  { n: "900", hex: "#134E4A", bg: "bg-teal-900" },
                ].map((c) => (
                  <Swatch key={c.n} color={c.bg} name={c.n} hex={c.hex} dark={c.n === "600" || c.n === "700"} />
                ))}
              </div>
            </div>

            {/* Warm neutrals */}
            <div className="mb-10">
              <SubLabel>Warm Neutrals</SubLabel>
              <p className="text-xs text-muted-foreground mb-4">
                Warmer than pure gray. Use for backgrounds, cards, text, and borders. Inspired by natural materials.
              </p>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {[
                  { n: "50", hex: "#FAFAF9", bg: "bg-stone-50" },
                  { n: "100", hex: "#F5F5F4", bg: "bg-stone-100" },
                  { n: "200", hex: "#E7E5E4", bg: "bg-stone-200" },
                  { n: "300", hex: "#D6D3D1", bg: "bg-stone-300" },
                  { n: "400", hex: "#A8A29E", bg: "bg-stone-400" },
                  { n: "500", hex: "#78716C", bg: "bg-stone-500" },
                  { n: "600", hex: "#57534E", bg: "bg-stone-600" },
                  { n: "700", hex: "#44403C", bg: "bg-stone-700" },
                  { n: "800", hex: "#292524", bg: "bg-stone-800" },
                  { n: "900", hex: "#1C1917", bg: "bg-stone-900" },
                ].map((c) => (
                  <Swatch key={c.n} color={c.bg} name={`stone-${c.n}`} hex={c.hex} />
                ))}
              </div>
            </div>

            {/* Semantic + Financial colors */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <SubLabel>Semantic</SubLabel>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { name: "Success", hex: "#16A34A", bg: "bg-green-600", usage: "Confirmations" },
                    { name: "Warning", hex: "#F59E0B", bg: "bg-amber-500", usage: "Pending states" },
                    { name: "Error", hex: "#DC2626", bg: "bg-red-600", usage: "Destructive actions" },
                    { name: "Info", hex: "#2563EB", bg: "bg-blue-600", usage: "Informational" },
                  ].map((c) => (
                    <div key={c.name} className="rounded-xl border border-gray-100 p-3">
                      <div className={cn("h-8 rounded-lg mb-2", c.bg)} />
                      <p className="text-[11px] font-semibold">{c.name}</p>
                      <p className="text-[9px] font-mono text-muted-foreground">{c.hex}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <SubLabel>Financial Data</SubLabel>
                <p className="text-[11px] text-muted-foreground mb-3">Distinct from semantic. Used only in expense/balance contexts.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-gray-100 p-3">
                    <div className="h-8 rounded-lg mb-2 bg-emerald-600" />
                    <p className="text-[11px] font-semibold flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Positive</p>
                    <p className="text-[9px] font-mono text-muted-foreground">#059669 · text-emerald-600</p>
                    <p className="text-[9px] text-muted-foreground">Money owed to you</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 p-3">
                    <div className="h-8 rounded-lg mb-2 bg-rose-600" />
                    <p className="text-[11px] font-semibold flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Negative</p>
                    <p className="text-[9px] font-mono text-muted-foreground">#E11D48 · text-rose-600</p>
                    <p className="text-[9px] text-muted-foreground">Money you owe</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════
               2. TYPOGRAPHY — DELIBERATE HIERARCHY
              ═══════════════════════════════════════════════════ */}
          <section>
            <SectionHeader
              id="typography"
              title="Deliberate Hierarchy"
              subtitle="Two font families with distinct roles. Display type is tight and bold. Data type is monospaced and confident. Body type disappears."
            />

            {/* Display scale */}
            <div className="mb-10">
              <SubLabel>Display Scale — Headlines & Hero Text</SubLabel>
              <div className="space-y-4 mb-4">
                {[
                  { cls: "text-5xl font-bold", label: "5xl / 48px", tracking: "-0.03em", sample: "Bali 2026" },
                  { cls: "text-4xl font-bold", label: "4xl / 36px", tracking: "-0.025em", sample: "Split the bill" },
                  { cls: "text-3xl font-semibold", label: "3xl / 30px", tracking: "-0.02em", sample: "Trip Overview" },
                  { cls: "text-2xl font-semibold", label: "2xl / 24px", tracking: "-0.015em", sample: "Your Itinerary" },
                ].map((t) => (
                  <div key={t.label} className="flex items-baseline gap-4 py-3 border-b border-gray-50">
                    <code className="text-[9px] font-mono text-muted-foreground/60 w-24 shrink-0">{t.label}</code>
                    <p className={cn(t.cls, "flex-1")} style={{ letterSpacing: t.tracking }}>{t.sample}</p>
                  </div>
                ))}
              </div>
              <CodeSnippet>{`// Display heading — tight tracking, bold
<h1 className="text-4xl font-bold" style={{ letterSpacing: "-0.025em" }}>
  Split the bill
</h1>

// Section heading
<h2 className="text-2xl font-semibold tracking-tight">
  Your Itinerary
</h2>`}</CodeSnippet>
            </div>

            {/* Data scale */}
            <div className="mb-10">
              <SubLabel>Data Scale — Numbers as Features</SubLabel>
              <p className="text-xs text-muted-foreground mb-4">Large numbers should feel like a feature, not just text. Always use IBM Plex Mono with tabular-nums.</p>
              <div className="grid sm:grid-cols-3 gap-4 mb-4">
                <div className="rounded-2xl border border-gray-100 p-5 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">Hero Balance</p>
                  <p className="font-mono text-4xl font-bold tabular-nums tracking-tight text-foreground">$2,847</p>
                  <p className="font-mono text-sm text-muted-foreground mt-1">.50 <span className="text-[10px]">USD</span></p>
                </div>
                <div className="rounded-2xl border border-gray-100 p-5 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">Inline Amount</p>
                  <p className="font-mono text-xl font-semibold tabular-nums text-foreground">IDR 1,703,707</p>
                </div>
                <div className="rounded-2xl border border-gray-100 p-5 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">Small Data</p>
                  <p className="font-mono text-sm tabular-nums text-foreground">€38.50 · £33.00 · ¥5,200</p>
                </div>
              </div>
              <CodeSnippet>{`// Hero balance — 4xl mono, split decimals
<p className="font-mono text-4xl font-bold tabular-nums tracking-tight">$2,847</p>
<p className="font-mono text-sm text-muted-foreground">.50 <span className="text-[10px]">USD</span></p>

// Inline currency
<span className="font-mono text-sm tabular-nums">IDR 160,000.00</span>`}</CodeSnippet>
            </div>

            {/* Body scale */}
            <div className="mb-10">
              <SubLabel>Body & UI Scale</SubLabel>
              <div className="space-y-2">
                {[
                  { cls: "text-lg font-medium", label: "lg/18px", usage: "Subheadings", sample: "Where are you going?" },
                  { cls: "text-base", label: "base/16px", usage: "Body text", sample: "Plan your next adventure with friends." },
                  { cls: "text-sm", label: "sm/14px", usage: "Secondary, labels", sample: "Added 3 days ago by Sarah" },
                  { cls: "text-xs", label: "xs/12px", usage: "Captions, metadata", sample: "Last updated: Apr 16, 2026" },
                  { cls: "text-[11px] font-medium tracking-wide", label: "11px", usage: "Micro labels, badges", sample: "CONFIRMED · 3 MEMBERS" },
                  { cls: "text-[10px]", label: "10px", usage: "Chip text", sample: "7 of 7 unclaimed" },
                ].map((t) => (
                  <div key={t.label} className="flex items-baseline gap-4 py-2 border-b border-gray-50 last:border-0">
                    <code className="text-[9px] font-mono text-muted-foreground/60 w-16 shrink-0">{t.label}</code>
                    <p className={cn(t.cls, "flex-1 truncate")}>{t.sample}</p>
                    <span className="text-[9px] text-muted-foreground hidden sm:block">{t.usage}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Weight contrast */}
            <div>
              <SubLabel>Weight Contrast</SubLabel>
              <div className="grid sm:grid-cols-4 gap-3">
                {[
                  { w: "font-bold", label: "700 Bold", usage: "Display headings" },
                  { w: "font-semibold", label: "600 Semibold", usage: "Section titles, buttons" },
                  { w: "font-medium", label: "500 Medium", usage: "Labels, captions" },
                  { w: "font-normal", label: "400 Regular", usage: "Body copy" },
                ].map((f) => (
                  <div key={f.label} className="rounded-xl border border-gray-100 p-4">
                    <p className={cn("text-lg", f.w)}>Junto</p>
                    <p className="text-[10px] font-mono text-muted-foreground mt-1">{f.label}</p>
                    <p className="text-[10px] text-muted-foreground">{f.usage}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════
               3. MOTION — SIGNATURE INTERACTIONS
              ═══════════════════════════════════════════════════ */}
          <section>
            <SectionHeader
              id="motion"
              title="Signature Motion"
              subtitle="Consistent timing and easing makes the app feel intentional. Every animation has a purpose."
            />

            {/* Easings */}
            <div className="mb-10">
              <SubLabel>Standard Easings</SubLabel>
              <div className="grid sm:grid-cols-3 gap-4 mb-4">
                {[
                  { name: "Entrance", easing: "cubic-bezier(0.16, 1, 0.3, 1)", duration: "400ms", desc: "Elements entering view — fast start, gentle settle" },
                  { name: "State Change", easing: "cubic-bezier(0.4, 0, 0.2, 1)", duration: "250ms", desc: "Hover, toggle, color shifts — smooth and balanced" },
                  { name: "Micro", easing: "cubic-bezier(0.4, 0, 0.6, 1)", duration: "150ms", desc: "Button press, icon swap — snappy and immediate" },
                ].map((e) => (
                  <div key={e.name} className="rounded-xl border border-gray-100 p-4">
                    <p className="text-sm font-semibold mb-1">{e.name}</p>
                    <p className="text-[10px] font-mono text-primary mb-1">{e.duration}</p>
                    <p className="text-[10px] font-mono text-muted-foreground mb-2">{e.easing}</p>
                    <p className="text-[10px] text-muted-foreground">{e.desc}</p>
                  </div>
                ))}
              </div>
              <CodeSnippet>{`// Entrance (elements appearing)
transition: all 400ms cubic-bezier(0.16, 1, 0.3, 1);

// State change (hover, toggle)
className="transition-all duration-250 ease-in-out"

// Micro interaction (press)
className="transition-transform duration-150 active:opacity-80"`}</CodeSnippet>
            </div>

            {/* Live demos */}
            <div className="mb-10">
              <SubLabel>Interactive Demos</SubLabel>
              <div className="grid sm:grid-cols-4 gap-4">
                {/* Card lift */}
                <div
                  className="rounded-xl border border-gray-100 p-5 text-center cursor-pointer"
                  style={{
                    transition: "all 250ms cubic-bezier(0.4, 0, 0.2, 1)",
                    transform: hoverCard === "lift" ? "translateY(-4px)" : "translateY(0)",
                    boxShadow: hoverCard === "lift"
                      ? "0 12px 40px -8px rgba(0,0,0,0.12)"
                      : "0 1px 3px rgba(0,0,0,0.04)",
                  }}
                  onMouseEnter={() => setHoverCard("lift")}
                  onMouseLeave={() => setHoverCard(null)}
                >
                  <p className="text-sm font-semibold">Card Lift</p>
                  <p className="text-[10px] text-muted-foreground mt-1">translateY(-4px) + shadow</p>
                </div>

                {/* Button press */}
                <button className="rounded-xl border border-gray-100 p-5 text-center active:opacity-80 transition-transform duration-150">
                  <p className="text-sm font-semibold">Button Press</p>
                  <p className="text-[10px] text-muted-foreground mt-1">scale(0.96) on active</p>
                </button>

                {/* Color transition */}
                <div className="rounded-xl border border-gray-100 p-5 text-center cursor-pointer hover:bg-primary hover:text-white hover:border-primary transition-colors duration-250">
                  <p className="text-sm font-semibold">Color Shift</p>
                  <p className="text-[10px] mt-1 opacity-60">bg + text transition</p>
                </div>

                {/* Scale */}
                <div className="rounded-xl border border-gray-100 p-5 text-center cursor-pointer hover:scale-[1.03] transition-transform duration-250">
                  <p className="text-sm font-semibold">Subtle Scale</p>
                  <p className="text-[10px] text-muted-foreground mt-1">scale(1.03) on hover</p>
                </div>
              </div>
            </div>

            {/* Loading states */}
            <div>
              <SubLabel>Loading & Shimmer</SubLabel>
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="rounded-xl border border-gray-100 p-4">
                  <p className="text-xs font-medium mb-3">Skeleton pattern</p>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                    <Skeleton className="h-20 w-full rounded-xl" />
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 p-4">
                  <p className="text-xs font-medium mb-3">Spinner</p>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Loading…</span>
                    </div>
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════
               4. CARDS — LAYERED DEPTH
              ═══════════════════════════════════════════════════ */}
          <section>
            <SectionHeader
              id="cards"
              title="Layered Depth"
              subtitle="Cards are the primary container. Four variants handle different contexts — from standard content to hero moments."
            />

            <div className="grid sm:grid-cols-2 gap-6 mb-6">
              {/* Standard */}
              <div
                className="rounded-2xl bg-white border border-gray-100 p-5 cursor-pointer"
                style={{
                  transition: "all 250ms cubic-bezier(0.4, 0, 0.2, 1)",
                  transform: hoverCard === "standard" ? "translateY(-2px)" : "translateY(0)",
                  boxShadow: hoverCard === "standard"
                    ? "0 8px 30px -6px rgba(0,0,0,0.1)"
                    : "0 1px 3px rgba(0,0,0,0.04)",
                }}
                onMouseEnter={() => setHoverCard("standard")}
                onMouseLeave={() => setHoverCard(null)}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-3">Standard Card</p>
                <p className="text-sm font-semibold">Flights to Bali</p>
                <p className="text-xs text-muted-foreground mt-1">3 attachments · Added by Sarah</p>
                <p className="text-[10px] text-muted-foreground/60 mt-3 font-mono">rounded-2xl border border-gray-100 shadow-sm → hover:shadow-lg + translateY(-2px)</p>
              </div>

              {/* Hero card */}
              <div className="rounded-3xl p-6 text-white overflow-hidden relative" style={{
                background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)",
              }}>
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/[0.06] -translate-y-1/2 translate-x-1/2" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/50 mb-3">Hero Card</p>
                <p className="text-xl font-bold">Bali Adventure</p>
                <p className="text-sm text-white/60 mt-1">5 travelers · Oct 12–19, 2026</p>
                <div className="flex gap-2 mt-4">
                  <button className="px-3 py-1.5 rounded-lg bg-white text-teal-700 text-xs font-semibold">View trip</button>
                  <button className="px-3 py-1.5 rounded-lg bg-white/15 text-white text-xs font-medium border border-white/20">Share</button>
                </div>
                <p className="text-[10px] text-white/30 mt-4 font-mono">rounded-3xl gradient bg white text</p>
              </div>

              {/* Data card */}
              <div className="rounded-2xl bg-white border border-gray-100 p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[2px]" style={{
                  background: "linear-gradient(90deg, #0D9488, #0F766E)",
                }} />
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-3">Data Card</p>
                <p className="font-mono text-3xl font-bold tabular-nums tracking-tight">$1,284.50</p>
                <p className="text-xs text-muted-foreground mt-1">Total trip expenses</p>
                <p className="text-[10px] text-muted-foreground/60 mt-3 font-mono">Inset gradient top edge for depth</p>
              </div>

              {/* Glass card */}
              <div className="rounded-2xl p-5 relative overflow-hidden" style={{
                background: "rgba(13, 148, 136, 0.06)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(13, 148, 136, 0.1)",
              }}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-3">Glass Card</p>
                <p className="text-sm font-semibold">Overlay content</p>
                <p className="text-xs text-muted-foreground mt-1">Used for floating panels, tooltips, and overlays on busy backgrounds.</p>
                <p className="text-[10px] text-muted-foreground/60 mt-3 font-mono">backdrop-blur-xl bg-primary/[0.06]</p>
              </div>
            </div>

            <CodeSnippet>{`// Standard card with hover lift
<div className="rounded-2xl bg-white border border-gray-100 p-5
  hover:-translate-y-0.5 hover:shadow-lg transition-all duration-250">

// Hero gradient card
<div className="rounded-3xl p-6 text-white"
  style={{ background: "linear-gradient(135deg, #0D9488, #0F766E)" }}>

// Data card with inset top edge
<div className="rounded-2xl bg-white border border-gray-100 p-5 relative overflow-hidden">
  <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-primary" />

// Glass card
<div className="rounded-2xl p-5 bg-primary/[0.06] backdrop-blur-xl border border-primary/10">`}</CodeSnippet>
          </section>

          {/* ═══════════════════════════════════════════════════
               5. COMPONENTS
              ═══════════════════════════════════════════════════ */}
          <section>
            <SectionHeader
              id="components"
              title="Component Library"
              subtitle="Every interactive element with all variants. Use these patterns — don't invent new ones."
            />

            {/* Buttons */}
            <div className="mb-10">
              <SubLabel>Buttons</SubLabel>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3 items-center">
                  <Button>Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="destructive">Destructive</Button>
                  <Button variant="link">Link</Button>
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                  <Button size="sm">Small</Button>
                  <Button size="default">Default</Button>
                  <Button size="lg">Large</Button>
                  <Button size="icon"><Plus className="h-4 w-4" /></Button>
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                  <Button><Plus className="h-4 w-4" /> Add expense</Button>
                  <Button disabled>Disabled</Button>
                  <Button variant="destructive"><Trash2 className="h-4 w-4" /> Delete trip</Button>
                </div>
              </div>
            </div>

            {/* Inputs */}
            <div className="mb-10">
              <SubLabel>Inputs</SubLabel>
              <div className="grid sm:grid-cols-2 gap-4 max-w-lg">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Text input</label>
                  <Input placeholder="Enter destination…" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">With error</label>
                  <Input placeholder="Email" className="border-red-400 focus-visible:ring-red-400" />
                  <p className="text-[11px] text-red-600">Please enter a valid email</p>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium">Textarea</label>
                  <Textarea placeholder="Add notes about this expense…" rows={3} />
                </div>
              </div>
            </div>

            {/* Badges */}
            <div className="mb-10">
              <SubLabel>Badges</SubLabel>
              <div className="flex flex-wrap gap-2 items-center">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="destructive">Destructive</Badge>
                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-0">Confirmed</Badge>
                <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border-0">Pending</Badge>
                <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50 border-0">Info</Badge>
              </div>
            </div>

            {/* Stepper */}
            <div className="mb-10">
              <SubLabel>Number Stepper</SubLabel>
              <div className="flex items-center gap-6">
                <div className="flex items-center rounded-lg border border-border overflow-hidden shrink-0">
                  <button
                    onClick={() => setStepperVal(Math.max(0, stepperVal - 1))}
                    className={cn(
                      "h-9 w-10 flex items-center justify-center transition-colors",
                      stepperVal <= 0 ? "text-muted-foreground/30 cursor-not-allowed" : "text-foreground hover:bg-muted active:bg-muted/80"
                    )}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className={cn(
                    "h-9 w-10 flex items-center justify-center text-sm font-semibold tabular-nums border-x border-border bg-background font-mono",
                    stepperVal > 0 ? "text-primary" : "text-muted-foreground"
                  )}>
                    {stepperVal}
                  </span>
                  <button
                    onClick={() => setStepperVal(stepperVal + 1)}
                    className="h-9 w-10 flex items-center justify-center text-foreground hover:bg-muted active:bg-muted/80 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="text-sm text-muted-foreground">Value: <span className="font-mono font-semibold text-foreground">{stepperVal}</span></span>
              </div>
            </div>

            {/* Empty state */}
            <div className="mb-10">
              <SubLabel>Empty States</SubLabel>
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-10 text-center max-w-sm">
                <div className="h-12 w-12 rounded-2xl bg-primary/[0.06] flex items-center justify-center mx-auto mb-4">
                  <Receipt className="h-6 w-6 text-primary/40" />
                </div>
                <p className="text-sm font-semibold mb-1">No expenses yet</p>
                <p className="text-xs text-muted-foreground mb-5">Add your first expense to start tracking costs for this trip.</p>
                <Button size="sm"><Plus className="h-3.5 w-3.5" /> Add expense</Button>
              </div>
            </div>

            {/* Toasts */}
            <div>
              <SubLabel>Toasts</SubLabel>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => toast.success("Expense saved!")}>Success</Button>
                <Button size="sm" variant="outline" onClick={() => toast.error("Something went wrong")}>Error</Button>
                <Button size="sm" variant="outline" onClick={() => toast.info("Trip updated")}>Info</Button>
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════
               6. PHOTO-FORWARD COMPONENTS
              ═══════════════════════════════════════════════════ */}
          <section>
            <SectionHeader
              id="photo-forward"
              title="Photo-Forward"
              subtitle="Junto is an image-forward product. Trip cards, destinations, and activities lead with photography."
            />

            <div className="grid sm:grid-cols-2 gap-6 mb-6">
              {/* Trip card */}
              <div className="space-y-3">
                <SubLabel>Trip Card</SubLabel>
                <div
                  className="relative rounded-2xl overflow-hidden cursor-pointer group"
                  style={{ height: 220 }}
                  onMouseEnter={() => setHoverCard("trip")}
                  onMouseLeave={() => setHoverCard(null)}
                >
                  <img
                    src="https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=600&h=400&fit=crop"
                    alt="Bali"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500"
                    style={{ transform: hoverCard === "trip" ? "scale(1.05)" : "scale(1)" }}
                  />
                  <div className="absolute inset-0" style={{
                    background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0) 100%)",
                  }} />
                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    <p className="text-white text-lg font-bold">Bali Adventure</p>
                    <p className="text-white/60 text-sm">Oct 12–19, 2026 · 5 travelers</p>
                  </div>
                  <div className="absolute top-3 right-3">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white text-[10px] font-medium border border-white/10">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
                    </span>
                  </div>
                </div>
              </div>

              {/* Destination tile */}
              <div className="space-y-3">
                <SubLabel>Destination Tile</SubLabel>
                <div
                  className="relative rounded-2xl overflow-hidden cursor-pointer"
                  style={{ height: 220 }}
                  onMouseEnter={() => setHoverCard("dest")}
                  onMouseLeave={() => setHoverCard(null)}
                >
                  <img
                    src="https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=600&h=400&fit=crop"
                    alt="Tokyo"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500"
                    style={{ transform: hoverCard === "dest" ? "scale(1.05)" : "scale(1)" }}
                  />
                  <div className="absolute inset-0 bg-black/30" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                    <p className="text-white text-2xl font-bold tracking-tight">Tokyo</p>
                    <p className="text-white/60 text-sm mt-1">Japan</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Activity card - horizontal */}
            <div className="mb-6">
              <SubLabel>Activity Card — Horizontal</SubLabel>
              <div className="rounded-2xl border border-gray-100 overflow-hidden flex max-w-lg group cursor-pointer hover:shadow-md transition-shadow duration-250">
                <img
                  src="https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=300&h=200&fit=crop"
                  alt="Snorkeling"
                  className="w-28 h-28 object-cover shrink-0"
                />
                <div className="flex-1 p-4 min-w-0">
                  <p className="text-sm font-semibold truncate">Snorkeling at Blue Lagoon</p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Nusa Ceningan
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> 09:00 – 12:00
                  </p>
                  <p className="font-mono text-xs font-medium text-primary mt-2 tabular-nums">IDR 350,000</p>
                </div>
              </div>
            </div>

            <CodeSnippet>{`// Trip card — image with gradient scrim overlay
<div className="relative rounded-2xl overflow-hidden" style={{ height: 220 }}>
  <img src="..." className="absolute inset-0 w-full h-full object-cover
    group-hover:scale-105 transition-transform duration-500" />
  <div style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }} />
  <div className="absolute bottom-0 p-5">
    <p className="text-white text-lg font-bold">Trip Name</p>
  </div>
</div>`}</CodeSnippet>
          </section>

          {/* ═══════════════════════════════════════════════════
               7. FINANCIAL DISPLAY
              ═══════════════════════════════════════════════════ */}
          <section>
            <SectionHeader
              id="financial"
              title="Numbers as Hero"
              subtitle="Financial data should feel like a feature. Large, confident, monospaced numbers with clear positive/negative states."
            />

            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              {/* Large balance - positive */}
              <div className="rounded-2xl border border-gray-100 p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-emerald-500" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1">You're owed</p>
                <p className="font-mono text-3xl font-bold tabular-nums tracking-tight text-emerald-600">+$847.50</p>
                <p className="text-xs text-muted-foreground mt-2">From 3 members</p>
                <div className="flex items-center gap-1 mt-3">
                  <TrendingUp className="h-3 w-3 text-emerald-600" />
                  <span className="text-[10px] font-medium text-emerald-600">Positive balance</span>
                </div>
              </div>

              {/* Large balance - negative */}
              <div className="rounded-2xl border border-gray-100 p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-rose-500" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1">You owe</p>
                <p className="font-mono text-3xl font-bold tabular-nums tracking-tight text-rose-600">-$234.00</p>
                <p className="text-xs text-muted-foreground mt-2">To 2 members</p>
                <div className="flex items-center gap-1 mt-3">
                  <TrendingDown className="h-3 w-3 text-rose-600" />
                  <span className="text-[10px] font-medium text-rose-600">Negative balance</span>
                </div>
              </div>

              {/* Settled */}
              <div className="rounded-2xl border border-gray-100 p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gray-300" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1">Balance</p>
                <p className="font-mono text-3xl font-bold tabular-nums tracking-tight text-muted-foreground">$0.00</p>
                <p className="text-xs text-muted-foreground mt-2">All settled up</p>
                <div className="flex items-center gap-1 mt-3">
                  <Check className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-muted-foreground">Even</span>
                </div>
              </div>
            </div>

            {/* Settlement row */}
            <div className="mb-6">
              <SubLabel>Settlement Row</SubLabel>
              <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 max-w-md overflow-hidden">
                {[
                  { from: "SA", to: "JA", name: "Sarah → James", amount: "$120.00", color: "text-rose-600" },
                  { from: "OL", to: "SA", name: "Oliver → Sarah", amount: "$85.50", color: "text-rose-600" },
                  { from: "JA", to: "OL", name: "James → Oliver", amount: "$42.00", color: "text-rose-600" },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex items-center -space-x-2">
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-white z-10">
                        <span className="text-[9px] font-semibold text-primary">{s.from}</span>
                      </div>
                      <div className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center ring-2 ring-white">
                        <span className="text-[9px] font-semibold text-muted-foreground">{s.to}</span>
                      </div>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    <span className="text-sm flex-1 min-w-0 truncate">{s.name}</span>
                    <span className={cn("font-mono text-sm font-semibold tabular-nums", s.color)}>{s.amount}</span>
                  </div>
                ))}
              </div>
            </div>

            <CodeSnippet>{`// Positive balance — emerald
<p className="font-mono text-3xl font-bold tabular-nums text-emerald-600">+$847.50</p>

// Negative balance — rose
<p className="font-mono text-3xl font-bold tabular-nums text-rose-600">-$234.00</p>

// Inline amount
<span className="font-mono text-sm font-semibold tabular-nums">$120.00</span>

// Currency code muted
<span className="text-[10px] text-muted-foreground">USD</span>`}</CodeSnippet>
          </section>

          {/* ═══════════════════════════════════════════════════
               8. ICONS
              ═══════════════════════════════════════════════════ */}
          <section>
            <SectionHeader
              id="icons"
              title="Iconography"
              subtitle="lucide-react only. Never mix icon libraries. Consistent sizing across the app."
            />

            <div className="mb-8">
              <SubLabel>Common Icons</SubLabel>
              <div className="grid grid-cols-6 sm:grid-cols-10 gap-2">
                {[
                  { Icon: Calendar, name: "Calendar" }, { Icon: MapPin, name: "MapPin" },
                  { Icon: Users, name: "Users" }, { Icon: Plus, name: "Plus" },
                  { Icon: Minus, name: "Minus" }, { Icon: Trash2, name: "Trash2" },
                  { Icon: Pencil, name: "Pencil" }, { Icon: Search, name: "Search" },
                  { Icon: ChevronRight, name: "Chevron" }, { Icon: ArrowLeft, name: "Back" },
                  { Icon: Settings, name: "Settings" }, { Icon: Share2, name: "Share" },
                  { Icon: Heart, name: "Heart" }, { Icon: Star, name: "Star" },
                  { Icon: Check, name: "Check" }, { Icon: X, name: "X" },
                  { Icon: Bell, name: "Bell" }, { Icon: Home, name: "Home" },
                  { Icon: Receipt, name: "Receipt" }, { Icon: Globe, name: "Globe" },
                  { Icon: Clock, name: "Clock" }, { Icon: DollarSign, name: "Dollar" },
                  { Icon: Camera, name: "Camera" }, { Icon: Upload, name: "Upload" },
                  { Icon: Sparkles, name: "AI" }, { Icon: Plane, name: "Plane" },
                  { Icon: Map, name: "Map" }, { Icon: MoreHorizontal, name: "More" },
                ].map(({ Icon, name }) => (
                  <div key={name} className="flex flex-col items-center gap-1 rounded-xl border border-gray-50 p-2.5 hover:border-gray-200 hover:bg-gray-50/50 transition-colors">
                    <Icon className="h-[18px] w-[18px] text-foreground" />
                    <span className="text-[8px] font-mono text-muted-foreground/60">{name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <SubLabel>Sizing Convention</SubLabel>
              <div className="flex items-end gap-8">
                {[
                  { size: "h-4 w-4", px: "16px", label: "Inline / buttons" },
                  { size: "h-5 w-5", px: "20px", label: "Nav / cards" },
                  { size: "h-6 w-6", px: "24px", label: "Headers / CTAs" },
                ].map((s) => (
                  <div key={s.px} className="text-center space-y-1.5">
                    <MapPin className={cn(s.size, "mx-auto text-primary")} />
                    <p className="text-[10px] font-mono font-medium text-foreground">{s.px}</p>
                    <p className="text-[9px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════
               9. PATTERNS
              ═══════════════════════════════════════════════════ */}
          <section>
            <SectionHeader
              id="patterns"
              title="UI Patterns"
              subtitle="Reusable layout patterns for lists, forms, and navigation."
            />

            <div className="grid sm:grid-cols-2 gap-6">
              {/* List with avatars */}
              <div>
                <SubLabel>List with Avatars</SubLabel>
                <div className="rounded-xl border border-gray-100 bg-white divide-y divide-gray-50 overflow-hidden">
                  {[
                    { name: "Sarah Chen", initials: "SC", amount: "$120.00", color: "text-rose-600" },
                    { name: "James Wilson", initials: "JW", amount: "+$85.50", color: "text-emerald-600" },
                    { name: "Oliver Park", initials: "OP", amount: "$0.00", color: "text-muted-foreground" },
                  ].map((p, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-[10px] font-semibold text-primary">{p.initials}</span>
                      </div>
                      <span className="text-sm flex-1">{p.name}</span>
                      <span className={cn("font-mono text-sm font-medium tabular-nums", p.color)}>{p.amount}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Form pattern */}
              <div>
                <SubLabel>Stacked Form</SubLabel>
                <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Trip name</label>
                    <Input placeholder="e.g. Bali 2026" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Destination</label>
                    <Input placeholder="Where to?" />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button className="flex-1">Create trip</Button>
                    <Button variant="outline">Cancel</Button>
                  </div>
                </div>
              </div>

              {/* Navigation list */}
              <div>
                <SubLabel>Navigation List</SubLabel>
                <div className="rounded-xl border border-gray-100 bg-white divide-y divide-gray-50 overflow-hidden">
                  {[
                    { icon: Calendar, label: "Itinerary", badge: "3 items" },
                    { icon: Receipt, label: "Expenses", badge: "$1,284" },
                    { icon: MapPin, label: "Decisions", badge: "2 open" },
                  ].map(({ icon: Icon, label, badge }, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors cursor-pointer">
                      <div className="h-8 w-8 rounded-lg bg-primary/[0.06] flex items-center justify-center">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium flex-1">{label}</span>
                      <span className="text-[11px] text-muted-foreground">{badge}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Pill / chip pattern */}
              <div>
                <SubLabel>Filter Pills</SubLabel>
                <div className="flex flex-wrap gap-2 mb-4">
                  {["All", "Food", "Transport", "Accommodation", "Activities"].map((label, i) => (
                    <button
                      key={label}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                        i === 0
                          ? "bg-primary text-white"
                          : "bg-gray-100 text-muted-foreground hover:bg-gray-200"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <SubLabel>Member Chips</SubLabel>
                <div className="flex flex-wrap gap-2">
                  {["Sarah C.", "James W.", "Oliver P."].map((name) => (
                    <span key={name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-xs font-medium">
                      <span className="h-4 w-4 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-[7px] font-bold text-primary">{name[0]}</span>
                      </span>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Footer */}
          <div className="border-t border-gray-100 pt-10 pb-20">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{
                background: "linear-gradient(135deg, #0D9488, #0F766E)",
              }}>
                <span className="text-white text-xs font-bold">J</span>
              </div>
              <div>
                <p className="text-sm font-semibold">Junto Design System</p>
                <p className="text-[10px] text-muted-foreground">v2.0 · Internal reference · Not for end users</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground/60 max-w-md">
              This page is a living document. Update it when you add new patterns, colors, or components to the app. If it's not here, it doesn't exist.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

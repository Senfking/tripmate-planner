import { useState, useEffect } from "react";
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
  Sparkles, Globe, Clock, DollarSign, Camera, Upload,
} from "lucide-react";

/* ── helpers ─────────────────────────────────────────────── */
function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative group">
      <pre className="rounded-lg bg-gray-900 text-gray-100 text-xs p-3 overflow-x-auto font-mono leading-relaxed">
        <code>{children.trim()}</code>
      </pre>
      <button
        onClick={() => { navigator.clipboard.writeText(children.trim()); toast.success("Copied"); }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-2xl font-bold scroll-mt-20 border-b border-gray-200 pb-3 mb-6">
      {children}
    </h2>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

/* ── section data ────────────────────────────────────────── */
const SECTIONS = [
  { id: "colors", label: "Colors" },
  { id: "typography", label: "Typography" },
  { id: "spacing", label: "Spacing & Layout" },
  { id: "components", label: "Components" },
  { id: "icons", label: "Icons" },
  { id: "patterns", label: "Patterns" },
  { id: "animations", label: "Animations" },
];

const TEAL_SCALE = [
  { name: "teal-50", hex: "#F0FDFA", tw: "bg-teal-50" },
  { name: "teal-100", hex: "#CCFBF1", tw: "bg-teal-100" },
  { name: "teal-200", hex: "#99F6E4", tw: "bg-teal-200" },
  { name: "teal-300", hex: "#5EEAD4", tw: "bg-teal-300" },
  { name: "teal-400", hex: "#2DD4BF", tw: "bg-teal-400" },
  { name: "teal-500", hex: "#14B8A6", tw: "bg-teal-500" },
  { name: "teal-600", hex: "#0D9488", tw: "bg-teal-600" },
  { name: "teal-700", hex: "#0F766E", tw: "bg-teal-700" },
  { name: "teal-800", hex: "#115E59", tw: "bg-teal-800" },
  { name: "teal-900", hex: "#134E4A", tw: "bg-teal-900" },
];

const GRAY_SCALE = [
  { name: "gray-50", hex: "#F9FAFB", tw: "bg-gray-50" },
  { name: "gray-100", hex: "#F3F4F6", tw: "bg-gray-100" },
  { name: "gray-200", hex: "#E5E7EB", tw: "bg-gray-200" },
  { name: "gray-300", hex: "#D1D5DB", tw: "bg-gray-300" },
  { name: "gray-400", hex: "#9CA3AF", tw: "bg-gray-400" },
  { name: "gray-500", hex: "#6B7280", tw: "bg-gray-500" },
  { name: "gray-600", hex: "#4B5563", tw: "bg-gray-600" },
  { name: "gray-700", hex: "#374151", tw: "bg-gray-700" },
  { name: "gray-800", hex: "#1F2937", tw: "bg-gray-800" },
  { name: "gray-900", hex: "#111827", tw: "bg-gray-900" },
];

const SEMANTIC_COLORS = [
  { name: "Success", hex: "#16A34A", tw: "bg-green-600", usage: "Confirmations, positive balances" },
  { name: "Warning", hex: "#F59E0B", tw: "bg-amber-500", usage: "Cautions, pending states" },
  { name: "Error", hex: "#DC2626", tw: "bg-red-600", usage: "Destructive actions, errors" },
  { name: "Info", hex: "#2563EB", tw: "bg-blue-600", usage: "Informational notices, links" },
];

const TYPE_SCALE = [
  { cls: "text-4xl", size: "36px", usage: "Hero headings only" },
  { cls: "text-3xl", size: "30px", usage: "Page titles" },
  { cls: "text-2xl", size: "24px", usage: "Section headers" },
  { cls: "text-xl", size: "20px", usage: "Card titles" },
  { cls: "text-lg", size: "18px", usage: "Subheadings" },
  { cls: "text-base", size: "16px", usage: "Body text (default)" },
  { cls: "text-sm", size: "14px", usage: "Secondary body, form labels" },
  { cls: "text-xs", size: "12px", usage: "Captions, metadata" },
  { cls: "text-[11px]", size: "11px", usage: "Micro labels, badges" },
  { cls: "text-[10px]", size: "10px", usage: "Chip text, smallest UI" },
];

const ICON_LIST = [
  { Icon: Calendar, name: "Calendar" }, { Icon: MapPin, name: "MapPin" },
  { Icon: Users, name: "Users" }, { Icon: Plus, name: "Plus" },
  { Icon: Minus, name: "Minus" }, { Icon: Trash2, name: "Trash2" },
  { Icon: Pencil, name: "Pencil" }, { Icon: Search, name: "Search" },
  { Icon: ChevronRight, name: "ChevronRight" }, { Icon: ArrowLeft, name: "ArrowLeft" },
  { Icon: Settings, name: "Settings" }, { Icon: Share2, name: "Share2" },
  { Icon: Heart, name: "Heart" }, { Icon: Star, name: "Star" },
  { Icon: Check, name: "Check" }, { Icon: X, name: "X" },
  { Icon: Loader2, name: "Loader2" }, { Icon: Bell, name: "Bell" },
  { Icon: Home, name: "Home" }, { Icon: Receipt, name: "Receipt" },
  { Icon: Map, name: "Map" }, { Icon: MoreHorizontal, name: "MoreHorizontal" },
  { Icon: Sparkles, name: "Sparkles" }, { Icon: Globe, name: "Globe" },
  { Icon: Clock, name: "Clock" }, { Icon: DollarSign, name: "DollarSign" },
  { Icon: Camera, name: "Camera" }, { Icon: Upload, name: "Upload" },
];

/* ── main page ───────────────────────────────────────────── */
export default function DesignSystem() {
  const [activeSection, setActiveSection] = useState("colors");
  const [stepperVal, setStepperVal] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        }
      },
      { rootMargin: "-100px 0px -60% 0px", threshold: 0 }
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-teal-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">J</span>
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">Junto Design System</h1>
            <p className="text-[11px] text-muted-foreground">Internal reference · v1.0</p>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex">
        {/* Sidebar */}
        <nav className="hidden lg:block sticky top-[57px] h-[calc(100vh-57px)] w-56 shrink-0 border-r border-gray-200 p-4 space-y-1 overflow-y-auto">
          {SECTIONS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className={cn(
                "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                activeSection === id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 min-w-0 px-4 py-8 lg:px-10 space-y-16">

          {/* ═══ COLORS ═══ */}
          <section>
            <SectionTitle id="colors">Colors</SectionTitle>

            <div className="space-y-8">
              <SubSection title="Primary — Junto Teal (accent color)">
                <p className="text-sm text-muted-foreground mb-3">
                  <strong>teal-600 (#0D9488)</strong> is the primary accent. Use for buttons, links, active states, and CTAs.
                </p>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                  {TEAL_SCALE.map((c) => (
                    <div key={c.name} className="text-center space-y-1">
                      <div className={cn("h-12 rounded-lg border border-gray-200", c.tw)} />
                      <p className="text-[10px] font-mono text-muted-foreground">{c.name.split("-")[1]}</p>
                      <p className="text-[9px] font-mono text-muted-foreground/70">{c.hex}</p>
                    </div>
                  ))}
                </div>
                <CodeBlock>{`// Primary button
<Button>Save</Button>

// Teal accent text
<span className="text-primary">Active</span>

// Teal background badge
<Badge className="bg-teal-600 text-white">New</Badge>`}</CodeBlock>
              </SubSection>

              <SubSection title="Neutrals — Gray scale">
                <p className="text-sm text-muted-foreground mb-3">
                  Use for text, borders, backgrounds, and dividers. <strong>gray-200</strong> for component borders, <strong>gray-100</strong> for dividers.
                </p>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                  {GRAY_SCALE.map((c) => (
                    <div key={c.name} className="text-center space-y-1">
                      <div className={cn("h-12 rounded-lg border border-gray-200", c.tw)} />
                      <p className="text-[10px] font-mono text-muted-foreground">{c.name.split("-")[1]}</p>
                      <p className="text-[9px] font-mono text-muted-foreground/70">{c.hex}</p>
                    </div>
                  ))}
                </div>
              </SubSection>

              <SubSection title="Semantic colors">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {SEMANTIC_COLORS.map((c) => (
                    <div key={c.name} className="rounded-xl border border-gray-200 p-3 space-y-2">
                      <div className={cn("h-10 rounded-lg", c.tw)} />
                      <p className="text-xs font-semibold">{c.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{c.hex}</p>
                      <p className="text-[10px] text-muted-foreground">{c.usage}</p>
                    </div>
                  ))}
                </div>
              </SubSection>
            </div>
          </section>

          {/* ═══ TYPOGRAPHY ═══ */}
          <section>
            <SectionTitle id="typography">Typography</SectionTitle>

            <div className="space-y-8">
              <SubSection title="Font families">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="text-lg font-semibold mb-1">IBM Plex Sans</p>
                    <p className="text-sm text-muted-foreground mb-3">Body text, headings, UI labels</p>
                    <p className="text-base">The quick brown fox jumps over the lazy dog</p>
                    <p className="text-base font-medium mt-1">Medium weight for emphasis</p>
                    <p className="text-base font-bold mt-1">Bold for headings</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="text-lg font-semibold mb-1 font-mono">IBM Plex Mono</p>
                    <p className="text-sm text-muted-foreground mb-3">Currency amounts, data, code</p>
                    <p className="font-mono text-base">IDR 1,703,707.50</p>
                    <p className="font-mono text-sm mt-1 text-muted-foreground">$42.00 · €38.50 · £33.00</p>
                  </div>
                </div>
                <CodeBlock>{`// Body text
<p className="text-sm">Description text</p>

// Currency / data
<span className="font-mono text-sm tabular-nums">IDR 160,000.00</span>

// Heading
<h2 className="text-xl font-bold">Section Title</h2>`}</CodeBlock>
              </SubSection>

              <SubSection title="Type scale">
                <div className="space-y-3">
                  {TYPE_SCALE.map((t) => (
                    <div key={t.cls} className="flex items-baseline gap-4 py-2 border-b border-gray-100 last:border-0">
                      <code className="text-[10px] font-mono text-muted-foreground w-20 shrink-0">{t.cls}</code>
                      <span className="text-[10px] text-muted-foreground w-10 shrink-0">{t.size}</span>
                      <p className={cn(t.cls, "truncate flex-1")}>The quick brown fox</p>
                      <span className="text-[10px] text-muted-foreground hidden sm:block">{t.usage}</span>
                    </div>
                  ))}
                </div>
              </SubSection>
            </div>
          </section>

          {/* ═══ SPACING & LAYOUT ═══ */}
          <section>
            <SectionTitle id="spacing">Spacing & Layout</SectionTitle>

            <div className="space-y-8">
              <SubSection title="Spacing scale">
                <div className="flex flex-wrap gap-3 items-end">
                  {[1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                    <div key={n} className="text-center">
                      <div
                        className="bg-teal-500/20 border border-teal-500/40 rounded"
                        style={{ width: `${n * 4}px`, height: `${n * 4}px` }}
                      />
                      <p className="text-[9px] font-mono text-muted-foreground mt-1">p-{n}</p>
                      <p className="text-[8px] text-muted-foreground">{n * 4}px</p>
                    </div>
                  ))}
                </div>
              </SubSection>

              <SubSection title="Card pattern">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-4">
                    <p className="text-sm font-semibold mb-1">Standard card</p>
                    <p className="text-xs text-muted-foreground">bg-white rounded-2xl shadow-sm border border-gray-100</p>
                  </div>
                  <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-4 hover:shadow-md hover:border-gray-200 transition-all cursor-pointer">
                    <p className="text-sm font-semibold mb-1">Hoverable card</p>
                    <p className="text-xs text-muted-foreground">+ hover:shadow-md hover:border-gray-200</p>
                  </div>
                </div>
                <CodeBlock>{`<div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-4">
  {/* Card content */}
</div>`}</CodeBlock>
              </SubSection>

              <SubSection title="Container widths">
                <div className="space-y-2">
                  {[
                    { label: "Mobile", width: "375px", cls: "max-w-[375px]" },
                    { label: "sm", width: "640px", cls: "max-w-sm" },
                    { label: "md", width: "768px", cls: "max-w-md" },
                    { label: "lg", width: "1024px", cls: "max-w-lg" },
                    { label: "4xl (content max)", width: "896px", cls: "max-w-4xl" },
                  ].map((c) => (
                    <div key={c.label} className="flex items-center gap-3">
                      <code className="text-[10px] font-mono text-muted-foreground w-32">{c.cls}</code>
                      <div className="h-3 rounded-full bg-teal-100" style={{ width: `min(${c.width}, 100%)` }} />
                      <span className="text-[10px] text-muted-foreground">{c.width}</span>
                    </div>
                  ))}
                </div>
              </SubSection>
            </div>
          </section>

          {/* ═══ COMPONENTS ═══ */}
          <section>
            <SectionTitle id="components">Components</SectionTitle>

            <div className="space-y-10">
              {/* Buttons */}
              <SubSection title="Buttons">
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
                  <Button><Plus className="h-4 w-4" /> With icon</Button>
                  <Button disabled>Disabled</Button>
                  <Button variant="destructive"><Trash2 className="h-4 w-4" /> Delete</Button>
                </div>
                <CodeBlock>{`<Button>Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive"><Trash2 /> Delete</Button>
<Button size="sm">Small</Button>
<Button size="icon"><Plus /></Button>`}</CodeBlock>
              </SubSection>

              {/* Inputs */}
              <SubSection title="Inputs">
                <div className="grid sm:grid-cols-2 gap-4 max-w-lg">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Text input</label>
                    <Input placeholder="Enter destination…" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">With error</label>
                    <Input placeholder="Email" className="border-red-500 focus-visible:ring-red-500" />
                    <p className="text-[11px] text-red-600">Please enter a valid email</p>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-sm font-medium">Textarea</label>
                    <Textarea placeholder="Add notes…" rows={3} />
                  </div>
                </div>
                <CodeBlock>{`<Input placeholder="Enter destination…" />
<Input className="border-red-500 focus-visible:ring-red-500" />
<Textarea placeholder="Add notes…" rows={3} />`}</CodeBlock>
              </SubSection>

              {/* Badges */}
              <SubSection title="Badges">
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge>Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="outline">Outline</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0">Success</Badge>
                  <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0">Warning</Badge>
                  <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0">Info</Badge>
                </div>
                <CodeBlock>{`<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Destructive</Badge>
<Badge className="bg-green-100 text-green-700">Success</Badge>`}</CodeBlock>
              </SubSection>

              {/* Stepper */}
              <SubSection title="Number stepper">
                <div className="flex items-center gap-4">
                  <div className="flex items-center rounded-lg border border-border overflow-hidden shrink-0">
                    <button
                      onClick={() => setStepperVal(Math.max(0, stepperVal - 1))}
                      className={cn(
                        "h-8 w-9 flex items-center justify-center transition-colors",
                        stepperVal <= 0 ? "text-muted-foreground/30 cursor-not-allowed" : "text-foreground hover:bg-muted active:bg-muted/80"
                      )}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className={cn(
                      "h-8 w-8 flex items-center justify-center text-[13px] font-semibold tabular-nums border-x border-border bg-background",
                      stepperVal > 0 ? "text-primary" : "text-muted-foreground"
                    )}>
                      {stepperVal}
                    </span>
                    <button
                      onClick={() => setStepperVal(stepperVal + 1)}
                      className="h-8 w-9 flex items-center justify-center text-foreground hover:bg-muted active:bg-muted/80 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-sm text-muted-foreground">Current: {stepperVal}</span>
                </div>
                <CodeBlock>{`<div className="flex items-center rounded-lg border border-border overflow-hidden">
  <button className="h-8 w-9 flex items-center justify-center">
    <Minus className="h-3.5 w-3.5" />
  </button>
  <span className="h-8 w-8 flex items-center justify-center text-[13px] font-semibold border-x border-border">
    {count}
  </span>
  <button className="h-8 w-9 flex items-center justify-center">
    <Plus className="h-3.5 w-3.5" />
  </button>
</div>`}</CodeBlock>
              </SubSection>

              {/* Empty state */}
              <SubSection title="Empty states">
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center max-w-sm">
                  <Receipt className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium mb-1">No expenses yet</p>
                  <p className="text-xs text-muted-foreground mb-4">Add your first expense to start tracking costs.</p>
                  <Button size="sm"><Plus className="h-3.5 w-3.5" /> Add expense</Button>
                </div>
                <CodeBlock>{`<div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
  <Receipt className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
  <p className="text-sm font-medium mb-1">No expenses yet</p>
  <p className="text-xs text-muted-foreground mb-4">Add your first expense.</p>
  <Button size="sm"><Plus /> Add expense</Button>
</div>`}</CodeBlock>
              </SubSection>

              {/* Skeletons */}
              <SubSection title="Loading skeletons">
                <div className="space-y-3 max-w-sm">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                  <Skeleton className="h-24 w-full rounded-xl" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-20 rounded-lg" />
                    <Skeleton className="h-8 w-16 rounded-lg" />
                  </div>
                </div>
                <CodeBlock>{`<Skeleton className="h-10 w-10 rounded-full" />
<Skeleton className="h-4 w-3/4" />
<Skeleton className="h-24 w-full rounded-xl" />`}</CodeBlock>
              </SubSection>

              {/* Toasts */}
              <SubSection title="Toasts / notifications">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => toast.success("Expense saved!")}>Success toast</Button>
                  <Button size="sm" variant="outline" onClick={() => toast.error("Something went wrong")}>Error toast</Button>
                  <Button size="sm" variant="outline" onClick={() => toast.info("Trip updated")}>Info toast</Button>
                </div>
                <CodeBlock>{`import { toast } from "sonner";

toast.success("Expense saved!");
toast.error("Something went wrong");
toast.info("Trip updated");`}</CodeBlock>
              </SubSection>
            </div>
          </section>

          {/* ═══ ICONS ═══ */}
          <section>
            <SectionTitle id="icons">Icons</SectionTitle>

            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                We use <strong>lucide-react</strong> exclusively. Never mix icon libraries.
              </p>

              <SubSection title="Common icons">
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
                  {ICON_LIST.map(({ Icon, name }) => (
                    <div key={name} className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-200 p-3 hover:bg-muted/50 transition-colors">
                      <Icon className="h-5 w-5 text-foreground" />
                      <span className="text-[9px] font-mono text-muted-foreground text-center">{name}</span>
                    </div>
                  ))}
                </div>
              </SubSection>

              <SubSection title="Sizing conventions">
                <div className="flex items-end gap-6">
                  {[
                    { size: "h-4 w-4", px: "16px", usage: "Inline with text, buttons" },
                    { size: "h-5 w-5", px: "20px", usage: "Navigation, cards" },
                    { size: "h-6 w-6", px: "24px", usage: "Headers, CTAs" },
                  ].map((s) => (
                    <div key={s.px} className="text-center space-y-1">
                      <MapPin className={cn(s.size, "mx-auto text-primary")} />
                      <p className="text-[10px] font-mono text-muted-foreground">{s.size}</p>
                      <p className="text-[9px] text-muted-foreground">{s.px} — {s.usage}</p>
                    </div>
                  ))}
                </div>
                <CodeBlock>{`import { MapPin, Calendar, Users } from "lucide-react";

// Inline with text (16px)
<MapPin className="h-4 w-4" />

// Card icons (20px)
<Calendar className="h-5 w-5" />

// Header icons (24px)
<Users className="h-6 w-6" />`}</CodeBlock>
              </SubSection>
            </div>
          </section>

          {/* ═══ PATTERNS ═══ */}
          <section>
            <SectionTitle id="patterns">Patterns</SectionTitle>

            <div className="space-y-8">
              <SubSection title="List with dividers">
                <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 max-w-sm overflow-hidden">
                  {["Flights to Bali", "Hotel booking", "Travel insurance"].map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-sm">{item}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </SubSection>

              <SubSection title="List with avatars">
                <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 max-w-sm overflow-hidden">
                  {[
                    { name: "Sarah", initials: "SA", amount: "$120.00" },
                    { name: "James", initials: "JA", amount: "$85.50" },
                    { name: "Oliver", initials: "OL", amount: "$42.00" },
                  ].map((p, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-[10px] font-semibold text-primary">{p.initials}</span>
                      </div>
                      <span className="text-sm flex-1">{p.name}</span>
                      <span className="text-sm font-mono tabular-nums font-medium">{p.amount}</span>
                    </div>
                  ))}
                </div>
              </SubSection>

              <SubSection title="Form — stacked layout">
                <div className="max-w-sm space-y-4 rounded-xl border border-gray-200 bg-white p-4">
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
              </SubSection>
            </div>
          </section>

          {/* ═══ ANIMATIONS ═══ */}
          <section>
            <SectionTitle id="animations">Animations</SectionTitle>

            <div className="space-y-8">
              <SubSection title="Standard transitions">
                <div className="grid sm:grid-cols-3 gap-4 max-w-lg">
                  <div className="rounded-xl border border-gray-200 p-4 hover:bg-muted/50 transition-colors cursor-pointer text-center">
                    <p className="text-xs font-medium">transition-colors</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Hover me</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4 hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer text-center">
                    <p className="text-xs font-medium">transition-all</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Lift on hover</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4 hover:scale-[1.02] transition-transform cursor-pointer text-center">
                    <p className="text-xs font-medium">transition-transform</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Scale on hover</p>
                  </div>
                </div>
              </SubSection>

              <SubSection title="Active / pressed states">
                <div className="flex gap-3">
                  <button className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium hover:bg-muted active:scale-95 transition-all">
                    Press me
                  </button>
                  <button className="rounded-xl bg-primary text-primary-foreground px-4 py-3 text-sm font-medium hover:opacity-90 active:scale-95 transition-all">
                    Primary press
                  </button>
                </div>
              </SubSection>

              <SubSection title="Loading shimmer">
                <div className="max-w-xs space-y-2">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-4/5" />
                  <Skeleton className="h-5 w-3/5" />
                </div>
                <CodeBlock>{`// Standard transitions
className="transition-colors hover:bg-muted"
className="transition-all hover:-translate-y-0.5 hover:shadow-md"

// Active / pressed
className="active:scale-95 transition-transform"

// Loading shimmer
<Skeleton className="h-5 w-full" />`}</CodeBlock>
              </SubSection>

              <SubSection title="Spinner">
                <div className="flex items-center gap-4">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
                <CodeBlock>{`<Loader2 className="h-5 w-5 animate-spin text-primary" />`}</CodeBlock>
              </SubSection>
            </div>
          </section>

          {/* Footer */}
          <div className="border-t border-gray-200 pt-8 pb-16 text-center">
            <p className="text-xs text-muted-foreground">Junto Design System · Internal reference only · Not for end users</p>
          </div>
        </main>
      </div>
    </div>
  );
}

import { useEffect } from "react";
import {
  Package,
  Shirt,
  Footprints,
  CloudRain,
  Sun,
  Plug,
  FileCheck,
  Sparkles,
  Backpack,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Category = {
  key: string;
  label: string;
  Icon: React.ElementType;
  color: string;
};

const CATEGORIES: Record<string, Category> = {
  documents:  { key: "documents",  label: "Documents",  Icon: FileCheck,  color: "#059669" },
  clothing:   { key: "clothing",   label: "Clothing",   Icon: Shirt,      color: "#D97706" },
  footwear:   { key: "footwear",   label: "Footwear",   Icon: Footprints, color: "#EA580C" },
  weather:    { key: "weather",    label: "Weather",    Icon: CloudRain,  color: "#0284C7" },
  sun:        { key: "sun",        label: "Sun care",   Icon: Sun,        color: "#CA8A04" },
  tech:       { key: "tech",       label: "Tech",       Icon: Plug,       color: "#475569" },
  toiletries: { key: "toiletries", label: "Toiletries", Icon: Sparkles,   color: "#DB2777" },
  bag:        { key: "bag",        label: "Bag",        Icon: Backpack,   color: "#E11D48" },
  default:    { key: "default",    label: "Essentials", Icon: Package,    color: "#E07A5F" },
};

function categorize(text: string): Category {
  const t = text.toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));

  if (has("passport", "visa", "ticket", "insurance", "document", " id ", "id card")) return CATEGORIES.documents;
  if (has("sunscreen", "spf", "sunglass", "sun hat", "sun ")) return CATEGORIES.sun;
  if (has("umbrella", "rain", "poncho", "raincoat", "waterproof")) return CATEGORIES.weather;
  if (has("shoe", "sneaker", "boot", "sandal", "footwear", "trainer", "loafer")) return CATEGORIES.footwear;
  if (has("shirt", "pant", "short", "jacket", "dress", "sock", "underwear", "swimwear", "swimsuit", "trouser", "sweater", "hoodie", "tee", "t-shirt", "scarf", "hat", "blazer", "cardigan")) return CATEGORIES.clothing;
  if (has("charger", "adapter", "power bank", "powerbank", "cable", "phone", "camera", "headphone", "earbud", "laptop", "tablet")) return CATEGORIES.tech;
  if (has("toothbrush", "toothpaste", "soap", "shampoo", "deodorant", "toiletr", "medication", "medicine", "first aid", "first-aid", "razor", "comb")) return CATEGORIES.toiletries;
  if (has("backpack", "daypack", "tote", " bag", "duffel")) return CATEGORIES.bag;
  return CATEGORIES.default;
}

function cleanItem(raw: string): { title: string; detail?: string } {
  const text = raw.trim();
  const separators = [" — ", " – ", " - ", ": ", " ("];
  for (const sep of separators) {
    const idx = text.indexOf(sep);
    if (idx > 0 && idx < text.length - sep.length) {
      const title = text.slice(0, idx).trim();
      let detail = text.slice(idx + sep.length).trim();
      if (sep === " (" && detail.endsWith(")")) detail = detail.slice(0, -1);
      if (title.length >= 3) return { title, detail: detail || undefined };
    }
  }
  return { title: text };
}

interface Props {
  items: string[];
  open: boolean;
  onToggle: () => void;
  className?: string;
  itemClassName?: string;
}

export function PackingCard({ items, open, onToggle, className }: Props) {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id === "section-packing" && !open) {
        onToggle();
      }
    };
    window.addEventListener("results:expand", handler as EventListener);
    return () => window.removeEventListener("results:expand", handler as EventListener);
  }, [open, onToggle]);

  // Group items by category, preserving original order within each group
  const grouped = (() => {
    const groups = new Map<string, { cat: Category; items: { title: string; detail?: string }[] }>();
    items.forEach((raw) => {
      const cat = categorize(raw);
      const parsed = cleanItem(raw);
      if (!groups.has(cat.key)) groups.set(cat.key, { cat, items: [] });
      groups.get(cat.key)!.items.push(parsed);
    });
    return Array.from(groups.values());
  })();

  return (
    <div id="section-packing" className={cn("mx-4 mt-2 mb-6", className)}>
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        {/* Header */}
        <button
          onClick={onToggle}
          className="group/header w-full flex items-center gap-3.5 p-4 text-left hover:bg-muted/30 transition-colors"
          aria-expanded={open}
        >
          <div className="relative h-11 w-11 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 text-primary flex items-center justify-center shrink-0 ring-1 ring-inset ring-primary/15">
            <Backpack className="h-[18px] w-[18px]" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[15px] font-semibold text-foreground leading-tight tracking-tight">
                Packing essentials
              </p>
              <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground tabular-nums">
                {items.length}
              </span>
            </div>
            <p className="text-[11.5px] text-muted-foreground mt-1 leading-snug">
              Curated for your destination and season
            </p>
          </div>
          <div className="h-7 w-7 rounded-full bg-muted/60 flex items-center justify-center shrink-0 group-hover/header:bg-muted transition-colors">
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-300",
                !open && "-rotate-90"
              )}
            />
          </div>
        </button>

        {/* Grouped editorial list */}
        {open && (
          <div className="border-t border-border/60 px-4 sm:px-5 py-5 space-y-6">
            {grouped.map(({ cat, items: groupItems }, gIdx) => {
              const { Icon } = cat;
              return (
                <section
                  key={cat.key}
                  className="animate-fade-in"
                  style={{ animationDelay: `${gIdx * 40}ms`, animationFillMode: "both" }}
                >
                  {/* Category header — small icon + label, no boxes */}
                  <div className="flex items-center gap-2 mb-2.5">
                    <Icon
                      className="h-3.5 w-3.5 shrink-0"
                      strokeWidth={2}
                      style={{ color: cat.color }}
                    />
                    <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-foreground/80">
                      {cat.label}
                    </h4>
                    <div className="flex-1 h-px bg-border/60" />
                    <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                      {groupItems.length}
                    </span>
                  </div>

                  {/* Items — typographic list with vertical accent bar */}
                  <ul className="space-y-2 pl-[22px] relative">
                    <span
                      className="absolute left-[6px] top-1 bottom-1 w-px"
                      style={{ backgroundColor: `${cat.color}30` }}
                      aria-hidden
                    />
                    {groupItems.map((item, i) => (
                      <li key={i} className="relative">
                        <span
                          className="absolute -left-[18px] top-[7px] h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: cat.color }}
                          aria-hidden
                        />
                        <p className="text-[13.5px] leading-snug text-foreground">
                          {item.title}
                        </p>
                        {item.detail && (
                          <p className="text-[12px] leading-snug text-muted-foreground mt-0.5">
                            {item.detail}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

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
import { useState } from "react";

type Category = {
  label: string;
  Icon: React.ElementType;
  // A single accent color per category, used consistently across the
  // icon, the chip, and the hover ring — matches the ActivityCard system.
  color: string; // hex, used inline for tinted backgrounds
};

const CATEGORIES: Record<string, Category> = {
  clothing:   { label: "Clothing",   Icon: Shirt,      color: "#D97706" },
  footwear:   { label: "Footwear",   Icon: Footprints, color: "#EA580C" },
  weather:    { label: "Weather",    Icon: CloudRain,  color: "#0284C7" },
  sun:        { label: "Sun care",   Icon: Sun,        color: "#CA8A04" },
  tech:       { label: "Tech",       Icon: Plug,       color: "#475569" },
  documents:  { label: "Documents",  Icon: FileCheck,  color: "#059669" },
  toiletries: { label: "Toiletries", Icon: Sparkles,   color: "#DB2777" },
  bag:        { label: "Bag",        Icon: Backpack,   color: "#E11D48" },
  default:    { label: "Essential",  Icon: Package,    color: "#E07A5F" },
};

function categorize(text: string): Category {
  const t = text.toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));

  if (has("passport", "visa", "ticket", "insurance", "document", " id ", "id card")) return CATEGORIES.documents;
  if (has("sunscreen", "spf", "sunglass", "sun hat", "sun ")) return CATEGORIES.sun;
  if (has("umbrella", "rain", "poncho", "raincoat", "waterproof")) return CATEGORIES.weather;
  if (has("shoe", "sneaker", "boot", "sandal", "footwear", "trainer", "loafer")) return CATEGORIES.footwear;
  if (has("shirt", "pant", "short", "jacket", "dress", "sock", "underwear", "swimwear", "swimsuit", "trouser", "sweater", "hoodie", "tee", "t-shirt", "scarf", "hat")) return CATEGORIES.clothing;
  if (has("charger", "adapter", "power bank", "powerbank", "cable", "phone", "camera", "headphone", "earbud", "laptop", "tablet")) return CATEGORIES.tech;
  if (has("toothbrush", "toothpaste", "soap", "shampoo", "deodorant", "toiletr", "medication", "medicine", "first aid", "first-aid", "razor", "comb")) return CATEGORIES.toiletries;
  if (has("backpack", "daypack", "tote", " bag", "duffel")) return CATEGORIES.bag;
  return CATEGORIES.default;
}

function splitTitleDetail(raw: string): { title: string; detail?: string } {
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

export function PackingCard({ items, open, onToggle, className, itemClassName }: Props) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

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

  const toggleItem = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const packedCount = checked.size;
  const progress = items.length > 0 ? Math.round((packedCount / items.length) * 100) : 0;

  return (
    <div id="section-packing" className={cn("mx-4 mt-2 mb-6", className)}>
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm transition-all">
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
                {packedCount}/{items.length}
              </span>
            </div>
            <p className="text-[11.5px] text-muted-foreground mt-1 leading-snug">
              Curated for your destination and season
            </p>
            {/* Progress bar */}
            <div className="mt-2 h-1 w-full max-w-[180px] rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
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

        {/* Item list */}
        {open && (
          <div className="border-t border-border/60">
            <ul className="divide-y divide-border/50">
              {items.map((item, i) => {
                const cat = categorize(item);
                const { Icon } = cat;
                const { title, detail } = splitTitleDetail(item);
                const isChecked = checked.has(i);
                return (
                  <li
                    key={i}
                    className={cn(
                      "group/item relative flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors animate-fade-in cursor-pointer",
                      itemClassName
                    )}
                    style={{ animationDelay: `${i * 25}ms`, animationFillMode: "both" }}
                    onClick={() => toggleItem(i)}
                  >
                    {/* Leading icon — color tinted, no heavy box */}
                    <div
                      className="relative h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover/item:scale-105"
                      style={{
                        backgroundColor: `${cat.color}14`,
                        boxShadow: `inset 0 0 0 1px ${cat.color}25`,
                      }}
                    >
                      <Icon className="h-[16px] w-[16px]" strokeWidth={1.9} style={{ color: cat.color }} />
                    </div>

                    {/* Body */}
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p
                          className={cn(
                            "text-[13.5px] font-medium leading-snug break-words transition-all",
                            isChecked
                              ? "text-muted-foreground line-through decoration-muted-foreground/40"
                              : "text-foreground"
                          )}
                        >
                          {title}
                        </p>
                        <span
                          className="inline-flex items-center px-1.5 py-px rounded-full text-[9.5px] font-medium uppercase tracking-[0.06em]"
                          style={{
                            backgroundColor: `${cat.color}12`,
                            color: cat.color,
                            boxShadow: `inset 0 0 0 1px ${cat.color}25`,
                          }}
                        >
                          {cat.label}
                        </span>
                      </div>
                      {detail && (
                        <p className={cn(
                          "text-[12px] leading-snug mt-1 break-words transition-colors",
                          isChecked ? "text-muted-foreground/60" : "text-muted-foreground"
                        )}>
                          {detail}
                        </p>
                      )}
                    </div>

                    {/* Check toggle */}
                    <div
                      className={cn(
                        "h-5 w-5 mt-1 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                        isChecked
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/30 group-hover/item:border-foreground/50"
                      )}
                      aria-hidden
                    >
                      {isChecked && (
                        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-primary-foreground">
                          <path d="M2 6.5L5 9.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

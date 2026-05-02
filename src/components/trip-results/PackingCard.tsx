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
  label: string;
  Icon: React.ElementType;
  // Tailwind classes — accent ring + icon-tile bg + icon color. All routed
  // through semantic-friendly Tailwind colors so we stay inside the design
  // system (no raw hex).
  tile: string;
  icon: string;
};

const CATEGORIES: Record<string, Category> = {
  clothing:   { label: "Clothing",   Icon: Shirt,      tile: "bg-amber-100",   icon: "text-amber-700" },
  footwear:   { label: "Footwear",   Icon: Footprints, tile: "bg-orange-100",  icon: "text-orange-700" },
  weather:    { label: "Weather",    Icon: CloudRain,  tile: "bg-sky-100",     icon: "text-sky-700" },
  sun:        { label: "Sun care",   Icon: Sun,        tile: "bg-yellow-100",  icon: "text-yellow-700" },
  tech:       { label: "Tech",       Icon: Plug,       tile: "bg-slate-100",   icon: "text-slate-700" },
  documents:  { label: "Documents",  Icon: FileCheck,  tile: "bg-emerald-100", icon: "text-emerald-700" },
  toiletries: { label: "Toiletries", Icon: Sparkles,   tile: "bg-pink-100",    icon: "text-pink-700" },
  bag:        { label: "Bag",        Icon: Backpack,   tile: "bg-rose-100",    icon: "text-rose-700" },
  default:    { label: "Essential",  Icon: Package,    tile: "bg-primary/10",  icon: "text-primary" },
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

interface Props {
  items: string[];
  open: boolean;
  onToggle: () => void;
  className?: string;
  itemClassName?: string;
}

export function PackingCard({ items, open, onToggle, className, itemClassName }: Props) {
  // Allow the timeline rail to remote-open this section.
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

  return (
    <div id="section-packing" className={cn("mx-4 mt-2 mb-6", className)}>
      <div className="rounded-2xl border border-border bg-card overflow-hidden bg-gradient-to-b from-primary/[0.04] to-transparent">
        {/* Header */}
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent/40 transition-colors"
          aria-expanded={open}
        >
          <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Backpack className="h-4 w-4" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">
              Packing essentials
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 uppercase tracking-wide">
              Curated for your destination
            </p>
          </div>
          <span className="text-[11px] font-mono px-2 py-1 rounded-full bg-muted text-muted-foreground">
            {items.length} items
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-300",
              !open && "-rotate-90"
            )}
          />
        </button>

        {/* Grid of categorized chips */}
        {open && (
          <div className="px-4 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {items.map((item, i) => {
              const cat = categorize(item);
              const { Icon } = cat;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-xl border border-border/60 bg-background/60 hover:border-border hover:bg-background transition-all animate-fade-in",
                    itemClassName
                  )}
                  style={{ animationDelay: `${i * 30}ms`, animationFillMode: "both" }}
                >
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", cat.tile)}>
                    <Icon className={cn("h-4 w-4", cat.icon)} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-[13px] leading-snug text-foreground line-clamp-2">
                      {item}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                      {cat.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

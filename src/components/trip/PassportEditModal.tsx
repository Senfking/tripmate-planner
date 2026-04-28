import { useEffect, useMemo, useState } from "react";
import { Check, Search, Star, X } from "lucide-react";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { COUNTRIES, countryName } from "@/lib/countries";
import { useUpdatePassport, type TravellerPassport } from "@/hooks/useTripTravellerPassports";

interface PassportEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  userId: string;
  travellerName: string;
  existing: TravellerPassport[];
}

export function PassportEditModal({
  open,
  onOpenChange,
  tripId,
  userId,
  travellerName,
  existing,
}: PassportEditModalProps) {
  const isMobile = useIsMobile();
  const [codes, setCodes] = useState<string[]>([]);
  const [primary, setPrimary] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const update = useUpdatePassport();

  useEffect(() => {
    if (open) {
      const initial = existing.map((r) => r.nationality_iso.toUpperCase());
      setCodes(initial);
      const existingPrimary =
        existing.find((r) => r.is_primary)?.nationality_iso.toUpperCase() ?? initial[0] ?? null;
      setPrimary(existingPrimary);
      setSearch("");
    }
  }, [open, existing]);

  const toggle = (code: string) => {
    setCodes((prev) => {
      if (prev.includes(code)) {
        const next = prev.filter((c) => c !== code);
        if (primary === code) setPrimary(next[0] ?? null);
        return next;
      }
      const next = [...prev, code];
      if (!primary) setPrimary(code);
      return next;
    });
  };

  const remove = (code: string) => {
    setCodes((prev) => {
      const next = prev.filter((c) => c !== code);
      if (primary === code) setPrimary(next[0] ?? null);
      return next;
    });
  };

  const handleSave = async () => {
    await update.mutateAsync({
      tripId,
      userId,
      nationalityCodes: codes,
      primaryCode: primary,
      existing,
    });
    onOpenChange(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [search]);

  const body = (
    <div className="flex flex-col gap-3 px-4 pb-4">
      {/* Selected chips */}
      {codes.length > 0 && (
        <div className="space-y-1.5">
          {codes.map((code) => {
            const isPrimary = primary === code;
            return (
              <div
                key={code}
                className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-2.5 py-2"
              >
                <CountryFlag code={code} size={24} className="shrink-0" />
                <span className="font-mono text-[11px] font-semibold text-foreground w-7">
                  {code}
                </span>
                <span className="text-sm text-foreground flex-1 truncate">{countryName(code)}</span>
                <button
                  type="button"
                  onClick={() => setPrimary(code)}
                  className={cn(
                    "flex items-center gap-1 text-[11px] rounded-full px-2 py-1 transition shrink-0",
                    isPrimary
                      ? "bg-[#0D9488] text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                  aria-label={isPrimary ? "Primary nationality" : "Set as primary"}
                >
                  <Star className={cn("h-3 w-3", isPrimary && "fill-current")} />
                  {isPrimary ? "Primary" : "Set primary"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(code)}
                  className="rounded-full p-1 hover:bg-muted shrink-0"
                  aria-label={`Remove ${countryName(code)}`}
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Inline searchable list (no popover, no overlay) */}
      <div className="rounded-xl border border-gray-100 overflow-hidden">
        <div className="relative border-b border-gray-100">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search country…"
            className="h-10 pl-9 border-0 rounded-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-64 overflow-y-auto overscroll-contain">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
              No country found.
            </p>
          ) : (
            filtered.map((c) => {
              const selected = codes.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => toggle(c.code)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                    selected ? "bg-[#0D9488]/[0.06]" : "hover:bg-muted/60",
                  )}
                >
                  <CountryFlag code={c.code} size={20} className="shrink-0" />
                  <span className="text-sm text-foreground flex-1 truncate">{c.name}</span>
                  <span className="font-mono text-[10.5px] text-muted-foreground">{c.code}</span>
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0 text-[#0D9488]",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                </button>
              );
            })
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Visible to other trip members on this trip only.
      </p>

      <div className="flex gap-2 pt-1">
        <Button
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={update.isPending}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={update.isPending}
          className="flex-1 bg-[#0D9488] hover:bg-[#0D9488]/90 text-white"
        >
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-base">Nationalities — {travellerName}</DrawerTitle>
          </DrawerHeader>
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base">Nationalities — {travellerName}</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

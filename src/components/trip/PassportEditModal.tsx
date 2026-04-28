import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { COUNTRIES, countryName } from "@/lib/countries";
import { useUpdatePassport, type TravellerPassport } from "@/hooks/useTripTravellerPassports";

interface PassportEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  userId: string;
  travellerName: string;
  existing: TravellerPassport[]; // existing rows for this user
}

export function PassportEditModal({
  open,
  onOpenChange,
  tripId,
  userId,
  travellerName,
  existing,
}: PassportEditModalProps) {
  const [codes, setCodes] = useState<string[]>([]);
  const [primary, setPrimary] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const update = useUpdatePassport();

  useEffect(() => {
    if (open) {
      const initial = existing.map((r) => r.nationality_iso.toUpperCase());
      setCodes(initial);
      const existingPrimary = existing.find((r) => r.is_primary)?.nationality_iso.toUpperCase() ?? initial[0] ?? null;
      setPrimary(existingPrimary);
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
    setCodes((prev) => prev.filter((c) => c !== code));
    if (primary === code) {
      setPrimary((p) => {
        const remaining = codes.filter((c) => c !== code);
        return remaining[0] ?? null;
      });
    }
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

  const sortedCountries = useMemo(() => COUNTRIES, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Passport info — {travellerName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={pickerOpen}
                className="w-full justify-between h-10 font-normal"
              >
                <span className={cn("truncate", codes.length === 0 && "text-muted-foreground")}>
                  {codes.length === 0 ? "Select country…" : `${codes.length} selected`}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="p-0 w-[--radix-popover-trigger-width] max-w-[calc(100vw-2rem)]"
              align="start"
            >
              <Command>
                <CommandInput placeholder="Search country…" />
                <CommandList className="max-h-64">
                  <CommandEmpty>No country found.</CommandEmpty>
                  <CommandGroup>
                    {sortedCountries.map((c) => {
                      const selected = codes.includes(c.code);
                      return (
                        <CommandItem
                          key={c.code}
                          value={`${c.name} ${c.code}`}
                          onSelect={() => toggle(c.code)}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
                          <span className="flex-1 truncate">{c.name} ({c.code})</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {codes.length > 0 && (
            <div className="space-y-1.5">
              {codes.map((code) => {
                const isPrimary = primary === code;
                return (
                  <div
                    key={code}
                    className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2"
                  >
                    <span className="font-mono text-xs font-semibold text-foreground w-7">{code}</span>
                    <span className="text-sm text-foreground flex-1 truncate">{countryName(code)}</span>
                    <button
                      type="button"
                      onClick={() => setPrimary(code)}
                      className={cn(
                        "flex items-center gap-1 text-[11px] rounded-full px-2 py-1 transition",
                        isPrimary
                          ? "bg-[#0D9488] text-white"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                      aria-label={isPrimary ? "Primary passport" : "Set as primary"}
                    >
                      <Star className={cn("h-3 w-3", isPrimary && "fill-current")} />
                      {isPrimary ? "Primary" : "Set primary"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(code)}
                      className="rounded-full p-1 hover:bg-muted"
                      aria-label={`Remove ${countryName(code)}`}
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Visible to other trip members on this trip only.
          </p>
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={update.isPending}
            className="bg-[#0D9488] hover:bg-[#0D9488]/90 text-white"
          >
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

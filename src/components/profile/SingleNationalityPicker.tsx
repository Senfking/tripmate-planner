import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

interface SingleNationalityPickerProps {
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  /** ISO code that's already taken by the other slot (excluded from list). */
  excludeCode?: string | null;
  placeholder?: string;
  /** Show a clear ("✕") button when a value is selected. */
  clearable?: boolean;
}

/**
 * Single-country combobox used for the scalar nationality slots
 * (`profiles.nationality_iso`, `profiles.secondary_nationality_iso`) introduced
 * by PR #233. Distinct from the legacy multi-select `NationalitiesPicker` —
 * the new shape is exactly two slots, not an array.
 */
export function SingleNationalityPicker({
  value,
  onChange,
  disabled,
  excludeCode,
  placeholder = "Select country…",
  clearable = false,
}: SingleNationalityPickerProps) {
  const [open, setOpen] = useState(false);

  const selectedName = value ? countryName(value) : null;

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="flex-1 justify-between h-10 font-normal"
          >
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value ? `${selectedName} (${value})` : placeholder}
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
                {COUNTRIES.filter((c) => c.code !== excludeCode).map((c) => {
                  const selected = value === c.code;
                  return (
                    <CommandItem
                      key={c.code}
                      value={`${c.name} ${c.code}`}
                      onSelect={() => {
                        onChange(c.code);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{c.code}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {clearable && value && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onChange(null)}
          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Clear selection"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

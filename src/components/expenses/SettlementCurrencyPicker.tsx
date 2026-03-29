import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ChevronDown } from "lucide-react";

const CURRENCIES = [
  { code: "EUR", symbol: "€", flag: "🇪🇺" },
  { code: "USD", symbol: "$", flag: "🇺🇸" },
  { code: "GBP", symbol: "£", flag: "🇬🇧" },
  { code: "CHF", symbol: "Fr", flag: "🇨🇭" },
  { code: "THB", symbol: "฿", flag: "🇹🇭" },
  { code: "JPY", symbol: "¥", flag: "🇯🇵" },
  { code: "AUD", symbol: "A$", flag: "🇦🇺" },
  { code: "SGD", symbol: "S$", flag: "🇸🇬" },
];

interface Props {
  value: string;
  onChange: (currency: string) => void;
  disabled?: boolean;
}

export function SettlementCurrencyPicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  const selected = CURRENCIES.find((c) => c.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-8 gap-1.5 text-xs font-medium"
        >
          <span>{selected?.flag || "💱"}</span>
          Settle in: {value}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <div className="space-y-1">
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              onClick={() => { onChange(c.code); setOpen(false); }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors ${
                value === c.code ? "bg-accent font-medium" : ""
              }`}
            >
              <span>{c.flag}</span>
              <span>{c.code}</span>
              <span className="text-muted-foreground text-xs ml-auto">{c.symbol}</span>
            </button>
          ))}
          <div className="border-t pt-2 mt-1">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const code = custom.trim().toUpperCase();
                if (code.length === 3) {
                  onChange(code);
                  setCustom("");
                  setOpen(false);
                }
              }}
              className="flex gap-1"
            >
              <Input
                placeholder="Other (e.g. BRL)"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="h-8 text-xs"
                maxLength={3}
              />
              <Button type="submit" size="sm" className="h-8 text-xs" disabled={custom.trim().length !== 3}>
                Set
              </Button>
            </form>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

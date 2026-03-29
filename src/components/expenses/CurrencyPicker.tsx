import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ChevronDown, Search } from "lucide-react";

interface CurrencyDef {
  code: string;
  name: string;
  flag: string;
}

const GROUPS: { label: string; currencies: CurrencyDef[] }[] = [
  {
    label: "Europe",
    currencies: [
      { code: "EUR", name: "Euro", flag: "🇪🇺" },
      { code: "GBP", name: "British Pound", flag: "🇬🇧" },
      { code: "CHF", name: "Swiss Franc", flag: "🇨🇭" },
      { code: "SEK", name: "Swedish Krona", flag: "🇸🇪" },
      { code: "NOK", name: "Norwegian Krone", flag: "🇳🇴" },
      { code: "DKK", name: "Danish Krone", flag: "🇩🇰" },
      { code: "PLN", name: "Polish Złoty", flag: "🇵🇱" },
      { code: "CZK", name: "Czech Koruna", flag: "🇨🇿" },
      { code: "HUF", name: "Hungarian Forint", flag: "🇭🇺" },
      { code: "RON", name: "Romanian Leu", flag: "🇷🇴" },
    ],
  },
  {
    label: "Americas",
    currencies: [
      { code: "USD", name: "US Dollar", flag: "🇺🇸" },
      { code: "CAD", name: "Canadian Dollar", flag: "🇨🇦" },
      { code: "MXN", name: "Mexican Peso", flag: "🇲🇽" },
      { code: "BRL", name: "Brazilian Real", flag: "🇧🇷" },
      { code: "ARS", name: "Argentine Peso", flag: "🇦🇷" },
      { code: "CLP", name: "Chilean Peso", flag: "🇨🇱" },
      { code: "COP", name: "Colombian Peso", flag: "🇨🇴" },
    ],
  },
  {
    label: "Asia Pacific",
    currencies: [
      { code: "THB", name: "Thai Baht", flag: "🇹🇭" },
      { code: "JPY", name: "Japanese Yen", flag: "🇯🇵" },
      { code: "CNY", name: "Chinese Yuan", flag: "🇨🇳" },
      { code: "HKD", name: "Hong Kong Dollar", flag: "🇭🇰" },
      { code: "SGD", name: "Singapore Dollar", flag: "🇸🇬" },
      { code: "MYR", name: "Malaysian Ringgit", flag: "🇲🇾" },
      { code: "IDR", name: "Indonesian Rupiah", flag: "🇮🇩" },
      { code: "VND", name: "Vietnamese Đồng", flag: "🇻🇳" },
      { code: "PHP", name: "Philippine Peso", flag: "🇵🇭" },
      { code: "KRW", name: "South Korean Won", flag: "🇰🇷" },
      { code: "AUD", name: "Australian Dollar", flag: "🇦🇺" },
      { code: "NZD", name: "New Zealand Dollar", flag: "🇳🇿" },
      { code: "INR", name: "Indian Rupee", flag: "🇮🇳" },
      { code: "PKR", name: "Pakistani Rupee", flag: "🇵🇰" },
      { code: "BDT", name: "Bangladeshi Taka", flag: "🇧🇩" },
      { code: "LKR", name: "Sri Lankan Rupee", flag: "🇱🇰" },
    ],
  },
  {
    label: "Middle East & Africa",
    currencies: [
      { code: "AED", name: "UAE Dirham", flag: "🇦🇪" },
      { code: "SAR", name: "Saudi Riyal", flag: "🇸🇦" },
      { code: "QAR", name: "Qatari Riyal", flag: "🇶🇦" },
      { code: "KWD", name: "Kuwaiti Dinar", flag: "🇰🇼" },
      { code: "ZAR", name: "South African Rand", flag: "🇿🇦" },
      { code: "EGP", name: "Egyptian Pound", flag: "🇪🇬" },
      { code: "MAD", name: "Moroccan Dirham", flag: "🇲🇦" },
      { code: "NGN", name: "Nigerian Naira", flag: "🇳🇬" },
      { code: "KES", name: "Kenyan Shilling", flag: "🇰🇪" },
    ],
  },
];

const ALL_PREDEFINED = GROUPS.flatMap((g) => g.currencies);
const PREDEFINED_CODES = new Set(ALL_PREDEFINED.map((c) => c.code));

interface Props {
  value: string;
  onChange: (currency: string) => void;
  disabled?: boolean;
  /** Extra currency codes from cache to show under "Other" when searched */
  cachedCurrencyCodes?: string[];
  /** Codes to show in a "Suggested" section at the top (settlement + recently used) */
  suggestedCodes?: string[];
  /** Visual variant */
  variant?: "settlement" | "form";
}

export function CurrencyPicker({ value, onChange, disabled, cachedCurrencyCodes = [], suggestedCodes = [], variant = "form" }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedDef = ALL_PREDEFINED.find((c) => c.code === value);
  const query = search.trim().toUpperCase();

  const filteredGroups = useMemo(() => {
    if (!query) return GROUPS;
    return GROUPS.map((g) => ({
      ...g,
      currencies: g.currencies.filter(
        (c) => c.code.includes(query) || c.name.toUpperCase().includes(query)
      ),
    })).filter((g) => g.currencies.length > 0);
  }, [query]);

  const otherCurrencies = useMemo(() => {
    if (!query) return [];
    return cachedCurrencyCodes
      .filter((code) => !PREDEFINED_CODES.has(code) && code.includes(query))
      .sort();
  }, [query, cachedCurrencyCodes]);

  const handleSelect = (code: string) => {
    onChange(code);
    setSearch("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "settlement" ? (
          <Button variant="outline" size="sm" disabled={disabled} className="h-8 gap-1.5 text-xs font-medium">
            <span>{selectedDef?.flag || "💱"}</span>
            Settle in: {value}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        ) : (
          <Button variant="outline" disabled={disabled} className="h-10 w-full justify-between font-normal">
            <span className="flex items-center gap-1.5">
              <span>{selectedDef?.flag || "💱"}</span>
              {value}
            </span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search currency..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>

        <div className="max-h-[300px] overflow-y-auto overscroll-contain">
          <div className="p-1.5 space-y-1">
            {filteredGroups.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                  {group.label}
                </p>
                {group.currencies.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => handleSelect(c.code)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors ${
                      value === c.code ? "bg-accent font-medium" : ""
                    }`}
                  >
                    <span>{c.flag}</span>
                    <span>{c.code}</span>
                    <span className="text-muted-foreground text-xs ml-auto truncate max-w-[100px]">{c.name}</span>
                  </button>
                ))}
              </div>
            ))}

            {otherCurrencies.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                  Other currencies
                </p>
                {otherCurrencies.map((code) => (
                  <button
                    key={code}
                    onClick={() => handleSelect(code)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors ${
                      value === code ? "bg-accent font-medium" : ""
                    }`}
                  >
                    <span>💱</span>
                    <span>{code}</span>
                  </button>
                ))}
              </div>
            )}

            {filteredGroups.length === 0 && otherCurrencies.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No currencies found
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

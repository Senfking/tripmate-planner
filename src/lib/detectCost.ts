/**
 * Detect currency amounts in text using regex patterns.
 * Patterns: €25, $40, £30, 150 EUR, 25 USD, 100 AED, 40.50€, etc.
 */

const SYMBOL_MAP: Record<string, string> = {
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
  "₩": "KRW",
  "₽": "RUB",
  "₺": "TRY",
  "R$": "BRL",
  "kr": "SEK", // also NOK/DKK but default to SEK
  "zł": "PLN",
  "Kč": "CZK",
  "Fr": "CHF",
};

const CURRENCY_CODES = new Set([
  "USD", "EUR", "GBP", "JPY", "CNY", "INR", "AUD", "CAD", "CHF", "SEK",
  "NOK", "DKK", "NZD", "SGD", "HKD", "KRW", "BRL", "MXN", "ZAR", "TRY",
  "RUB", "PLN", "CZK", "THB", "MYR", "PHP", "IDR", "VND", "AED", "SAR",
  "QAR", "BHD", "OMR", "KWD", "EGP", "MAD", "HRK", "HUF", "RON", "BGN",
  "ISK", "ILS", "TWD", "CLP", "COP", "PEN", "ARS", "UYU", "CRC",
]);

export interface DetectedCost {
  amount: number;
  currency: string;
  raw: string;
}

export function detectCost(text: string): DetectedCost | null {
  if (!text) return null;

  // Pattern 1: Symbol before number — €25, $40.50, £30
  const symbolBefore = /([€$£¥₹₩₽₺]|R\$)\s*(\d[\d,]*(?:\.\d{1,2})?)/;
  const m1 = text.match(symbolBefore);
  if (m1) {
    const sym = m1[1];
    const amount = parseFloat(m1[2].replace(/,/g, ""));
    if (amount > 0) {
      return { amount, currency: SYMBOL_MAP[sym] || "USD", raw: m1[0] };
    }
  }

  // Pattern 2: Number followed by symbol — 40.50€, 30£
  const symbolAfter = /(\d[\d,]*(?:\.\d{1,2})?)\s*([€$£¥₹₩₽₺])/;
  const m2 = text.match(symbolAfter);
  if (m2) {
    const amount = parseFloat(m2[1].replace(/,/g, ""));
    const sym = m2[2];
    if (amount > 0) {
      return { amount, currency: SYMBOL_MAP[sym] || "USD", raw: m2[0] };
    }
  }

  // Pattern 3: Number followed by currency code — 150 EUR, 25USD
  const codeAfter = /(\d[\d,]*(?:\.\d{1,2})?)\s*([A-Z]{3})\b/;
  const m3 = text.match(codeAfter);
  if (m3 && CURRENCY_CODES.has(m3[2])) {
    const amount = parseFloat(m3[1].replace(/,/g, ""));
    if (amount > 0) {
      return { amount, currency: m3[2], raw: m3[0] };
    }
  }

  // Pattern 4: Currency code before number — EUR 150, USD25
  const codeBefore = /\b([A-Z]{3})\s*(\d[\d,]*(?:\.\d{1,2})?)/;
  const m4 = text.match(codeBefore);
  if (m4 && CURRENCY_CODES.has(m4[1])) {
    const amount = parseFloat(m4[2].replace(/,/g, ""));
    if (amount > 0) {
      return { amount, currency: m4[1], raw: m4[0] };
    }
  }

  // Pattern 5: kr/zł/Kč/Fr before or after number
  const miscSymbol = /(?:(kr|zł|Kč|Fr)\s*(\d[\d,]*(?:\.\d{1,2})?))|(?:(\d[\d,]*(?:\.\d{1,2})?)\s*(kr|zł|Kč|Fr))/i;
  const m5 = text.match(miscSymbol);
  if (m5) {
    const sym = (m5[1] || m5[4])?.toLowerCase();
    const numStr = m5[2] || m5[3];
    const amount = parseFloat(numStr.replace(/,/g, ""));
    if (amount > 0 && sym) {
      const symMap: Record<string, string> = { kr: "SEK", "zł": "PLN", "kč": "CZK", fr: "CHF" };
      return { amount, currency: symMap[sym] || "USD", raw: m5[0] };
    }
  }

  return null;
}

/** Generate a stable key for an item's title+notes to track dismissals */
export function costPromptKey(itemId: string, title: string, notes: string | null): string {
  return `${itemId}:${title}:${notes || ""}`;
}

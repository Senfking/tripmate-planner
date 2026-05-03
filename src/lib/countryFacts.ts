// Static lookup keyed by ISO 3166-1 alpha-2.
// Keep tight: currency code, primary language(s), IANA timezone (representative).
// If a country has multiple zones, pick the most common for tourism.

export type CountryFacts = {
  currency: string;
  language: string;
  timezone: string;
};

const FACTS: Record<string, CountryFacts> = {
  AE: { currency: "AED", language: "Arabic", timezone: "Asia/Dubai" },
  CA: { currency: "CAD", language: "English / French", timezone: "America/Toronto" },
  CH: { currency: "CHF", language: "German / French / Italian", timezone: "Europe/Zurich" },
  CN: { currency: "CNY", language: "Mandarin", timezone: "Asia/Shanghai" },
  CO: { currency: "COP", language: "Spanish", timezone: "America/Bogota" },
  CR: { currency: "CRC", language: "Spanish", timezone: "America/Costa_Rica" },
  CZ: { currency: "CZK", language: "Czech", timezone: "Europe/Prague" },
  DE: { currency: "EUR", language: "German", timezone: "Europe/Berlin" },
  EG: { currency: "EGP", language: "Arabic", timezone: "Africa/Cairo" },
  ES: { currency: "EUR", language: "Spanish", timezone: "Europe/Madrid" },
  FJ: { currency: "FJD", language: "English / Fijian", timezone: "Pacific/Fiji" },
  FR: { currency: "EUR", language: "French", timezone: "Europe/Paris" },
  GB: { currency: "GBP", language: "English", timezone: "Europe/London" },
  GR: { currency: "EUR", language: "Greek", timezone: "Europe/Athens" },
  HR: { currency: "EUR", language: "Croatian", timezone: "Europe/Zagreb" },
  ID: { currency: "IDR", language: "Indonesian", timezone: "Asia/Jakarta" },
  IN: { currency: "INR", language: "Hindi / English", timezone: "Asia/Kolkata" },
  IS: { currency: "ISK", language: "Icelandic", timezone: "Atlantic/Reykjavik" },
  IT: { currency: "EUR", language: "Italian", timezone: "Europe/Rome" },
  JO: { currency: "JOD", language: "Arabic", timezone: "Asia/Amman" },
  JP: { currency: "JPY", language: "Japanese", timezone: "Asia/Tokyo" },
  MA: { currency: "MAD", language: "Arabic / French", timezone: "Africa/Casablanca" },
  MV: { currency: "MVR", language: "Dhivehi", timezone: "Indian/Maldives" },
  MX: { currency: "MXN", language: "Spanish", timezone: "America/Mexico_City" },
  NL: { currency: "EUR", language: "Dutch", timezone: "Europe/Amsterdam" },
  NP: { currency: "NPR", language: "Nepali", timezone: "Asia/Kathmandu" },
  PE: { currency: "PEN", language: "Spanish", timezone: "America/Lima" },
  PF: { currency: "XPF", language: "French", timezone: "Pacific/Tahiti" },
  PT: { currency: "EUR", language: "Portuguese", timezone: "Europe/Lisbon" },
  SC: { currency: "SCR", language: "English / French / Creole", timezone: "Indian/Mahe" },
  SG: { currency: "SGD", language: "English", timezone: "Asia/Singapore" },
  TH: { currency: "THB", language: "Thai", timezone: "Asia/Bangkok" },
  TR: { currency: "TRY", language: "Turkish", timezone: "Europe/Istanbul" },
  TZ: { currency: "TZS", language: "Swahili / English", timezone: "Africa/Dar_es_Salaam" },
  US: { currency: "USD", language: "English", timezone: "America/New_York" },
  VN: { currency: "VND", language: "Vietnamese", timezone: "Asia/Ho_Chi_Minh" },
  ZA: { currency: "ZAR", language: "English / Afrikaans", timezone: "Africa/Johannesburg" },
};

export function getCountryFacts(iso: string | null | undefined): CountryFacts | null {
  if (!iso) return null;
  return FACTS[iso.toUpperCase()] ?? null;
}

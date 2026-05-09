// Convert IANA timezone (e.g. "America/Mexico_City") to a friendly label
// like "GMT-6 · Central Time". Falls back gracefully if Intl can't resolve it.

const FRIENDLY_NAME: Record<string, string> = {
  "America/New_York": "Eastern Time",
  "America/Chicago": "Central Time",
  "America/Denver": "Mountain Time",
  "America/Los_Angeles": "Pacific Time",
  "America/Mexico_City": "Central Time",
  "America/Toronto": "Eastern Time",
  "America/Bogota": "Colombia Time",
  "America/Lima": "Peru Time",
  "America/Costa_Rica": "Central Time",
  "Europe/London": "GMT / BST",
  "Europe/Paris": "Central European Time",
  "Europe/Berlin": "Central European Time",
  "Europe/Madrid": "Central European Time",
  "Europe/Lisbon": "Western European Time",
  "Europe/Rome": "Central European Time",
  "Europe/Amsterdam": "Central European Time",
  "Europe/Athens": "Eastern European Time",
  "Europe/Istanbul": "Türkiye Time",
  "Europe/Prague": "Central European Time",
  "Europe/Zagreb": "Central European Time",
  "Europe/Zurich": "Central European Time",
  "Asia/Dubai": "Gulf Standard Time",
  "Asia/Tokyo": "Japan Standard Time",
  "Asia/Bangkok": "Indochina Time",
  "Asia/Shanghai": "China Standard Time",
  "Asia/Singapore": "Singapore Time",
  "Asia/Jakarta": "Western Indonesia Time",
  "Asia/Kolkata": "India Standard Time",
  "Asia/Kathmandu": "Nepal Time",
  "Asia/Amman": "Jordan Time",
  "Asia/Ho_Chi_Minh": "Indochina Time",
  "Africa/Cairo": "Eastern European Time",
  "Africa/Casablanca": "Western European Time",
  "Africa/Dar_es_Salaam": "East Africa Time",
  "Africa/Johannesburg": "South Africa Time",
  "Indian/Maldives": "Maldives Time",
  "Indian/Mahe": "Seychelles Time",
  "Pacific/Fiji": "Fiji Time",
  "Pacific/Tahiti": "Tahiti Time",
  "Atlantic/Reykjavik": "GMT",
};

export function formatTimezone(iana: string | null | undefined): string | null {
  if (!iana) return null;
  let offsetLabel = "";
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: iana,
      timeZoneName: "shortOffset",
    });
    const parts = fmt.formatToParts(new Date());
    const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    // Normalize "GMT−6" or "GMT-06:00" → "GMT-6"
    const m = tz.match(/GMT([+\-−])(\d{1,2})(?::?(\d{2}))?/);
    if (m) {
      const sign = m[1] === "−" ? "-" : m[1];
      const hours = parseInt(m[2], 10);
      const mins = m[3] ? parseInt(m[3], 10) : 0;
      offsetLabel = mins
        ? `GMT${sign}${hours}:${m[3]}`
        : `GMT${sign}${hours}`;
    } else if (tz === "GMT" || tz === "UTC") {
      offsetLabel = "GMT";
    } else {
      offsetLabel = tz;
    }
  } catch {
    // Intl failed — fall through
  }
  const friendly = FRIENDLY_NAME[iana];
  if (offsetLabel && friendly) return `${offsetLabel} · ${friendly}`;
  if (friendly) return friendly;
  if (offsetLabel) return offsetLabel;
  // Last-resort: humanize the IANA string
  return iana.split("/").pop()?.replace(/_/g, " ") ?? iana;
}

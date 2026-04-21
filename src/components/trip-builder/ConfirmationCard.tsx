import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { differenceInDays } from "date-fns";
import type { PremiumInputData } from "./PremiumTripInput";

type Props = {
  data: PremiumInputData;
  onConfirm: () => void;
  onEdit: () => void;
};

// Map common deal-breaker phrasings to clean third-person summaries.
// The raw input is free-text, so we pattern-match first and fall back to a
// conservative "no X" if the phrase is short enough to trust verbatim.
function normalizeDealBreaker(raw: string): string | null {
  const text = raw.toLowerCase().trim();
  if (!text) return null;

  // Dietary / allergy — these often land in deal-breakers too.
  if (/\bdairy\b|\blactose\b/.test(text)) return "dairy-free";
  if (/\bgluten\b/.test(text)) return "gluten-free";
  if (/\bnut(s)?\b/.test(text)) return "nut-free";
  if (/\bshellfish\b/.test(text)) return "no shellfish";
  if (/\bseafood\b/.test(text)) return "no seafood";
  if (/\bvegan\b/.test(text)) return "vegan-friendly";
  if (/vegetarian/.test(text)) return "vegetarian-friendly";
  if (/halal/.test(text)) return "halal-friendly";

  // Tourist-y — handles "touristy", "tourist traps", "not so many tourist activities".
  if (/touris/.test(text)) return "off the tourist track";

  // Crowds
  if (/crowd/.test(text)) return "away from the crowds";

  // Early mornings
  if (/early/.test(text) && /(morning|start|wake)/.test(text)) return "no early mornings";

  // Chains
  if (/chain/.test(text)) return "no chain restaurants";

  // Loud / noise
  if (/(loud|noisy|noise)/.test(text)) return "somewhere calmer";

  // Advance-booking pain
  if (/(reservation|booking)/.test(text) || /(weeks|months)\s+ahead/.test(text)) {
    return "nothing that needs booking far ahead";
  }

  // Alcohol
  if (/\balcohol\b|\bdrink(ing)?\b/.test(text)) return "alcohol-free";

  // Driving
  if (/driv/.test(text)) return "no driving";

  // Strenuous
  if (/(hik|trek|strenuous|climb|steep)/.test(text)) return "nothing too strenuous";

  // Museums
  if (/museum/.test(text)) return "light on museums";

  // Fallback: only trust phrases that are short and already clean.
  // Reject anything with hedge words that would read awkwardly after "no".
  if (text.length > 24) return null;
  if (/\b(not|so|very|many|much|quite|kinda|sort)\b/.test(text)) return null;

  const core = text
    .replace(/^(no\s+|not\s+|without\s+|nothing\s+|avoid\s+|don'?t\s+want\s+)/, "")
    .trim();
  if (!core) return null;
  return `no ${core}`;
}

// Stable non-negative int from a string — used to pick openers/closers
// deterministically so the same input always renders the same summary.
function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function buildCorePhrase(
  destination: string,
  duration: number | null,
  party: PremiumInputData["travelParty"],
): string {
  const dur = duration ? `${duration}-day ` : "";
  switch (party) {
    case "solo":
      return `${dur}solo trip to ${destination}`;
    case "couple":
      return `${dur}couple's getaway to ${destination}`;
    case "friends":
      return `${dur}friends' trip to ${destination}`;
    case "family":
      return `${dur}family trip to ${destination}`;
    case "group":
      return `${dur}group trip to ${destination}`;
    default:
      return `${dur}trip to ${destination}`;
  }
}

function buildVibeClause(vibes: string[]): string {
  if (vibes.length === 0) return "";
  const top = vibes.slice(0, 2).map((v) => v.toLowerCase());
  if (top.length === 1) return `, with ${top[0]} at the center`;
  return `, leaning into ${top[0]} and ${top[1]}`;
}

function pickOpener(seed: number): string {
  // Weighted toward a bare start so "Got it" isn't the default.
  const openers = ["Got it — ", "Alright — ", "Perfect — ", "Lovely — ", "", "", ""];
  return openers[seed % openers.length];
}

// Pick "a" vs "an" based on the phonetic start of the body. The only realistic
// vowel-sound starts here are durations like "8-day" (eight), "11-day" (eleven),
// "18-day" (eighteen). Everything else starts with a consonant sound.
function articleFor(body: string): string {
  const m = body.match(/^(\d+)-day\b/);
  if (!m) return "a";
  const n = m[1];
  if (n === "8" || n === "11" || n === "18") return "an";
  if (/^8[0-9]$/.test(n)) return "an";
  return "a";
}

function pickCloser(vibes: string[], party: PremiumInputData["travelParty"], seed: number): string {
  const low = vibes.map((v) => v.toLowerCase()).join(" ");
  if (/nightlife|party/.test(low)) return "Let's make it fun.";
  if (/relax|wellness|spa/.test(low)) return "Sounds restful.";
  if (/adventure|outdoor|nature/.test(low)) return "Let's get after it.";
  if (party === "couple") return "Sounds lovely.";
  const fallback = ["Ready to plan?", "Let's put it together.", "Sounds good?"];
  return fallback[seed % fallback.length];
}

function buildSummary(data: PremiumInputData): string {
  const duration = data.dateRange?.from && data.dateRange?.to
    ? differenceInDays(data.dateRange.to, data.dateRange.from) + 1
    : null;

  const core = buildCorePhrase(data.destination, duration, data.travelParty);
  const vibeClause = buildVibeClause(data.vibes);

  let avoidClause = "";
  if (data.dealBreakers) {
    const first = data.dealBreakers.split(/[,;.\n]/)[0]?.trim() ?? "";
    const normalized = normalizeDealBreaker(first);
    if (normalized) avoidClause = `, ${normalized}`;
  }

  const seed = stableHash(`${data.destination}|${duration ?? 0}|${data.travelParty ?? ""}`);
  const opener = pickOpener(seed);
  const closer = pickCloser(data.vibes, data.travelParty, seed);

  const body = `${core}${vibeClause}${avoidClause}`;
  const article = articleFor(body);
  const sentence = opener
    ? `${opener}${article} ${body}.`
    : `${article === "an" ? "An" : "A"} ${body}.`;

  return `${sentence} ${closer}`;
}

export function ConfirmationCard({ data, onConfirm, onEdit }: Props) {
  const summary = buildSummary(data);

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl p-6 animate-fade-in">
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <p className="font-semibold text-foreground text-[15px]">Just confirming</p>
        </div>

        <p className="text-sm text-foreground leading-relaxed mb-6">{summary}</p>

        <div className="flex gap-3">
          <Button variant="ghost" onClick={onEdit} className="flex-1 h-11 rounded-xl text-sm">
            Edit
          </Button>
          <Button
            onClick={onConfirm}
            className="flex-1 h-11 rounded-xl font-semibold text-primary-foreground text-sm"
            style={{ background: "var(--gradient-primary)" }}
          >
            Looks good, continue
          </Button>
        </div>
      </div>
    </div>
  );
}

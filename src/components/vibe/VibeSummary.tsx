import { Badge } from "@/components/ui/badge";
import type { VibeAggregate } from "@/hooks/useVibeBoard";

const QUESTION_LABELS: Record<string, string> = {
  energy: "Trip energy",
  budget: "Budget vibe",
  accommodation: "Accommodation",
  length: "Trip length",
  musthave: "Must-haves",
};

const QUESTION_ORDER = ["energy", "budget", "accommodation", "length", "musthave"];

// Map answer_value to a short label for the summary sentence
const SUMMARY_PHRASES: Record<string, Record<string, string>> = {
  energy: {
    "Full send 🔥": "a full-send energy trip",
    "Balanced 😎": "a balanced trip",
    "Chill 🧘": "a chill trip",
  },
  budget: {
    "Splash out 💸": "splashing out on budget",
    "Fair split ⚖️": "a fair-split budget",
    "Keep it lean 🪙": "a lean budget",
  },
  accommodation: {
    "Together 🏠": "staying together",
    "Own rooms 🏨": "own rooms",
    "Don't mind 🤷": "flexible accommodation",
  },
  length: {
    Weekend: "a weekend",
    "4–5 days": "4–5 days",
    "Week+": "a week+",
  },
};

type Props = {
  aggregates: VibeAggregate[];
  respondentCount: number;
  memberCount: number;
};

export function VibeSummary({ aggregates, respondentCount, memberCount }: Props) {
  if (respondentCount < 2) return null;

  const byQuestion: Record<string, { answer: string; count: number }[]> = {};
  for (const a of aggregates) {
    if (!byQuestion[a.question_key]) byQuestion[a.question_key] = [];
    byQuestion[a.question_key].push({
      answer: a.answer_value,
      count: Number(a.response_count),
    });
  }

  // Sort each question's answers by count desc
  for (const key of Object.keys(byQuestion)) {
    byQuestion[key].sort((a, b) => b.count - a.count);
  }

  const getMaxCount = (key: string) => {
    const entries = byQuestion[key];
    if (!entries?.length) return 0;
    return Math.max(...entries.map((e) => e.count));
  };

  const isAligned = (key: string) => {
    const entries = byQuestion[key];
    if (!entries?.length) return false;
    if (key === "musthave") {
      // Total selections for musthave
      const totalSelections = entries.reduce((s, e) => s + e.count, 0);
      const topCount = entries[0]?.count || 0;
      return topCount / totalSelections >= 0.7;
    }
    // All respondents chose same answer
    return entries.length === 1;
  };

  // Build summary sentence
  const buildSummary = () => {
    const parts: string[] = [];
    const discussItems: string[] = [];

    for (const key of ["energy", "budget", "length"] as const) {
      const entries = byQuestion[key];
      if (!entries?.length) continue;
      const topAnswer = entries[0].answer;
      const phrase = SUMMARY_PHRASES[key]?.[topAnswer];
      if (phrase) parts.push(phrase);
      if (!isAligned(key)) discussItems.push(QUESTION_LABELS[key].toLowerCase());
    }

    if (!isAligned("accommodation"))
      discussItems.push("accommodation");

    let sentence = parts.length
      ? `Looks like ${parts.join(" with ")}` 
      : "The group's vibes are coming together";

    if (discussItems.length > 0) {
      sentence += ` — but ${discussItems.join(" and ")} need${discussItems.length === 1 ? "s" : ""} a chat.`;
    } else {
      sentence += " — the group is fully aligned! 🎉";
    }

    return sentence;
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">
        Group Vibe Summary
      </h3>

      {QUESTION_ORDER.map((key) => {
        const entries = byQuestion[key];
        if (!entries?.length) return null;
        const maxCount = getMaxCount(key);
        const aligned = isAligned(key);

        return (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {QUESTION_LABELS[key]}
              </span>
              <Badge
                variant={aligned ? "default" : "secondary"}
                className={
                  aligned
                    ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    : "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100"
                }
              >
                {aligned ? "✅ Aligned" : "⚡ Discuss"}
              </Badge>
            </div>
            <div className="space-y-1">
              {entries.map((e) => (
                <div key={e.answer} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-28 truncate shrink-0">
                    {e.answer}
                  </span>
                  <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-primary rounded-full transition-all"
                      style={{
                        width: `${maxCount ? (e.count / maxCount) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium text-foreground w-6 text-right">
                    {e.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <p className="text-sm text-foreground/80 italic border-t border-border pt-3">
        {buildSummary()}
      </p>
    </div>
  );
}

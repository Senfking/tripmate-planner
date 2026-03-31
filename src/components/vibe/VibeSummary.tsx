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

// Strip emojis for display
function stripEmoji(str: string) {
  return str.replace(/\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2702}-\u{27B0}\u{200D}\u{FE0F}\u{2640}\u{2642}\u{2694}-\u{269F}\u{1FA70}-\u{1FAFF}]+$/u, "");
}

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
      const totalSelections = entries.reduce((s, e) => s + e.count, 0);
      const topCount = entries[0]?.count || 0;
      return topCount / totalSelections >= 0.7;
    }
    return entries.length === 1;
  };

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
      sentence += " — the group is fully aligned!";
    }

    return sentence;
  };

  return (
    <div className="mt-8">
      <div className="border-t border-border" />
      <div className="space-y-5 rounded-xl border border-border bg-card p-4 mt-8">
        <h3 className="text-[15px] font-semibold text-foreground">
          Group Vibe Summary
        </h3>

        {QUESTION_ORDER.map((key) => {
          const entries = byQuestion[key];
          if (!entries?.length) return null;
          const maxCount = getMaxCount(key);
          const aligned = isAligned(key);

          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-muted-foreground">
                  {QUESTION_LABELS[key]}
                </span>
                <Badge
                  variant="secondary"
                  className={
                    aligned
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-[11px]"
                      : "bg-muted text-foreground border-border hover:bg-muted text-[11px]"
                  }
                >
                  {aligned ? "Aligned" : "Discuss"}
                </Badge>
              </div>
              <div className="space-y-2">
                {entries.map((e) => (
                  <div key={e.answer} className="flex items-center gap-3">
                    <span className="text-[13px] text-muted-foreground w-28 truncate shrink-0">
                      {stripEmoji(e.answer)}
                    </span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#0D9488] rounded-full transition-all"
                        style={{
                          width: `${maxCount ? (e.count / maxCount) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-[13px] font-medium text-foreground w-6 text-right">
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
    </div>
  );
}

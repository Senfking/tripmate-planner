import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ThumbsUp, Flame, MessageSquare } from "lucide-react";

interface Props {
  planId: string;
  dayIndex: number;
  activityCount: number;
}

const REACTION_ICONS: Record<string, React.ElementType> = {
  "👍": ThumbsUp,
  "🔥": Flame,
};

export function DayReactionSummary({ planId, dayIndex, activityCount }: Props) {
  const prefix = `day-${dayIndex}-`;

  // Fetch all reactions for this day's activities
  const { data: reactions = [] } = useQuery({
    queryKey: ["day-reactions-summary", planId, dayIndex],
    queryFn: async () => {
      const { data } = await supabase
        .from("plan_activity_reactions" as any)
        .select("emoji, activity_key")
        .eq("plan_id", planId)
        .like("activity_key", `${prefix}%`);
      return (data as any[]) || [];
    },
    enabled: !!planId,
  });

  const { data: commentCount = 0 } = useQuery({
    queryKey: ["day-comments-count", planId, dayIndex],
    queryFn: async () => {
      // Count comments for day-level + all activities in this day
      const keys = [`day-${dayIndex}`];
      for (let i = 0; i < activityCount; i++) {
        keys.push(`day-${dayIndex}-activity-${i}`);
      }
      const { count } = await supabase
        .from("plan_activity_comments" as any)
        .select("id", { count: "exact", head: true })
        .eq("plan_id", planId)
        .in("activity_key", keys);
      return count || 0;
    },
    enabled: !!planId,
  });

  if (reactions.length === 0 && commentCount === 0) return null;

  // Count by emoji type
  const counts: Record<string, number> = {};
  for (const r of reactions) {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
  }

  return (
    <div className="flex items-center gap-2 ml-1">
      {Object.entries(counts).map(([emoji, count]) => {
        const Icon = REACTION_ICONS[emoji];
        if (!Icon) return null;
        return (
          <span key={emoji} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Icon className="h-3 w-3" />
            <span className="font-mono">{count}</span>
          </span>
        );
      })}
      {commentCount > 0 && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
          <MessageSquare className="h-3 w-3" />
          <span className="font-mono">{commentCount}</span>
        </span>
      )}
    </div>
  );
}

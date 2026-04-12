import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ThumbsUp, ThumbsDown, Flame, HelpCircle } from "lucide-react";

const REACTIONS = [
  { key: "👍", Icon: ThumbsUp, label: "Like" },
  { key: "👎", Icon: ThumbsDown, label: "Dislike" },
  { key: "🔥", Icon: Flame, label: "Love it" },
  { key: "🤔", Icon: HelpCircle, label: "Unsure" },
] as const;

interface Props {
  planId: string;
  activityKey: string;
}

export function ActivityReactions({ planId, activityKey }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["plan-reactions", planId, activityKey];

  const { data: reactions = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_activity_reactions")
        .select("id, emoji, user_id")
        .eq("plan_id", planId)
        .eq("activity_key", activityKey);
      if (error) throw error;
      return data || [];
    },
    enabled: !!planId,
  });

  // Realtime subscription via useEffect
  useEffect(() => {
    if (!planId) return;
    const channel = supabase
      .channel(`plan-reactions-${planId}-${activityKey}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "plan_activity_reactions", filter: `plan_id=eq.${planId}` },
        () => { qc.invalidateQueries({ queryKey: ["plan-reactions", planId] }); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [planId, activityKey, qc]);

  const toggle = useCallback(
    async (reactionKey: string) => {
      if (!user) return;
      const existing = reactions.find(
        (r) => r.emoji === reactionKey && r.user_id === user.id
      );

      // Optimistic update
      if (existing) {
        qc.setQueryData(queryKey, reactions.filter((r) => r.id !== existing.id));
        const { error } = await supabase
          .from("plan_activity_reactions")
          .delete()
          .eq("id", existing.id);
        if (error) qc.invalidateQueries({ queryKey });
      } else {
        const optimistic = { id: `temp-${Date.now()}`, emoji: reactionKey, user_id: user.id, plan_id: planId, activity_key: activityKey, created_at: new Date().toISOString() };
        qc.setQueryData(queryKey, [...reactions, optimistic]);
        const { error } = await supabase.from("plan_activity_reactions").insert({
          plan_id: planId,
          activity_key: activityKey,
          user_id: user.id,
          emoji: reactionKey,
        });
        if (error) qc.invalidateQueries({ queryKey });
        else qc.invalidateQueries({ queryKey });
      }
    },
    [user, reactions, planId, activityKey, qc, queryKey]
  );

  if (!planId) return null;

  return (
    <div className="flex items-center gap-1 px-3.5 py-2">
      {REACTIONS.map(({ key, Icon, label }) => {
        const count = reactions.filter((r) => r.emoji === key).length;
        const isActive = reactions.some(
          (r) => r.emoji === key && r.user_id === user?.id
        );
        return (
          <button
            key={key}
            onClick={(e) => {
              e.stopPropagation();
              toggle(key);
            }}
            title={label}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
              isActive
                ? "bg-[#0D9488] text-white shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={isActive ? 2.5 : 2} />
            {count > 0 && (
              <span className="text-[11px] tabular-nums">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

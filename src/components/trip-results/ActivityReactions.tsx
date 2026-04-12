import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const EMOJIS = ["👍", "👎", "🔥", "🤔"] as const;

interface Props {
  planId: string;
  activityKey: string;
}

interface Reaction {
  id: string;
  emoji: string;
  user_id: string;
}

export function ActivityReactions({ planId, activityKey }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["plan-reactions", planId, activityKey];

  const { data: reactions = [] } = useQuery<Reaction[]>({
    queryKey,
    queryFn: async () => {
      const { data } = await supabase
        .from("plan_activity_reactions" as any)
        .select("id, emoji, user_id")
        .eq("plan_id", planId)
        .eq("activity_key", activityKey);
      return (data as any as Reaction[]) || [];
    },
    enabled: !!planId,
  });

  // Realtime subscription
  useQuery({
    queryKey: ["plan-reactions-rt", planId],
    queryFn: () => null,
    enabled: !!planId,
    staleTime: Infinity,
    meta: {
      _subscribed: (() => {
        const channel = supabase
          .channel(`plan-reactions-${planId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "plan_activity_reactions",
              filter: `plan_id=eq.${planId}`,
            },
            () => {
              qc.invalidateQueries({ queryKey: ["plan-reactions", planId] });
            }
          )
          .subscribe();
        return () => supabase.removeChannel(channel);
      })(),
    },
  });

  const toggle = useCallback(
    async (emoji: string) => {
      if (!user) return;
      const existing = reactions.find(
        (r) => r.emoji === emoji && r.user_id === user.id
      );
      if (existing) {
        await supabase
          .from("plan_activity_reactions" as any)
          .delete()
          .eq("id", existing.id);
      } else {
        await supabase.from("plan_activity_reactions" as any).insert({
          plan_id: planId,
          activity_key: activityKey,
          user_id: user.id,
          emoji,
        } as any);
      }
      qc.invalidateQueries({ queryKey });
    },
    [user, reactions, planId, activityKey, qc, queryKey]
  );

  if (!planId) return null;

  return (
    <div className="flex items-center gap-1.5 px-3.5 py-1.5">
      {EMOJIS.map((emoji) => {
        const count = reactions.filter((r) => r.emoji === emoji).length;
        const isActive = reactions.some(
          (r) => r.emoji === emoji && r.user_id === user?.id
        );
        return (
          <button
            key={emoji}
            onClick={(e) => {
              e.stopPropagation();
              toggle(emoji);
            }}
            className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-full text-xs transition-colors ${
              isActive
                ? "bg-primary/20 border border-primary/40"
                : "bg-accent/50 border border-transparent hover:bg-accent"
            }`}
          >
            <span className="text-sm">{emoji}</span>
            {count > 0 && (
              <span className={`text-[10px] font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

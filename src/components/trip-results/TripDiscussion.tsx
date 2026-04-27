import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MessageSquare, Send, Trash2, ChevronDown, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Props {
  planId: string;
  activityKey: string;
  placeholder?: string;
  compact?: boolean;
  maxShown?: number;
  isDraft?: boolean;
}

interface Comment {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  user_name?: string;
}

function getInitialColor(name: string) {
  const code = name.charCodeAt(0) || 65;
  return `hsl(${(code * 37) % 360}, 55%, 55%)`;
}

export function TripDiscussion({ planId, activityKey, placeholder = "Add a comment...", compact = false, maxShown, isDraft = false }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [showAll, setShowAll] = useState(false);
  const queryKey = ["plan-comments", planId, activityKey];

  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey,
    queryFn: async () => {
      const { data } = await supabase
        .from("plan_activity_comments" as any)
        .select("id, user_id, text, created_at")
        .eq("plan_id", planId)
        .eq("activity_key", activityKey)
        .order("created_at", { ascending: true });

      if (!data || (data as any[]).length === 0) return [];

      const userIds = [...new Set((data as any[]).map((c: any) => c.user_id))];
      const { data: profiles } = await supabase.rpc("get_public_profiles", { _user_ids: userIds });
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      return (data as any[]).map((c: any) => {
        const prof = profileMap.get(c.user_id);
        return { ...c, user_name: prof?.display_name || "User" };
      });
    },
    enabled: !!planId,
  });

  useEffect(() => {
    if (!planId) return;
    const channel = supabase
      .channel(`plan-disc-${planId}-${activityKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_activity_comments", filter: `plan_id=eq.${planId}` }, () => {
        qc.invalidateQueries({ queryKey: ["plan-comments", planId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [planId, activityKey, qc]);

  const handleSend = useCallback(async () => {
    if (!user || !text.trim()) return;
    const trimmed = text.trim().slice(0, 500);
    setText("");
    await supabase.from("plan_activity_comments" as any).insert({
      plan_id: planId, activity_key: activityKey, user_id: user.id, text: trimmed,
    } as any);
    qc.invalidateQueries({ queryKey });
  }, [user, text, planId, activityKey, qc, queryKey]);

  const handleDelete = useCallback(async (id: string) => {
    await supabase.from("plan_activity_comments" as any).delete().eq("id", id);
    qc.invalidateQueries({ queryKey });
  }, [qc, queryKey]);

  if (!planId) return null;

  const visibleComments = maxShown && !showAll ? comments.slice(-maxShown) : comments;
  const hasMore = maxShown && !showAll && comments.length > maxShown;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {!compact && (
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="h-4 w-4 text-[#0D9488]" />
          <h3 className="text-sm font-semibold text-foreground">Group discussion</h3>
          {comments.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#0D9488]/15 text-[#0D9488] font-mono">
              {comments.length}
            </span>
          )}
        </div>
      )}

      {hasMore && (
        <button
          onClick={() => setShowAll(true)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className="h-3 w-3" />
          Show {comments.length - (maxShown || 0)} earlier
        </button>
      )}

      {visibleComments.map((c) => (
        <div key={c.id} className="flex gap-2 group">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5"
            style={{ backgroundColor: getInitialColor(c.user_name || "U") }}
          >
            {(c.user_name || "U").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-foreground">{c.user_name}</span>
              <span className="text-[9px] text-muted-foreground">
                {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
              </span>
              {c.user_id === user?.id && (
                <button
                  onClick={() => handleDelete(c.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">{c.text}</p>
          </div>
        </div>
      ))}

      {/* Input */}
      <div className="flex gap-2 items-end">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          placeholder={placeholder}
          maxLength={500}
          className="flex-1 px-2.5 py-1.5 text-[11px] rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) { e.stopPropagation(); handleSend(); }
          }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="p-1.5 rounded-lg bg-[#0D9488] text-white disabled:opacity-30 hover:bg-[#0D9488]/90 transition-colors"
        >
          <Send className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { X, Users, ThumbsUp, ThumbsDown, Flame, HelpCircle, MessageSquare, Send, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { AITripResult, AIDay } from "./useResultsState";

interface Props {
  planId: string;
  result: AITripResult;
  allDays: AIDay[];
  onScrollTo: (id: string) => void;
  onClose: () => void;
}

const EMOJI_MAP: Record<string, { Icon: typeof ThumbsUp; label: string }> = {
  thumbsup: { Icon: ThumbsUp, label: "👍" },
  thumbsdown: { Icon: ThumbsDown, label: "👎" },
  fire: { Icon: Flame, label: "🔥" },
  thinking: { Icon: HelpCircle, label: "🤔" },
};

function getInitialColor(name: string) {
  const code = name.charCodeAt(0) || 65;
  return `hsl(${(code * 37) % 360}, 55%, 55%)`;
}

function parseActivityKey(key: string): { dayIndex: number; activityIndex: number } | null {
  const match = key.match(/^day-(\d+)-activity-(\d+)$/);
  if (!match) return null;
  return { dayIndex: parseInt(match[1]), activityIndex: parseInt(match[2]) };
}

function getActivityLabel(key: string, allDays: AIDay[]): string {
  const parsed = parseActivityKey(key);
  if (!parsed) {
    if (key.startsWith("day-")) {
      const dayMatch = key.match(/^day-(\d+)$/);
      if (dayMatch) return `Day ${parseInt(dayMatch[1]) + 1} discussion`;
    }
    if (key === "trip-general") return "Trip discussion";
    return key;
  }
  const day = allDays[parsed.dayIndex];
  if (!day) return key;
  const activity = day.activities[parsed.activityIndex];
  return activity ? `${activity.title}, Day ${day.day_number}` : `Day ${day.day_number}`;
}

function getSectionId(key: string, allDays: AIDay[]): string {
  const parsed = parseActivityKey(key);
  if (parsed) {
    const day = allDays[parsed.dayIndex];
    return day ? `section-day-${day.day_number}` : "";
  }
  return "";
}

type CommentEntry = {
  id: string;
  userName: string;
  userId: string;
  text: string;
  createdAt: Date;
};

type ReactionEntry = {
  id: string;
  userName: string;
  userId: string;
  emoji: string;
  createdAt: Date;
};

type Thread = {
  activityKey: string;
  activityLabel: string;
  sectionId: string;
  comments: CommentEntry[];
  reactions: ReactionEntry[];
  latestAt: Date;
};

export function GroupActivityPanel({ planId, result, allDays, onScrollTo, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [generalText, setGeneralText] = useState("");
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

  const { data: reactions = [] } = useQuery({
    queryKey: ["all-plan-reactions", planId],
    queryFn: async () => {
      const { data } = await supabase
        .from("plan_activity_reactions")
        .select("id, emoji, user_id, activity_key, created_at")
        .eq("plan_id", planId)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!planId,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["all-plan-comments", planId],
    queryFn: async () => {
      const { data } = await supabase
        .from("plan_activity_comments" as any)
        .select("id, user_id, text, activity_key, created_at")
        .eq("plan_id", planId)
        .order("created_at", { ascending: true });
      return (data as any[]) || [];
    },
    enabled: !!planId,
  });

  useEffect(() => {
    if (!planId) return;
    const channel = supabase
      .channel(`group-activity-${planId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_activity_comments", filter: `plan_id=eq.${planId}` }, () => {
        qc.invalidateQueries({ queryKey: ["all-plan-comments", planId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_activity_reactions", filter: `plan_id=eq.${planId}` }, () => {
        qc.invalidateQueries({ queryKey: ["all-plan-reactions", planId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [planId, qc]);

  const allUserIds = useMemo(() => {
    const ids = new Set<string>();
    reactions.forEach((r: any) => ids.add(r.user_id));
    comments.forEach((c: any) => ids.add(c.user_id));
    return [...ids];
  }, [reactions, comments]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-feed", allUserIds.join(",")],
    queryFn: async () => {
      if (allUserIds.length === 0) return [];
      const { data } = await supabase.rpc("get_public_profiles", { _user_ids: allUserIds });
      return data || [];
    },
    enabled: allUserIds.length > 0,
  });

  const profileMap = useMemo(() => new Map(profiles.map((p: any) => [p.id, p])), [profiles]);

  const threads: Thread[] = useMemo(() => {
    const threadMap = new Map<string, Thread>();

    const getOrCreate = (key: string): Thread => {
      if (!threadMap.has(key)) {
        threadMap.set(key, {
          activityKey: key,
          activityLabel: getActivityLabel(key, allDays),
          sectionId: getSectionId(key, allDays),
          comments: [],
          reactions: [],
          latestAt: new Date(0),
        });
      }
      return threadMap.get(key)!;
    };

    for (const c of comments) {
      const prof = profileMap.get(c.user_id);
      const thread = getOrCreate(c.activity_key);
      const d = new Date(c.created_at);
      thread.comments.push({
        id: c.id,
        userName: prof?.display_name || "User",
        userId: c.user_id,
        text: c.text,
        createdAt: d,
      });
      if (d > thread.latestAt) thread.latestAt = d;
    }

    for (const r of reactions) {
      const prof = profileMap.get((r as any).user_id);
      const thread = getOrCreate((r as any).activity_key);
      const d = new Date((r as any).created_at);
      thread.reactions.push({
        id: (r as any).id,
        userName: prof?.display_name || "User",
        userId: (r as any).user_id,
        emoji: (r as any).emoji,
        createdAt: d,
      });
      if (d > thread.latestAt) thread.latestAt = d;
    }

    return [...threadMap.values()].sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime());
  }, [reactions, comments, profileMap, allDays]);

  const uniqueMembers = useMemo(() => new Set(allUserIds).size, [allUserIds]);

  const toggleThread = useCallback((key: string) => {
    setExpandedThreads(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const handleSendGeneral = useCallback(async () => {
    if (!user || !generalText.trim()) return;
    const trimmed = generalText.trim().slice(0, 500);
    setGeneralText("");
    await supabase.from("plan_activity_comments" as any).insert({
      plan_id: planId, activity_key: "trip-general", user_id: user.id, text: trimmed,
    } as any);
    qc.invalidateQueries({ queryKey: ["all-plan-comments", planId] });
  }, [user, generalText, planId, qc]);

  const handleReply = useCallback(async () => {
    if (!user || !replyText.trim() || !replyTo) return;
    const trimmed = replyText.trim().slice(0, 500);
    setReplyText("");
    const activityKey = replyTo;
    setReplyTo(null);
    setExpandedThreads(prev => new Set(prev).add(activityKey));
    await supabase.from("plan_activity_comments" as any).insert({
      plan_id: planId, activity_key: activityKey, user_id: user.id, text: trimmed,
    } as any);
    qc.invalidateQueries({ queryKey: ["all-plan-comments", planId] });
  }, [user, replyText, replyTo, planId, qc]);

  const handleDeleteComment = useCallback(async (id: string) => {
    await supabase.from("plan_activity_comments" as any).delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["all-plan-comments", planId] });
  }, [qc, planId]);

  return (
    <div className="fixed inset-0 z-[10001] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[420px] bg-card border-l border-border h-full overflow-y-auto animate-slide-in-right shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border px-4 py-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Group activity</h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-accent transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
            <span>{reactions.length} reactions</span>
            <span>·</span>
            <span>{comments.length} comments</span>
            <span>·</span>
            <span>{uniqueMembers} members active</span>
          </div>
        </div>

        {/* Threaded Feed */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <Users className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Reactions and comments from your group will appear here</p>
            </div>
          ) : (
            threads.map((thread) => (
              <ThreadCard
                key={thread.activityKey}
                thread={thread}
                currentUserId={user?.id}
                isExpanded={expandedThreads.has(thread.activityKey)}
                replyTo={replyTo}
                onToggle={() => toggleThread(thread.activityKey)}
                onScrollTo={() => {
                  if (thread.sectionId) {
                    onClose();
                    setTimeout(() => onScrollTo(thread.sectionId), 200);
                  }
                }}
                onReply={() => setReplyTo(thread.activityKey)}
                onDelete={handleDeleteComment}
              />
            ))
          )}
        </div>

        {/* Inline reply bar */}
        {replyTo && (
          <div className="px-4 pt-2 pb-1 border-t border-border bg-accent/30 shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground">
                Replying to <span className="font-medium text-foreground">{getActivityLabel(replyTo, allDays)}</span>
              </span>
              <button onClick={() => { setReplyTo(null); setReplyText(""); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="flex gap-2 items-end">
              <input
                type="text"
                autoFocus
                value={replyText}
                onChange={(e) => setReplyText(e.target.value.slice(0, 500))}
                placeholder="Write a reply..."
                maxLength={500}
                className="flex-1 px-2.5 py-1.5 text-[11px] rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => { if (e.key === "Enter" && replyText.trim()) handleReply(); }}
              />
              <button onClick={handleReply} disabled={!replyText.trim()} className="p-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-30">
                <Send className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* General comment input */}
        {!replyTo && (
          <div className="px-4 py-3 border-t border-border bg-card shrink-0">
            <div className="flex gap-2 items-end">
              <input
                type="text"
                value={generalText}
                onChange={(e) => setGeneralText(e.target.value.slice(0, 500))}
                placeholder="Comment on this trip..."
                maxLength={500}
                className="flex-1 px-2.5 py-1.5 text-[11px] rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => { if (e.key === "Enter" && generalText.trim()) handleSendGeneral(); }}
              />
              <button onClick={handleSendGeneral} disabled={!generalText.trim()} className="p-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-30">
                <Send className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Thread Card ── */

function ThreadCard({ thread, currentUserId, isExpanded, replyTo, onToggle, onScrollTo, onReply, onDelete }: {
  thread: Thread;
  currentUserId?: string;
  isExpanded: boolean;
  replyTo: string | null;
  onToggle: () => void;
  onScrollTo: () => void;
  onReply: () => void;
  onDelete: (id: string) => void;
}) {
  const firstComment = thread.comments[0];
  const replies = thread.comments.slice(1);
  const hasReplies = replies.length > 0;
  const reactionSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    thread.reactions.forEach(r => {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    });
    return Object.entries(counts);
  }, [thread.reactions]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Thread header — activity label */}
      <button
        onClick={onScrollTo}
        className="w-full text-left px-3 py-2 bg-accent/30 hover:bg-accent/50 transition-colors border-b border-border"
      >
        <span className="text-[11px] font-medium text-primary">{thread.activityLabel}</span>
        <span className="text-[9px] text-muted-foreground/60 ml-2">
          {formatDistanceToNow(thread.latestAt, { addSuffix: true })}
        </span>
      </button>

      {/* Reactions summary */}
      {reactionSummary.length > 0 && (
        <div className="px-3 py-1.5 flex items-center gap-2 border-b border-border/50">
          {reactionSummary.map(([emoji, count]) => {
            const info = EMOJI_MAP[emoji];
            return info ? (
              <span key={emoji} className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <info.Icon className="h-3 w-3" /> {count}
              </span>
            ) : null;
          })}
        </div>
      )}

      {/* First comment (root) */}
      {firstComment && (
        <div className="px-3 py-2">
          <CommentRow
            comment={firstComment}
            isOwn={firstComment.userId === currentUserId}
            onDelete={() => onDelete(firstComment.id)}
          />
          <div className="flex items-center gap-3 mt-1 ml-7">
            <button onClick={onReply} className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
              <MessageSquare className="h-2.5 w-2.5" /> Reply
            </button>
            {hasReplies && (
              <button onClick={onToggle} className="text-[9px] text-primary hover:text-primary/80 flex items-center gap-0.5 font-medium">
                {isExpanded ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                {replies.length} {replies.length === 1 ? "reply" : "replies"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* No comments, only reactions — show reply button */}
      {!firstComment && (
        <div className="px-3 py-2">
          <button onClick={onReply} className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
            <MessageSquare className="h-2.5 w-2.5" /> Comment
          </button>
        </div>
      )}

      {/* Threaded replies */}
      {isExpanded && hasReplies && (
        <div className="border-t border-border/50">
          {replies.map((reply) => (
            <div key={reply.id} className="pl-7 pr-3 py-1.5 border-l-2 border-primary/20 ml-5 relative">
              <CommentRow
                comment={reply}
                isOwn={reply.userId === currentUserId}
                onDelete={() => onDelete(reply.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Comment Row ── */

function CommentRow({ comment, isOwn, onDelete }: {
  comment: CommentEntry;
  isOwn: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="group flex gap-2">
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5"
        style={{ backgroundColor: getInitialColor(comment.userName) }}
      >
        {comment.userName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-medium text-foreground">{comment.userName}</span>
          <span className="text-[9px] text-muted-foreground/60">
            {formatDistanceToNow(comment.createdAt, { addSuffix: true })}
          </span>
        </div>
        <p className="text-[11px] text-foreground/90 mt-0.5 leading-relaxed">{comment.text}</p>
        {isOwn && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-[9px] text-muted-foreground hover:text-destructive flex items-center gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="h-2.5 w-2.5" /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

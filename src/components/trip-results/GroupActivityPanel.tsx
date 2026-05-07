import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { X, Users, ThumbsUp, ThumbsDown, Flame, HelpCircle, MessageSquare, Send, Trash2, ChevronDown, ChevronUp, MapPin } from "lucide-react";
import { useGooglePlaceDetails } from "@/hooks/useGooglePlaceDetails";
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
  "👍": { Icon: ThumbsUp, label: "👍" },
  "👎": { Icon: ThumbsDown, label: "👎" },
  "🔥": { Icon: Flame, label: "🔥" },
  "🤔": { Icon: HelpCircle, label: "🤔" },
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

function getActivityMeta(key: string, allDays: AIDay[]): { label: string; dayLabel: string | null; activityTitle: string | null; locationName: string | null } {
  const parsed = parseActivityKey(key);
  if (!parsed) {
    if (key === "trip-general") return { label: "Trip discussion", dayLabel: null, activityTitle: null, locationName: null };
    const dayMatch = key.match(/^day-(\d+)$/);
    if (dayMatch) {
      const day = allDays[parseInt(dayMatch[1])];
      return { label: day ? `Day ${day.day_number} discussion` : key, dayLabel: null, activityTitle: null, locationName: null };
    }
    return { label: key, dayLabel: null, activityTitle: null, locationName: null };
  }
  const day = allDays[parsed.dayIndex];
  if (!day) return { label: key, dayLabel: null, activityTitle: null, locationName: null };
  const activity = day.activities[parsed.activityIndex];
  return {
    label: activity?.title ?? `Day ${day.day_number}`,
    dayLabel: `Day ${day.day_number}`,
    activityTitle: activity?.title ?? null,
    locationName: activity?.location_name ?? null,
  };
}

function getSectionId(key: string, allDays: AIDay[]): string {
  const parsed = parseActivityKey(key);
  if (parsed) {
    const day = allDays[parsed.dayIndex];
    return day ? `section-day-${day.day_number}` : "";
  }
  const dayMatch = key.match(/^day-(\d+)$/);
  if (dayMatch) {
    const day = allDays[parseInt(dayMatch[1])];
    return day ? `section-day-${day.day_number}` : "";
  }
  return "";
}

type CommentEntry = {
  id: string;
  userName: string;
  userId: string;
  avatarUrl: string | null;
  text: string;
  createdAt: Date;
};

type ReactionEntry = {
  id: string;
  userName: string;
  userId: string;
  avatarUrl: string | null;
  emoji: string;
  createdAt: Date;
};

type Thread = {
  activityKey: string;
  activityLabel: string;
  dayLabel: string | null;
  sectionId: string;
  activityTitle: string | null;
  locationName: string | null;
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
  const [reactionsOpen, setReactionsOpen] = useState(false);

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

  const profileMap = useMemo(
    () => new Map(profiles.map((p: any) => [p.id, p])),
    [profiles],
  );

  const threads: Thread[] = useMemo(() => {
    const threadMap = new Map<string, Thread>();
    const getOrCreate = (key: string): Thread => {
      if (!threadMap.has(key)) {
        const meta = getActivityMeta(key, allDays);
        threadMap.set(key, {
          activityKey: key,
          activityLabel: meta.label,
          dayLabel: meta.dayLabel,
          sectionId: getSectionId(key, allDays),
          activityTitle: meta.activityTitle,
          locationName: meta.locationName,
          comments: [],
          reactions: [],
          latestAt: new Date(0),
        });
      }
      return threadMap.get(key)!;
    };

    for (const c of comments) {
      const prof = profileMap.get(c.user_id) as any;
      const thread = getOrCreate(c.activity_key);
      const d = new Date(c.created_at);
      thread.comments.push({
        id: c.id,
        userName: prof?.display_name || "User",
        userId: c.user_id,
        avatarUrl: prof?.avatar_url || null,
        text: c.text,
        createdAt: d,
      });
      if (d > thread.latestAt) thread.latestAt = d;
    }

    for (const r of reactions) {
      const prof = profileMap.get((r as any).user_id) as any;
      const thread = getOrCreate((r as any).activity_key);
      const d = new Date((r as any).created_at);
      thread.reactions.push({
        id: (r as any).id,
        userName: prof?.display_name || "User",
        userId: (r as any).user_id,
        avatarUrl: prof?.avatar_url || null,
        emoji: (r as any).emoji,
        createdAt: d,
      });
      if (d > thread.latestAt) thread.latestAt = d;
    }

    return [...threadMap.values()].sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime());
  }, [reactions, comments, profileMap, allDays]);

  // Split: discussion threads (have comments) vs reaction-only threads
  const discussionThreads = useMemo(
    () => threads.filter(t => t.comments.length > 0),
    [threads],
  );
  const reactionOnlyThreads = useMemo(
    () => threads.filter(t => t.comments.length === 0 && t.reactions.length > 0),
    [threads],
  );

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

  // Unique member avatars across all activity, for header stack
  const memberAvatars = useMemo(() => {
    const map = new Map<string, { name: string; url: string | null }>();
    for (const id of allUserIds) {
      const p = profileMap.get(id) as any;
      map.set(id, { name: p?.display_name || "User", url: p?.avatar_url || null });
    }
    return [...map.values()];
  }, [allUserIds, profileMap]);

  const goToSection = useCallback((sectionId: string) => {
    if (!sectionId) return;
    onClose();
    setTimeout(() => {
      // Tell DaySection to expand if collapsed, then scroll
      window.dispatchEvent(new CustomEvent("results:expand", { detail: { id: sectionId } }));
      setTimeout(() => onScrollTo(sectionId), 60);
    }, 200);
  }, [onClose, onScrollTo]);

  return (
    <div className="fixed inset-0 z-[10001] flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      {/* Panel: full-width on mobile, side panel on >=md */}
      <div className="relative w-full md:max-w-[440px] bg-gradient-to-b from-muted/40 to-muted/20 md:border-l border-border h-full overflow-hidden animate-slide-in-right shadow-2xl flex flex-col">
        {/* Header — richer with gradient strip + avatar stack */}
        <div
          className="sticky top-0 z-10 shrink-0 border-b border-border bg-card relative overflow-hidden"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px))" }}
        >
          {/* Decorative gradient bar */}
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#0D9488] via-[#E07A5F] to-[#F4A261]" />
          <div className="px-4 pt-3.5 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-[#0D9488]" />
                  <h2 className="text-[13px] font-semibold tracking-tight text-foreground">Group activity</h2>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span><span className="font-semibold text-foreground">{comments.length}</span> comments</span>
                  <span className="text-muted-foreground/30">•</span>
                  <span><span className="font-semibold text-foreground">{reactions.length}</span> reactions</span>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-accent transition-colors -mr-1 -mt-0.5 shrink-0">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            {/* Member avatar stack */}
            {memberAvatars.length > 0 && (
              <div className="mt-2.5 flex items-center gap-2">
                <div className="flex -space-x-1.5">
                  {memberAvatars.slice(0, 5).map((m, i) => (
                    <div key={i} className="ring-2 ring-card rounded-full">
                      <Avatar name={m.name} url={m.url} size={22} />
                    </div>
                  ))}
                </div>
                <span className="text-[10.5px] text-muted-foreground">
                  {uniqueMembers} {uniqueMembers === 1 ? "member" : "members"} active
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Feed */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <Users className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Reactions and comments from your group will appear here</p>
            </div>
          ) : (
            <>
              {/* Reactions section — collapsed by default */}
              {reactionOnlyThreads.length > 0 && (
                <section>
                  <button
                    onClick={() => setReactionsOpen(o => !o)}
                    className="w-full flex items-center justify-between px-1 mb-1.5"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Reactions · {reactionOnlyThreads.length}
                    </span>
                    {reactionsOpen
                      ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                      : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                  </button>
                  {reactionsOpen && (
                    <div className="divide-y divide-border/50">
                      {reactionOnlyThreads.map(t => (
                        <ReactionRow
                          key={t.activityKey}
                          thread={t}
                          onScrollTo={() => goToSection(t.sectionId)}
                          onComment={() => setReplyTo(t.activityKey)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Discussion section */}
              {discussionThreads.length > 0 && (
                <section>
                  <div className="px-1 mb-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Discussion · {discussionThreads.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {discussionThreads.map(thread => (
                      <ThreadCard
                        key={thread.activityKey}
                        thread={thread}
                        currentUserId={user?.id}
                        isExpanded={expandedThreads.has(thread.activityKey)}
                        onToggle={() => toggleThread(thread.activityKey)}
                        onScrollTo={() => goToSection(thread.sectionId)}
                        onReply={() => setReplyTo(thread.activityKey)}
                        onDelete={handleDeleteComment}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Inline reply bar */}
        {replyTo && (
          <div className="px-4 pt-2 border-t border-border bg-accent/30 shrink-0" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground">
                Replying to <span className="font-medium text-foreground">{getActivityMeta(replyTo, allDays).label}</span>
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
                className="flex-1 px-2.5 py-1.5 text-[12px] rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
                onKeyDown={(e) => { if (e.key === "Enter" && replyText.trim()) handleReply(); }}
              />
              <button onClick={handleReply} disabled={!replyText.trim()} className="p-1.5 rounded-lg bg-[#0D9488] text-white disabled:opacity-30">
                <Send className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* General comment input */}
        {!replyTo && (
          <div className="px-4 pt-3 border-t border-border bg-card shrink-0" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
            <div className="flex gap-2 items-end">
              <input
                type="text"
                value={generalText}
                onChange={(e) => setGeneralText(e.target.value.slice(0, 500))}
                placeholder="Comment on this trip..."
                maxLength={500}
                className="flex-1 px-2.5 py-1.5 text-[12px] rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
                onKeyDown={(e) => { if (e.key === "Enter" && generalText.trim()) handleSendGeneral(); }}
              />
              <button onClick={handleSendGeneral} disabled={!generalText.trim()} className="p-1.5 rounded-lg bg-[#0D9488] text-white disabled:opacity-30">
                <Send className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Avatar ── */
function Avatar({ name, url, size = 20 }: { name: string; url: string | null; size?: number }) {
  const [errored, setErrored] = useState(false);
  const px = `${size}px`;
  if (url && !errored) {
    return (
      <img
        src={url}
        alt={name}
        onError={() => setErrored(true)}
        className="rounded-full object-cover shrink-0"
        style={{ width: px, height: px }}
        loading="lazy"
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold text-white shrink-0"
      style={{
        width: px,
        height: px,
        fontSize: Math.max(9, Math.round(size * 0.42)),
        backgroundColor: getInitialColor(name),
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/* ── Reaction row (compact, no card) ── */
function ReactionRow({ thread, onScrollTo, onComment }: {
  thread: Thread;
  onScrollTo: () => void;
  onComment: () => void;
}) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    thread.reactions.forEach(r => { c[r.emoji] = (c[r.emoji] || 0) + 1; });
    return Object.entries(c);
  }, [thread.reactions]);

  // Unique reactors for the avatar stack (max 3)
  const reactors = useMemo(() => {
    const seen = new Map<string, ReactionEntry>();
    for (const r of thread.reactions) if (!seen.has(r.userId)) seen.set(r.userId, r);
    return [...seen.values()].slice(0, 3);
  }, [thread.reactions]);

  return (
    <div className="flex items-center gap-2 py-1.5 px-1 group">
      {/* Avatar stack */}
      <div className="flex -space-x-1.5 shrink-0">
        {reactors.map(r => (
          <div key={r.userId} className="ring-1 ring-muted/30 rounded-full">
            <Avatar name={r.userName} url={r.avatarUrl} size={18} />
          </div>
        ))}
      </div>

      {/* Title */}
      <button
        onClick={onScrollTo}
        className="flex-1 min-w-0 text-left text-[12px] text-foreground hover:text-[#0D9488] transition-colors truncate"
      >
        {thread.activityLabel}
        {thread.dayLabel && (
          <span className="ml-1.5 text-[10px] text-muted-foreground/70 font-normal">{thread.dayLabel}</span>
        )}
      </button>

      {/* Reaction counts */}
      <div className="flex items-center gap-1.5 shrink-0">
        {counts.map(([emoji, count]) => {
          const info = EMOJI_MAP[emoji];
          return info ? (
            <span key={emoji} className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <info.Icon className="h-3 w-3" />{count > 1 ? count : ""}
            </span>
          ) : null;
        })}
        <button
          onClick={onComment}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-[#0D9488]"
          title="Comment"
        >
          <MessageSquare className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/* ── Discussion thread card ── */
function ThreadCard({ thread, currentUserId, isExpanded, onToggle, onScrollTo, onReply, onDelete }: {
  thread: Thread;
  currentUserId?: string;
  isExpanded: boolean;
  onToggle: () => void;
  onScrollTo: () => void;
  onReply: () => void;
  onDelete: (id: string) => void;
}) {
  const firstComment = thread.comments[0];
  const replies = thread.comments.slice(1);
  const hasReplies = replies.length > 0;
  const reactionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    thread.reactions.forEach(r => { counts[r.emoji] = (counts[r.emoji] || 0) + 1; });
    return Object.entries(counts);
  }, [thread.reactions]);

  return (
    <div className="rounded-xl bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={onScrollTo}
        className="w-full flex items-center justify-between px-3 pt-2.5 pb-1.5 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[12px] font-semibold text-foreground truncate">
            {thread.activityLabel}
          </span>
          {thread.dayLabel && (
            <span className="text-[10px] text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5 shrink-0">
              {thread.dayLabel}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap ml-2 shrink-0">
          {formatDistanceToNow(thread.latestAt, { addSuffix: true })}
        </span>
      </button>

      {/* Reactions inline (subtle) */}
      {reactionCounts.length > 0 && (
        <div className="px-3 pb-1 flex items-center gap-2">
          {reactionCounts.map(([emoji, count]) => {
            const info = EMOJI_MAP[emoji];
            return info ? (
              <span key={emoji} className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <info.Icon className="h-3 w-3" /> {count}
              </span>
            ) : null;
          })}
        </div>
      )}

      {/* First comment */}
      {firstComment && (
        <div className="px-3 pb-2.5 pt-1">
          <CommentRow
            comment={firstComment}
            isOwn={firstComment.userId === currentUserId}
            onDelete={() => onDelete(firstComment.id)}
          />
          <div className="flex items-center gap-3 mt-1.5 ml-7">
            <button onClick={onReply} className="text-[10px] text-muted-foreground hover:text-[#0D9488] flex items-center gap-1 transition-colors">
              <MessageSquare className="h-3 w-3" /> Reply
            </button>
            {hasReplies && (
              <button onClick={onToggle} className="text-[10px] text-[#0D9488] hover:opacity-80 flex items-center gap-1 font-medium transition-colors">
                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {replies.length} {replies.length === 1 ? "reply" : "replies"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Threaded replies */}
      {isExpanded && hasReplies && (
        <div className="bg-muted/20 px-3 py-1.5">
          <div className="ml-6 border-l-2 border-[#0D9488]/40 pl-3 space-y-2 py-1">
            {replies.map(reply => (
              <CommentRow
                key={reply.id}
                comment={reply}
                isOwn={reply.userId === currentUserId}
                onDelete={() => onDelete(reply.id)}
              />
            ))}
          </div>
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
      <Avatar name={comment.userName} url={comment.avatarUrl} size={20} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-medium text-foreground">{comment.userName}</span>
          <span className="text-[10px] text-muted-foreground/60">
            {formatDistanceToNow(comment.createdAt, { addSuffix: true })}
          </span>
        </div>
        <p className="text-[12px] text-foreground/90 mt-0.5 leading-relaxed break-words">{comment.text}</p>
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

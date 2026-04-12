import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { X, Users, ThumbsUp, ThumbsDown, Flame, HelpCircle, MessageSquare, Send, Trash2 } from "lucide-react";
import { formatDistanceToNow, isToday, isYesterday } from "date-fns";
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

type FeedEntry = {
  id: string;
  type: "reaction" | "comment";
  userName: string;
  userId: string;
  activityKey: string;
  activityLabel: string;
  sectionId: string;
  emoji?: string;
  text?: string;
  createdAt: Date;
};

export function GroupActivityPanel({ planId, result, allDays, onScrollTo, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [replyTo, setReplyTo] = useState<string | null>(null); // activityKey to reply to
  const [replyText, setReplyText] = useState("");
  const [generalText, setGeneralText] = useState("");
  const feedEndRef = useRef<HTMLDivElement>(null);

  const { data: reactions = [] } = useQuery({
    queryKey: ["all-plan-reactions", planId],
    queryFn: async () => {
      const { data } = await supabase
        .from("plan_activity_reactions")
        .select("id, emoji, user_id, activity_key, created_at")
        .eq("plan_id", planId)
        .order("created_at", { ascending: false });
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
        .order("created_at", { ascending: false });
      return (data as any[]) || [];
    },
    enabled: !!planId,
  });

  // Realtime
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

  const feed: FeedEntry[] = useMemo(() => {
    const entries: FeedEntry[] = [];
    for (const r of reactions) {
      const prof = profileMap.get((r as any).user_id);
      entries.push({
        id: (r as any).id,
        type: "reaction",
        userName: prof?.display_name || "User",
        userId: (r as any).user_id,
        activityKey: (r as any).activity_key,
        activityLabel: getActivityLabel((r as any).activity_key, allDays),
        sectionId: getSectionId((r as any).activity_key, allDays),
        emoji: (r as any).emoji,
        createdAt: new Date((r as any).created_at),
      });
    }
    for (const c of comments) {
      const prof = profileMap.get(c.user_id);
      entries.push({
        id: c.id,
        type: "comment",
        userName: prof?.display_name || "User",
        userId: c.user_id,
        activityKey: c.activity_key,
        activityLabel: getActivityLabel(c.activity_key, allDays),
        sectionId: getSectionId(c.activity_key, allDays),
        text: c.text,
        createdAt: new Date(c.created_at),
      });
    }
    entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return entries;
  }, [reactions, comments, profileMap, allDays]);

  const uniqueMembers = useMemo(() => new Set(allUserIds).size, [allUserIds]);

  const groups = useMemo(() => {
    const today: FeedEntry[] = [];
    const yesterday: FeedEntry[] = [];
    const earlier: FeedEntry[] = [];
    for (const e of feed) {
      if (isToday(e.createdAt)) today.push(e);
      else if (isYesterday(e.createdAt)) yesterday.push(e);
      else earlier.push(e);
    }
    return { today, yesterday, earlier };
  }, [feed]);

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
    setReplyTo(null);
    await supabase.from("plan_activity_comments" as any).insert({
      plan_id: planId, activity_key: replyTo, user_id: user.id, text: trimmed,
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
      <div className="relative w-full max-w-sm bg-card border-l border-border h-full overflow-y-auto animate-slide-in-right shadow-2xl flex flex-col">
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

        {/* Feed */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {feed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <Users className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Reactions and comments from your group will appear here</p>
            </div>
          ) : (
            <>
              {groups.today.length > 0 && (
                <FeedSection
                  label="Today"
                  entries={groups.today}
                  currentUserId={user?.id}
                  replyTo={replyTo}
                  onScrollTo={onScrollTo}
                  onClose={onClose}
                  onReply={setReplyTo}
                  onDelete={handleDeleteComment}
                />
              )}
              {groups.yesterday.length > 0 && (
                <FeedSection
                  label="Yesterday"
                  entries={groups.yesterday}
                  currentUserId={user?.id}
                  replyTo={replyTo}
                  onScrollTo={onScrollTo}
                  onClose={onClose}
                  onReply={setReplyTo}
                  onDelete={handleDeleteComment}
                />
              )}
              {groups.earlier.length > 0 && (
                <FeedSection
                  label="Earlier"
                  entries={groups.earlier}
                  currentUserId={user?.id}
                  replyTo={replyTo}
                  onScrollTo={onScrollTo}
                  onClose={onClose}
                  onReply={setReplyTo}
                  onDelete={handleDeleteComment}
                />
              )}
            </>
          )}
          <div ref={feedEndRef} />
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
              <button onClick={handleReply} disabled={!replyText.trim()} className="p-1.5 rounded-lg bg-[#0D9488] text-white disabled:opacity-30">
                <Send className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* General comment input — always visible at bottom */}
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

function FeedSection({ label, entries, currentUserId, replyTo, onScrollTo, onClose, onReply, onDelete }: {
  label: string;
  entries: FeedEntry[];
  currentUserId?: string;
  replyTo: string | null;
  onScrollTo: (id: string) => void;
  onClose: () => void;
  onReply: (activityKey: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">{label}</p>
      <div className="space-y-1.5">
        {entries.map((entry) => {
          const EmojiInfo = entry.emoji ? EMOJI_MAP[entry.emoji] : null;
          return (
            <div key={entry.id} className="group">
              <button
                onClick={() => {
                  if (entry.sectionId) {
                    onClose();
                    setTimeout(() => onScrollTo(entry.sectionId), 200);
                  }
                }}
                className="w-full text-left flex gap-2 p-2 rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5"
                  style={{ backgroundColor: getInitialColor(entry.userName) }}
                >
                  {entry.userName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-foreground leading-snug">
                    <span className="font-medium">{entry.userName}</span>
                    {entry.type === "reaction" && EmojiInfo ? (
                      <> reacted <EmojiInfo.Icon className="h-3 w-3 inline-block mx-0.5 text-primary" /> on <span className="text-primary font-medium">{entry.activityLabel}</span></>
                    ) : (
                      <> commented on <span className="text-primary font-medium">{entry.activityLabel}</span></>
                    )}
                  </p>
                  {entry.text && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">"{entry.text}"</p>
                  )}
                  <p className="text-[9px] text-muted-foreground/60 mt-0.5">
                    {formatDistanceToNow(entry.createdAt, { addSuffix: true })}
                  </p>
                </div>
              </button>
              {/* Action row */}
              {entry.type === "comment" && (
                <div className="ml-9 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity -mt-0.5 mb-1">
                  <button
                    onClick={() => onReply(entry.activityKey)}
                    className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                  >
                    <MessageSquare className="h-2.5 w-2.5" /> Reply
                  </button>
                  {entry.userId === currentUserId && (
                    <button
                      onClick={() => onDelete(entry.id)}
                      className="text-[9px] text-muted-foreground hover:text-destructive flex items-center gap-0.5"
                    >
                      <Trash2 className="h-2.5 w-2.5" /> Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

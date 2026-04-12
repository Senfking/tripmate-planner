import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X, Users, ThumbsUp, ThumbsDown, Flame, HelpCircle, MessageSquare } from "lucide-react";
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
  activityKey: string;
  activityLabel: string;
  sectionId: string;
  emoji?: string;
  text?: string;
  createdAt: Date;
};

export function GroupActivityPanel({ planId, result, allDays, onScrollTo, onClose }: Props) {
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

  // Fetch profile names
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

  return (
    <div className="fixed inset-0 z-[10001] flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-card border-r border-border h-full overflow-y-auto animate-slide-in-left shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Group activity</h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-accent transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          {/* Stats */}
          <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
            <span>{reactions.length} reactions</span>
            <span>·</span>
            <span>{comments.length} comments</span>
            <span>·</span>
            <span>{uniqueMembers} members active</span>
          </div>
        </div>

        {feed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <Users className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No activity yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Reactions and comments from your group will appear here</p>
          </div>
        ) : (
          <div className="px-4 py-3 space-y-4">
            {groups.today.length > 0 && (
              <FeedSection label="Today" entries={groups.today} onScrollTo={onScrollTo} onClose={onClose} />
            )}
            {groups.yesterday.length > 0 && (
              <FeedSection label="Yesterday" entries={groups.yesterday} onScrollTo={onScrollTo} onClose={onClose} />
            )}
            {groups.earlier.length > 0 && (
              <FeedSection label="Earlier" entries={groups.earlier} onScrollTo={onScrollTo} onClose={onClose} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FeedSection({ label, entries, onScrollTo, onClose }: { label: string; entries: FeedEntry[]; onScrollTo: (id: string) => void; onClose: () => void }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">{label}</p>
      <div className="space-y-1.5">
        {entries.map((entry) => {
          const EmojiInfo = entry.emoji ? EMOJI_MAP[entry.emoji] : null;
          return (
            <button
              key={entry.id}
              onClick={() => {
                if (entry.sectionId) {
                  onClose();
                  setTimeout(() => onScrollTo(entry.sectionId), 200);
                }
              }}
              className="w-full text-left flex gap-2 p-2 rounded-lg hover:bg-accent/50 transition-colors group"
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
          );
        })}
      </div>
    </div>
  );
}
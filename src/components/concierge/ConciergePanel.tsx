import { useState, useRef, useEffect, useCallback } from "react";
import { X, Sparkles, Send, ThumbsUp, Star, MapPin, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useConcierge, type ConciergeSuggestion, type ConciergeMessage } from "@/hooks/useConcierge";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { AITripResult, AIActivity } from "@/components/trip-results/useResultsState";

interface Props {
  tripId: string;
  open: boolean;
  onClose: () => void;
  tripResult?: AITripResult | null;
  memberCount?: number;
  onAddToPlan?: (dayDate: string, activity: AIActivity) => void;
}

const QUICK_PILLS = [
  { label: "Tonight", query: "What should we do tonight?" },
  { label: "Tomorrow", query: "What should we do tomorrow?" },
  { label: "Restaurants", query: "Best restaurants nearby" },
  { label: "Nightlife", query: "Best nightlife and bars" },
  { label: "Beach", query: "Best beach spots and activities" },
  { label: "Wellness", query: "Spa, yoga, and wellness options" },
  { label: "Culture", query: "Cultural attractions and museums" },
  { label: "Events", query: "What events are happening this week?" },
];

function buildContext(tripResult?: AITripResult | null, memberCount?: number) {
  const dest = tripResult?.destinations?.[0];
  const ctx: any = {
    destination: dest?.name || tripResult?.trip_title || "Unknown",
    group_size: memberCount || 2,
  };
  if (dest?.cost_profile) {
    ctx.budget_level = dest.cost_profile.budget_level || "mid-range";
  }
  if (dest?.accommodation) {
    ctx.hotel_location = {
      name: dest.accommodation.name,
      lat: 0,
      lng: 0,
    };
  }
  return ctx;
}

function SuggestionCard({
  suggestion,
  messageId,
  index,
  getReactionInfo,
  onToggleReaction,
  tripDays,
  onAddToPlan,
}: {
  suggestion: ConciergeSuggestion;
  messageId: string;
  index: number;
  getReactionInfo: (msgId: string, idx: number) => { count: number; hasReacted: boolean; isGroupPick: boolean };
  onToggleReaction: (msgId: string, idx: number) => void;
  tripDays?: { date: string; dayNumber: number }[];
  onAddToPlan?: (dayDate: string, activity: AIActivity) => void;
}) {
  const [showDayPicker, setShowDayPicker] = useState(false);
  const { count, hasReacted, isGroupPick } = getReactionInfo(messageId, index);

  const handleAddToPlan = (dayDate: string) => {
    if (!onAddToPlan) return;
    const activity: AIActivity = {
      title: suggestion.name,
      description: suggestion.why || "",
      category: suggestion.category || "experience",
      start_time: suggestion.best_time?.split("-")[0] || "12:00",
      duration_minutes: 60,
      estimated_cost_per_person: suggestion.estimated_cost_per_person,
      currency: suggestion.currency || "USD",
      location_name: suggestion.address || "",
      latitude: suggestion.lat,
      longitude: suggestion.lng,
      google_maps_url: suggestion.googleMapsUrl,
      booking_url: null,
      photo_query: null,
      tips: null,
      dietary_notes: null,
    };
    onAddToPlan(dayDate, activity);
    setShowDayPicker(false);
    toast.success(`Added "${suggestion.name}" to plan`);
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm min-w-[260px] max-w-[300px] shrink-0">
      {/* Photo */}
      <div className="w-full h-[100px] bg-muted overflow-hidden">
        {suggestion.photo_url ? (
          <img
            src={suggestion.photo_url}
            alt={suggestion.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-accent/30">
            <MapPin className="h-6 w-6 text-muted-foreground/40" />
          </div>
        )}
      </div>

      <div className="p-2.5 space-y-1.5">
        {/* Name + category */}
        <div className="flex items-start justify-between gap-1">
          <h4 className="text-xs font-semibold text-foreground leading-snug line-clamp-1">{suggestion.name}</h4>
          <span className="text-[8px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary whitespace-nowrap shrink-0">
            {suggestion.category}
          </span>
        </div>

        {isGroupPick && (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-[#0D9488] bg-[#0D9488]/10 px-1.5 py-0.5 rounded-full">
            <Users className="h-2.5 w-2.5" /> Group pick
          </span>
        )}

        {/* Rating */}
        {suggestion.rating != null && (
          <div className="flex items-center gap-1 text-[10px]">
            <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
            <span className="font-medium">{suggestion.rating.toFixed(1)}</span>
            {suggestion.totalRatings && (
              <span className="text-muted-foreground">({suggestion.totalRatings})</span>
            )}
          </div>
        )}

        {/* Why */}
        {suggestion.why && (
          <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{suggestion.why}</p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground flex-wrap">
          {suggestion.best_time && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" /> {suggestion.best_time}
            </span>
          )}
          {suggestion.estimated_cost_per_person != null && (
            <span className="font-mono">
              ~{suggestion.currency || "USD"}{suggestion.estimated_cost_per_person}/pp
            </span>
          )}
          {suggestion.distance_km != null && (
            <span>{suggestion.distance_km}km away</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <button
            onClick={() => onToggleReaction(messageId, index)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${
              hasReacted
                ? "bg-[#0D9488]/10 text-[#0D9488]"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <ThumbsUp className={`h-3 w-3 ${hasReacted ? "fill-current" : ""}`} />
            {count > 0 && count}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowDayPicker(!showDayPicker)}
              className="text-[10px] font-medium text-[#0D9488] hover:bg-[#0D9488]/10 px-2 py-1 rounded-lg transition-colors"
            >
              Add to plan
            </button>
            {showDayPicker && tripDays && tripDays.length > 0 && (
              <div className="absolute bottom-full right-0 mb-1 bg-card border border-border rounded-lg shadow-lg p-1 z-30 min-w-[140px] animate-fade-in">
                {tripDays.map((d) => (
                  <button
                    key={d.date}
                    onClick={() => handleAddToPlan(d.date)}
                    className="w-full text-left px-2 py-1.5 text-[10px] rounded hover:bg-accent transition-colors"
                  >
                    Day {d.dayNumber} — {d.date}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingSuggestions() {
  return (
    <div className="flex gap-2 overflow-x-auto px-3 pb-2 scrollbar-hide">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-border bg-card overflow-hidden min-w-[260px] shrink-0">
          <Skeleton className="w-full h-[100px] rounded-none" />
          <div className="p-2.5 space-y-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConciergePanel({ tripId, open, onClose, tripResult, memberCount, onAddToPlan }: Props) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const context = buildContext(tripResult, memberCount);
  const { messages, loadingMessages, sending, sendMessage, toggleReaction, getReactionInfo } = useConcierge(tripId, context);

  const destination = context.destination;

  // Derive trip days from result
  const tripDays = tripResult?.destinations?.flatMap(d =>
    d.days.map(day => ({ date: day.date, dayNumber: day.day_number }))
  ) || [];

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    const q = input.trim();
    setInput("");
    try {
      await sendMessage(q);
    } catch {
      toast.error("Failed to get suggestions. Try again.");
    }
  }, [input, sending, sendMessage]);

  const handlePill = useCallback(async (query: string) => {
    try {
      await sendMessage(query);
    } catch {
      toast.error("Failed to get suggestions.");
    }
  }, [sendMessage]);

  if (!open) return null;

  const panelContent = (
    <div
      className={`flex flex-col bg-background ${
        isDesktop
          ? "fixed top-0 right-0 h-full w-[400px] border-l border-border shadow-2xl z-50 animate-slide-in-right"
          : "fixed bottom-0 left-0 right-0 h-[70vh] rounded-t-2xl border-t border-border shadow-2xl z-50 animate-slide-up"
      }`}
      style={isDesktop ? { backdropFilter: "blur(12px)", background: "hsl(var(--background) / 0.95)" } : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-[#0D9488]" />
            Ask Junto
          </h3>
          <p className="text-[10px] text-muted-foreground">What do you want to do?</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Quick pills */}
      <div className="flex gap-1.5 overflow-x-auto px-3 py-2 border-b border-border/50 shrink-0 scrollbar-hide">
        {QUICK_PILLS.map((pill) => (
          <button
            key={pill.label}
            onClick={() => handlePill(pill.query)}
            disabled={sending}
            className="shrink-0 text-[10px] font-medium px-2.5 py-1 rounded-full border border-border bg-accent/30 text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {loadingMessages ? (
          <div className="flex items-center justify-center h-32">
            <Skeleton className="h-4 w-32" />
          </div>
        ) : messages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-14 h-14 rounded-full bg-[#0D9488]/10 flex items-center justify-center mb-3">
              <Sparkles className="h-7 w-7 text-[#0D9488]" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">I'm your trip concierge</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Ask me anything about what to do in {destination}
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "user" ? (
                <div className="max-w-[85%] bg-[#0D9488] text-white px-3 py-2 rounded-2xl rounded-br-md">
                  <p className="text-xs">{msg.content}</p>
                </div>
              ) : (
                <div className="max-w-full space-y-2">
                  {msg.content && (
                    <div className="bg-accent/50 px-3 py-2 rounded-2xl rounded-bl-md">
                      <p className="text-xs text-foreground">{msg.content}</p>
                    </div>
                  )}
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {msg.suggestions.map((s, i) => (
                        <SuggestionCard
                          key={`${msg.id}-${i}`}
                          suggestion={s}
                          messageId={msg.id}
                          index={i}
                          getReactionInfo={getReactionInfo}
                          onToggleReaction={toggleReaction}
                          tripDays={tripDays}
                          onAddToPlan={onAddToPlan}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {sending && <LoadingSuggestions />}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border px-3 py-2 flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Where should we eat? What's fun tonight?"
          className="flex-1 text-xs bg-accent/30 rounded-xl px-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-[#0D9488] text-foreground placeholder:text-muted-foreground"
          onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          disabled={sending}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="p-2.5 rounded-xl bg-[#0D9488] text-white hover:bg-[#0D9488]/90 transition-colors disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 animate-fade-in"
        onClick={onClose}
      />
      {panelContent}
    </>
  );
}

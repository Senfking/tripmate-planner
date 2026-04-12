import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  X, Utensils, Wine, Music, Compass, Waves, Dumbbell,
  Calendar, Sparkles, Star, MapPin, Clock, ThumbsUp,
  Users, Search, ArrowLeft, Loader2, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useConcierge, type ConciergeSuggestion, type StructuredFilters } from "@/hooks/useConcierge";
import { Skeleton } from "@/components/ui/skeleton";
import type { AITripResult, AIActivity } from "@/components/trip-results/useResultsState";

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */

interface Props {
  tripId: string;
  open: boolean;
  onClose: () => void;
  tripResult?: AITripResult | null;
  memberCount?: number;
  destination?: string;
  onAddToPlan?: (dayDate: string, activity: AIActivity) => void;
}

interface Category {
  id: string;
  label: string;
  icon: React.ReactNode;
  query: string;
  vibes: string[];
}

const CATEGORIES: Category[] = [
  { id: "eat", label: "Eat", icon: <Utensils className="h-5 w-5" />, query: "Best places to eat", vibes: ["Casual", "Date night", "Group", "Local gem", "Instagrammable"] },
  { id: "drink", label: "Drink", icon: <Wine className="h-5 w-5" />, query: "Best bars and drinks", vibes: ["Chill", "Rooftop", "Cocktails", "Wine bar", "Dive bar"] },
  { id: "party", label: "Party", icon: <Music className="h-5 w-5" />, query: "Best nightlife and parties", vibes: ["Beach club", "Club", "Live music", "Rooftop", "Chill bar"] },
  { id: "explore", label: "Explore", icon: <Compass className="h-5 w-5" />, query: "Things to explore and see", vibes: ["Walking tour", "Hidden gem", "Markets", "Architecture", "Nature"] },
  { id: "relax", label: "Relax", icon: <Waves className="h-5 w-5" />, query: "Relaxation and wellness spots", vibes: ["Spa", "Beach", "Pool club", "Yoga", "Nature"] },
  { id: "workout", label: "Workout", icon: <Dumbbell className="h-5 w-5" />, query: "Gyms and fitness activities", vibes: ["Gym", "Running", "CrossFit", "Surf", "Hike"] },
  { id: "events", label: "Events", icon: <Calendar className="h-5 w-5" />, query: "Events and things happening", vibes: ["Festivals", "Markets", "Concerts", "Sports", "Pop-ups"] },
  { id: "surprise", label: "Surprise me", icon: <Sparkles className="h-5 w-5" />, query: "Surprise us with something unexpected", vibes: ["Weird", "Unique", "Adventurous", "Budget-friendly", "Luxury"] },
];

const WHEN_OPTIONS = ["Now", "Tonight", "Tomorrow", "This weekend"];
const BUDGET_OPTIONS = ["Budget", "Mid-range", "Treat yourself"];

type Stage = "what" | "refine" | "results";

interface RecentSearch {
  label: string;
  query: string;
  messageId: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildConciergeContext(tripResult?: AITripResult | null, memberCount?: number) {
  const dest = tripResult?.destinations?.[0];
  return {
    destination: dest?.name || tripResult?.trip_title || "Unknown",
    group_size: memberCount || 2,
    budget_level: dest?.cost_profile ? "mid-range" : undefined,
    hotel_location: dest?.accommodation
      ? { name: dest.accommodation.name, lat: 0, lng: 0 }
      : undefined,
  } as {
    destination: string;
    date?: string;
    time_of_day?: string;
    group_size?: number;
    budget_level?: string;
    preferences?: string[];
    hotel_location?: { name: string; lat: number; lng: number };
  };
}

/* ------------------------------------------------------------------ */
/*  SuggestionCard                                                     */
/* ------------------------------------------------------------------ */

function SuggestionCard({
  suggestion, messageId, index, getReactionInfo, onToggleReaction, tripDays, onAddToPlan,
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
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm animate-fade-in">
      {/* Photo */}
      <div className="w-full h-[140px] bg-muted overflow-hidden relative">
        {suggestion.photo_url ? (
          <img src={suggestion.photo_url} alt={suggestion.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-accent/30">
            <MapPin className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}
        {isGroupPick && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-bold text-white bg-[#0D9488] px-2 py-0.5 rounded-full shadow-sm">
            <Users className="h-3 w-3" /> Group pick
          </span>
        )}
        {suggestion.is_event ? (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-amber-500/90 text-white backdrop-blur-sm animate-pulse">
            <Calendar className="h-3 w-3" /> Live Event
          </span>
        ) : (
          <span className="absolute top-2 right-2 text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-black/50 text-white backdrop-blur-sm">
            {suggestion.category}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2">
        {/* Name + rating */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold text-foreground leading-snug line-clamp-1">{suggestion.name}</h4>
          {suggestion.rating != null && (
            <div className="flex items-center gap-0.5 text-xs shrink-0">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span className="font-medium">{suggestion.rating.toFixed(1)}</span>
              {suggestion.totalRatings != null && (
                <span className="text-muted-foreground text-[10px]">({suggestion.totalRatings})</span>
              )}
            </div>
          )}
        </div>

        {/* Why */}
        {suggestion.why && (
          <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{suggestion.why}</p>
        )}

        {/* Event details */}
        {suggestion.is_event && suggestion.event_details && (
          <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400 leading-snug">
            {suggestion.event_details}
          </p>
        )}

        {/* Meta */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
          {suggestion.best_time && (
            <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" /> {suggestion.best_time}</span>
          )}
          {suggestion.estimated_cost_per_person != null && (
            <span className="font-mono">~{suggestion.currency || "USD"} {suggestion.estimated_cost_per_person}/pp</span>
          )}
          {suggestion.distance_km != null && <span>{suggestion.distance_km}km away</span>}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <button
            onClick={() => onToggleReaction(messageId, index)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${hasReacted ? "bg-[#0D9488]/10 text-[#0D9488]" : "text-muted-foreground hover:bg-accent"}`}
          >
            <ThumbsUp className={`h-3.5 w-3.5 ${hasReacted ? "fill-current" : ""}`} />
            {count > 0 && count}
          </button>

          <div className="flex items-center gap-1">
            {suggestion.googleMapsUrl && (
              <a
                href={suggestion.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-accent transition-colors"
              >
                <ExternalLink className="h-3 w-3" /> Maps
              </a>
            )}
            <div className="relative">
              <button
                onClick={() => setShowDayPicker(!showDayPicker)}
                className="text-xs font-medium text-[#0D9488] hover:bg-[#0D9488]/10 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                + Add to plan
              </button>
              {showDayPicker && tripDays && tripDays.length > 0 && (
                <div className="absolute bottom-full right-0 mb-1 bg-card border border-border rounded-lg shadow-lg p-1 z-30 min-w-[140px] animate-fade-in">
                  {tripDays.map((d) => (
                    <button key={d.date} onClick={() => handleAddToPlan(d.date)} className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors">
                      Day {d.dayNumber} — {d.date}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function LoadingSkeleton() {
  return (
    <div className="space-y-3 px-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
          <Skeleton className="w-full h-[140px] rounded-none" />
          <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Breadcrumb pill                                                    */
/* ------------------------------------------------------------------ */

function FilterPill({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 text-[10px] font-medium px-2.5 py-1 rounded-full bg-[#0D9488]/10 text-[#0D9488] hover:bg-[#0D9488]/20 transition-colors"
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function ConciergePanel({ tripId, open, onClose, tripResult, memberCount, destination: destinationProp, onAddToPlan }: Props) {
  const [stage, setStage] = useState<Stage>("what");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedWhen, setSelectedWhen] = useState<string[]>([]);
  const [selectedVibe, setSelectedVibe] = useState<string[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [searchStartedAt, setSearchStartedAt] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const conciergeContext = buildConciergeContext(tripResult, memberCount);
  const destination = destinationProp || conciergeContext.destination;
  conciergeContext.destination = destination;
  const {
    messages,
    activeResult,
    sending,
    sendMessage,
    sendStructuredRequest,
    toggleReaction,
    getReactionInfo,
  } = useConcierge(tripId, conciergeContext);

  const tripDays = tripResult?.destinations?.flatMap(d =>
    d.days.map(day => ({ date: day.date, dayNumber: day.day_number }))
  ) || [];

  const latestResults = useMemo(() =>
    [...messages].reverse().find(
      m => m.role === "assistant" && m.suggestions && m.suggestions.length > 0
    ), [messages]);

  const displayedResults = useMemo(() => {
    if (activeResult) return activeResult;
    if (!searchStartedAt) return latestResults ?? null;
    if (!latestResults) return null;
    return new Date(latestResults.created_at).getTime() >= searchStartedAt
      ? latestResults
      : null;
  }, [activeResult, latestResults, searchStartedAt]);

  const recentSearches = useMemo<RecentSearch[]>(() => {
    const searches: RecentSearch[] = [];
    for (let i = messages.length - 1; i >= 0 && searches.length < 3; i--) {
      const msg = messages[i];
      if (msg.role === "user" && msg.content) {
        const next = messages[i + 1];
        if (next?.role === "assistant" && next.suggestions?.length) {
          const label = msg.content.length > 25
            ? msg.content.slice(0, 25) + "…"
            : msg.content;
          searches.push({ label, query: msg.content, messageId: next.id });
        }
      }
    }
    return searches;
  }, [messages]);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setStage("what");
        setSelectedCategory(null);
        setSelectedWhen([]);
        setSelectedVibe([]);
        setSelectedBudget([]);
        setFreeText("");
        setSearchStartedAt(null);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  const doSearch = useCallback(async (
    category: Category | null,
    when: string[],
    vibe: string[],
    budget: string[],
    text?: string,
  ) => {
    setSearchStartedAt(Date.now());
    setStage("results");
    try {
      if (text) {
        await sendMessage(text);
      } else if (category) {
        await sendStructuredRequest({
          category: category.id,
          when: when.length ? when : undefined,
          vibe: vibe.length ? vibe : undefined,
          budget: budget.length ? budget : undefined,
        });
      }
    } catch {
      toast.error("Couldn't find suggestions. Try again.");
    }
  }, [sendMessage, sendStructuredRequest]);

  const handleCategorySelect = (cat: Category) => {
    setSelectedCategory(cat);
    setStage("refine");
  };

  const handleFreeTextSubmit = () => {
    if (!freeText.trim()) return;
    doSearch(null, [], [], [], freeText.trim());
  };

  const toggleArrayItem = (arr: string[], item: string): string[] =>
    arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];

  const handleWhenSelect = (when: string) => {
    setSelectedWhen(prev => toggleArrayItem(prev, when));
  };

  const handleVibeSelect = (vibe: string) => {
    setSelectedVibe(prev => toggleArrayItem(prev, vibe));
  };

  const handleBudgetSelect = (budget: string) => {
    setSelectedBudget(prev => toggleArrayItem(prev, budget));
  };

  const handleFindSpots = () => {
    doSearch(selectedCategory, selectedWhen, selectedVibe, selectedBudget);
  };

  const handleRecentSearch = (_search: RecentSearch) => {
    setSearchStartedAt(null);
    setStage("results");
  };

  const handleBack = () => {
    if (stage === "results") {
      setStage(selectedCategory ? "refine" : "what");
    } else if (stage === "refine") {
      setStage("what");
      setSelectedCategory(null);
      setSelectedWhen(null);
      setSelectedVibe(null);
      setSelectedBudget(null);
    } else {
      onClose();
    }
  };

  const resetToWhat = () => {
    setStage("what");
    setSelectedCategory(null);
    setSelectedWhen(null);
    setSelectedVibe(null);
    setSelectedBudget(null);
    setSearchStartedAt(null);
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40 animate-fade-in" onClick={onClose} />

      {/* Full-screen overlay */}
      <div className="fixed inset-0 z-50 flex flex-col bg-background animate-slide-up overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            {stage !== "what" && (
              <button onClick={handleBack} className="p-1.5 -ml-1.5 rounded-lg hover:bg-accent transition-colors">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-sm font-semibold text-foreground">Discover in {destination}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">

          {/* =================== STAGE 1: WHAT =================== */}
          {stage === "what" && (
            <div className="px-4 py-6 space-y-6 animate-fade-in">
              <h3 className="text-xl font-bold text-foreground text-center">
                What are you looking for?
              </h3>

              {/* Category grid */}
              <div className="grid grid-cols-2 gap-3">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat)}
                    className="relative flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-card hover:bg-accent/50 hover:border-[#0D9488]/30 transition-all active:scale-95"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#0D9488]/10 text-[#0D9488] flex items-center justify-center">
                      {cat.icon}
                    </div>
                    <span className="text-xs font-medium text-foreground">{cat.label}</span>
                    {cat.id === "events" && (
                      <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-destructive animate-pulse" />
                    )}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 border-t border-border" />
              </div>

              {/* Free text */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    placeholder="Or describe what you want..."
                    className="w-full text-sm bg-accent/30 rounded-xl pl-9 pr-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-[#0D9488] text-foreground placeholder:text-muted-foreground"
                    onKeyDown={(e) => { if (e.key === "Enter") handleFreeTextSubmit(); }}
                  />
                </div>
                <button
                  onClick={handleFreeTextSubmit}
                  disabled={!freeText.trim()}
                  className="px-4 py-2.5 rounded-xl bg-[#0D9488] text-white text-sm font-medium hover:bg-[#0D9488]/90 transition-colors disabled:opacity-40"
                >
                  Go
                </button>
              </div>

              {/* Recent searches */}
              {recentSearches.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Recent searches</p>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => handleRecentSearch(s)}
                        className="text-xs px-3 py-1.5 rounded-full border border-border bg-card text-foreground hover:bg-accent/50 transition-colors"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =================== STAGE 2: REFINE =================== */}
          {stage === "refine" && selectedCategory && (
            <div className="px-4 py-6 space-y-5 animate-fade-in">
              {/* When */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">When?</h3>
                <div className="flex flex-wrap gap-2">
                  {WHEN_OPTIONS.map((w) => (
                    <button
                      key={w}
                      onClick={() => handleWhenSelect(w)}
                      className={`px-4 py-2 rounded-full text-xs font-medium border transition-all ${
                        selectedWhen === w
                          ? "bg-[#0D9488] text-white border-[#0D9488]"
                          : "border-border bg-card text-foreground hover:bg-accent/50"
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vibe */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Vibe?</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedCategory.vibes.map((v) => (
                    <button
                      key={v}
                      onClick={() => handleVibeSelect(v)}
                      className={`px-4 py-2 rounded-full text-xs font-medium border transition-all ${
                        selectedVibe === v
                          ? "bg-[#0D9488] text-white border-[#0D9488]"
                          : "border-border bg-card text-foreground hover:bg-accent/50"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Budget */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Budget?</h3>
                <div className="flex flex-wrap gap-2">
                  {BUDGET_OPTIONS.map((b) => (
                    <button
                      key={b}
                      onClick={() => handleBudgetSelect(b)}
                      className={`px-4 py-2 rounded-full text-xs font-medium border transition-all ${
                        selectedBudget === b
                          ? "bg-[#0D9488] text-white border-[#0D9488]"
                          : "border-border bg-card text-foreground hover:bg-accent/50"
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* Find spots button */}
              <button
                onClick={handleFindSpots}
                disabled={sending}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0D9488] text-white text-sm font-semibold hover:bg-[#0D9488]/90 transition-colors disabled:opacity-50"
              >
                <Search className="h-4 w-4" />
                Find spots
              </button>

              <button
                onClick={handleFindSpots}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip filters — show results
              </button>
            </div>
          )}

          {/* =================== STAGE 3: RESULTS =================== */}
          {stage === "results" && (
            <div className="py-3 animate-fade-in">
              {/* Breadcrumb pills */}
              {(selectedCategory || selectedWhen || selectedVibe || selectedBudget) && (
                <div className="flex items-center gap-1.5 px-4 pb-3 overflow-x-auto scrollbar-hide">
                  {selectedCategory && (
                    <FilterPill label={selectedCategory.label} onClick={() => { setStage("what"); setSelectedCategory(null); setSelectedWhen(null); setSelectedVibe(null); setSelectedBudget(null); }} />
                  )}
                  {selectedWhen && (
                    <FilterPill label={selectedWhen} onClick={() => { setStage("refine"); setSelectedWhen(null); }} />
                  )}
                  {selectedVibe && (
                    <FilterPill label={selectedVibe} onClick={() => { setStage("refine"); setSelectedVibe(null); }} />
                  )}
                  {selectedBudget && (
                    <FilterPill label={selectedBudget} onClick={() => { setStage("refine"); setSelectedBudget(null); }} />
                  )}
                </div>
              )}

              {sending ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-2 py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-[#0D9488]" />
                    <span className="text-sm text-muted-foreground">Finding the best spots…</span>
                  </div>
                  <LoadingSkeleton />
                </div>
              ) : latestResults ? (
                <div className="space-y-3">
                  {latestResults.content && (
                    <p className="text-sm text-muted-foreground px-4">{latestResults.content}</p>
                  )}

                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">
                    Recommended spots
                  </p>

                  <div className="space-y-3 px-4">
                    {latestResults.suggestions!.map((s, i) => (
                      <SuggestionCard
                        key={`${latestResults.id}-${i}`}
                        suggestion={s}
                        messageId={latestResults.id}
                        index={i}
                        getReactionInfo={getReactionInfo}
                        onToggleReaction={toggleReaction}
                        tripDays={tripDays}
                        onAddToPlan={onAddToPlan}
                      />
                    ))}
                  </div>

                  {/* Bottom actions */}
                  <div className="px-4 pt-3 space-y-2 pb-6">
                    <button
                      onClick={() => setStage("refine")}
                      className="w-full py-2.5 rounded-xl text-xs font-medium text-[#0D9488] hover:bg-[#0D9488]/10 transition-colors"
                    >
                      Try different filters
                    </button>
                    <button
                      onClick={resetToWhat}
                      className="w-full py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-accent/50 transition-colors"
                    >
                      Search something else
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                  <p className="text-sm text-muted-foreground">No results found. Try a different search.</p>
                  <button onClick={resetToWhat} className="mt-3 text-sm font-medium text-[#0D9488] hover:underline">
                    Start over
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

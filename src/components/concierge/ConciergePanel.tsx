import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  X, Utensils, Wine, Music, Compass, Waves, Dumbbell,
  CalendarHeart, Sparkles, Star, MapPin, Clock, ThumbsUp,
  Users, Search, ArrowLeft, Loader2, ExternalLink,
  Palette, Wallet, ChefHat, Armchair, Disc3, Zap, Map,
  Heart, Activity, Ticket, Navigation, Lightbulb, Signal,
  Dice5, Gem,
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
  tripName?: string;
  onAddToPlan?: (dayDate: string, activity: AIActivity) => void;
}

interface Category {
  id: string;
  label: string;
  tagline: string;
  icon: React.ReactNode;
  gradient: string;
  query: string;
}

interface FilterSection {
  key: string;
  label: string;
  icon: React.ReactNode;
  options: string[];
}

const CATEGORIES: Category[] = [
  { id: "eat", label: "Eat", tagline: "From street food to fine dining", icon: <Utensils className="h-7 w-7" />, gradient: "from-orange-400/80 to-amber-500/80", query: "Best places to eat" },
  { id: "drink", label: "Drink", tagline: "Hidden bars to sunset spots", icon: <Wine className="h-7 w-7" />, gradient: "from-purple-500/80 to-violet-600/80", query: "Best bars and drinks" },
  { id: "party", label: "Party", tagline: "Where the night takes you", icon: <Music className="h-7 w-7" />, gradient: "from-pink-500/80 to-rose-500/80", query: "Best nightlife and parties" },
  { id: "explore", label: "Explore", tagline: "Beyond the guidebook", icon: <Compass className="h-7 w-7" />, gradient: "from-sky-500/80 to-blue-500/80", query: "Things to explore and see" },
  { id: "relax", label: "Relax", tagline: "Your reset button", icon: <Waves className="h-7 w-7" />, gradient: "from-emerald-400/80 to-green-500/80", query: "Relaxation and wellness spots" },
  { id: "workout", label: "Workout", tagline: "Don't skip travel day", icon: <Dumbbell className="h-7 w-7" />, gradient: "from-slate-400/80 to-slate-500/80", query: "Gyms and fitness activities" },
  { id: "events", label: "Events", tagline: "Happening right now", icon: <CalendarHeart className="h-7 w-7" />, gradient: "from-red-400/80 to-orange-400/80", query: "Events and things happening" },
  { id: "surprise", label: "Surprise me", tagline: "Trust us on this one", icon: <Sparkles className="h-7 w-7" />, gradient: "from-teal-400/80 to-cyan-500/80", query: "Surprise us with something unexpected" },
];

const CATEGORY_FILTERS: Record<string, FilterSection[]> = {
  eat: [
    { key: "when", label: "When", icon: <Clock className="h-4 w-4" />, options: ["Breakfast", "Brunch", "Lunch", "Dinner", "Late night munchies"] },
    { key: "vibe", label: "Cuisine", icon: <ChefHat className="h-4 w-4" />, options: ["Local must-try", "Seafood", "Asian fusion", "Mediterranean", "Healthy", "Street food", "Fine dining", "Vegan friendly"] },
    { key: "budget", label: "Setting", icon: <Armchair className="h-4 w-4" />, options: ["Ocean view", "Rice paddy views", "Jungle setting", "Hidden alley gem", "Instagrammable", "Authentic no-frills", "Chef's table"] },
    // We'll use a 4th row for actual budget
  ],
  drink: [
    { key: "when", label: "When", icon: <Clock className="h-4 w-4" />, options: ["Right now", "Golden hour", "After dinner", "Late night", "Tomorrow"] },
    { key: "vibe", label: "Style", icon: <Palette className="h-4 w-4" />, options: ["Beach club", "Speakeasy", "Rooftop", "Pool bar", "Craft cocktails", "Natural wine", "Local spot", "Tiki bar"] },
    { key: "scene", label: "Scene", icon: <Users className="h-4 w-4" />, options: ["Solo exploring", "Couple", "Squad night", "Meet locals"] },
    { key: "budget", label: "Budget", icon: <Wallet className="h-4 w-4" />, options: ["Cheap & cheerful", "Worth the spend", "Go all out"] },
  ],
  party: [
    { key: "when", label: "When", icon: <Clock className="h-4 w-4" />, options: ["Pre-drinks now", "Tonight", "Best night this week", "This weekend"] },
    { key: "vibe", label: "Style", icon: <Disc3 className="h-4 w-4" />, options: ["Beach club day party", "Sunset → club", "Live music", "Underground/techno", "Pool party", "Hip-hop & R&B", "Reggae chill", "Full moon / themed"] },
    { key: "energy", label: "Energy", icon: <Zap className="h-4 w-4" />, options: ["Warm up first", "Ready to go", "Dancing till sunrise", "Plan the whole night"] },
  ],
  explore: [
    { key: "when", label: "When", icon: <Clock className="h-4 w-4" />, options: ["Sunrise mission", "Morning", "Full day", "Afternoon", "Golden hour"] },
    { key: "vibe", label: "Type", icon: <Map className="h-4 w-4" />, options: ["Hidden waterfall", "Secret beach", "Temple nobody visits", "Local market", "Motorbike adventure", "Photography spots", "Cultural deep dive", "Viewpoint"] },
  ],
  relax: [
    { key: "when", label: "When", icon: <Clock className="h-4 w-4" />, options: ["This morning", "Afternoon reset", "Full day off"] },
    { key: "vibe", label: "Type", icon: <Heart className="h-4 w-4" />, options: ["Traditional spa", "Beach club", "Yoga", "Sound healing", "Hot springs", "Quiet beach", "Float therapy", "Meditation"] },
  ],
  workout: [
    { key: "when", label: "When", icon: <Clock className="h-4 w-4" />, options: ["Early morning", "Anytime"] },
    { key: "vibe", label: "Type", icon: <Activity className="h-4 w-4" />, options: ["CrossFit box", "Muay Thai", "Surf lesson", "Yoga flow", "Outdoor bootcamp", "Proper gym", "BJJ / martial arts", "Rock climbing"] },
  ],
  events: [
    { key: "when", label: "When", icon: <Clock className="h-4 w-4" />, options: ["Tonight", "Tomorrow", "This weekend", "This week", "Coming up"] },
    { key: "vibe", label: "Type", icon: <Ticket className="h-4 w-4" />, options: ["DJ / electronic", "Live band", "Art / exhibition", "Food market", "Full moon", "Cultural ceremony", "Pop-up", "Sports screening"] },
  ],
  surprise: [
    { key: "when", label: "When", icon: <Clock className="h-4 w-4" />, options: ["Now", "Tonight", "Tomorrow", "This weekend"] },
    { key: "vibe", label: "Vibe", icon: <Sparkles className="h-4 w-4" />, options: ["Weird & wonderful", "Adventurous", "Romantic", "Budget-friendly", "Luxury treat"] },
  ],
};

// Add budget row to eat
CATEGORY_FILTERS.eat.push({ key: "price", label: "Budget", icon: <Wallet className="h-4 w-4" />, options: ["Under $10", "Worth the splurge", "Treat ourselves"] });

type Stage = "what" | "refine" | "results";

interface RecentSearch {
  label: string;
  query: string;
  messageId: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function resolveDestination(
  destinationProp?: string,
  tripResult?: AITripResult | null,
  tripName?: string,
): string {
  if (destinationProp && destinationProp !== "Unknown") return destinationProp;
  const dest = tripResult?.destinations?.[0];
  if (dest?.name) return dest.name;
  if (tripResult?.trip_title) return tripResult.trip_title;
  if (tripName) return tripName;
  return "";
}

function buildConciergeContext(destination: string, tripResult?: AITripResult | null, memberCount?: number) {
  const dest = tripResult?.destinations?.[0];
  return {
    destination: destination || "Unknown",
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
  suggestion, messageId, index, getReactionInfo, onToggleReaction, tripDays, onAddToPlan, animDelay,
}: {
  suggestion: ConciergeSuggestion;
  messageId: string;
  index: number;
  getReactionInfo: (msgId: string, idx: number) => { count: number; hasReacted: boolean; isGroupPick: boolean };
  onToggleReaction: (msgId: string, idx: number) => void;
  tripDays?: { date: string; dayNumber: number }[];
  onAddToPlan?: (dayDate: string, activity: AIActivity) => void;
  animDelay?: number;
}) {
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [expanded, setExpanded] = useState(false);
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

  const s = suggestion as any;

  return (
    <div
      className="rounded-xl border border-border bg-card overflow-hidden shadow-sm"
      style={{ animation: `fade-in 0.3s ease-out ${(animDelay || 0)}ms both` }}
    >
      {/* Photo */}
      <div className="w-full h-[160px] bg-muted overflow-hidden relative">
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
            <CalendarHeart className="h-3 w-3" /> Live Event
          </span>
        ) : (
          <span className="absolute top-2 right-2 text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-black/50 text-white backdrop-blur-sm">
            {suggestion.category}
          </span>
        )}
      </div>

      <div className="p-3.5 space-y-2.5">
        {/* Name + rating */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold text-foreground leading-snug line-clamp-1">{suggestion.name}</h4>
          {suggestion.rating != null && (
            <div className="flex items-center gap-0.5 text-xs shrink-0">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
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

        {/* Pro tip / What to order / Best night callouts */}
        {s.pro_tip && (
          <div className="flex gap-2 p-2.5 rounded-lg bg-[#0D9488]/5 border-l-2 border-[#0D9488]">
            <Lightbulb className="h-3.5 w-3.5 text-[#0D9488] shrink-0 mt-0.5" />
            <p className="text-[11px] text-foreground leading-snug"><span className="font-semibold">Pro tip:</span> {s.pro_tip}</p>
          </div>
        )}
        {s.what_to_order && (
          <div className="flex gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/10 border-l-2 border-amber-400">
            <Utensils className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-foreground leading-snug"><span className="font-semibold">What to order:</span> {s.what_to_order}</p>
          </div>
        )}
        {s.specific_night && (
          <div className="flex gap-2 p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/10 border-l-2 border-purple-400">
            <CalendarHeart className="h-3.5 w-3.5 text-purple-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-foreground leading-snug"><span className="font-semibold">Best night:</span> {s.specific_night}</p>
          </div>
        )}

        {/* Expandable details */}
        {expanded && (
          <div className="space-y-2 pt-1 animate-fade-in">
            {suggestion.address && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" /> {suggestion.address}
              </p>
            )}
            {s.opening_hours && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0" /> {s.opening_hours}
              </p>
            )}
            {s.full_description && (
              <p className="text-xs text-muted-foreground leading-relaxed">{s.full_description}</p>
            )}
            <div className="flex gap-2 pt-1">
              {suggestion.googleMapsUrl && (
                <a
                  href={suggestion.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-accent text-foreground hover:bg-accent/80 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> View on Google Maps
                </a>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onToggleReaction(messageId, index)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${hasReacted ? "bg-[#0D9488]/10 text-[#0D9488]" : "text-muted-foreground hover:bg-accent"}`}
            >
              <ThumbsUp className={`h-3.5 w-3.5 ${hasReacted ? "fill-current" : ""}`} />
              {count > 0 && count}
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs font-medium text-[#0D9488] hover:bg-[#0D9488]/10 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              {expanded ? "Less" : "More details"}
            </button>
          </div>

          <div className="flex items-center gap-1">
            {!expanded && suggestion.googleMapsUrl && (
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
        <div key={i} className="rounded-xl border border-border bg-card overflow-hidden" style={{ animation: `fade-in 0.3s ease-out ${i * 100}ms both` }}>
          <Skeleton className="w-full h-[160px] rounded-none" />
          <div className="p-3.5 space-y-2.5">
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
      {label} ×
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function ConciergePanel({ tripId, open, onClose, tripResult, memberCount, destination: destinationProp, tripName, onAddToPlan }: Props) {
  const [stage, setStage] = useState<Stage>("what");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  // Multi-select filters stored as Record<filterKey, string[]>
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const [freeText, setFreeText] = useState("");
  const [searchStartedAt, setSearchStartedAt] = useState<number | null>(null);
  const [locationInput, setLocationInput] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const resolvedDest = resolveDestination(destinationProp, tripResult, tripName);
  const [manualLocation, setManualLocation] = useState("");
  const destination = manualLocation || resolvedDest;

  const conciergeContext = buildConciergeContext(destination, tripResult, memberCount);
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
          const label = msg.content.length > 25 ? msg.content.slice(0, 25) + "…" : msg.content;
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
        setSelectedFilters({});
        setFreeText("");
        setSearchStartedAt(null);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  const toggleFilter = (key: string, value: string) => {
    setSelectedFilters(prev => {
      const arr = prev[key] || [];
      return { ...prev, [key]: arr.includes(value) ? arr.filter(x => x !== value) : [...arr, value] };
    });
  };

  const doSearch = useCallback(async (
    category: Category | null,
    filters: Record<string, string[]>,
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
          when: filters.when?.length ? filters.when : undefined,
          vibe: [...(filters.vibe || []), ...(filters.scene || []), ...(filters.energy || [])].length ? [...(filters.vibe || []), ...(filters.scene || []), ...(filters.energy || [])] : undefined,
          budget: [...(filters.budget || []), ...(filters.price || [])].length ? [...(filters.budget || []), ...(filters.price || [])] : undefined,
        });
      }
    } catch {
      toast.error("Couldn't find suggestions. Try again.");
    }
  }, [sendMessage, sendStructuredRequest]);

  const handleCategorySelect = (cat: Category) => {
    setSelectedCategory(cat);
    setSelectedFilters({});
    setStage("refine");
  };

  const handleFreeTextSubmit = () => {
    if (!freeText.trim()) return;
    doSearch(null, {}, freeText.trim());
  };

  const handleFindSpots = () => {
    doSearch(selectedCategory, selectedFilters);
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
      setSelectedFilters({});
    } else {
      onClose();
    }
  };

  const resetToWhat = () => {
    setStage("what");
    setSelectedCategory(null);
    setSelectedFilters({});
    setSearchStartedAt(null);
  };

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&zoom=10`);
          const data = await res.json();
          const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || "your area";
          setManualLocation(city);
          setLocationInput(city);
        } catch {
          toast.error("Could not determine location");
        } finally {
          setGeoLoading(false);
        }
      },
      () => {
        toast.error("Location access denied");
        setGeoLoading(false);
      },
      { timeout: 10000 }
    );
  };

  const currentFilters = selectedCategory ? (CATEGORY_FILTERS[selectedCategory.id] || []) : [];
  const anyFiltersSelected = Object.values(selectedFilters).some(arr => arr.length > 0);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40 animate-fade-in" onClick={onClose} />

      {/* Full-screen overlay */}
      <div className="fixed inset-0 z-50 flex flex-col bg-background animate-slide-up overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        {/* Header with animated gradient */}
        <div className="relative shrink-0">
          <div className="absolute inset-0 bg-gradient-to-r from-[#0D9488]/5 via-[#0EA5E9]/5 to-[#0D9488]/5" style={{ backgroundSize: "200% 100%", animation: "gradient-shift 8s ease infinite" }} />
          <div className="relative flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              {stage !== "what" && (
                <button onClick={handleBack} className="p-1.5 -ml-1.5 rounded-lg hover:bg-accent transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {destination ? `Discover in ${destination}` : "Discover"}
                </h2>
                {stage === "refine" && selectedCategory && (
                  <p className="text-[10px] text-muted-foreground">{selectedCategory.label} · {selectedCategory.tagline}</p>
                )}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: stage === "refine" ? "120px" : "env(safe-area-inset-bottom, 0px)" }}>

          {/* =================== STAGE 1: WHAT =================== */}
          {stage === "what" && (
            <div className="px-4 py-6 space-y-6 animate-fade-in">
              {/* Location input when no destination */}
              {!resolvedDest && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Where are you?</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={locationInput}
                      onChange={(e) => setLocationInput(e.target.value)}
                      onBlur={() => { if (locationInput.trim()) setManualLocation(locationInput.trim()); }}
                      onKeyDown={(e) => { if (e.key === "Enter" && locationInput.trim()) setManualLocation(locationInput.trim()); }}
                      placeholder="e.g. Canggu, Bali"
                      className="flex-1 text-sm bg-accent/30 rounded-xl px-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-[#0D9488] text-foreground placeholder:text-muted-foreground"
                    />
                    <button
                      onClick={handleUseLocation}
                      disabled={geoLoading}
                      className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-border text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      {geoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
                      {geoLoading ? "..." : "Use my location"}
                    </button>
                  </div>
                </div>
              )}

              <h3 className="text-xl font-bold text-foreground text-center">
                What are you looking for?
              </h3>

              {/* Category grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat)}
                    className="relative flex flex-col items-center justify-center gap-2 p-4 h-[120px] rounded-xl overflow-hidden transition-transform active:scale-95 hover:scale-[1.02]"
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${cat.gradient} opacity-90`} />
                    <div className="relative z-10 text-white">
                      {cat.icon}
                    </div>
                    <span className="relative z-10 text-sm font-semibold text-white">{cat.label}</span>
                    <span className="relative z-10 text-[10px] text-white/80 leading-tight text-center">{cat.tagline}</span>
                    {cat.id === "events" && (
                      <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-white animate-pulse z-10" />
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
                  className="px-4 py-2.5 rounded-xl bg-gradient-primary text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
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
              {currentFilters.map((section) => (
                <div key={section.key} className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    {section.icon}
                    {section.label}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {section.options.map((opt) => {
                      const isSelected = (selectedFilters[section.key] || []).includes(opt);
                      return (
                        <button
                          key={opt}
                          onClick={() => toggleFilter(section.key, opt)}
                          className={`px-4 py-2.5 rounded-full text-xs font-medium transition-all active:scale-95 ${
                            isSelected
                              ? "bg-[#0D9488] text-white shadow-md border border-[#0D9488]"
                              : "bg-white dark:bg-card border border-gray-200 dark:border-border text-gray-700 dark:text-foreground hover:border-[#0D9488]/40"
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <button
                onClick={handleFindSpots}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors pt-2"
              >
                Skip filters — show me everything
              </button>
            </div>
          )}

          {/* =================== STAGE 3: RESULTS =================== */}
          {stage === "results" && (
            <div className="py-3 animate-fade-in">
              {/* Breadcrumb pills */}
              {(selectedCategory || anyFiltersSelected) && (
                <div className="flex items-center gap-1.5 px-4 pb-3 overflow-x-auto scrollbar-hide">
                  {selectedCategory && (
                    <FilterPill label={selectedCategory.label} onClick={resetToWhat} />
                  )}
                  {Object.entries(selectedFilters).flatMap(([_key, values]) =>
                    values.map(v => (
                      <FilterPill key={v} label={v} onClick={() => {
                        setStage("refine");
                        toggleFilter(_key, v);
                      }} />
                    ))
                  )}
                </div>
              )}

              {sending ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center justify-center gap-2 py-6">
                    <div className="w-10 h-10 rounded-full bg-[#0D9488]/10 flex items-center justify-center">
                      <Compass className="h-5 w-5 text-[#0D9488] animate-spin" style={{ animationDuration: "3s" }} />
                    </div>
                    <span className="text-sm font-medium text-foreground">Consulting our local sources...</span>
                    <span className="text-[10px] text-muted-foreground animate-pulse">Finding insider picks just for you</span>
                  </div>
                  <LoadingSkeleton />
                </div>
              ) : displayedResults ? (
                <div className="space-y-3">
                  {displayedResults.content && (
                    <p className="text-sm text-muted-foreground px-4">{displayedResults.content}</p>
                  )}

                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">
                    Insider picks
                  </p>

                  <div className="space-y-3 px-4">
                    {displayedResults.suggestions!.map((s, i) => (
                      <SuggestionCard
                        key={`${displayedResults.id}-${i}`}
                        suggestion={s}
                        messageId={displayedResults.id}
                        index={i}
                        getReactionInfo={getReactionInfo}
                        onToggleReaction={toggleReaction}
                        tripDays={tripDays}
                        onAddToPlan={onAddToPlan}
                        animDelay={i * 50}
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

        {/* Fixed CTA button for refine stage */}
        {stage === "refine" && (
          <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3 bg-background/95 backdrop-blur-sm border-t border-border">
            <button
              onClick={handleFindSpots}
              disabled={sending}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg"
            >
              <Sparkles className="h-4 w-4" />
              Show me the gems
            </button>
            <p className="text-center text-[10px] text-muted-foreground mt-1.5 flex items-center justify-center gap-1">
              <Signal className="h-3 w-3" /> Insider picks + live events
            </p>
          </div>
        )}
      </div>
    </>
  );
}

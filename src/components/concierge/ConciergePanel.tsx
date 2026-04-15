import React, { useState, useRef, useEffect, useCallback, useMemo, memo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  X, Utensils, Wine, Music, Compass, Waves, Dumbbell,
  Calendar, CalendarHeart, Sparkles, Star, MapPin, Clock,
  Users, Search, ArrowLeft, Loader2, ExternalLink,
  Palette, Wallet, ChefHat, Armchair, Disc3, Zap, Map,
  Heart, Activity, Ticket, Navigation, Lightbulb, Signal,
  Dice5, Gem, Plus, Check, Bookmark, Globe, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
  tripStartDate?: string;
  tripEndDate?: string;
  onAddToPlan?: (dayDate: string, activity: AIActivity) => void;
}

interface Category {
  id: string;
  label: string;
  tagline: string;
  icon: React.ReactNode;
  gradient: string;
  gradientColor: string;
  photoUrl: string;
  query: string;
}

interface FilterSection {
  key: string;
  label: string;
  icon: React.ReactNode;
  options: string[];
}

// Curated Unsplash photos — specific, always-relevant, fast CDN
const CATEGORIES: Category[] = [
  { id: "eat", label: "Eat", tagline: "From street food to fine dining", icon: <Utensils className="h-7 w-7" />, gradient: "from-orange-400/80 to-amber-500/80", gradientColor: "rgba(251,146,60,0.85)", photoUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=200&fit=crop&q=80", query: "Best places to eat" },
  { id: "drink", label: "Drink", tagline: "Hidden bars to sunset spots", icon: <Wine className="h-7 w-7" />, gradient: "from-purple-500/80 to-violet-600/80", gradientColor: "rgba(168,85,247,0.85)", photoUrl: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=200&fit=crop&q=80", query: "Best bars and drinks" },
  { id: "party", label: "Party", tagline: "Where the night takes you", icon: <Music className="h-7 w-7" />, gradient: "from-pink-500/80 to-rose-500/80", gradientColor: "rgba(236,72,153,0.85)", photoUrl: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&h=200&fit=crop&q=80", query: "Best nightlife and parties" },
  { id: "explore", label: "Explore", tagline: "Beyond the guidebook", icon: <Compass className="h-7 w-7" />, gradient: "from-sky-500/80 to-blue-500/80", gradientColor: "rgba(14,165,233,0.85)", photoUrl: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=400&h=200&fit=crop&q=80", query: "Things to explore and see" },
  { id: "relax", label: "Relax", tagline: "Your reset button", icon: <Waves className="h-7 w-7" />, gradient: "from-emerald-400/80 to-green-500/80", gradientColor: "rgba(52,211,153,0.85)", photoUrl: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=200&fit=crop&q=80", query: "Relaxation and wellness spots" },
  { id: "workout", label: "Workout", tagline: "Don't skip travel day", icon: <Dumbbell className="h-7 w-7" />, gradient: "from-slate-400/80 to-slate-500/80", gradientColor: "rgba(148,163,184,0.85)", photoUrl: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=200&fit=crop&q=80", query: "Gyms and fitness activities" },
  { id: "events", label: "Events", tagline: "Happening right now", icon: <CalendarHeart className="h-7 w-7" />, gradient: "from-red-400/80 to-orange-400/80", gradientColor: "rgba(248,113,113,0.85)", photoUrl: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&h=200&fit=crop&q=80", query: "Events and things happening" },
];

const CATEGORY_FILTERS: Record<string, FilterSection[]> = {
  eat: [
    { key: "when", label: "When", icon: <Clock className="h-4 w-4" />, options: ["Breakfast", "Brunch", "Lunch", "Dinner", "Late night munchies"] },
    { key: "vibe", label: "Cuisine", icon: <ChefHat className="h-4 w-4" />, options: ["Local must-try", "Seafood", "Asian fusion", "Italian", "Indian", "Thai", "Korean", "Mediterranean", "BBQ", "Brunch spot", "Bakery / pastry", "Coffee & cake", "Healthy", "Street food", "Fine dining", "Vegan friendly"] },
    { key: "budget", label: "Setting", icon: <Armchair className="h-4 w-4" />, options: ["Ocean view", "Rice paddy views", "Jungle setting", "Hidden alley gem", "Instagrammable", "Authentic no-frills", "Chef's table"] },
    { key: "price", label: "Budget", icon: <Wallet className="h-4 w-4" />, options: ["Under $10", "Worth the splurge", "Treat ourselves"] },
  ],
  drink: [
    { key: "when", label: "When", icon: <Clock className="h-4 w-4" />, options: ["Right now", "Golden hour", "After dinner", "Late night", "Tomorrow"] },
    { key: "vibe", label: "Style", icon: <Palette className="h-4 w-4" />, options: ["Beach club", "Speakeasy", "Rooftop", "Pool bar", "Craft cocktails", "Natural wine", "Brewery", "Sake / Japanese bar", "Sports bar", "Mezcal / tequila", "Gin bar", "Local spot", "Tiki bar"] },
    { key: "scene", label: "Scene", icon: <Users className="h-4 w-4" />, options: ["Solo exploring", "Couple", "Squad night", "Meet locals"] },
    { key: "budget", label: "Budget", icon: <Wallet className="h-4 w-4" />, options: ["Cheap & cheerful", "Worth the spend", "Go all out"] },
  ],
  party: [
    { key: "when", label: "When", icon: <Clock className="h-4 w-4" />, options: ["Pre-drinks now", "Tonight", "Best night this week", "This weekend"] },
    { key: "vibe", label: "Style", icon: <Disc3 className="h-4 w-4" />, options: ["Beach club day party", "Sunset → club", "Live music", "Underground/techno", "Pool party", "Hip-hop & R&B", "Reggae chill", "Full moon / themed", "Karaoke", "Pub crawl", "Jazz club", "Latin / salsa night", "Acoustic / singer-songwriter"] },
    { key: "energy", label: "Energy", icon: <Zap className="h-4 w-4" />, options: ["Warm up first", "Ready to go", "Dancing till sunrise", "Plan the whole night"] },
  ],
  explore: [
    { key: "when", label: "When", icon: <Clock className="h-4 w-4" />, options: ["Sunrise mission", "Morning", "Full day", "Afternoon", "Golden hour"] },
    { key: "vibe", label: "Type", icon: <Map className="h-4 w-4" />, options: ["Hidden waterfall", "Secret beach", "Temple nobody visits", "Local market", "Motorbike adventure", "Photography spots", "Cultural deep dive", "Viewpoint", "Snorkeling / diving", "Cooking class", "Art gallery", "Street art walk", "Boat trip", "Cycling tour"] },
  ],
  relax: [
    { key: "when", label: "When", icon: <Clock className="h-4 w-4" />, options: ["This morning", "Afternoon reset", "Full day off"] },
    { key: "vibe", label: "Type", icon: <Heart className="h-4 w-4" />, options: ["Traditional spa", "Massage", "Sauna / steam", "Reflexology", "Beach club", "Yoga", "Sound healing", "Hot springs", "Quiet beach", "Float therapy", "Meditation"] },
  ],
  workout: [
    { key: "when", label: "When", icon: <Clock className="h-4 w-4" />, options: ["Early morning", "Anytime"] },
    { key: "vibe", label: "Type", icon: <Activity className="h-4 w-4" />, options: ["CrossFit box", "Muay Thai", "Surf lesson", "Yoga flow", "Outdoor bootcamp", "Proper gym", "BJJ / martial arts", "Rock climbing", "Swimming", "Tennis", "Running route", "Dance class", "Pilates"] },
  ],
  events: [
    { key: "when", label: "When", icon: <Clock className="h-4 w-4" />, options: ["Tonight", "Tomorrow", "This weekend", "This week", "Coming up"] },
    { key: "vibe", label: "Type", icon: <Ticket className="h-4 w-4" />, options: ["DJ / electronic", "Live band", "Art / exhibition", "Food market", "Full moon", "Cultural ceremony", "Pop-up", "Sports screening", "Workshop / class", "Charity event", "Networking / social", "Comedy night", "Film screening"] },
  ],
  surprise: [
    { key: "when", label: "When", icon: <Clock className="h-4 w-4" />, options: ["Now", "Tonight", "Tomorrow", "This weekend"] },
    { key: "vibe", label: "Vibe", icon: <Sparkles className="h-4 w-4" />, options: ["Weird & wonderful", "Adventurous", "Romantic", "Budget-friendly", "Luxury treat"] },
  ],
};

const LUCKY_BADGES = ["Hidden gem", "Off-script", "Local secret", "Insider only", "Wild card"];

const PLACEHOLDER_PROMPTS = [
  "best sunset cocktail spot nobody knows about",
  "where do locals actually eat around here?",
  "planning a birthday dinner for 6 people",
  "secret beach with no tourists",
  "late night street food worth the trip",
];

type Stage = "what" | "refine" | "results";

interface RecentSearch {
  label: string;
  query: string;
  messageId: string;
}

/* ------------------------------------------------------------------ */
/*  Saved spots helpers (localStorage per trip)                        */
/* ------------------------------------------------------------------ */

function getSavedSpots(tripId: string): ConciergeSuggestion[] {
  try {
    const raw = JSON.parse(localStorage.getItem(`concierge-saved-${tripId}`) || "[]");
    // Migration: if old format (string[]), return empty — they'll re-save
    if (raw.length > 0 && typeof raw[0] === "string") return [];
    return raw as ConciergeSuggestion[];
  } catch { return []; }
}

function saveSuggestion(tripId: string, suggestion: ConciergeSuggestion): boolean {
  const saved = getSavedSpots(tripId);
  const idx = saved.findIndex(s => s.name === suggestion.name);
  if (idx >= 0) return true; // already saved
  saved.push(suggestion);
  localStorage.setItem(`concierge-saved-${tripId}`, JSON.stringify(saved));
  return true;
}

function unsaveSuggestion(tripId: string, name: string): boolean {
  const saved = getSavedSpots(tripId);
  const idx = saved.findIndex(s => s.name === name);
  if (idx < 0) return false;
  saved.splice(idx, 1);
  localStorage.setItem(`concierge-saved-${tripId}`, JSON.stringify(saved));
  return false;
}

function isSuggestionSaved(tripId: string, name: string): boolean {
  return getSavedSpots(tripId).some(s => s.name === name);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function resolveDestination(
  destinationProp?: string,
  tripResult?: AITripResult | null,
  tripName?: string,
): string {
  // Prefer AI plan destination name (specific like "Canggu"), not trip name ("Bali April 2026")
  const dest = tripResult?.destinations?.[0];
  if (dest?.name) return dest.name;
  if (destinationProp && destinationProp !== "Unknown") return destinationProp;
  // Strip dates/years from trip name as fallback
  if (tripName) {
    const cleaned = tripName.replace(/\b(20\d{2}|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/gi, "").replace(/\s+/g, " ").trim();
    return cleaned || tripName;
  }
  return "";
}

function buildMapsUrl(name: string, address?: string | null): string {
  const query = address ? `${name} ${address}` : name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildConciergeContext(destination: string, location: string, tripResult?: AITripResult | null, memberCount?: number) {
  const dest = tripResult?.destinations?.[0];

  // Resolve real coordinates: prefer map_center (destination-level), never hardcode 0/0
  const mapCenter = tripResult?.map_center;
  const hasCoords = mapCenter && typeof mapCenter.lat === "number" && typeof mapCenter.lng === "number"
    && !(mapCenter.lat === 0 && mapCenter.lng === 0);

  // Only send hotel_location when we have both a name and real coordinates
  const hotelLocation = dest?.accommodation && hasCoords
    ? { name: dest.accommodation.name, lat: mapCenter!.lat, lng: mapCenter!.lng }
    : undefined;

  return {
    destination: destination || "Unknown",
    location: location || undefined,
    group_size: memberCount || 2,
    budget_level: dest?.cost_profile ? "mid-range" : undefined,
    hotel_location: hotelLocation,
  } as {
    destination: string;
    location?: string;
    date?: string;
    time_of_day?: string;
    group_size?: number;
    budget_level?: string;
    preferences?: string[];
    hotel_location?: { name: string; lat: number; lng: number };
  };
}

/* ------------------------------------------------------------------ */
/*  Custom Filter Input                                                */
/* ------------------------------------------------------------------ */

function CustomFilterInput({ filterKey, onAdd }: { filterKey: string; onAdd: (key: string, value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = () => {
    const v = value.trim();
    if (v) {
      onAdd(filterKey, v);
      setValue("");
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-2 rounded-full text-xs font-medium border border-dashed border-muted-foreground/30 text-muted-foreground hover:border-[#0D9488]/50 hover:text-[#0D9488] transition-all active:scale-95 flex items-center gap-1"
      >
        <Plus className="h-3 w-3" /> Custom
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setOpen(false); }}
        placeholder="Type..."
        className="w-24 text-xs bg-accent/30 rounded-full px-3 py-2 border border-[#0D9488]/40 focus:outline-none focus:ring-1 focus:ring-[#0D9488] text-foreground placeholder:text-muted-foreground"
      />
      <button onClick={submit} className="p-1.5 rounded-full bg-[#0D9488] text-white hover:opacity-90 transition-opacity">
        <Check className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  HorizontalCarousel (desktop only)                                  */
/* ------------------------------------------------------------------ */


const SuggestionCard = memo(function SuggestionCard({
  suggestion, messageId, index, tripId, tripDays, onAddToPlan, animDelay, isLucky, luckyBadge, onSaveChange,
}: {
  suggestion: ConciergeSuggestion;
  messageId: string;
  index: number;
  tripId: string;
  tripDays?: { date: string; dayNumber: number; label: string }[];
  onAddToPlan?: (dayDate: string, activity: AIActivity) => void;
  animDelay?: number;
  isLucky?: boolean;
  luckyBadge?: string;
  onSaveChange?: () => void;
}) {
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [added, setAdded] = useState(false);
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(() => isSuggestionSaved(tripId, suggestion.name));

  const handleAddToPlan = async (dayDate: string) => {
    setAddingDate(dayDate);
    try {
      if (onAddToPlan) {
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
      } else {
        const notes = [
          suggestion.why,
          suggestion.address ? `📍 ${suggestion.address}` : null,
          suggestion.estimated_cost_per_person != null
            ? `💰 ~${suggestion.currency || "USD"} ${suggestion.estimated_cost_per_person}/pp`
            : null,
        ].filter(Boolean).join("\n");

        const { error } = await supabase.from("itinerary_items").insert({
          trip_id: tripId,
          title: suggestion.name,
          day_date: dayDate,
          start_time: suggestion.best_time?.split("-")[0]?.trim() || null,
          location_text: suggestion.address || null,
          notes,
          status: "idea",
        });
        if (error) throw error;
      }

      setAdded(true);
      setShowDayPicker(false);
      const dayLabel = tripDays?.find(d => d.date === dayDate)?.label || dayDate;
      toast.success(`Added "${suggestion.name}" to ${dayLabel}`, {
        action: {
          label: "View in plan",
          onClick: () => {
            window.location.hash = "";
            window.location.pathname = `/trips/${tripId}/itinerary`;
          },
        },
      });
    } catch (err) {
      console.error("Failed to add to plan:", err);
      toast.error("Failed to add to plan");
    } finally {
      setAddingDate(null);
    }
  };

  const handleSave = () => {
    if (isSaved) {
      unsaveSuggestion(tripId, suggestion.name);
      setIsSaved(false);
      toast.success("Removed from saved");
    } else {
      saveSuggestion(tripId, suggestion);
      setIsSaved(true);
      toast.success("Saved for later");
    }
    onSaveChange?.();
  };

  const s = suggestion as any;
  const bookingUrl = s.booking_url || null;
  const googleSearchBookUrl = `https://www.google.com/search?q=book+${encodeURIComponent(suggestion.name + " " + (suggestion.address || ""))}`;
  const mapsUrl = buildMapsUrl(suggestion.name || "Unknown", suggestion.address);

  // Determine if this is an event — only when explicitly flagged
  const isEvent = suggestion.is_event === true || s.type === "event";
  const eventUrl = s.url || s.booking_url || null;
  const eventThumbnail = s.thumbnail || null;
  const atMatch = isEvent && suggestion.name ? suggestion.name.match(/^(.+?)\s+at\s+(.+)$/i) : null;
  const eventTitle = atMatch ? atMatch[1] : (suggestion.name || "Unnamed");
  const eventVenue = atMatch ? atMatch[2] : null;

  // Resolve image: event thumbnail > photo_url > placeholder
  // For regular venues, always show photo_url if available (not_verified only blocks for events)
  const cardImage = isEvent && eventThumbnail
    ? eventThumbnail
    : (suggestion.photo_url || null);

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${isLucky ? "ring-1 ring-amber-200 dark:ring-amber-700/30" : ""}`}
      style={{ animation: `fade-in 0.3s ease-out ${(animDelay || 0)}ms both` }}
    >
      {/* Photo — full width */}
      <div className="w-full h-[180px] bg-muted overflow-hidden relative">
        {cardImage ? (
          <img src={cardImage} alt={suggestion.name || ""} className="w-full h-full object-cover" loading="lazy" />
        ) : isEvent ? (
          <div className="w-full h-full flex items-center justify-center bg-[#0D9488]/5">
            <Calendar className="h-10 w-10 text-[#0D9488]/30" />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-accent/30">
            <MapPin className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}
        {luckyBadge ? (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-400 text-white backdrop-blur-sm shadow-sm">
            <Gem className="h-3 w-3" /> {luckyBadge}
          </span>
        ) : isEvent ? (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-[#0D9488] text-white backdrop-blur-sm">
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
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{eventTitle}</h4>
            {eventVenue && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3 shrink-0" /> {eventVenue}
              </p>
            )}
          </div>
          {suggestion.rating != null && !suggestion.not_verified && !isEvent && (
            <div className="flex items-center gap-0.5 text-xs shrink-0">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="font-medium">{suggestion.rating.toFixed(1)}</span>
              {suggestion.totalRatings != null && (
                <span className="text-muted-foreground text-[10px]">({suggestion.totalRatings})</span>
              )}
            </div>
          )}
        </div>

        {/* Event date/time — prominent for events */}
        {isEvent && suggestion.event_details && (
          <p className="text-xs font-semibold text-[#0D9488] leading-snug">
            {suggestion.event_details}
          </p>
        )}

        {/* Why */}
        {suggestion.why && (
          <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{suggestion.why}</p>
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

        {/* Pro tip — elegant inline callout */}
        {s.pro_tip && (
          <div className="flex gap-2 py-2 pl-3 border-l-[3px] border-[#0D9488] bg-gray-50 dark:bg-white/5 rounded-r-md">
            <Lightbulb className="h-3.5 w-3.5 text-[#0D9488] shrink-0 mt-0.5" />
            <p className="text-[13px] text-gray-700 dark:text-gray-300 leading-snug"><span className="font-semibold">Pro tip:</span> {s.pro_tip}</p>
          </div>
        )}
        {/* What to order — warm subtle callout */}
        {s.what_to_order && (
          <div className="flex gap-2 py-2 pl-3 border-l-[3px] border-amber-400 bg-amber-50/30 dark:bg-amber-900/5 rounded-r-md">
            <Utensils className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[13px] text-gray-700 dark:text-gray-300 leading-snug"><span className="font-semibold">What to order:</span> {s.what_to_order}</p>
          </div>
        )}
        {s.specific_night && (
          <div className="flex gap-2 py-2 pl-3 border-l-[3px] border-purple-400 bg-purple-50/30 dark:bg-purple-900/5 rounded-r-md">
            <CalendarHeart className="h-3.5 w-3.5 text-purple-500 shrink-0 mt-0.5" />
            <p className="text-[13px] text-gray-700 dark:text-gray-300 leading-snug"><span className="font-semibold">Best night:</span> {s.specific_night}</p>
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
            <div className="flex gap-2 pt-1 flex-wrap">
              {isEvent && eventUrl ? (
                <a
                  href={eventUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#0D9488]/10 text-[#0D9488] hover:bg-[#0D9488]/20 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> View Event
                </a>
              ) : null}
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-accent text-foreground hover:bg-accent/80 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Google Maps
              </a>
              {!isEvent && bookingUrl ? (
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#0D9488]/10 text-[#0D9488] hover:bg-[#0D9488]/20 transition-colors"
                >
                  <Globe className="h-3.5 w-3.5" /> Visit website
                </a>
              ) : !isEvent ? (
                <a
                  href={googleSearchBookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-accent text-foreground hover:bg-accent/80 transition-colors"
                >
                  <Search className="h-3.5 w-3.5" /> Book
                </a>
              ) : null}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="flex items-center gap-1">
            <button
              onClick={handleSave}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${isSaved ? "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" : "text-muted-foreground hover:bg-accent"}`}
            >
              <Bookmark className={`h-3.5 w-3.5 ${isSaved ? "fill-current" : ""}`} />
              {isSaved ? "Saved" : "Save"}
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs font-medium text-[#0D9488] hover:bg-[#0D9488]/10 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              {expanded ? "Less" : "More details"}
            </button>
          </div>

          <div className="flex items-center gap-1">
            {!expanded && (
              isEvent && eventUrl ? (
                <a
                  href={eventUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-[#0D9488] hover:bg-[#0D9488]/10 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" /> View Event
                </a>
              ) : (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-accent transition-colors"
                >
                  <ExternalLink className="h-3 w-3" /> Maps
                </a>
              )
            )}
            <div className="relative">
              {added ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20">
                  <Check className="h-3.5 w-3.5" /> Added
                </span>
              ) : (
                <button
                  onClick={() => setShowDayPicker(!showDayPicker)}
                  disabled={!!addingDate}
                  className="text-xs font-medium text-[#0D9488] hover:bg-[#0D9488]/10 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {addingDate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "+ Add to plan"}
                </button>
              )}
              {showDayPicker && tripDays && tripDays.length > 0 && (
                <div className="absolute bottom-full right-0 mb-1 bg-card border border-border rounded-xl shadow-lg p-2 z-30 min-w-[180px] max-h-[200px] overflow-y-auto animate-fade-in">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 pb-1.5">Add to which day?</p>
                  {tripDays.map((d) => (
                    <button
                      key={d.date}
                      onClick={() => handleAddToPlan(d.date)}
                      disabled={addingDate === d.date}
                      className="w-full text-left px-2.5 py-2 text-xs rounded-lg hover:bg-accent transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {addingDate === d.date ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarHeart className="h-3 w-3 text-muted-foreground" />}
                      {d.label}
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
    <div className="space-y-3 px-3 md:px-0">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-border bg-card overflow-hidden" style={{ animation: `fade-in 0.3s ease-out ${i * 100}ms both` }}>
          <Skeleton className="w-full h-[180px] rounded-none" />
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
/*  Rotating placeholder hook                                          */
/* ------------------------------------------------------------------ */

function useRotatingPlaceholder() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % PLACEHOLDER_PROMPTS.length), 4000);
    return () => clearInterval(t);
  }, []);
  return PLACEHOLDER_PROMPTS[idx];
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function ConciergePanel({ tripId, open, onClose, tripResult, memberCount, destination: destinationProp, tripName, tripStartDate, tripEndDate, onAddToPlan }: Props) {
  const [stage, setStage] = useState<Stage>("what");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const [freeText, setFreeText] = useState("");
  const [searchStartedAt, setSearchStartedAt] = useState<number | null>(null);
  const [isLucky, setIsLucky] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [extraResults, setExtraResults] = useState<ConciergeSuggestion[]>([]);
  const lastRequestBodyRef = useRef<Record<string, unknown> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const placeholder = useRotatingPlaceholder();

  const resolvedDest = resolveDestination(destinationProp, tripResult, tripName);
  const [manualLocation, setManualLocation] = useState("");
  const destination = manualLocation || resolvedDest;

  const [savedVersion, setSavedVersion] = useState(0);
  const savedSpots = useMemo(() => getSavedSpots(tripId), [tripId, stage, savedVersion]);
  const savedCount = savedSpots.length;
  const [savedExpanded, setSavedExpanded] = useState(false);

  // Trip destinations for quick-select
  const tripDestinations = useMemo(() => {
    const dests: string[] = [];
    if (tripResult?.destinations) {
      tripResult.destinations.forEach(d => { if (d.name) dests.push(d.name); });
    }
    if (destinationProp && destinationProp !== "Unknown" && !dests.includes(destinationProp)) {
      dests.unshift(destinationProp);
    }
    return dests;
  }, [tripResult, destinationProp]);

  const conciergeContext = buildConciergeContext(destination, manualLocation || resolvedDest, tripResult, memberCount);
  const {
    messages,
    activeResult,
    sending,
    sendMessage,
    sendStructuredRequest,
  } = useConcierge(tripId, conciergeContext);

  // Build trip days with nice labels
  const tripDays = useMemo(() => {
    const days: { date: string; dayNumber: number; label: string }[] = [];
    if (tripResult?.destinations) {
      tripResult.destinations.forEach(d => {
        d.days.forEach(day => {
          const dateObj = new Date(day.date + "T12:00:00");
          const label = `Day ${day.day_number} · ${dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
          days.push({ date: day.date, dayNumber: day.day_number, label });
        });
      });
    }
    if (days.length === 0 && tripStartDate && tripEndDate) {
      const start = new Date(tripStartDate + "T12:00:00");
      const end = new Date(tripEndDate + "T12:00:00");
      let dayNum = 1;
      const cur = new Date(start);
      while (cur <= end && dayNum <= 30) {
        const dateStr = cur.toISOString().split("T")[0];
        const label = `Day ${dayNum} · ${cur.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
        days.push({ date: dateStr, dayNumber: dayNum, label });
        cur.setDate(cur.getDate() + 1);
        dayNum++;
      }
    }
    const today = new Date().toISOString().split("T")[0];
    if (!days.find(d => d.date === today)) {
      days.unshift({ date: today, dayNumber: 0, label: "Today" });
    } else {
      const todayIdx = days.findIndex(d => d.date === today);
      if (todayIdx > 0) {
        const [todayItem] = days.splice(todayIdx, 1);
        todayItem.label = `Today · ${todayItem.label}`;
        days.unshift(todayItem);
      }
    }
    return days;
  }, [tripResult, tripStartDate, tripEndDate]);

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
          const label = msg.content.length > 30 ? msg.content.slice(0, 30) + "…" : msg.content;
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
        setIsLucky(false);
        setShowLocationPicker(false);
        setExtraResults([]);
        setLoadingMore(false);
        lastRequestBodyRef.current = null;
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyTouchAction = body.style.touchAction;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyWidth = body.style.width;
    const previousHtmlOverflow = html.style.overflow;
    const previousHtmlOverscrollBehavior = html.style.overscrollBehavior;

    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.touchAction = previousBodyTouchAction;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.width = previousBodyWidth;
      html.style.overflow = previousHtmlOverflow;
      html.style.overscrollBehavior = previousHtmlOverscrollBehavior;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  const toggleFilter = (key: string, value: string) => {
    setSelectedFilters(prev => {
      const arr = prev[key] || [];
      return { ...prev, [key]: arr.includes(value) ? arr.filter(x => x !== value) : [...arr, value] };
    });
  };

  const addCustomFilter = (key: string, value: string) => {
    setSelectedFilters(prev => {
      const arr = prev[key] || [];
      if (arr.includes(value)) return prev;
      return { ...prev, [key]: [...arr, value] };
    });
  };

  const doSearch = useCallback(async (
    category: Category | null,
    filters: Record<string, string[]>,
    text?: string,
    lucky?: boolean,
  ) => {
    setSearchStartedAt(Date.now());
    setIsLucky(!!lucky);
    setStage("results");
    setExtraResults([]);
    try {
      if (text) {
        // Free-text request — store body for "show more" re-use
        lastRequestBodyRef.current = {
          trip_id: tripId,
          query: text,
          context: conciergeContext,
        };
        await sendMessage(text);
      } else if (category) {
        const structuredFilters: StructuredFilters = {
          category: category.id,
          when: filters.when?.length ? filters.when : undefined,
          vibe: [...(filters.vibe || []), ...(filters.scene || []), ...(filters.energy || [])].length ? [...(filters.vibe || []), ...(filters.scene || []), ...(filters.energy || [])] : undefined,
          budget: [...(filters.budget || []), ...(filters.price || [])].length ? [...(filters.budget || []), ...(filters.price || [])] : undefined,
          feeling_lucky: lucky,
        };
        // Store the full structured body for "show more" re-use
        lastRequestBodyRef.current = {
          trip_id: tripId,
          category: structuredFilters.category,
          when: structuredFilters.when,
          vibe: structuredFilters.vibe,
          budget: structuredFilters.budget,
          feeling_lucky: structuredFilters.feeling_lucky || false,
          context: conciergeContext,
        };
        await sendStructuredRequest(structuredFilters);
      }
    } catch {
      toast.error("Couldn't find suggestions. Try again.");
    }
  }, [sendMessage, sendStructuredRequest, tripId, conciergeContext]);

  const handleShowMore = useCallback(async () => {
    if (loadingMore || !displayedResults?.suggestions) return;
    setLoadingMore(true);
    try {
      const allShown = [
        ...(displayedResults.suggestions || []),
        ...extraResults,
      ];
      const excludeNames = allShown.map(s => s.name).filter(Boolean);
      const excludePlaceIds = allShown
        .map(s => (s as unknown as Record<string, unknown>).place_id as string)
        .filter(Boolean);

      // Re-send the original request body with exclusion list
      const baseBody = lastRequestBodyRef.current ?? {
        trip_id: tripId,
        query: `More suggestions in ${destination}`,
        context: conciergeContext,
      };

      const { data, error } = await supabase.functions.invoke("concierge-suggest", {
        body: {
          ...baseBody,
          exclude_names: excludeNames,
          exclude_place_ids: excludePlaceIds,
        },
      });
      if (error) throw error;
      if (data?.suggestions?.length) {
        setExtraResults(prev => [...prev, ...data.suggestions]);
      } else {
        toast("No more suggestions found");
      }
    } catch {
      toast.error("Couldn't load more suggestions");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, displayedResults, extraResults, tripId, destination, conciergeContext]);

  const handleCategorySelect = (cat: Category) => {
    setSelectedCategory(cat);
    setSelectedFilters({});
    setStage("refine");
  };

  const handleSurpriseMe = () => {
    setSelectedCategory({ id: "surprise", label: "Surprise me", tagline: "Trust us", icon: <Sparkles className="h-7 w-7" />, gradient: "from-teal-400/80 to-cyan-500/80", gradientColor: "rgba(45,212,191,0.85)", photoUrl: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&h=200&fit=crop&q=80", query: "Surprise" });
    setIsLucky(true);
    doSearch({ id: "surprise", label: "Surprise me", tagline: "", icon: null, gradient: "", gradientColor: "", photoUrl: "", query: "" }, {}, undefined, true);
  };

  const handleFreeTextSubmit = () => {
    if (!freeText.trim()) return;
    doSearch(null, {}, freeText.trim());
  };

  const handleFindSpots = () => {
    doSearch(selectedCategory, selectedFilters);
  };

  const handleFeelingLucky = () => {
    setIsLucky(true);
    doSearch(selectedCategory, selectedFilters, undefined, true);
  };

  const handleRecentSearch = (_search: RecentSearch) => {
    setSearchStartedAt(null);
    setStage("results");
  };

  const handleBack = () => {
    if (stage === "results") {
      if (isLucky) {
        setStage("what");
        setSelectedCategory(null);
        setIsLucky(false);
      } else {
        setStage(selectedCategory ? "refine" : "what");
      }
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
    setIsLucky(false);
    setExtraResults([]);
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
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&zoom=14`);
          const data = await res.json();
          const locality = data.address?.village || data.address?.suburb || data.address?.town || data.address?.city || data.address?.county || "your area";
          const country = data.address?.country || "";
          const loc = country ? `${locality}, ${country}` : locality;
          setManualLocation(loc);
          setLocationInput(loc);
          setShowLocationPicker(false);
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

  const handleLocationSubmit = () => {
    if (locationInput.trim()) {
      setManualLocation(locationInput.trim());
      setShowLocationPicker(false);
    }
  };

  const currentFilters = selectedCategory ? (CATEGORY_FILTERS[selectedCategory.id] || []) : [];
  const anyFiltersSelected = Object.values(selectedFilters).some(arr => arr.length > 0);

  if (!open) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-[59] animate-fade-in" onClick={onClose} />

      {/* Full-screen overlay */}
      <div className="fixed inset-0 z-[60] flex h-dvh flex-col bg-background animate-slide-up overflow-hidden overscroll-none" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        {/* Header — clean: back + title + X only */}
        <div className="relative shrink-0">
          <div className="absolute inset-0 bg-gradient-to-r from-[#0D9488]/5 via-[#0EA5E9]/5 to-[#0D9488]/5" style={{ backgroundSize: "200% 100%", animation: "gradient-shift 8s ease infinite" }} />
          <div className="relative flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <button onClick={handleBack} className="p-1.5 -ml-1.5 rounded-lg hover:bg-accent transition-colors">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h2 className="text-sm font-semibold text-foreground">
                {destination ? `Discover in ${destination}` : "Discover"}
              </h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Location bar — clean list style */}
        <div className="shrink-0 px-4 py-2 border-b border-border/50 bg-background/80">
          <button
            onClick={() => setShowLocationPicker(!showLocationPicker)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              destination
                ? "bg-[#0D9488]/10 text-[#0D9488] hover:bg-[#0D9488]/20"
                : "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/30"
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
            {destination || "Set your location"}
            <ChevronDown className="h-3 w-3" />
          </button>

          {showLocationPicker && (
            <div className="mt-2 rounded-xl border border-border bg-card shadow-lg animate-fade-in overflow-hidden">
              {/* GPS row */}
              <button
                onClick={handleUseLocation}
                disabled={geoLoading}
                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-medium text-foreground hover:bg-accent/50 transition-colors disabled:opacity-50"
              >
                {geoLoading ? <Loader2 className="h-4 w-4 animate-spin text-[#0D9488]" /> : <Navigation className="h-4 w-4 text-[#0D9488]" />}
                {geoLoading ? "Getting location..." : "Use my current location"}
              </button>

              {/* Trip destinations */}
              {tripDestinations.length > 0 && (
                <>
                  <div className="border-t border-border/50" />
                  <div className="px-4 py-3 space-y-2">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Trip destinations</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tripDestinations.map(d => (
                        <button
                          key={d}
                          onClick={() => { setManualLocation(d); setLocationInput(d); setShowLocationPicker(false); }}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            destination === d
                              ? "bg-[#0D9488] text-white"
                              : "bg-accent text-foreground hover:bg-accent/80"
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Manual input */}
              <div className="border-t border-border/50" />
              <div className="flex gap-2 px-4 py-3">
                <input
                  type="text"
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleLocationSubmit(); }}
                  placeholder="Type a location..."
                  className="flex-1 text-xs bg-accent/30 rounded-lg px-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-[#0D9488] text-foreground placeholder:text-muted-foreground"
                />
                <button
                  onClick={handleLocationSubmit}
                  disabled={!locationInput.trim()}
                  className="px-3 py-2.5 rounded-lg bg-[#0D9488] text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  Set
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content area */}
        <div className={`min-h-0 flex-1 ${stage === "what" && savedCount === 0 ? "overflow-hidden" : "overflow-y-auto overscroll-contain"}`} style={{ willChange: "transform", paddingBottom: stage === "refine" ? "120px" : "env(safe-area-inset-bottom, 0px)" }}>

          {/* =================== STAGE 1: WHAT =================== */}
          {stage === "what" && (
            <div className={`${savedCount === 0 ? "h-full overflow-hidden" : ""} px-3 pt-3 pb-4 space-y-3 animate-fade-in md:max-w-[900px] md:mx-auto w-full md:px-8`}>
              {/* Category grid */}
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleCategorySelect(cat)}
                      className="relative flex items-center gap-2.5 p-3 rounded-xl overflow-hidden transition-transform active:scale-[0.97] hover:scale-[1.02] text-left"
                      style={{ minHeight: "62px" }}
                    >
                      {/* Photo background */}
                      <img
                        src={cat.photoUrl}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      {/* Gradient overlay — strong enough for text readability */}
                      <div
                        className="absolute inset-0"
                        style={{
                          background: `linear-gradient(to right, ${cat.gradientColor} 0%, ${cat.gradientColor.replace('0.85', '0.65')} 55%, ${cat.gradientColor.replace('0.85', '0.35')} 100%)`,
                        }}
                      />
                      {/* Fallback gradient */}
                      <div className={`absolute inset-0 bg-gradient-to-br ${cat.gradient} -z-10`} />
                      <div className="relative z-10 w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                        <div className="text-white [&>svg]:h-5 [&>svg]:w-5">{cat.icon}</div>
                      </div>
                      <div className="relative z-10 min-w-0">
                        <span className="text-[14px] font-bold text-white block leading-tight drop-shadow-sm">{cat.label}</span>
                        <span className="text-[11px] text-white/80 leading-tight block truncate drop-shadow-sm">{cat.tagline}</span>
                      </div>
                      {cat.id === "events" && (
                        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-white animate-pulse z-10" />
                      )}
                    </button>
                ))}


                {/* Surprise Me — full width */}
                <button
                  onClick={handleSurpriseMe}
                  className="col-span-2 relative flex items-center justify-center gap-3 rounded-xl overflow-hidden transition-transform active:scale-[0.97] hover:scale-[1.02]"
                  style={{ minHeight: "62px" }}
                >
                  <img
                    src="https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&h=200&fit=crop&q=80"
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      background: "linear-gradient(135deg, rgba(13,148,136,0.8) 0%, rgba(217,119,6,0.65) 50%, rgba(13,148,136,0.4) 100%)",
                    }}
                  />
                  <div
                    className="absolute inset-0 -z-10"
                    style={{
                      background: "linear-gradient(135deg, #0D9488 0%, #D97706 25%, #0D9488 50%, #D97706 75%, #0D9488 100%)",
                      backgroundSize: "400% 400%",
                      animation: "shimmer-gradient 4s ease infinite",
                    }}
                  />
                  <div className="relative z-10 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-white" />
                    </div>
                    <div className="text-left">
                      <span className="text-[14px] font-bold text-white block leading-tight drop-shadow-sm">Surprise me</span>
                      <span className="text-[11px] text-white/80 leading-tight block drop-shadow-sm">Hidden gems & unexpected experiences</span>
                    </div>
                  </div>
                </button>
              </div>

              {/* Free text input */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    placeholder={placeholder}
                    className="w-full text-[14px] bg-accent/30 rounded-xl pl-8 pr-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-[#0D9488] text-foreground placeholder:text-muted-foreground/60 placeholder:italic"
                    onKeyDown={(e) => { if (e.key === "Enter") handleFreeTextSubmit(); }}
                  />
                </div>
                <button
                  onClick={handleFreeTextSubmit}
                  disabled={!freeText.trim()}
                  className="px-4 py-2.5 rounded-xl bg-[#0D9488] text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  Go
                </button>
              </div>

              {/* Saved spots section — full cards */}
              {savedCount > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Bookmark className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                    <span className="text-xs font-semibold text-foreground">Saved spots</span>
                    <span className="text-[10px] text-muted-foreground">({savedCount})</span>
                  </div>
                  {/* Mobile: vertical stack */}
                  <div className="md:hidden space-y-3">
                    {(savedExpanded ? savedSpots : savedSpots.slice(0, 2)).map((spot, i) => (
                      <SuggestionCard
                        key={spot.name}
                        suggestion={spot}
                        messageId={`saved-${i}`}
                        index={i}
                        tripId={tripId}
                        tripDays={tripDays}
                        onAddToPlan={onAddToPlan}
                        onSaveChange={() => setSavedVersion(v => v + 1)}
                      />
                    ))}
                    {savedCount > 2 && !savedExpanded && (
                      <button
                        onClick={() => setSavedExpanded(true)}
                        className="text-xs font-medium text-[#0D9488] hover:underline"
                      >
                        Show all {savedCount} saved
                      </button>
                    )}
                    {savedExpanded && savedCount > 2 && (
                      <button
                        onClick={() => setSavedExpanded(false)}
                        className="text-xs font-medium text-muted-foreground hover:underline"
                      >
                        Show less
                      </button>
                    )}
                  </div>
                  {/* Desktop: 2-column grid */}
                  <DesktopGrid>
                    {savedSpots.map((spot, i) => (
                      <SuggestionCard
                        key={spot.name}
                        suggestion={spot}
                        messageId={`saved-${i}`}
                        index={i}
                        tripId={tripId}
                        tripDays={tripDays}
                        onAddToPlan={onAddToPlan}
                        onSaveChange={() => setSavedVersion(v => v + 1)}
                      />
                    ))}
                  </DesktopGrid>
                </div>
              )}

              {/* Recent searches */}
              {recentSearches.length > 0 && (
                <div className="flex flex-wrap gap-2 items-center">
                  {recentSearches.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleRecentSearch(s)}
                      className="text-[11px] px-3 py-1.5 rounded-full border border-border bg-card text-foreground hover:bg-accent/50 transition-colors"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* =================== STAGE 2: REFINE =================== */}
          {stage === "refine" && selectedCategory && (
            <div className="px-4 py-5 space-y-5 animate-fade-in">
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
                          className={`px-3.5 py-2 rounded-full text-xs font-medium transition-all active:scale-95 ${
                            isSelected
                              ? "bg-[#0D9488] text-white shadow-md border border-[#0D9488]"
                              : "bg-white dark:bg-card border border-gray-200 dark:border-border text-gray-700 dark:text-foreground hover:border-[#0D9488]/40"
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                    {(selectedFilters[section.key] || [])
                      .filter(v => !section.options.includes(v))
                      .map(v => (
                        <button
                          key={v}
                          onClick={() => toggleFilter(section.key, v)}
                          className="px-3.5 py-2 rounded-full text-xs font-medium bg-[#0D9488] text-white shadow-md border border-[#0D9488] transition-all active:scale-95"
                        >
                          {v}
                        </button>
                      ))
                    }
                    <CustomFilterInput filterKey={section.key} onAdd={addCustomFilter} />
                  </div>
                </div>
              ))}

              <button
                onClick={handleFindSpots}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors pt-2"
              >
                Skip filters — show me everything
              </button>

              {/* Feeling lucky */}
              <div className="border-t border-border pt-4">
                <button
                  onClick={handleFeelingLucky}
                  className="w-full relative flex items-center justify-center gap-2.5 py-3 rounded-xl overflow-hidden transition-transform active:scale-[0.97]"
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background: "linear-gradient(135deg, #0D9488 0%, #D97706 25%, #0D9488 50%, #D97706 75%, #0D9488 100%)",
                      backgroundSize: "400% 400%",
                      animation: "shimmer-gradient 4s ease infinite",
                      opacity: 0.12,
                    }}
                  />
                  <Sparkles className="h-4 w-4 text-amber-500 relative z-10" />
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 relative z-10">Surprise me instead</span>
                </button>
              </div>
            </div>
          )}

          {/* =================== STAGE 3: RESULTS =================== */}
          {stage === "results" && (
            <div className="py-3 animate-fade-in">
              {/* Breadcrumb pills — no "Feeling Lucky" pill */}
              {!isLucky && (selectedCategory || anyFiltersSelected) && (
                <div className="flex items-center gap-1.5 px-3 md:px-0 pb-3 overflow-x-auto scrollbar-hide">
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

              {sending && !loadingMore ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center justify-center gap-2 py-6">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isLucky ? "bg-amber-100 dark:bg-amber-900/20" : "bg-[#0D9488]/10"}`}>
                      {isLucky ? (
                        <Sparkles className="h-5 w-5 text-amber-500 animate-spin" style={{ animationDuration: "3s" }} />
                      ) : (
                        <Compass className="h-5 w-5 text-[#0D9488] animate-spin" style={{ animationDuration: "3s" }} />
                      )}
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {isLucky ? "Uncovering hidden gems..." : "Consulting our local sources..."}
                    </span>
                    <span className="text-[10px] text-muted-foreground animate-pulse">
                      {isLucky ? "The ones we don't tell everyone about" : "Finding insider picks just for you"}
                    </span>
                  </div>
                  <LoadingSkeleton />
                </div>
              ) : displayedResults && (displayedResults.suggestions?.length ?? 0) > 0 ? (
                <div className="space-y-3 md:max-w-[900px] md:mx-auto w-full md:px-8">
                  {/* Intro text — regular weight teal, not italic */}
                  {displayedResults.content && (
                    <p className="text-sm px-3 md:px-0 text-[#0D9488] font-normal">
                      {displayedResults.content}
                    </p>
                  )}

                  {/* Section label — muted, not bold orange */}
                  <p className="text-xs font-medium tracking-wide text-muted-foreground px-3 md:px-0 uppercase">
                    {isLucky ? "Hidden gems & local secrets" : "Insider picks"}
                  </p>

                  {/* Results — mobile: vertical stack, desktop: 2-col grid */}
                  <div className="space-y-3 px-3 md:hidden">
                    {(displayedResults.suggestions ?? []).map((s, i) => (
                      <SuggestionCard
                        key={`${displayedResults.id}-${i}`}
                        suggestion={s}
                        messageId={displayedResults.id}
                        index={i}
                        tripId={tripId}
                        tripDays={tripDays}
                        onAddToPlan={onAddToPlan}
                        animDelay={i * 50}
                        isLucky={isLucky}
                        luckyBadge={isLucky ? LUCKY_BADGES[i % LUCKY_BADGES.length] : undefined}
                        onSaveChange={() => setSavedVersion(v => v + 1)}
                      />
                    ))}
                  </div>
                  <DesktopGrid>
                    {(displayedResults.suggestions ?? []).map((s, i) => (
                      <SuggestionCard
                        key={`${displayedResults.id}-${i}`}
                        suggestion={s}
                        messageId={displayedResults.id}
                        index={i}
                        tripId={tripId}
                        tripDays={tripDays}
                        onAddToPlan={onAddToPlan}
                        animDelay={i * 50}
                        isLucky={isLucky}
                        luckyBadge={isLucky ? LUCKY_BADGES[i % LUCKY_BADGES.length] : undefined}
                        onSaveChange={() => setSavedVersion(v => v + 1)}
                      />
                    ))}
                  </DesktopGrid>

                  {/* Extra results from "Show more" */}
                  {extraResults.length > 0 && (
                    <div className="space-y-3 px-3 md:px-0 pt-1 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
                      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase lg:col-span-2">More picks</p>
                      {extraResults.map((s, i) => (
                        <SuggestionCard
                          key={`extra-${i}`}
                          suggestion={s}
                          messageId={`extra-${i}`}
                          index={i}
                          tripId={tripId}
                          tripDays={tripDays}
                          onAddToPlan={onAddToPlan}
                          animDelay={i * 50}
                          isLucky={isLucky}
                          luckyBadge={isLucky ? LUCKY_BADGES[((displayedResults?.suggestions?.length ?? 0) + i) % LUCKY_BADGES.length] : undefined}
                          onSaveChange={() => setSavedVersion(v => v + 1)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Bottom actions */}
                  <div className="px-3 md:px-0 pt-3 space-y-2 pb-6">
                    <button
                      onClick={handleShowMore}
                      disabled={loadingMore || sending}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[#0D9488]/30 text-sm font-medium text-[#0D9488] hover:bg-[#0D9488]/5 transition-colors disabled:opacity-50"
                    >
                      {loadingMore ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Loading more...</>
                      ) : (
                        <><Plus className="h-4 w-4" /> Show more suggestions</>
                      )}
                    </button>

                    {!isLucky && (
                      <button
                        onClick={() => setStage("refine")}
                        className="w-full py-2.5 rounded-xl text-xs font-medium text-[#0D9488] hover:bg-[#0D9488]/10 transition-colors"
                      >
                        Try different filters
                      </button>
                    )}
                    <button
                      onClick={resetToWhat}
                      className="w-full py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-accent/50 transition-colors"
                    >
                      Search something else
                    </button>
                  </div>
                </div>
              ) : displayedResults?.content ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                  <p className="text-sm text-muted-foreground">{displayedResults.content}</p>
                  <button onClick={resetToWhat} className="mt-3 text-sm font-medium text-[#0D9488] hover:underline">
                    Try something else
                  </button>
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
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0D9488] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg"
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

      {/* Shimmer gradient keyframes */}
      <style>{`
        @keyframes shimmer-gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </>,
    document.body
  );
}

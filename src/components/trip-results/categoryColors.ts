import {
  Utensils, Coffee, Landmark, TreePine, Moon,
  Mountain, Dumbbell, Waves, Sparkles, Car,
  Hotel, ShoppingBag, Camera, MapPin,
  type LucideIcon
} from "lucide-react";

// Shared category palette — used by budget breakdown legend, progress bar,
// and activity card chips so colors stay consistent across the trip page.
export const CATEGORY_COLORS: Record<string, string> = {
  // Accommodation — brand teal (biggest line item)
  accommodation: "#0D9488",
  hotel: "#0D9488",
  stay: "#0D9488",
  // Food — warm orange
  food: "#F97316",
  restaurant: "#F97316",
  cafe: "#F97316",
  dining: "#F97316",
  // Nightlife — purple
  nightlife: "#A855F7",
  bar: "#A855F7",
  club: "#A855F7",
  // Culture — blue
  culture: "#3B82F6",
  museum: "#3B82F6",
  history: "#3B82F6",
  attraction: "#3B82F6",
  // Experience / activities — pink coral
  experience: "#EC4899",
  experiences: "#EC4899",
  activity: "#EC4899",
  activities: "#EC4899",
  adventure: "#EC4899",
  sport: "#EC4899",
  // Nature — green
  nature: "#22C55E",
  park: "#22C55E",
  // Relaxation / wellness — sky
  relaxation: "#0EA5E9",
  wellness: "#0EA5E9",
  spa: "#0EA5E9",
  // Shopping — amber
  shopping: "#F59E0B",
  // Transport — slate
  transport: "#64748B",
};

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  food: Utensils,
  restaurant: Utensils,
  cafe: Coffee,
  culture: Landmark,
  museum: Landmark,
  history: Landmark,
  nature: TreePine,
  park: TreePine,
  nightlife: Moon,
  bar: Moon,
  adventure: Mountain,
  sport: Dumbbell,
  relaxation: Waves,
  wellness: Sparkles,
  spa: Sparkles,
  transport: Car,
  accommodation: Hotel,
  hotel: Hotel,
  shopping: ShoppingBag,
  attraction: Camera,
  activity: TreePine,
};

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category?.toLowerCase()] || "#6B7280";
}

export function getCategoryIcon(category: string): LucideIcon {
  return CATEGORY_ICONS[category?.toLowerCase()] || MapPin;
}

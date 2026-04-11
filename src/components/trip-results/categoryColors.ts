import {
  Utensils, Coffee, Landmark, TreePine, Moon,
  Mountain, Dumbbell, Waves, Sparkles, Car,
  Hotel, ShoppingBag, Camera, MapPin,
  type LucideIcon
} from "lucide-react";

export const CATEGORY_COLORS: Record<string, string> = {
  food: "#F97316",
  restaurant: "#F97316",
  cafe: "#F97316",
  culture: "#A855F7",
  museum: "#A855F7",
  history: "#A855F7",
  nature: "#22C55E",
  park: "#22C55E",
  nightlife: "#EC4899",
  bar: "#EC4899",
  adventure: "#EF4444",
  sport: "#EF4444",
  relaxation: "#3B82F6",
  wellness: "#3B82F6",
  spa: "#3B82F6",
  transport: "#6B7280",
  accommodation: "#0D9488",
  hotel: "#0D9488",
  shopping: "#F59E0B",
  attraction: "#A855F7",
  activity: "#22C55E",
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

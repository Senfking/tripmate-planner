import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AITripResult } from "@/components/trip-results/useResultsState";

export type CuratedHighlight = {
  name: string;
  area: string;
  description: string;
  place_id: string;
  photo_url: string;
};

export type TripTemplate = {
  slug: string;
  destination: string;
  country: string;
  country_iso: string | null;
  duration_days: number;
  default_vibes: string[];
  default_pace: string;
  default_budget_tier: string;
  cover_image_url: string;
  description: string;
  recommended_season: string | null;
  category: string;
  chips: string[];
  cached_result: AITripResult | null;
  cached_at: string | null;
  cached_from_trip_id: string | null;
  display_order: number;
  curated_highlights: CuratedHighlight[] | null;
};

async function fetchTemplates(): Promise<TripTemplate[]> {
  const { data, error } = await (supabase as any)
    .from("trip_templates")
    .select("*")
    .order("category", { ascending: true })
    .order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TripTemplate[];
}

/** All templates, grouped by category (preserves insertion order). */
export function useTripTemplates() {
  return useQuery({
    queryKey: ["trip-templates"],
    queryFn: fetchTemplates,
    staleTime: 1000 * 60 * 10,
  });
}

/** A single template by slug. Cheap because the full list is cached. */
export function useTripTemplate(slug: string | undefined) {
  const { data, isLoading, error } = useTripTemplates();
  const template = data?.find((t) => t.slug === slug) ?? null;
  return { template, isLoading, error };
}

/** Group templates into ordered sections by category. */
export function groupByCategory(templates: TripTemplate[]) {
  const sections = new Map<string, TripTemplate[]>();
  for (const t of templates) {
    if (!sections.has(t.category)) sections.set(t.category, []);
    sections.get(t.category)!.push(t);
  }
  return Array.from(sections.entries()).map(([title, cards]) => ({ title, cards }));
}

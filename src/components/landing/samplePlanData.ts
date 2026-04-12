// Sample AI trip plan data matching the ai_trip_plans result format
// Used for template pages

export interface TemplatePlan {
  slug: string;
  title: string;
  description: string;
  duration: string;
  destinations: string[];
  totalCost: string;
  heroImg: string;
  category: string;
  result: {
    trip_name: string;
    summary: string;
    destinations: Array<{
      name: string;
      days: Array<{
        day_number: number;
        date_label: string;
        theme: string;
        activities: Array<{
          name: string;
          time: string;
          duration: string;
          cost_estimate: string;
          description: string;
          category: string;
          rating?: number;
          photo_url?: string;
        }>;
      }>;
      accommodation?: {
        name: string;
        area: string;
        price_per_night: string;
      };
    }>;
    estimated_budget: {
      total: string;
      per_day: string;
      breakdown: Record<string, string>;
    };
  };
}

export const TEMPLATE_PLANS: TemplatePlan[] = [
  {
    slug: "bali-7-days",
    title: "Bali 7 Day Itinerary",
    description: "Culture, beaches, and adventure across Ubud, Canggu, and Nusa Penida",
    duration: "7 days",
    destinations: ["Ubud", "Canggu", "Nusa Penida"],
    totalCost: "~$1,200",
    heroImg: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1200&q=80",
    category: "Trending",
    result: {
      trip_name: "Bali Adventure",
      summary: "A 7-day itinerary exploring Bali's temples, rice terraces, surf beaches, and island paradise.",
      destinations: [
        {
          name: "Ubud",
          days: [
            {
              day_number: 1, date_label: "Day 1", theme: "Temples & Terraces",
              activities: [
                { name: "Tegallalang Rice Terraces", time: "9:00 AM", duration: "2h", cost_estimate: "$5", description: "Stunning tiered rice paddies with swing photo ops", category: "sightseeing", rating: 4.7, photo_url: "https://images.unsplash.com/photo-1558862107-d49ef2a04d72?w=400&q=80" },
                { name: "Tirta Empul Temple", time: "12:00 PM", duration: "1.5h", cost_estimate: "$3", description: "Sacred water temple — try the purification ritual", category: "culture", rating: 4.6, photo_url: "https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=400&q=80" },
                { name: "Ubud Monkey Forest", time: "3:00 PM", duration: "2h", cost_estimate: "$7", description: "Ancient temple complex in a monkey-filled forest", category: "nature", rating: 4.5, photo_url: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=400&q=80" },
                { name: "Locavore dinner", time: "7:00 PM", duration: "2h", cost_estimate: "$45", description: "Award-winning Indonesian fine dining", category: "food", rating: 4.8 },
              ],
            },
            {
              day_number: 2, date_label: "Day 2", theme: "Sunrise & Coffee",
              activities: [
                { name: "Mount Batur Sunrise Trek", time: "4:00 AM", duration: "5h", cost_estimate: "$45", description: "Sunrise hike up an active volcano — breakfast at the summit", category: "adventure", rating: 4.8, photo_url: "https://images.unsplash.com/photo-1604999333679-b86d54738315?w=400&q=80" },
                { name: "Luwak Coffee Plantation", time: "10:00 AM", duration: "1h", cost_estimate: "$12", description: "Try the world's most expensive coffee and learn how it's made", category: "food", rating: 4.3 },
                { name: "Ubud Art Market", time: "1:00 PM", duration: "1.5h", cost_estimate: "$20", description: "Handicrafts, textiles, and souvenirs — bargain hard", category: "shopping", rating: 4.2 },
                { name: "Campuhan Ridge Walk", time: "4:00 PM", duration: "1h", cost_estimate: "Free", description: "Scenic hilltop walk at golden hour", category: "nature", rating: 4.5 },
              ],
            },
            {
              day_number: 3, date_label: "Day 3", theme: "Waterfalls & Wellness",
              activities: [
                { name: "Tegenungan Waterfall", time: "9:00 AM", duration: "2h", cost_estimate: "$3", description: "Most accessible waterfall near Ubud with swimming", category: "nature", rating: 4.4, photo_url: "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&q=80" },
                { name: "Tibumana Waterfall", time: "11:30 AM", duration: "1.5h", cost_estimate: "$2", description: "Hidden gem — less crowded, great for photos", category: "nature", rating: 4.6 },
                { name: "Balinese Spa Treatment", time: "3:00 PM", duration: "2h", cost_estimate: "$35", description: "Traditional Balinese massage and flower bath", category: "wellness", rating: 4.7 },
                { name: "Kecak Fire Dance", time: "7:00 PM", duration: "1h", cost_estimate: "$10", description: "Mesmerizing traditional dance performance at Ubud Palace", category: "culture", rating: 4.6 },
              ],
            },
          ],
          accommodation: { name: "Bisma Eight", area: "Central Ubud", price_per_night: "$85" },
        },
        {
          name: "Canggu",
          days: [
            {
              day_number: 4, date_label: "Day 4", theme: "Surf & Sunset",
              activities: [
                { name: "Echo Beach Surf Lesson", time: "8:00 AM", duration: "2h", cost_estimate: "$30", description: "Learn to surf with local instructors on Bali's best breaks", category: "adventure", rating: 4.6 },
                { name: "Lunch at Shady Shack", time: "12:00 PM", duration: "1h", cost_estimate: "$12", description: "Healthy bowls and smoothies in a garden setting", category: "food", rating: 4.5 },
                { name: "La Brisa Beach Club", time: "4:00 PM", duration: "3h", cost_estimate: "$25", description: "Sunset cocktails in a shipwreck-themed beachfront venue", category: "food", rating: 4.7 },
                { name: "Batu Bolong night market", time: "8:00 PM", duration: "1.5h", cost_estimate: "$10", description: "Street food and local vibes", category: "food", rating: 4.4 },
              ],
            },
            {
              day_number: 5, date_label: "Day 5", theme: "Temple & Beach Day",
              activities: [
                { name: "Tanah Lot Temple", time: "9:00 AM", duration: "2h", cost_estimate: "$8", description: "Iconic sea temple perched on a rock — stunning at any time", category: "culture", rating: 4.5, photo_url: "https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=400&q=80" },
                { name: "Berawa Beach", time: "12:00 PM", duration: "3h", cost_estimate: "Free", description: "Relax on black sand beaches with the crew", category: "beach", rating: 4.3 },
                { name: "COMO Beach Club", time: "4:00 PM", duration: "3h", cost_estimate: "$35", description: "Upscale poolside vibes overlooking the ocean", category: "food", rating: 4.6 },
              ],
            },
          ],
          accommodation: { name: "The Slow", area: "Canggu", price_per_night: "$120" },
        },
        {
          name: "Nusa Penida",
          days: [
            {
              day_number: 6, date_label: "Day 6", theme: "Island Paradise",
              activities: [
                { name: "Kelingking Beach (T-Rex)", time: "8:00 AM", duration: "3h", cost_estimate: "Free", description: "The iconic dinosaur-shaped cliff — hike down to the beach if you dare", category: "sightseeing", rating: 4.9, photo_url: "https://images.unsplash.com/photo-1570789210967-2cac24e2beee?w=400&q=80" },
                { name: "Angel's Billabong", time: "12:00 PM", duration: "1h", cost_estimate: "Free", description: "Natural infinity pool on the cliff edge", category: "nature", rating: 4.7 },
                { name: "Broken Beach", time: "1:30 PM", duration: "1h", cost_estimate: "Free", description: "Stunning natural rock archway over turquoise water", category: "sightseeing", rating: 4.6 },
                { name: "Sunset dinner at Penida Colada", time: "6:00 PM", duration: "2h", cost_estimate: "$20", description: "Cliff-edge restaurant with ocean views", category: "food", rating: 4.5 },
              ],
            },
            {
              day_number: 7, date_label: "Day 7", theme: "Underwater World",
              activities: [
                { name: "Crystal Bay Snorkeling", time: "8:00 AM", duration: "3h", cost_estimate: "$25", description: "Swim with manta rays and sea turtles", category: "adventure", rating: 4.8 },
                { name: "Diamond Beach", time: "12:00 PM", duration: "2h", cost_estimate: "Free", description: "White sand paradise tucked between cliffs", category: "beach", rating: 4.7 },
                { name: "Atuh Beach", time: "3:00 PM", duration: "2h", cost_estimate: "$3", description: "Remote beach with dramatic rock formations", category: "beach", rating: 4.6 },
              ],
            },
          ],
          accommodation: { name: "Penida Colada Guesthouse", area: "Nusa Penida", price_per_night: "$65" },
        },
      ],
      estimated_budget: {
        total: "$1,200",
        per_day: "$170",
        breakdown: { accommodation: "$550", activities: "$200", food: "$300", transport: "$150" },
      },
    },
  },
  // Placeholder entries for other templates
  ...["japan-10-days", "thailand-8-days", "greece-5-days", "italy-10-days", "portugal-7-days", "spain-8-days", "croatia-7-days", "colombia-9-days", "morocco-6-days", "peru-10-days", "costa-rica-7-days", "maldives-5-days", "tulum-5-days", "zanzibar-6-days", "phuket-5-days"].map(slug => ({
    slug,
    title: slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ").replace(/(\d+)/, " $1 ").trim() + " Itinerary",
    description: `Explore ${slug.split("-")[0].charAt(0).toUpperCase() + slug.split("-")[0].slice(1)} with a curated AI plan`,
    duration: slug.match(/(\d+)/)?.[1] + " days" || "7 days",
    destinations: [slug.split("-")[0].charAt(0).toUpperCase() + slug.split("-")[0].slice(1)],
    totalCost: "~$1,500",
    heroImg: "",
    category: "General",
    result: {
      trip_name: slug.split("-")[0].charAt(0).toUpperCase() + slug.split("-")[0].slice(1) + " Trip",
      summary: "Coming soon — full itinerary being generated.",
      destinations: [],
      estimated_budget: { total: "$1,500", per_day: "$200", breakdown: {} },
    },
  })),
];

export function getTemplatePlan(slug: string): TemplatePlan | undefined {
  return TEMPLATE_PLANS.find(p => p.slug === slug);
}

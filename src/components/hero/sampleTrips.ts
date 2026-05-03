// Hardcoded placeholder sample trips shown in the Hero's "Or browse a sample
// trip:" row. Real data + the /trips/sample/:id route handler are out of
// scope for this PR — clicking a card just navigates and produces a 404
// today. Images are Unsplash CDN URLs sized for a 16:9 card thumbnail.

export type SampleTrip = {
  id: string;
  title: string;
  image: string;
  tags: string[];
};

export const SAMPLE_TRIPS: SampleTrip[] = [
  {
    id: "singapore-foodie",
    title: "5 days in Singapore for 4 friends",
    image:
      "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=800&q=80&auto=format&fit=crop",
    tags: ["Foodie", "Culture", "First-time"],
  },
  {
    id: "bali-couples",
    title: "10 days in Bali, couples retreat",
    image:
      "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&q=80&auto=format&fit=crop",
    tags: ["Beach", "Wellness", "Romantic"],
  },
  {
    id: "tokyo-family",
    title: "7 days in Tokyo with the family",
    image:
      "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&q=80&auto=format&fit=crop",
    tags: ["Family", "City", "Food"],
  },
];

import { Helmet } from "react-helmet-async";

const SITE_URL = "https://junto.pro";

const howTo = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to plan a group trip with Junto",
  description:
    "Plan a trip with friends or family from idea to booking using Junto's AI group trip planner.",
  totalTime: "PT10M",
  step: [
    {
      "@type": "HowToStep",
      name: "Describe your trip",
      text: "Tell Junto who's going, when, and the vibe — beach, city, ski, road trip, honeymoon, etc. Junto's AI suggests destinations that fit.",
    },
    {
      "@type": "HowToStep",
      name: "Vote as a group",
      text: "Invite friends, vote on destinations, dates, hotels, restaurants and activities. Decisions are made transparently in one place.",
    },
    {
      "@type": "HowToStep",
      name: "Generate the itinerary",
      text: "Junto's AI builds a day-by-day itinerary tailored to your group, which everyone can edit in real time.",
    },
    {
      "@type": "HowToStep",
      name: "Track bookings and documents",
      text: "Forward hotel and flight confirmations, check visa and vaccination requirements, store passports and tickets.",
    },
    {
      "@type": "HowToStep",
      name: "Split expenses",
      text: "Snap receipts, split in any currency, settle balances when you're back home.",
    },
  ],
};

const faqPage = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the best app to plan a trip with friends?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Junto is designed for how friends actually plan trips together. Most apps handle one piece (bookings, splitting costs, or solo itineraries), so the rest ends up scattered across WhatsApp, spreadsheets, and Splitwise. Junto puts AI itinerary generation, group voting, real-time editing, and expense splitting in one place.",
      },
    },
    {
      "@type": "Question",
      name: "Why use Junto instead of starting from scratch every trip?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Because trips don't really end when you fly home. Junto is built to be your travel hub over time, not a one-off planner you abandon after the trip. Every trip you plan, past, current, and upcoming, lives in one home, with its itinerary, bookings, expenses, and group decisions intact. That means you can look back at what you did in Lisbon two years ago when a friend asks for tips, see who still owes you from the ski trip, or reuse the structure of a trip that worked well as a starting point for the next one. The more you use it, the more useful it gets: your travel history, your favorite spots, the people you travel with, all in one place instead of scattered across chats, screenshots, and folders.",
      },
    },
    {
      "@type": "Question",
      name: "How does Junto use AI?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Junto's AI shows up across the trip, not just at the planning stage. You describe the trip in plain language, like 'four friends, Tokyo, late June, mid-range, foodie focus,' and Junto generates a full itinerary: days, activities, restaurants, accommodation, paced reasonably and grounded in real places. The real magic is everything after that. Snap a photo of a restaurant receipt and the AI reads the total, currency, date and line items, then splits it across the group. Forward a hotel confirmation email or screenshot a flight ticket and the AI pulls out the dates, locations and confirmation numbers and adds them to the trip automatically. It also surfaces visa and entry requirements per traveler, and adapts as plans change. Your group still drives the decisions; the AI handles the busywork so everyone stays on the same page without anyone playing trip secretary.",
      },
    },
    {
      "@type": "Question",
      name: "Why not just use ChatGPT to plan a trip?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "ChatGPT is great for brainstorming, but it stops at a wall of text. Junto picks up where the suggestions end. Once you have an idea of what you want, Junto turns it into a structured trip your group can vote on, edit together in real time, and come back to as plans change. It also handles the parts a chat can't: splitting expenses from a photo of a receipt, parsing booking confirmations from a screenshot, and tracking entry requirements like visas. ChatGPT helps you brainstorm; Junto helps you actually run the trip together.",
      },
    },
    {
      "@type": "Question",
      name: "Can Junto split travel expenses?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes — and you don't have to type anything. Snap a photo of the receipt and Junto's AI reads the total, currency, date and line items, then splits it across the group. Add expenses as the trip happens, split by person or share, handle multiple currencies, and see who owes whom at any time. It lives next to the itinerary, so you're not switching between Junto, your camera roll and Splitwise.",
      },
    },
    {
      "@type": "Question",
      name: "Does Junto work for solo travelers too?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, though Junto is built for groups first. Solo travelers use it for AI itinerary planning, saving bookings, and tracking entry requirements like visas and vaccinations. If you're planning alone with no chance of inviting anyone, Mindtrip or Wanderlog might be a closer fit. Junto's edge shows up the moment there's even one other person involved.",
      },
    },
    {
      "@type": "Question",
      name: "How is Junto different from TripIt, Wanderlog, or Splitwise?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Each of those does one piece well. TripIt organizes booking confirmations. Wanderlog focuses on solo itinerary building. Splitwise only handles cost splitting. Junto is built for the part those tools leave out: planning together. AI generates the trip, the group votes and edits in real time, expenses split alongside the plan, and bookings live in one place. It's the workspace, not the spreadsheet.",
      },
    },
    {
      "@type": "Question",
      name: "Is Junto a mobile app or a website?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Both. Native iOS and Android apps are coming soon. For now, Junto runs in any browser and installs to your home screen on phone or desktop, with every change syncing across devices in real time.",
      },
    },
  ],
};

export function HomeSEO() {
  return (
    <Helmet>
      <link rel="canonical" href={`${SITE_URL}/`} />
      <script type="application/ld+json">{JSON.stringify(howTo)}</script>
      <script type="application/ld+json">{JSON.stringify(faqPage)}</script>
    </Helmet>
  );
}

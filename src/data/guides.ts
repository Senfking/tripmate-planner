// Single source of truth for the Junto Field Guide library.
// New articles get a slug + status here and are picked up by /guides and
// the related-reading rails on individual guide pages.

export type GuideStatus = "live" | "coming-soon";
export type GuideCategory = "planning" | "money" | "on-the-road";

export interface Guide {
  slug: string;
  number: string; // "001", "002" …
  category: GuideCategory;
  title: string; // short, human title for cards
  longTitle: string; // SEO title (used in <title> when placeholder)
  description: string; // SEO meta description / card subtitle
  readTime: string; // "12 min read"
  status: GuideStatus;
  image: string; // cover (Unsplash, webp)
  publishedAt?: string; // "June 2026"
  // Placeholder copy — only rendered for status === "coming-soon".
  placeholder?: {
    promise: string; // single sentence pitch on the placeholder
    bullets: string[]; // 3–5 things the article will cover
  };
}

export const CATEGORIES: Record<GuideCategory, { label: string; blurb: string }> = {
  planning: {
    label: "Planning",
    blurb: "Get the trip out of the group chat and onto the calendar.",
  },
  money: {
    label: "Money",
    blurb: "Budgets, bookings, and the unspoken rules of who pays for what.",
  },
  "on-the-road": {
    label: "On the road",
    blurb: "What you actually need once you're there.",
  },
};

export const GUIDES: Guide[] = [
  {
    slug: "how-to-plan-a-group-trip",
    number: "001",
    category: "planning",
    title: "How to plan a group trip that actually happens",
    longTitle: "How to Plan a Group Trip (Without the 200-Message Group Chat)",
    description:
      "The honest playbook for planning a group trip with friends. 8 rules that actually work, the 5 reasons most group trips collapse, and the exact tools to skip the spreadsheet hell.",
    readTime: "12 min read",
    status: "live",
    image:
      "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1600&q=75&auto=format&fit=crop&fm=webp",
    publishedAt: "June 2026",
  },
  {
    slug: "how-to-split-expenses-on-a-group-trip",
    number: "002",
    category: "money",
    title: "How to split expenses on a group trip",
    longTitle: "How to Split Expenses on a Group Trip Without Losing Friends",
    description:
      "The four ways to split group-trip costs — even split, weighted, item-by-item, and pot — and when to use each. Plus the one rule that keeps the math (and the friendships) clean.",
    readTime: "9 min read",
    status: "coming-soon",
    image:
      "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1600&q=75&auto=format&fit=crop&fm=webp",
    placeholder: {
      promise:
        "A field manual for the awkward dinner-bill moment, the villa deposit, and the friend who 'forgot' Venmo exists.",
      bullets: [
        "The four split models (and when each one is the right call)",
        "Why even splits beat fairness math for trips under €1.5k",
        "The 48-hour settle rule that prevents the trip-end resentment spiral",
        "How to handle the friend who skipped the boat day but ate the food",
      ],
    },
  },
  {
    slug: "how-to-choose-a-destination-with-friends",
    number: "003",
    category: "planning",
    title: "How to choose a vacation destination with friends",
    longTitle: "How to Choose a Vacation Destination With Friends (and Actually Decide)",
    description:
      "Bali vs Tulum vs Lisbon ends nowhere because everyone's voting on different trips. A 3-step framework — vibe, constraints, single transferable vote — to lock a destination in 48 hours.",
    readTime: "8 min read",
    status: "coming-soon",
    image:
      "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1600&q=75&auto=format&fit=crop&fm=webp",
    placeholder: {
      promise:
        "The decision framework that ends the three-week 'but what about Croatia' loop in your group chat.",
      bullets: [
        "Why destination-first voting always breaks down",
        "The vibe → constraints → shortlist sequence that doesn't",
        "Single transferable vote in plain English (and a free template)",
        "How to handle the one friend who refuses to commit until flights are booked",
      ],
    },
  },
  {
    slug: "group-trip-packing-list",
    number: "004",
    category: "on-the-road",
    title: "The group trip packing list",
    longTitle: "The Group Trip Packing List (Beach, City, Adventure)",
    description:
      "What to actually pack for a group trip — the shared items nobody remembers, the personal essentials, and the three things that quietly save every trip when one person brings them.",
    readTime: "7 min read",
    status: "coming-soon",
    image:
      "https://images.unsplash.com/photo-1565026057447-bc90a3dceb87?w=1600&q=75&auto=format&fit=crop&fm=webp",
    placeholder: {
      promise:
        "A no-fluff checklist of what to bring when you're sharing a villa, a car, or a tent with five other adults.",
      bullets: [
        "The 'shared kit' — one Bluetooth speaker, one first-aid bag, one universal adapter",
        "The personal essentials nobody packs until the first night",
        "Beach / city / adventure variants with swap-outs",
        "What to leave at home so the group-chat 'can someone bring X' messages stop",
      ],
    },
  },
  {
    slug: "best-apps-for-group-travel",
    number: "005",
    category: "planning",
    title: "Best apps for group travel in 2026",
    longTitle: "The Best Apps for Group Travel in 2026 (Tested on Real Trips)",
    description:
      "An honest, opinionated tour of the apps that survive contact with a real group trip — for splitting costs, voting on plans, sharing photos, and keeping the itinerary alive.",
    readTime: "10 min read",
    status: "coming-soon",
    image:
      "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=1600&q=75&auto=format&fit=crop&fm=webp",
    placeholder: {
      promise:
        "Which apps to use, which to skip, and the one stack that replaces the spreadsheet for good.",
      bullets: [
        "Splitwise vs Tricount vs settling in-app — what actually works at scale",
        "Voting tools that aren't a Google Form",
        "Why the WhatsApp group is the worst itinerary tool you can pick",
        "The minimum-viable group-trip stack — three apps, no more",
      ],
    },
  },
];

export const guideUrl = (slug: string) => `/guides/${slug}`;

export const getGuide = (slug: string) => GUIDES.find((g) => g.slug === slug);

export const getRelatedGuides = (slug: string, limit = 3) =>
  GUIDES.filter((g) => g.slug !== slug).slice(0, limit);

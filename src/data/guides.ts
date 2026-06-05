// Single source of truth for the Junto Field Guide library.
// New articles get a slug + status here and are picked up by /guides and
// the related-reading rails on individual guide pages.

export type GuideStatus = "live" | "coming-soon";
export type GuideCategory = "planning" | "money" | "on-the-road";

export interface GuideChapter {
  title: string;
  body: string;
}

export interface Guide {
  slug: string;
  number: string; // "001", "002" …
  category: GuideCategory;
  tag: string; // short noun for the hero eyebrow (e.g. "Money")
  title: string; // short, human title for cards
  heroTitle: string; // hero headline with one word that becomes italic accent
  heroAccent: string; // word inside heroTitle that gets the italic accent
  longTitle: string; // SEO title (used in <title> when placeholder)
  description: string; // SEO meta description / card subtitle
  readTime: string; // "12 min read"
  status: GuideStatus;
  image: string; // cover (Unsplash, webp)
  imageAlt: string;
  publishedAt?: string; // "June 2026"
  // Placeholder copy — only rendered for status === "coming-soon".
  placeholder?: {
    standfirst: string; // editorial standfirst (drop-cap paragraph)
    pullQuote: string; // big pull quote
    chapters: GuideChapter[]; // 4–5 chapter teasers w/ real prose
    closing: string; // short closing line above CTA
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
    tag: "Planning",
    title: "How to plan a group trip that actually happens",
    heroTitle: "How to plan a group trip that actually happens.",
    heroAccent: "actually",
    longTitle: "How to Plan a Group Trip (Without the 200-Message Group Chat)",
    description:
      "The honest playbook for planning a group trip with friends. 8 rules that actually work, the 5 reasons most group trips collapse, and the exact tools to skip the spreadsheet hell.",
    readTime: "12 min read",
    status: "live",
    image:
      "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1600&q=75&auto=format&fit=crop&fm=webp",
    imageAlt: "An airplane wing cutting through clouds at golden hour",
    publishedAt: "June 2026",
  },
  {
    slug: "how-to-split-expenses-on-a-group-trip",
    number: "002",
    category: "money",
    tag: "Money",
    title: "How to split expenses on a group trip",
    heroTitle: "How to split the bill without losing the friends.",
    heroAccent: "friends",
    longTitle: "How to Split Expenses on a Group Trip Without Losing Friends",
    description:
      "The four ways to split group-trip costs — even split, weighted, item-by-item, and pot — and when to use each. Plus the one rule that keeps the math (and the friendships) clean.",
    readTime: "9 min read",
    status: "coming-soon",
    image:
      "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1600&q=75&auto=format&fit=crop&fm=webp",
    imageAlt: "An espresso cup and folded euro notes on a worn café table",
    placeholder: {
      standfirst:
        "The villa is booked. The flights are confirmed. And somewhere on day four — usually after a long lunch and a second bottle — somebody opens a spreadsheet and the mood collapses. This is the guide that prevents that.",
      pullQuote:
        "Fairness math is the most expensive way to be cheap. Pick a model on day one and stop re-litigating the receipts.",
      chapters: [
        {
          title: "The four split models",
          body: "Even split, weighted by income, item-by-item, and the shared pot. Each one is the right answer in a specific situation and the wrong answer everywhere else. We map them onto real trips so you know which one you're actually running.",
        },
        {
          title: "Why even splits beat fairness math",
          body: "For trips under €1,500 per head, the time saved arguing about who had the lobster is worth more than the €18 imbalance. The math is in the article — and it's not close.",
        },
        {
          title: "The 48-hour settle rule",
          body: "Resentment compounds faster than interest. The one operational rule that keeps the group transferring within two days of getting home, even when nobody wants to be the one to send the screenshot.",
        },
        {
          title: "Edge cases that ruin trips",
          body: "The friend who skipped the boat day but ate the food. The couple who shared one room. The vegetarian and the wine list. How to price each one in without holding a tribunal.",
        },
      ],
      closing:
        "We're writing it now from the receipts of six recent group trips. Drop your email and we'll send it the day it ships.",
    },
  },
  {
    slug: "how-to-choose-a-destination-with-friends",
    number: "003",
    category: "planning",
    tag: "Direction",
    title: "How to choose a vacation destination with friends",
    heroTitle: "How to pick a destination before the group chat dies.",
    heroAccent: "dies",
    longTitle: "How to Choose a Vacation Destination With Friends (and Actually Decide)",
    description:
      "Bali vs Tulum vs Lisbon ends nowhere because everyone's voting on different trips. A 3-step framework — vibe, constraints, single transferable vote — to lock a destination in 48 hours.",
    readTime: "8 min read",
    status: "coming-soon",
    image:
      "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1600&q=75&auto=format&fit=crop&fm=webp",
    imageAlt: "A weathered paper map curling open on a wooden table",
    placeholder: {
      standfirst:
        "Bali. Tulum. Lisbon. Croatia. Mexico City. Three weeks in, the WhatsApp thread looks like a UN debate and you still don't have flights. The reason is structural — and the fix takes about an hour.",
      pullQuote:
        "Destination-first groups argue for weeks. Vibe-first groups book on Tuesday. Same friends, same budget, completely different outcome.",
      chapters: [
        {
          title: "Why destination-first voting breaks",
          body: "Bali and Lisbon aren't options on the same axis — they're answers to different questions. When people vote destination first, they're voting their fantasy of the trip. That's why nobody can let go.",
        },
        {
          title: "Vibe → constraints → shortlist",
          body: "A three-step sequence that gets the group to agree on the trip before the place. We walk through each step with the exact prompts to drop in the chat, and the time-box for each round.",
        },
        {
          title: "Single transferable vote in plain English",
          body: "The fairest voting system you've never used, explained without the political-science jargon. Plus the free template — paste into a doc, send the link, get an answer in 24 hours.",
        },
        {
          title: "Handling the holdout",
          body: "There's always one friend who refuses to commit until flights are booked. Three scripts for moving them off the fence without burning the friendship or the trip.",
        },
      ],
      closing:
        "Coming next from the Field Guide. Start a trip in Junto now and we'll send the article straight to your trip when it drops.",
    },
  },
  {
    slug: "group-trip-packing-list",
    number: "004",
    category: "on-the-road",
    tag: "Gear",
    title: "The group trip packing list",
    heroTitle: "The packing list nobody remembers until day two.",
    heroAccent: "remembers",
    longTitle: "The Group Trip Packing List (Beach, City, Adventure)",
    description:
      "What to actually pack for a group trip — the shared items nobody remembers, the personal essentials, and the three things that quietly save every trip when one person brings them.",
    readTime: "7 min read",
    status: "coming-soon",
    image:
      "https://images.unsplash.com/photo-1565026057447-bc90a3dceb87?w=1600&q=75&auto=format&fit=crop&fm=webp",
    imageAlt: "An open suitcase with neatly rolled clothes and a passport",
    placeholder: {
      standfirst:
        "Six adults sharing a villa, a rental car, and one questionable adapter. Group trips fail at packing the same way they fail at everything else — by assuming somebody else has already handled it.",
      pullQuote:
        "There's a shared kit and there's a personal kit. The trips that go smoothly are the ones where someone owned the difference before takeoff.",
      chapters: [
        {
          title: "The shared kit",
          body: "Bluetooth speaker. First-aid bag. Universal adapter. Card reader. The list of communal items that should be assigned to one person — never crowdsourced from the group chat at 11pm the night before.",
        },
        {
          title: "The personal essentials",
          body: "The four things every adult forgets at least once: a charger that fits the local socket, a refillable water bottle, a portable battery, and a real pair of walking shoes. Yes, real ones.",
        },
        {
          title: "Beach / city / adventure variants",
          body: "Three swap-out tables for the three trip archetypes. Strike-through what you don't need, screenshot the rest. No 47-item Notion doc required.",
        },
        {
          title: "Things to leave at home",
          body: "The hair dryer the Airbnb already has. The third pair of shoes. The novel you won't read. A short list of confident no's that makes the suitcase lighter and the trip easier.",
        },
      ],
      closing:
        "Field-tested across beach weeks, city breaks, and one regrettable hiking weekend. The final list ships soon.",
    },
  },
  {
    slug: "best-apps-for-group-travel",
    number: "005",
    category: "planning",
    tag: "Tools",
    title: "Best apps for group travel in 2026",
    heroTitle: "The apps that survive contact with a real group trip.",
    heroAccent: "survive",
    longTitle: "The Best Apps for Group Travel in 2026 (Tested on Real Trips)",
    description:
      "An honest, opinionated tour of the apps that survive contact with a real group trip — for splitting costs, voting on plans, sharing photos, and keeping the itinerary alive.",
    readTime: "10 min read",
    status: "coming-soon",
    image:
      "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=1600&q=75&auto=format&fit=crop&fm=webp",
    imageAlt: "A hand holding a phone with a map app open in low evening light",
    placeholder: {
      standfirst:
        "Every group trip starts with the same lie: 'we'll just use WhatsApp.' Three days in, there are four separate threads, a Notion doc nobody reads, and a Splitwise that hasn't been opened since check-in. There is a better stack.",
      pullQuote:
        "The right tool isn't the one with the most features. It's the one your least-online friend will actually open on day three.",
      chapters: [
        {
          title: "Splitting money",
          body: "Splitwise vs Tricount vs settling inside a planning app. We rank them on the only metric that matters: will the friend who 'forgot' send the transfer this time.",
        },
        {
          title: "Voting and decisions",
          body: "The four tools that work better than a Google Form for picking a villa, a restaurant, or a day trip. Plus the one decision pattern that doesn't need any app at all.",
        },
        {
          title: "Itinerary that stays alive",
          body: "Why the shared Notion doc dies on day one, and what to use instead so the plan keeps updating as the trip evolves. Hint: it isn't another spreadsheet.",
        },
        {
          title: "The minimum-viable stack",
          body: "The three-app shortlist that replaces the spreadsheet, the group chat sub-thread, and the lost Google Doc — without making anyone download something new every trip.",
        },
      ],
      closing:
        "Honest reviews, no affiliate fees, ships when we've tested everything on one more real trip.",
    },
  },
];

export const guideUrl = (slug: string) => `/guides/${slug}`;

export const getGuide = (slug: string) => GUIDES.find((g) => g.slug === slug);

export const getRelatedGuides = (slug: string, limit = 3) =>
  GUIDES.filter((g) => g.slug !== slug).slice(0, limit);

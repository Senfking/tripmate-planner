// Single source of truth for the Junto Field Guide library.
// All five guides are live editorial articles. The "GuidePlaceholder"
// renderer reads from this file: title, hero, standfirst, pull quote,
// chapters (with rich body + optional checklists), and a closing line.

export type GuideStatus = "live" | "coming-soon";
export type GuideCategory = "planning" | "money" | "on-the-road";

export interface GuideChapter {
  title: string;
  // Free-form prose. Split on \n\n for paragraphs.
  body: string;
  // Optional checklist / numbered list rendered after the prose.
  list?: { kind: "bullet" | "ordered"; items: string[] };
}

export interface Guide {
  slug: string;
  number: string;
  category: GuideCategory;
  tag: string;
  title: string;
  heroTitle: string;
  heroAccent: string;
  longTitle: string;
  description: string;
  readTime: string;
  status: GuideStatus;
  image: string;
  imageAlt: string;
  publishedAt?: string;
  // Article body. Optional only because the bespoke 001 page has its own.
  article?: {
    standfirst: string;
    pullQuote: string;
    chapters: GuideChapter[];
    closing: string;
  };
}

/**
 * Search snippets get cut around 160 characters and Ahrefs flags anything
 * longer. Guide `description` doubles as on-page teaser copy, so clamp a
 * copy of it for the head instead of shortening the teaser itself.
 */
export function seoDescription(text: string, max = 155): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(", "), cut.lastIndexOf(" "));
  return cut.slice(0, stop > max * 0.6 ? stop : max).replace(/[,.\s]+$/, "") + ".";
}

/** Titles over ~60 characters get truncated in the SERP. */
export function seoTitle(guide: Pick<Guide, "longTitle" | "title">): string {
  const suffix = " | Junto";
  const long = guide.longTitle + suffix;
  if (long.length <= 60) return long;
  const short = guide.title + suffix;
  if (short.length <= 60) return short;
  return guide.title;
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
    readTime: "9 min read",
    status: "live",
    image:
      "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1600&q=75&auto=format&fit=crop&fm=webp",
    imageAlt: "An airplane wing cutting through clouds at golden hour",
    publishedAt: "June 2026",
  },

  // -------------------------------------------------------------------------
  // 002 — Splitting expenses
  // -------------------------------------------------------------------------
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
      "Four ways to split group-trip costs: even, weighted, item-by-item, and the shared pot. When each one works, the apps worth using, and the one habit that keeps the math (and the friendships) clean.",
    readTime: "6 min read",
    status: "live",
    image:
      "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1600&q=75&auto=format&fit=crop&fm=webp",
    imageAlt: "An espresso cup and folded euro notes on a worn café table",
    publishedAt: "June 2026",
    article: {
      standfirst:
        "The villa is booked, flights are confirmed, and somewhere on day four, usually after a long lunch and a second bottle of wine, someone opens a spreadsheet and the mood collapses. Splitting money is the part of a group trip that quietly breaks more friendships than anything else, and almost all of it is solvable on day one.",
      pullQuote:
        "Fairness math is the most expensive way to be cheap. Pick a split model on day one and stop re-litigating the receipts.",
      chapters: [
        {
          title: "Pick a split model on day one",
          body:
            "There are four split models that work at group scale. Pick one before you book anything. Picking it later, over dinner, in person, while someone is paying with their card, is how the trip turns into a tribunal.\n\nThe four are even, weighted, item-by-item, and the shared pot. They suit different trips. Mixing them halfway through is what kills the math.",
          list: {
            kind: "ordered",
            items: [
              "Even split. Total cost divided by number of people. One number, no arguments. Best for short trips with friends on similar incomes.",
              "Weighted split. Heavier earners cover more. Works only if you agree the weights before money is spent. Awkward to retrofit.",
              "Item-by-item. Each person pays for what they personally used. Most 'fair', most admin. Best for long trips or mixed-budget groups.",
              "Shared pot. Everyone sends €X up front, the trip spends from it, leftovers refund. Best when one or two people manage the logistics.",
            ],
          },
        },
        {
          title: "Why even splits beat fairness math",
          body:
            "For most group trips, an even split is mathematically 'unfair' by maybe €15 to €40 per person. The friend who didn't drink subsidises the friend who did. The vegetarian subsidises the steak.\n\nEven splits still win because the alternative, line-by-line accounting, costs the group two or three hours of admin over the course of the trip, plus the social cost of every receipt becoming a small negotiation. €30 is a cheap price to never have that conversation.\n\nRule of thumb: if the trip is under €1,500 a head and nobody has dramatically different drinking, eating, or activity patterns, split everything evenly and move on. You can buy the friend who got the short end of the stick a coffee when you're home and you'll still be ahead on time.",
        },
        {
          title: "When item-by-item is worth the admin",
          body:
            "Switch to item-by-item when one of these is true: someone on the trip doesn't drink and the bar bill is meaningful; someone can't do the boat day or the lift ticket or the tasting menu and would feel taxed by it; the trip is long enough (ten days or more) that small inequities compound into real money.\n\nIf you go item-by-item, you need an app. The math is too annoying to do in a Notes doc. Splitwise is the default, Tricount is the better European option, Settle Up is the strongest free one. All three let one person enter an expense, mark who it's for, and have the app calculate the final transfers at the end of the trip.",
        },
        {
          title: "The shared-pot pattern",
          body:
            "Underused, often the best answer. Before the trip starts, everyone sends €X to one person (the 'banker'). The banker pays for the villa, the rental car, the group dinners, the boat day, anything shared. Personal stuff stays personal.\n\nThis works because nobody has to chase transfers mid-trip, one card racks up points instead of six, and the banker can see in real time whether the pot needs topping up before it runs out.\n\nTwo rules make it work. Top the pot up before it's empty, not after. And refund any leftover the week you get home. Don't let it become a 'we'll use it for the next trip' slush fund, because that's how it disappears.",
        },
        {
          title: "Splitwise alternatives, ranked honestly",
          body:
            "Splitwise is the default, and that's mostly an awareness problem. It's a decent calculator, but it lives in its own app, disconnected from the trip you're actually on. Receipts in one place, the itinerary in another, the group chat in a third, and by day five nobody remembers which app the rental car got logged in.\n\nHere's the ranking, with the trade-off each one makes.\n\nJunto is our pick, and we'll explain the bias. Splits live inside the trip, next to the itinerary and the group. Add an expense the moment it happens, the math updates in real time, and at the end of the trip there's one settle screen instead of a separate app to chase. Multi-currency is built in with proper FX (not yesterday's rate), the shared-pot pattern is a first-class feature, and there's no paywall on the things groups actually need. The reason it beats Splitwise isn't the math, it's that the expense, the receipt photo, and the dinner it paid for are all the same record.\n\nTricount is the strongest standalone. Free, no ads, multi-currency done right. Best pick if you specifically don't want a planner attached.\n\nSettle Up is offline-first, which sounds niche until you're on a boat or up a mountain. Strongest free tier of the standalone apps.\n\nKittysplit is web-only, no install. The right pick when one friend point-blank refuses to download another app.\n\nSplitwise itself is fine, but the free tier now caps how many expenses you can add per day unless you pay, and the ads are loud. If you've already got everyone on it, fine. If you're starting fresh in 2026, you can do better.\n\nWhatever you pick, the operational rule is the same: enter expenses the day they happen. Backfilling from a wallet full of receipts at the end of the trip is how the data quality dies, and the reason we built Junto's expense entry to take fewer taps than opening Splitwise in the first place.",
        },
        {
          title: "The 48-hour settle rule",
          body:
            "Settle within 48 hours of landing. Not 'sometime this week'. Not 'when we get the photos sorted'. 48 hours.\n\nThe reason is psychological. Day one home, the trip is still fresh and people will Venmo without thinking. Day five, the trip feels like history and €87 starts to feel abstract. Day fourteen, somebody hasn't paid and the group quietly resents them.\n\nThe person who organised the split should be the one who sends the screenshot, and they should send it once, in the group chat, with everyone's amount visible. Public accountability beats private nudging every time. In Junto, the settle screen is a single share link, so everyone sees the same final numbers and nobody needs to screenshot anything.",
        },
        {
          title: "Edge cases that ruin trips",
          body:
            "A short list of the situations that consistently cause problems, and the clean answer for each.",
          list: {
            kind: "bullet",
            items: [
              "The couple sharing one room. They pay 1.5x for the room, 1x each for everything else. Not 2x for the room. Not 1x. 1.5x.",
              "The friend who skips the boat day. They don't pay for the boat. They still pay their even share of the villa.",
              "The vegetarian or non-drinker on a big-eating trip. Switch dinners to item-by-item, keep everything else even. Don't make them argue every meal.",
              "The friend whose flight got cancelled and missed day one. They pay from the day they arrived. Refund their share of the missed night.",
              "The 'I'll pay you back later' friend. They pay before the trip ends, on the spot, or they stop ordering. Done in love, but done.",
            ],
          },
        },
      ],
      closing:
        "Junto handles all four split models inside the trip itself. Receipts live next to the itinerary, not in a separate app you'll forget to open. Start a trip and see why we think it beats Splitwise.",
    },
  },

  // -------------------------------------------------------------------------
  // 003 — Choosing a destination
  // -------------------------------------------------------------------------
  {
    slug: "how-to-choose-a-destination-with-friends",
    number: "003",
    category: "planning",
    tag: "Direction",
    title: "How to choose where to travel with friends",
    heroTitle: "How to pick a destination before the group chat dies.",
    heroAccent: "dies",
    longTitle: "How to Choose Where to Travel With Friends (and Actually Decide)",
    description:
      "Bali vs Tulum vs Lisbon ends nowhere because everyone's voting on different trips. A three-step framework (vibe, constraints, ranked vote) to lock a destination in 48 hours, plus the best places to travel with friends in 2026.",
    readTime: "5 min read",
    status: "live",
    image:
      "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1600&q=75&auto=format&fit=crop&fm=webp",
    imageAlt: "A weathered paper map curling open on a wooden table",
    publishedAt: "June 2026",
    article: {
      standfirst:
        "Bali. Tulum. Lisbon. Croatia. Mexico City. Three weeks in, the WhatsApp thread looks like a UN debate and you still don't have flights. The reason is structural, and the fix takes about an hour.",
      pullQuote:
        "Destination-first groups argue for weeks. Vibe-first groups book on Tuesday. Same friends, same budget, completely different outcome.",
      chapters: [
        {
          title: "Why destination-first voting always breaks",
          body:
            "When someone asks 'where should we go?', everyone hears a different question. One person hears 'beach reset'. One hears 'culture week'. One hears 'cheapest flights from London'. They all vote, the votes don't agree on anything, and nobody can let go of their pick because they're not actually defending the place. They're defending the trip they pictured.\n\nThe fix is to stop voting on destinations and start voting on the trip itself. Pick the shape first and the place falls out of it.",
        },
        {
          title: "Step 1. Vote the vibe",
          body:
            "Pick one of four. That's it. No 'a bit of both'. No 'beach but with culture'. One.",
          list: {
            kind: "bullet",
            items: [
              "Beach reset. Sun, water, food, sleep. Examples: Sardinia, Tulum, Zanzibar, Phuket, Maldives.",
              "City break. Walking, eating, museums, late dinners. Examples: Lisbon, Barcelona, Mexico City, Istanbul, Tokyo.",
              "Adventure. Hiking, diving, riding, real movement. Examples: Costa Rica, Peru, Iceland, Nepal, Jordan.",
              "Event anchor. A wedding, a festival, a birthday, built around one fixed thing. The location follows the anchor.",
            ],
          },
        },
        {
          title: "Step 2. Name the constraints out loud",
          body:
            "Three numbers. Say them in the chat. Don't dance around them.",
          list: {
            kind: "ordered",
            items: [
              "Total budget per person, all in. Flights, accommodation, food, activities. One number.",
              "The window. 'Last week of September' or 'between July 10 and August 5'. Be specific.",
              "Max flight time from the most awkward home airport. If one friend lives in Sydney and everyone else in London, that's the constraint, not the average.",
            ],
          },
        },
        {
          title: "Step 3. Ranked vote, 24 hours",
          body:
            "Whoever runs the planning shortlists three to five destinations that fit the vibe and constraints. Send them in a list. Each person ranks them 1, 2, 3 (no abstaining, no 'I'm easy'). Lowest score wins.\n\nThe magic of ranked voting is that the winner is the destination the group is collectively least mad about, not the one one person loves most. That's exactly what you want for a group trip.\n\nGive it 24 hours. If someone hasn't voted by the deadline, they get the median rank assigned automatically. No revisits. No 'but what about Croatia'. The vote is the vote.",
        },
        {
          title: "Best places to travel with friends in 2026",
          body:
            "If you want a quick shortlist sorted by vibe, here's what's been working for groups this year, based on what people are actually booking through us.",
          list: {
            kind: "bullet",
            items: [
              "Beach reset on a budget: Sardinia (Sept), Zanzibar (Feb), Phuket (Nov). Each under €1,400 a head for a week with flights from Europe.",
              "Beach reset, no budget: Maldives water villas, Bora Bora, Seychelles. Pick three nights, not seven. You'll spend the same and look smarter.",
              "City break under five days: Lisbon, Barcelona, Istanbul, Prague. Cheap flights, good food, walkable.",
              "Long-haul city: Tokyo, Mexico City, Bangkok. Plan ten days minimum. Jet lag eats the first 48 hours.",
              "Adventure for fit groups: Peru (Inca Trail), Nepal (Annapurna foothills), Costa Rica (Pacific coast). All work in groups of four to eight.",
              "First-time-together groups: Croatia island-hopping, Greek islands, southern Spain. Hard to mess up, easy to please everyone.",
            ],
          },
        },
        {
          title: "The kill-criteria pass",
          body:
            "Before the ranked vote, run the shortlist through five hard filters. If a destination fails any one of them, it's out. No discussion, no 'but it would be amazing in October'. Out.\n\nThese filters exist because group trips die in the details, not the dream. A place can be perfect on Instagram and impossible in practice, and you only find out three weeks in when someone realises their passport expires in four months.",
          list: {
            kind: "ordered",
            items: [
              "Passport validity. Most of Asia, the Middle East, and a lot of Latin America require six months past your return date. Anyone in the group inside that window kills the destination unless they're willing to renew on a rush fee.",
              "Visa lead time. US ESTA is instant. Schengen for non-EU passports can be six to eight weeks. India e-visa is fine but needs a clean photo. Check the slowest passport in the group, not your own.",
              "Season. 'Bali in February' sounds dreamy until you learn it's monsoon. Cross-check the destination against shoulder/peak/rainy season for your actual dates. Skyscanner's 'cheapest month' view tells you more than any travel blog.",
              "Direct flight access. Two stops with a 9-hour layover at 4am is not a holiday, it's a sentence. If nobody in the group has a direct or one-stop option under 14 hours total, drop it.",
              "Group accommodation. If you're six people, you need either two adjacent apartments or one villa. Check Airbnb supply for your exact dates before you fall in love with a place. Nothing kills momentum like discovering everywhere sleeps four.",
            ],
          },
        },
        {
          title: "A worked example",
          body:
            "Six friends, late twenties, based across London, Berlin, and New York. Budget €1,400 a head all-in. Window: last two weeks of September. Group chat has been arguing since June.\n\nStep 1, vibe vote (Monday): four 'beach reset', one 'city break', one 'adventure'. Beach reset wins. The two outliers swallow it.\n\nStep 2, constraints (Tuesday): €1,400/head, Sep 13-21, max 12 hours of total flight time from NYC (the slowest origin).\n\nKill-criteria pass: Bali is out (flight time blows the cap), Tulum is in, Sardinia is in, Zanzibar is out (one passport at 5 months validity), Greece is in.\n\nStep 3, ranked vote (Wednesday): three picks, 24 hours.\n  • Tulum — 14 points\n  • Sardinia — 10 points (winner: lowest score)\n  • Greek islands — 12 points\n\nFlights booked Thursday. Villa booked Friday. Total elapsed time from 'let's plan something' to confirmation: five days. The same group spent eight weeks the year before and never left their group chat.",
        },
        {
          title: "Handling the holdout",
          body:
            "Every group has one person who refuses to commit until flights are booked. Don't fight it. Set a deadline ('flights book Sunday at 8pm') and book without them if they haven't engaged by then.\n\nThis sounds harsh. It isn't. It's protecting the trip from the person whose indecision would otherwise sink it. Nine times out of ten, they book within an hour of seeing the others have committed. The tenth time, the trip happens without them and they come to the next one.",
        },
      ],
      closing:
        "Junto runs the vote, holds the shortlist, and locks the dates the moment quorum is hit. Start a trip and watch how fast the group chat goes quiet.",
    },
  },

  // -------------------------------------------------------------------------
  // 004 — Packing list
  // -------------------------------------------------------------------------
  {
    slug: "group-trip-packing-list",
    number: "004",
    category: "on-the-road",
    tag: "Gear",
    title: "The group trip packing list",
    heroTitle: "The packing list nobody remembers until day two.",
    heroAccent: "remembers",
    longTitle: "The Group Trip Packing List (Beach, City, Weekend Away)",
    description:
      "A real, tested packing list for trips with friends: the shared kit somebody needs to own, the personal essentials nobody packs until day two, and trip-specific add-ons for beach, city, and weekend trips.",
    readTime: "5 min read",
    status: "live",
    image:
      "https://images.unsplash.com/photo-1565026057447-bc90a3dceb87?w=1600&q=75&auto=format&fit=crop&fm=webp",
    imageAlt: "An open suitcase with neatly rolled clothes and a passport",
    publishedAt: "June 2026",
    article: {
      standfirst:
        "Six adults sharing a villa, a rental car, and one questionable adapter. Group trips fail at packing the same way they fail at everything else: by assuming somebody else has already handled it. This is the list we wished we'd had on every group trip that went sideways at check-in.",
      pullQuote:
        "There's a shared kit and there's a personal kit. The trips that go smoothly are the ones where someone owned the difference before takeoff.",
      chapters: [
        {
          title: "The shared kit, assign it before the airport",
          body:
            "These are the things that are stupid to bring four of, and a disaster to bring zero of. Assign each one to a person before you leave. Group chat, single message, names against items. Don't crowdsource it at 11pm the night before.",
          list: {
            kind: "bullet",
            items: [
              "Bluetooth speaker (one good one beats four phone speakers)",
              "Universal travel adapter with USB-C and USB-A. Bring two of these, not one",
              "Portable battery pack, 20,000mAh minimum. The group beach day will kill phones",
              "Basic first-aid kit: plasters, ibuprofen, electrolyte sachets, antiseptic wipes, antihistamines",
              "Card reader, cards, dice. The rainy-afternoon insurance",
              "Aux cable for rental cars older than 2018 (yes, they still exist)",
              "A laundry bag. Six people, one shared bathroom, the floor fills up fast",
              "One nice outfit per person for the inevitable 'let's do somewhere proper tonight' dinner",
            ],
          },
        },
        {
          title: "The personal essentials",
          body:
            "The four things every adult forgets at least once. If you only check four boxes on this list, check these.",
          list: {
            kind: "ordered",
            items: [
              "A charger that fits the local socket. Not just an adapter, an actual cable that doesn't fall out of the wall",
              "Refillable water bottle (1L minimum). The single highest-impact item you can pack",
              "Portable battery, even if the group has one. Yours, in your bag, not in the villa",
              "Real walking shoes. Not the white sneakers you wore on the flight, real ones with grip",
            ],
          },
        },
        {
          title: "Weekend trip packing list",
          body:
            "Two to four nights, one bag, no checking in. The whole point of a weekend trip is friction-free, and an over-packed weekend bag kills that on day one.",
          list: {
            kind: "bullet",
            items: [
              "One outfit per day plus one spare. That's it",
              "One pair of shoes you walk in, one pair for the evening if needed",
              "Toiletries in a 100ml zip bag. Buy shampoo on arrival if you need more",
              "Phone, charger, headphones, ID, card. The four-item core",
              "A book or e-reader for the flight (not your laptop, you won't open it)",
              "One layer for cold airports and cold restaurants, even in summer",
            ],
          },
        },
        {
          title: "Beach vacation packing list",
          body:
            "What changes for a beach week. The trap on beach trips is over-packing clothes you'll never wear, because you'll be in a swimsuit for ten hours a day.",
          list: {
            kind: "bullet",
            items: [
              "Two swimsuits. One in the wash, one on you. That's enough",
              "Reef-safe sunscreen, SPF 30 or higher, in 100ml bottles. Bring more than you think",
              "A real hat. A cap is not a hat. Get one with a brim",
              "Sunglasses you don't mind losing. You will lose them",
              "Flip-flops and a real sandal you can walk in for an hour",
              "Aftersun or aloe. Somebody will burn on day one, every time",
              "A lightweight cover-up. The walk from beach to lunch is hotter than you expect",
              "Dry bag for the boat day. Phones survive, photos get taken",
            ],
          },
        },
        {
          title: "City break packing list",
          body:
            "A city trip is a walking trip. The single mistake is wearing the wrong shoes. Everything else is recoverable.",
          list: {
            kind: "bullet",
            items: [
              "One pair of shoes you can walk 15km in without thinking about it",
              "Layers, even in summer. Restaurants and museums are aggressively air-conditioned",
              "A small day bag (not the backpack you flew with)",
              "Offline-downloaded maps and translations. Don't trust hotel wifi",
              "One smart-casual outfit for the dinner that turns out to be fancier than expected",
              "A reusable shopping bag for markets, pastries, and the inevitable wine bottle",
            ],
          },
        },
        {
          title: "Things to leave at home",
          body:
            "The shorter, harder list. Confidence about what not to bring is what separates the people whose suitcases close from the people sitting on theirs at the airport.",
          list: {
            kind: "bullet",
            items: [
              "A hair dryer. Every Airbnb and hotel above one star has one",
              "Beach towels. Most accommodations provide them; if not, buy a cheap one on arrival",
              "The third pair of 'just in case' shoes",
              "The novel you've been meaning to start. You won't",
              "Anything you'd be devastated to lose. Group trips and expensive jewellery don't mix",
              "Full-size toiletries. Decant or buy on arrival, full stop",
            ],
          },
        },
        {
          title: "Villa and shared-bathroom logistics",
          body:
            "The thing nobody packs for: six adults sharing one or two bathrooms for a week. The fix is small, cheap, and saves the trip's mood by day three.",
          list: {
            kind: "bullet",
            items: [
              "A hanging toiletry bag with a hook. The shelf in the shared bathroom is not yours. Keep everything in your room and bring it in",
              "Quick-dry microfiber towel. Useful for the beach, essential when you're the fifth person in line for a shower",
              "Earplugs. The friend who snores will snore. The villa's walls are thinner than you think",
              "A sleep mask. East-facing windows and 5am sunrise in summer are a brutal combination",
              "Slip-on indoor shoes or thick socks. Tile floors at 7am are not a vibe",
              "One small grocery run on arrival, agreed in the group: coffee, milk, bread, fruit, eggs, salt, oil, dish soap, paper towels, bin bags. Costs €30, saves three trips on day one",
            ],
          },
        },
      ],
      closing:
        "Junto lets you assign the shared kit to specific people in the trip, with check-off and reminders. Start a trip and stop being the person who brought four adapters.",
    },
  },

  // -------------------------------------------------------------------------
  // 005 — Best apps
  // -------------------------------------------------------------------------
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
      "An honest, opinionated tour of the apps that survive a real group trip: for splitting costs, voting on plans, sharing photos, and keeping the itinerary alive. With the three-app minimum stack.",
    readTime: "5 min read",
    status: "live",
    image:
      "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=1600&q=75&auto=format&fit=crop&fm=webp",
    imageAlt: "A hand holding a phone with a map app open in low evening light",
    publishedAt: "June 2026",
    article: {
      standfirst:
        "Every group trip starts with the same lie: 'we'll just use WhatsApp.' Three days in, there are four separate threads, a Notion doc nobody reads, and a Splitwise that hasn't been opened since check-in. The right tools matter, but only if the friend who hates apps will actually open them.",
      pullQuote:
        "The right tool isn't the one with the most features. It's the one your least-online friend will actually open on day three.",
      chapters: [
        {
          title: "Splitting money",
          body:
            "The category most groups fix first, with the most overrated app. Splitwise is the default by inertia, not because it's the best, and in 2026 the free tier is heavily ad-supported and rate-limits how many expenses you can log per day. Worth knowing what else is out there.",
          list: {
            kind: "bullet",
            items: [
              "Junto. Splits live inside the trip itself, alongside the itinerary, the votes, and the group. One settle screen at the end, multi-currency built in, no separate app to chase. Our pick (obviously) and the reason we built it",
              "Tricount. Best standalone. Free, no ads, multi-currency done properly. Use this if you specifically don't want a planner attached",
              "Settle Up. Best offline mode. Strongest for trips with patchy reception (boats, mountains, rural)",
              "Kittysplit. Web-only, no install. The right pick when one friend refuses to download another app",
              "Splitwise. The default by awareness, not by quality. Fine for simple even splits, slow for multi-currency, and the free tier is now actively annoying",
            ],
          },
        },
        {
          title: "Voting and group decisions",
          body:
            "WhatsApp polls are bad. Google Forms are worse. A few tools that actually move groups to a decision.\n\nRallly is the best free pick for 'when are we free?'. Think Doodle without the ads. For destination or activity votes, ranked-choice tools like RankedVote and OpaVote beat 'reply 👍 if you're in' every time. For real-time decisions on the trip itself (restaurant, bar, beach), a quick four-option poll in the group chat is still fine. The problem isn't the tool, it's that nobody calls the vote closed.",
        },
        {
          title: "Itinerary apps",
          body:
            "The category where most apps die on contact. The Notion doc is the cliché. It gets one update on day one and never opens again. Wanderlog and TripIt are the two consumer apps people try; both work for solo travel and break in groups because nobody else logs in.\n\nThe rule for itinerary tools is simple: if the friend who isn't planning the trip won't open it twice, it doesn't count. Most apps fail that test. Junto was built around that test: read-only links, no signup required to view the plan, edits visible in real time.",
        },
        {
          title: "Photo sharing",
          body:
            "Underrated category, biggest source of post-trip annoyance. The standard answer is a shared iCloud album, which works perfectly if every person on the trip uses an iPhone, and falls apart the second one Android friend is in the group.\n\nCross-platform picks worth knowing: Google Photos shared albums (works on everything, free, no quality cap up to 16MP), WeTransfer for the dump-everything-at-the-end approach, and Lapse if you want the photos held back for a week. Surprisingly good for groups because nobody panics about being tagged in the wrong shot in real time.",
        },
        {
          title: "Maps and offline navigation",
          body:
            "Google Maps remains the answer for most things, but two underused features change group trips. First, download offline maps for the whole destination before you fly. Reception in old towns is unreliable and roaming charges add up fast. Second, shared lists. One person builds the 'restaurants', 'bars', and 'must do' lists and shares the links in the group chat once. Everyone sees the pins on their own map.\n\nFor anywhere off-grid, Maps.me and OsmAnd both work fully offline and are more accurate than Google Maps in rural areas. Worth installing the day before a hike, not the morning of.",
        },
        {
          title: "The minimum viable stack",
          body:
            "If you take one thing from this article, take this: three apps is enough. Adding more creates work, not value. Here's the stack that handles 90% of group trips without making anyone download something they'll never reopen.",
          list: {
            kind: "ordered",
            items: [
              "One planner for the itinerary, the votes, the budget. Junto (or a Notion doc you'll abandon by day two)",
              "One split app if you're not splitting inside the planner. Tricount, Settle Up, or Splitwise",
              "One shared photo album. Google Photos works everywhere, iCloud if you're all on iPhone",
            ],
          },
        },
        {
          title: "Docs, boarding passes, and the 4am check-in",
          body:
            "The category nobody plans for and everybody needs at 4am at the gate. Hotel PDFs, flight tickets, visa stamps, rental car confirmations, travel insurance. If they live in one person's inbox, they don't exist for the group.\n\nThe minimum: a single shared folder (Google Drive, iCloud Drive, Dropbox — pick one, one) with one PDF per booking, named clearly: '2026-09-13 Easyjet LGW-OLB Lisa.pdf'. Sounds anal. Saves a marriage at the rental car desk.\n\nApple Wallet and Google Wallet handle boarding passes natively — make sure everyone has added theirs the night before, not in the security queue. For passport photos, vaccination records, and travel insurance numbers, a single shared note in Apple Notes or Google Keep works fine and is searchable offline.\n\nThe one thing worth paying for: a password manager with sharing (1Password Families, Bitwarden). Share the rental car account, the Airbnb login, and the Wi-Fi password once and never again.",
        },
        {
          title: "What to skip",
          body:
            "A short list of categories where the app you'd install is worse than just not having one.",
          list: {
            kind: "bullet",
            items: [
              "Group chat apps beyond what you already use. Adding Discord or Slack for a six-person trip is overkill",
              "Currency converters. Google does it, your phone does it, you don't need a third app",
              "Habit and mood trackers 'for the trip'. You are on holiday, please",
              "Anything with a $9.99/mo subscription you'll cancel the week you get home",
            ],
          },
        },
      ],
      closing:
        "Junto is the planner part of that minimum stack: itinerary, votes, splits, photos, all in one place that doesn't expire after the trip. Start a trip and see if it sticks.",
    },
  },

  // -------------------------------------------------------------------------
  // 006 — Europe's new border rules
  // -------------------------------------------------------------------------
  {
    slug: "ees-etias-uk-eta-group-travel-2026",
    number: "006",
    category: "on-the-road",
    tag: "Borders",
    title: "Europe's new border rules, explained for groups",
    heroTitle: "Six friends, one border queue, three new systems.",
    heroAccent: "three",
    longTitle: "EES, ETIAS and the UK ETA in 2026: What Group Travellers Need to Know",
    description:
      "Europe's biometric Entry/Exit System is live, ETIAS is coming, and the UK now wants an ETA from most visitors. What each one is, who needs it, and how to get a group of six through the airport without one person holding everyone up.",
    readTime: "7 min read",
    status: "live",
    image:
      "https://images.unsplash.com/photo-1530521954074-e64f6810b32d?w=1600&q=75&auto=format&fit=crop&fm=webp",
    imageAlt: "Travellers waiting in a wide airport terminal at dawn",
    publishedAt: "August 2026",
    article: {
      standfirst:
        "Border admin used to be one line on the packing list: check the passport hasn't expired. That is no longer enough. Europe is midway through the biggest change to its external border in a generation, the UK has added its own pre-travel permission, and the practical effect on a group trip is simple: the slowest person in your group is now the whole group's arrival time.",
      pullQuote:
        "Nobody plans for the border. Then one friend gets pulled aside for fingerprints and the villa check-in slips by two hours.",
      chapters: [
        {
          title: "What actually changed",
          body:
            "Three separate systems, often confused, doing three different jobs. Understanding which applies to you takes about ninety seconds and saves a genuinely bad morning.\n\nThe short version: EES records you at the border, ETIAS is permission to travel before you leave, and the UK ETA is the same idea for Britain. They stack. Being fine on one says nothing about the others.",
          list: {
            kind: "ordered",
            items: [
              "EES (Entry/Exit System). The EU's biometric border register for non-EU travellers. Fingerprints and a facial image on first crossing, replacing the passport stamp. Rolled out progressively across Schengen border posts from late 2025 into 2026",
              "ETIAS. A pre-travel authorisation for visa-exempt non-EU nationals visiting Schengen. Applied for online, low fee, valid for multiple trips over several years. Scheduled to follow EES rather than run alongside it, so check its status before you rely on this article's timing",
              "UK ETA. Electronic Travel Authorisation, required for most visa-exempt visitors to the UK including EU citizens. Applied for through the official UK ETA app or gov.uk, valid for multiple visits over two years",
            ],
          },
        },
        {
          title: "Who in your group needs what",
          body:
            "Mixed-passport groups are where this gets messy, and most friend groups are mixed now. Run the list once, in the group chat, the week you book.\n\nEU or Schengen passport travelling inside Schengen: nothing new. You are unaffected by EES and ETIAS. If the trip includes the UK, you very likely need an ETA.\n\nUK, US, Canadian, Australian, and other visa-exempt passports entering Schengen: EES applies at the border, and ETIAS applies once it is in force. You still have the 90-days-in-any-180 limit, and EES makes that limit far easier for border staff to enforce because the count is now automatic.\n\nDual nationals: travel on one passport consistently for the whole trip. Entering on one and leaving on the other is how you end up with a mismatched record and a long conversation at departures.\n\nResidence permit holders and family members of EU citizens: usually exempt from EES registration, but bring the card, not a photo of it.",
        },
        {
          title: "The 90/180 rule now has teeth",
          body:
            "This is the part that catches people who have been travelling to Europe casually for years. Non-EU visitors can spend 90 days in any rolling 180-day period in the Schengen area. That rule is old. What is new is that a computer is counting.\n\nBefore EES, the count depended on a human reading ink stamps. In practice, plenty of overstays went unnoticed. With a biometric record on entry and exit, the count is exact and it follows you.\n\nThe practical implication for group trips: if someone in your group has been doing repeated European trips, a remote-work stint, or a long summer, they may be closer to their 90 days than they think. Have them add it up before booking, not at the gate. Ski week in January, long weekend in April, two weeks in August, and a Christmas trip is more days than most people expect.",
        },
        {
          title: "How EES changes the actual arrival",
          body:
            "The first crossing under EES takes longer than the old stamp. You give fingerprints and a facial image, and the record is created. Subsequent crossings are faster because the biometrics already exist and the gate verifies against them.\n\nThat first-time cost is the whole story for groups. Six people at a kiosk, one of whom has a scratched-up passport chip or a fingerprint the reader refuses to accept, is a real half hour. Ports and ferry terminals have felt this more than airports, which is worth knowing if you are driving to France or taking a ferry to Spain or Italy.\n\nWhat helps in practice:",
          list: {
            kind: "bullet",
            items: [
              "Assume a slower first arrival. Do not book the 90-minute connection or the tight rental car pickup on the way in",
              "Tell your group to travel together through the border, not scattered across the terminal. If one person gets held, everyone knows",
              "Land in daylight hours where you can. Understaffed early-morning and late-night shifts are where queues balloon",
              "Give the villa or hotel a realistic arrival window, plus an hour. Late self-check-in fees are avoidable",
              "Keep the return leg in mind too. Exit is now a recorded event, not a wave-through",
            ],
          },
        },
        {
          title: "Get the paperwork done as a group, not individually",
          body:
            "Every travel authorisation scheme has the same failure mode: five people do it in week one, the sixth does it the night before and hits a manual review. Applications are usually approved quickly, but a minority get pulled for extra checks that take days.\n\nMake it one shared task with one deadline, four weeks out. Then verify it, because 'yeah I did it' is not evidence.",
          list: {
            kind: "ordered",
            items: [
              "Check every passport's expiry against the trip dates, plus the destination's validity buffer. Many countries want three or six months beyond your return date",
              "Confirm blank pages. Some borders still want them",
              "Apply for the UK ETA if the itinerary touches Britain, including a layover where you pass through immigration",
              "Apply for ETIAS once it is required for your nationality, and use only the official EU site. Copycat sites charge several times the real fee for the same form",
              "Everyone posts a screenshot of their approval in the group. One person keeps a copy of all of them",
              "Check travel insurance covers the whole group and the actual activities, not just the flights",
            ],
          },
        },
        {
          title: "The scam layer nobody warns you about",
          body:
            "New rules create a market for confusion. Search for ETIAS or UK ETA and the paid results are full of intermediaries that reformat the government form and charge a large multiple of the official fee. They are not always illegal, but you are paying twenty or thirty euros for nothing.\n\nTwo rules keep you clean. Apply only through the official government domain or the official app, and never through a link in an ad or an email. And be suspicious of anything asking for payment in a currency that is not the scheme's stated fee currency.\n\nSame logic applies to the wave of 'visa check' messages that arrive by SMS before big travel weekends. No border authority texts you a payment link.",
        },
        {
          title: "Put it in the trip, not in someone's head",
          body:
            "The failure here is never knowledge. Somebody in the group always reads the news. The failure is that the knowledge lives in one person's head and never becomes a task with a name and a date on it.\n\nJunto keeps passport and entry requirements attached to the trip itself: each traveller's nationality and passport, what their document situation means for the destination, and a shared checklist the whole group can see. Nobody has to chase six people individually, and nobody arrives at the airport discovering that their passport expires seven weeks after the return flight.\n\nThe rules will keep moving through 2026 and beyond. Check the official source for your nationality close to departure, and treat any article, including this one, as orientation rather than gospel.",
        },
      ],
      closing:
        "Junto tracks each traveller's passport and entry requirements alongside the itinerary, so the border admin is a shared checklist instead of one person's problem. Start a trip and get it handled early.",
    },
  },

  // -------------------------------------------------------------------------
  // 007 — Is it safe to go?
  // -------------------------------------------------------------------------
  {
    slug: "is-it-safe-to-travel-group-decision-2026",
    number: "007",
    category: "planning",
    tag: "Risk",
    title: "Is it safe to go? How groups decide when the news looks bad",
    heroTitle: "One headline, six opinions, a non-refundable villa.",
    heroAccent: "six",
    longTitle: "Is It Safe to Travel There? How a Group Decides When the News Looks Bad (2026)",
    description:
      "Protests, strikes, wildfires, unrest, advisory levels. How to read what governments actually say, tell a real risk from a scary headline, and get a group of friends to a decision without one person vetoing the trip.",
    readTime: "8 min read",
    status: "live",
    image:
      "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=1600&q=75&auto=format&fit=crop&fm=webp",
    imageAlt: "A departures board and travellers moving through a busy terminal",
    publishedAt: "August 2026",
    article: {
      standfirst:
        "Every group has the friend who sends the link. A protest in the capital, a strike at the airport, a fire on the other side of the island, and suddenly a trip four people already paid for is up for debate at eleven at night. The problem is rarely the risk itself. It is that nobody in the group has agreed on how to judge one.",
      pullQuote:
        "A country is not a single place, and a headline is not an advisory. Most cancelled trips were never actually dangerous, just badly discussed.",
      chapters: [
        {
          title: "Read the advisory, not the article",
          body:
            "Governments publish travel advice for their own citizens, and it is far more specific than any news story. The UK FCDO, the US State Department, Germany's Auswärtiges Amt, Australia's Smartraveller and Canada's travel.gc.ca all cover roughly the same ground with different tone. They are free, they are updated fast, and they are the only source your insurer will care about.\n\nTwo things matter more than the headline level. First, geography: advice is usually drawn to regions, provinces or a distance from a border, and the scary part of a country is often a thousand kilometres from where you are going. Second, the reason: 'crime in specific neighbourhoods after dark' and 'armed conflict' both raise a level, and they are not the same trip.\n\nAlso read your own country's advice, not the loudest one. Advisories reflect the issuing government's politics and its consular capacity, not a universal safety score. Two allied countries will rate the same destination differently in the same week.",
          list: {
            kind: "bullet",
            items: [
              "Check the date the page was last updated, and what specifically changed",
              "Check the region, down to the province or city, not the country headline",
              "Check whether the wording is 'reconsider travel' or 'do not travel'. That gap is the whole decision",
              "Check the insurance line. Some policies void cover when you travel against your own government's advice",
              "Register with your embassy's traveller scheme if one exists. It costs two minutes",
            ],
          },
        },
        {
          title: "The five risks people actually meet",
          body:
            "In practice, the things that disrupt a normal group holiday are boring and predictable, and almost none of them are the thing on the news.\n\nStrikes and transport disruption. Air traffic control, rail and ferry strikes are announced in advance in most of Europe, and they wreck a tightly-booked itinerary far more often than any political event. Check the national rail operator and the airline's own disruption page before you build a day around a train.\n\nHeat, fire and storms. Summer in the Mediterranean now regularly means heat warnings and localised fire closures, and hurricane season is a real planning input in the Caribbean and parts of Mexico. Fires close roads and trails, not usually whole islands.\n\nProtests and civil unrest. Almost always concentrated in specific squares, government districts and dates. They are genuinely worth avoiding in person and almost never a reason to skip a country. Know where the flashpoint is and stay away from it.\n\nPetty crime. The single most likely thing to actually happen to your group, and the one nobody plans for. Phones and bags, in tourist crowds, at stations.\n\nHealth and access. Pharmacy rules, hospital access, and whether your insurance actually covers the activity someone booked. The scooter is the risk, not the region.",
        },
        {
          title: "How to have the conversation without a stalemate",
          body:
            "The group dynamic is the hard part. One person is anxious, one is dismissive, and the rest go quiet because it feels rude to argue about someone else's fear. That is how a trip dies by silence, or worse, how someone gets guilted into going somewhere they are not comfortable with.\n\nThe fix is to separate two questions that always get merged: is this dangerous, and is this still going to be fun? A place can be perfectly safe and still be a bad trip because half the itinerary is closed. Answer them one at a time.\n\nThen use an actual decision rule instead of vibes.",
          list: {
            kind: "ordered",
            items: [
              "One person, named, reads the official advisory and reports back with the region and the wording. Not a link dump, a summary",
              "Ask what would change our mind. Write the trigger down: an advisory level change, a specific airport closing, a named event being cancelled",
              "Set a decision date tied to money. The day before free cancellation ends is the deadline, not 'let's see'",
              "Anyone can opt out without a debate, and without losing their share of the group booking if it is still recoverable. Make that explicit early and people stop arguing defensively",
              "If the group is split, poll it once and take the result. A second poll on the same question is just the loudest person relitigating",
            ],
          },
        },
        {
          title: "Book so that a change of plan is cheap",
          body:
            "Most of the pain of a wobbly destination is financial, not physical. If cancelling costs nothing, the conversation is calm. If it costs four thousand euros, everyone argues about safety when they are really arguing about money.\n\nSo buy flexibility deliberately, and only where it matters. Refundable accommodation is usually worth the premium on the big shared booking. Refundable flights rarely are. Insurance bought at the time of booking, before an event becomes 'known', is the single highest-leverage thing most groups skip.\n\nWatch the known-event trap: once a storm is named or an advisory is raised, insurers treat it as foreseeable and cover for it disappears. Buying cover the week the news breaks is buying nothing.\n\nAnd keep one plan B destination alive on the shortlist rather than starting over. If you already voted between three options, the runner-up is still there, still costed, still agreed on.",
          list: {
            kind: "bullet",
            items: [
              "Pay the premium for free cancellation on the villa or the biggest booking, not on every coffee-sized line item",
              "Buy travel insurance the day you book, not the month you fly",
              "Keep the group's money in one shared, visible place so nobody is chasing reimbursements after a cancellation",
              "Screenshot every cancellation policy at the moment of booking. Terms pages change",
              "Note the free-cancellation cutoff date in the itinerary itself, as a dated item everyone sees",
            ],
          },
        },
        {
          title: "If you go, the small things that matter",
          body:
            "Deciding to go is not the end of it. Groups get into trouble by splitting up badly, not by being in the wrong country.\n\nAgree a meeting point for each day that does not depend on phones working, because in a crowd or a protest the network goes first. Share the accommodation address in writing with everyone, in the local language, not just as a pin one person has. Make sure at least two people have working local data. Keep a photo of everyone's passport page and insurance number in the shared trip, not in one person's camera roll.\n\nAvoid the flashpoint rather than the city. Demonstrations have addresses and dates, and local news lists them. Walk around the square, not through it.\n\nAnd know one number: the local emergency line, which is 112 across the EU and much of the world, plus your embassy's after-hours line if you are somewhere genuinely unsettled.",
        },
        {
          title: "Keep the decision in the trip, not the group chat",
          body:
            "Every point above dies the same death: it gets said once at midnight in a chat, and by morning it is fifty messages down. The advisory link, the cancellation deadline, the plan B, the meeting point, all of it needs to live somewhere that is still findable in three weeks.\n\nThat is the whole reason Junto exists. Destination options get voted on once, with the result recorded. Deadlines sit on the itinerary as dated items instead of in someone's memory. Passport and entry details live on the trip for every traveller. Shared costs stay visible, so if plans do change, everyone can see what was actually spent and what comes back.\n\nNone of that makes a destination safer. It makes the decision honest, quick, and something the group made together rather than something one anxious message decided for them.\n\nOne last thing: advice moves. Check your own government's page close to departure and treat this guide as a way to think, not a source of facts about any specific place.",
        },
      ],
      closing:
        "Junto keeps the vote, the deadlines, the entry requirements and the money in one shared place, so a wobbly week of news does not turn into a lost trip. Start a trip and decide it properly.",
    },
  },
];


export const guideUrl = (slug: string) => `/guides/${slug}`;

export const getGuide = (slug: string) => GUIDES.find((g) => g.slug === slug);

export const getRelatedGuides = (slug: string, limit = 3) =>
  GUIDES.filter((g) => g.slug !== slug).slice(0, limit);

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
];

export const guideUrl = (slug: string) => `/guides/${slug}`;

export const getGuide = (slug: string) => GUIDES.find((g) => g.slug === slug);

export const getRelatedGuides = (slug: string, limit = 3) =>
  GUIDES.filter((g) => g.slug !== slug).slice(0, limit);

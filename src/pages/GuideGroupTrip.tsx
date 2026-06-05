import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { useSmartBack } from "@/hooks/useSmartBack";

const SITE = "https://junto.pro";
const URL = `${SITE}/guides/how-to-plan-a-group-trip`;
const TITLE = "How to Plan a Group Trip (Without the 200-Message Group Chat)";
const DESCRIPTION =
  "The honest playbook for planning a group trip with friends. 8 rules that actually work, the 5 reasons most group trips collapse, and the exact tools to skip the spreadsheet hell.";

const HERO_IMG =
  "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1600&q=70&auto=format&fit=crop&fm=webp";
const IMG_DATES =
  "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=1200&q=65&auto=format&fit=crop&fm=webp";
const IMG_BUDGET =
  "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200&q=65&auto=format&fit=crop&fm=webp";
const IMG_DESTINATION =
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1200&q=65&auto=format&fit=crop&fm=webp";
const IMG_ANCHORS =
  "https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=1200&q=65&auto=format&fit=crop&fm=webp";
const IMG_BOOKING =
  "https://images.unsplash.com/photo-1551918120-9739cb430c6d?w=1200&q=65&auto=format&fit=crop&fm=webp";
const IMG_EXPENSES =
  "https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=1200&q=65&auto=format&fit=crop&fm=webp";
const IMG_DOCS =
  "https://images.unsplash.com/photo-1452421822248-d4c2b47f0c81?w=1200&q=65&auto=format&fit=crop&fm=webp";
const IMG_DECISIONS =
  "https://images.unsplash.com/photo-1543269865-cbf427effbad?w=1200&q=65&auto=format&fit=crop&fm=webp";

type Step = {
  title: string;
  rule: string;
  body: string;
  example: string;
  image: string;
  alt: string;
};

const STEPS: Step[] = [
  {
    title: "Kill the 'maybe' tier",
    rule: "10 maybes < 4 yeses.",
    body: "Send one message: 'Trip in Q3, who's actually in?' Give people 48 hours, then close the door. The friends who reply 'yeah maybe lol' are the same ones who drop out two weeks before flights and torch the deposit.",
    example: "Real example: a 9-person Lisbon plan died because three 'maybes' refused to commit to dates, so flights kept climbing past €400 until everyone gave up. A 4-person plan with the same dates would have booked in a week.",
    image: IMG_DATES,
    alt: "A traveler flipping through a paper calendar planning trip dates",
  },
  {
    title: "Say the budget number out loud",
    rule: "One number, all-in, before anything else.",
    body: "Don't say 'mid-range.' Say '€900 per person for the week, flights and Airbnb included.' This is the single highest-leverage move in group travel. It filters destinations, accommodation tiers, and activities in one sentence, and it surfaces the awkward gap between the friend on a startup salary and the friend whose parents are paying.",
    example: "The split that breaks groups: Person A is picturing €40 hostels and €15 dinners. Person B is picturing a private villa and a tasting menu. Both think they agreed to 'a chill week away.' Name the number on day one.",
    image: IMG_BUDGET,
    alt: "Euro and dollar banknotes spread out on a wooden table",
  },
  {
    title: "Vote on the vibe before the place",
    rule: "Beach reset, city break, adventure, or wedding side-trip. Pick one.",
    body: "Destination debates ('Bali vs Tulum vs Lisbon') never end because people are arguing about different trips. Vote the vibe first, then shortlist 2 to 3 destinations that fit. Single transferable vote, 24 hours, winner takes it. No revisits, no 'but what about Croatia.'",
    example: "A vibe-first group picks 'beach + nightlife, July, €1k cap' and lands on Ibiza in a day. A destination-first group is still negotiating in week three.",
    image: IMG_DESTINATION,
    alt: "Friends looking at a world map planning a destination together",
  },
  {
    title: "Anchors, not schedules",
    rule: "One anchor per day. The rest is air.",
    body: "Over-planning is why group travel feels like a school trip. For each day pick exactly one anchor: a dinner reservation, a hike, a beach club, a museum slot. Everything else is decided that morning over coffee. Anchors create momentum without trapping anyone who wakes up hungover.",
    example: "Day 3 in Mexico City: anchor = 8pm reservation at Pujol. That's the whole plan. People split off for markets, naps, walks, and reconverge at 7. Nobody is herding twelve adults through Coyoacán in 35°C heat.",
    image: IMG_ANCHORS,
    alt: "A group of friends having dinner together at a long candlelit table",
  },
  {
    title: "One person books, everyone pays",
    rule: "Group bookings: one card. Flights: your problem.",
    body: "Accommodation, the big group dinner, the boat day. These go on one person's card and they get paid back same week. Flights are personal because seat prefs, loyalty miles, and departure cities all differ. Don't try to coordinate 6 separate flight bookings on one Zoom call. It is a void.",
    example: "The booker gets a 2% credit card kickback and the gratitude of the group. Set this expectation early so nobody feels they're being volunteered.",
    image: IMG_BOOKING,
    alt: "A laptop screen showing a hotel booking confirmation page",
  },
  {
    title: "Log every receipt the day it happens",
    rule: "End-of-trip spreadsheets are a love language for resentment.",
    body: "Nobody remembers who paid for the taxi on Tuesday by the time Friday rolls around. Snap the receipt the moment it lands, tag who it was for (not always 'everyone', the vegetarian didn't have the €60 ribeye), settle in one transfer at the end.",
    example: "Junto reads the receipt, splits multi-currency, and shows live balances. A 14-day trip with 6 people and 80 expenses gets settled in two Revolut transfers. No spreadsheet, no arguments about whether wine counts.",
    image: IMG_EXPENSES,
    alt: "A close-up of a restaurant receipt and credit card on a wooden table",
  },
  {
    title: "One home for confirmations, passports, visas",
    rule: "If it's in someone's inbox, it doesn't exist.",
    body: "Hotel PDFs, flight tickets, visa stamps, vaccination cards, travel insurance, passport expiry dates. Put them in one shared place that everyone can pull up at a check-in desk at 4am. Then run a passport-validity check 8 weeks out: a passport that expires within 6 months of return will turn you away at immigration in most of Asia.",
    example: "A friend missed a Bali flight because his passport had 5 months and 27 days of validity. The airline refused boarding at the gate. Eight weeks of warning would have saved €600 and a ruined first day.",
    image: IMG_DOCS,
    alt: "A passport, boarding pass, and travel notebook on a wooden surface",
  },
  {
    title: "Decisions live on the plan, not in WhatsApp",
    rule: "If you're voting in chat, you've already lost the thread.",
    body: "When a comment about a restaurant lives 47 messages above the actual restaurant card, the group is now coordinating two parallel realities. Keep comments, reactions, and votes attached to the actual itinerary item. The plan is the source of truth, not the chat.",
    example: "Watch how fast a 200-message thread collapses to 12 once decisions sit on the venue card. Everyone can see what was decided, who weighed in, and what changed.",
    image: IMG_DECISIONS,
    alt: "Friends laughing while looking at a phone together planning",
  },
];

const FAILURES: { title: string; body: string }[] = [
  { title: "Nobody commits to dates", body: "Three people stay 'maybe' for four weeks. Flight prices double. Group quietly disbands." },
  { title: "Budget never gets named", body: "Two people are planning hostels, two are planning a villa. Surfaces during the Airbnb scroll. Argument follows." },
  { title: "Itinerary becomes a school trip", body: "Someone over-plans. Day 3 has 7 activities. Half the group fakes a stomach bug to skip the museum." },
  { title: "Money never settles", body: "End-of-trip spreadsheet takes 3 weeks. Two people never pay back. Resentment compounds into next year." },
  { title: "Decisions live in 4 places", body: "WhatsApp, Notion, Google Doc, Instagram DMs. Nobody knows what was actually agreed. Someone double-books." },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "How far in advance should we start planning a group trip?",
    a: "Long weekend: 6 to 8 weeks. Week-long international trip: 3 to 6 months. The constraint isn't planning time, it's flight prices and time-off requests. Anything past 6 months and people forget they agreed.",
  },
  {
    q: "What's the ideal group size for a trip?",
    a: "Four to six is the sweet spot. One Airbnb, one dinner reservation, one taxi. Above eight you start needing sub-groups, two cars, and a spreadsheet just to feed everyone. Above twelve you're running a wedding, not a trip.",
  },
  {
    q: "How do you split group travel expenses fairly?",
    a: "Log every shared expense the day it happens, tag who it was actually for (not always 'everyone'), and settle at the end with one transfer per person. Tools like Junto read receipts with AI, handle multi-currency, and show live balances so nobody is doing math in a hostel.",
  },
  {
    q: "What if people disagree about the destination?",
    a: "Don't debate, vote. Shortlist 2 to 3 options that all fit the agreed vibe and budget. One vote each. 24-hour deadline. Winner takes it. Endless pros-and-cons threads end in a trip that never gets booked.",
  },
  {
    q: "Should one person be the trip organizer?",
    a: "Someone has to drive momentum, but they shouldn't make every decision. The organizer kicks things off and pushes deadlines. The group votes, comments, and books in parallel. Otherwise the organizer burns out by week two and the trip dies in their inbox.",
  },
  {
    q: "What should we do about flights with people coming from different cities?",
    a: "Don't try to book together. Agree the arrival window (e.g. 'land by 6pm Friday'), share booking confirmations in one place, and meet at the accommodation. Trying to coordinate 6 flights from 4 cities is the fastest way to delay a trip by a month.",
  },
];

export default function GuideGroupTrip() {
  const back = useSmartBack("/");

  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: TITLE,
    description: DESCRIPTION,
    url: URL,
    mainEntityOfPage: URL,
    author: { "@type": "Organization", name: "Junto", url: SITE },
    publisher: {
      "@type": "Organization",
      name: "Junto",
      url: SITE,
      logo: { "@type": "ImageObject", url: `${SITE}/icon-512.svg` },
    },
    datePublished: "2026-06-05",
    dateModified: "2026-06-05",
    image: HERO_IMG,
  };

  const howTo = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to plan a group trip with friends",
    description: DESCRIPTION,
    totalTime: "PT45M",
    step: STEPS.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      text: s.body,
      image: s.image,
    })),
  };

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Guides", item: URL },
    ],
  };

  return (
    <div className="min-h-dvh bg-[#fafaf9] text-[#1a1a1a]">
      <Helmet>
        <title>{TITLE} | Junto</title>
        <meta name="description" content={DESCRIPTION} />
        <meta
          name="keywords"
          content="how to plan a group trip, group trip planning, plan a trip with friends, group travel guide, group trip itinerary, group trip budget, group travel split expenses"
        />
        <link rel="canonical" href={URL} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={URL} />
        <meta property="og:image" content={HERO_IMG} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />
        <meta name="twitter:image" content={HERO_IMG} />
        <script type="application/ld+json">{JSON.stringify(article)}</script>
        <script type="application/ld+json">{JSON.stringify(howTo)}</script>
        <script type="application/ld+json">{JSON.stringify(faq)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
      </Helmet>

      {/* Hero */}
      <header className="relative w-full h-[58vh] min-h-[420px] max-h-[640px] overflow-hidden">
        <img
          src={HERO_IMG}
          alt="A group of friends standing on a coastal cliff at sunset, planning their next trip"
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/75" />
        <div className="relative z-10 max-w-[860px] mx-auto h-full flex flex-col justify-end px-6 md:px-10 pb-14">
          <button
            type="button"
            onClick={back}
            className="self-start inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white transition-colors mb-6 backdrop-blur-sm bg-white/10 rounded-full px-3 py-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <span className="block font-bold text-white/90" style={{ fontSize: 13, letterSpacing: "0.22em" }}>
            THE GROUP TRIP PLAYBOOK
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mt-3 leading-[1.05] tracking-tight">
            How to plan a group trip without the 200-message group chat.
          </h1>
          <p className="text-lg text-white/85 mt-5 max-w-[640px] leading-relaxed">
            8 rules from people who've planned trips that actually happened (and watched the ones that didn't).
          </p>
        </div>
      </header>

      <article className="max-w-[760px] mx-auto px-6 md:px-8 pt-16 pb-24">
        {/* Intro */}
        <p className="text-xl text-foreground/85 leading-relaxed mb-10 font-medium">
          Most group trips don't die at the airport. They die in week 3 of the WhatsApp thread, when someone sends a poll that nobody answers, the dates slip again, and flights creep past what anyone wanted to pay.
        </p>
        <p className="text-base text-foreground/75 leading-relaxed mb-14">
          The trips that actually happen share a pattern. Tight commitments, named budgets, anchor-only itineraries, money settled in real time. This is the playbook. Steal what works, ignore what doesn't, and your next group trip won't be the one everyone politely stops talking about.
        </p>

        {/* Why most group trips fail */}
        <section className="mb-16 rounded-2xl bg-white border border-[#e5e5e5] p-6 sm:p-8">
          <h2 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#fee2e2] text-[#b91c1c]">
              <X className="h-4 w-4" />
            </span>
            The 5 reasons most group trips collapse
          </h2>
          <ul className="space-y-3">
            {FAILURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="flex-none mt-2 w-1.5 h-1.5 rounded-full bg-[#b91c1c]" />
                <p className="text-foreground/85 leading-relaxed">
                  <span className="font-semibold text-foreground">{f.title}.</span> {f.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Steps */}
        <h2 className="text-3xl font-bold text-foreground mb-2">The 8 rules</h2>
        <p className="text-foreground/70 mb-12">In order. The first three matter most.</p>

        <div className="space-y-20">
          {STEPS.map((s, i) => (
            <section key={s.title}>
              <div className="flex items-center gap-3 mb-4">
                <span className="flex-none w-10 h-10 rounded-full bg-[#0D9488] text-white text-base font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-xs font-bold tracking-[0.18em] text-[#0D9488] uppercase">Rule {i + 1}</span>
              </div>
              <h3 className="text-2xl sm:text-[28px] font-bold text-foreground mb-3 leading-tight">{s.title}</h3>
              <p className="text-lg font-semibold text-[#0D9488] mb-5 italic">{s.rule}</p>

              <div className="relative w-full aspect-[16/9] rounded-2xl overflow-hidden mb-6 bg-muted">
                <img
                  src={s.image}
                  alt={s.alt}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
              </div>

              <p className="text-foreground/85 leading-relaxed mb-5">{s.body}</p>

              <div className="border-l-2 border-[#0D9488] pl-4 py-1 bg-[#F0FDFA] rounded-r-md">
                <p className="text-sm font-bold text-[#064E4E] mb-1 tracking-wide uppercase">Real talk</p>
                <p className="text-foreground/80 leading-relaxed">{s.example}</p>
              </div>
            </section>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-20 mb-16 rounded-3xl bg-[#0D9488] text-white px-7 sm:px-10 py-10 relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <span className="inline-block text-xs font-bold tracking-[0.22em] text-white/80 mb-3">
              SKIP RULES 4 THROUGH 8
            </span>
            <h3 className="text-3xl sm:text-4xl font-bold mb-4 leading-tight">
              Let an AI plan it, an AI split the bill, and a real product hold the group together.
            </h3>
            <p className="text-white/90 mb-7 leading-relaxed max-w-[560px]">
              Junto builds anchor-based itineraries in 30 seconds, reads receipts to settle expenses, and keeps every decision on the actual plan. Free, no credit card, your group can join from a link.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/trips/new"
                className="inline-flex items-center gap-1.5 bg-white text-[#0D9488] font-semibold rounded-full px-6 py-3 hover:bg-white/90 transition-colors"
              >
                Plan a group trip <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/templates"
                className="inline-flex items-center gap-1.5 bg-white/15 text-white font-semibold rounded-full px-6 py-3 hover:bg-white/25 transition-colors backdrop-blur-sm"
              >
                Browse trip templates
              </Link>
            </div>
          </div>
        </div>

        {/* Quick checklist */}
        <section className="mb-20 rounded-2xl bg-white border border-[#e5e5e5] p-6 sm:p-8">
          <h2 className="text-xl font-bold text-foreground mb-5">The 30-second checklist</h2>
          <ul className="space-y-3">
            {[
              "Group is locked. No maybes.",
              "Budget number is named, in writing.",
              "Vibe is agreed. Destination shortlist is 3 max.",
              "Each day has 1 anchor. The rest is air.",
              "One person books group items. Flights are personal.",
              "Every receipt is logged the day it happens.",
              "Docs, confirmations, and passport dates are in one shared place.",
              "Decisions live on the plan, not in chat.",
            ].map((item) => (
              <li key={item} className="flex gap-3 items-start">
                <span className="flex-none mt-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#0D9488] text-white">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                <span className="text-foreground/85">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <h2 className="text-3xl font-bold text-foreground mb-8">Frequently asked questions</h2>
        <div className="space-y-7 mb-16">
          {FAQ.map((f) => (
            <div key={f.q} className="border-b border-[#e5e5e5] pb-7 last:border-none">
              <h3 className="text-lg font-bold text-foreground mb-2">{f.q}</h3>
              <p className="text-foreground/80 leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>

        {/* Outro */}
        <div className="border-t border-[#e5e5e5] pt-10">
          <h2 className="text-xl font-bold text-foreground mb-3">Need destination ideas?</h2>
          <p className="text-muted-foreground mb-5">
            Browse 16 curated group-trip itineraries. Bali, Tokyo, Tulum, Lisbon, Petra, Mexico City. By vibe, season, and budget.
          </p>
          <Link
            to="/templates"
            className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#0D9488] hover:text-[#064E4E] transition-colors"
          >
            See all trip ideas <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </article>
    </div>
  );
}

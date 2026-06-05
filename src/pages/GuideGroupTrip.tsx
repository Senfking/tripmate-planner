import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { useSmartBack } from "@/hooks/useSmartBack";

const SITE = "https://junto.pro";
const URL = `${SITE}/guides/how-to-plan-a-group-trip`;
const TITLE = "How to Plan a Group Trip (Without the Group Chat Chaos)";
const DESCRIPTION =
  "A practical, step-by-step guide to planning a group trip with friends — from picking dates and a destination to splitting expenses and keeping everyone on the same page.";

const STEPS: { title: string; body: string }[] = [
  {
    title: "Lock the group, then the dates",
    body:
      "Before anything else, decide who's actually coming. Four committed people beat ten 'maybes.' Put dates to a vote with two or three concrete options — a long weekend, a full week — and give people 48 hours to respond. Open-ended date threads die. A deadline forces decisions.",
  },
  {
    title: "Agree on a budget range up front",
    body:
      "Money kills more group trips than any other single thing. Set a rough per-person budget for flights, accommodation, food and activities before you pick a destination. It's much easier to say 'around €800 each, all-in' than to discover halfway through that one person was picturing hostels and another was picturing a private villa.",
  },
  {
    title: "Pick a destination that matches the vibe",
    body:
      "Don't start with the destination — start with the vibe. Is this a beach reset, a city break, a hiking trip, a wedding side-trip? Once the vibe is agreed, shortlist 2–3 destinations that fit the vibe and the budget. Vote, don't debate. Endless threads about 'Bali vs. Tulum' rarely converge.",
  },
  {
    title: "Build a rough day-by-day plan (not a minute-by-minute one)",
    body:
      "A good group itinerary has anchors, not a schedule. For each day pick one anchor (a hike, a dinner reservation, a beach club) and leave the rest open. Over-planning is the #1 way to make people resent group travel. Junto's AI builds these anchor-based itineraries in seconds and lets the group reshuffle them.",
  },
  {
    title: "Book the big stuff together, the small stuff individually",
    body:
      "Accommodation, big group dinners and any activity with limited availability should be booked together, ideally by one person who gets reimbursed. Flights are personal — let each traveler book their own based on their city, loyalty programs and timing preferences.",
  },
  {
    title: "Track expenses as you go, not after",
    body:
      "The end-of-trip spreadsheet always misses things and always causes friction. Log expenses the day they happen, split them across the right people (not everyone always pays for everything), and settle in one or two payments at the end. Apps like Junto do this automatically — snap a receipt, AI splits it.",
  },
  {
    title: "Centralize bookings, docs and entry requirements",
    body:
      "Hotel confirmations, flight tickets, visa info, vaccination requirements and travel insurance should live in one shared place — not buried in seven different inboxes. Add passport expiry dates per person so you catch problems before the airport.",
  },
  {
    title: "Make decisions on the actual plan, not in a separate chat",
    body:
      "Comments and votes about a restaurant should live on the restaurant card, not in a WhatsApp thread that drifts away from the plan. Group trips fall apart when the conversation lives in one place and the plan lives in another. Keep them together.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "How far in advance should we start planning a group trip?",
    a: "For a long weekend, 4–8 weeks is plenty. For a week-long international trip, 3–6 months gives everyone time to book flights, request time off and arrange visas. Anything beyond 6 months and people forget they agreed.",
  },
  {
    q: "What's the ideal group size for a trip?",
    a: "Four to six people is the sweet spot — large enough to split costs and have energy, small enough to fit in one Airbnb and one dinner reservation. Above eight, you start needing sub-groups and a more structured plan.",
  },
  {
    q: "How do you split group travel expenses fairly?",
    a: "Track every shared expense as it happens, tag who it was for (not always 'everyone'), and settle up at the end with one or two transfers. Tools like Junto handle multi-currency, partial splits and live balances automatically.",
  },
  {
    q: "What if people disagree about the destination?",
    a: "Don't debate — vote. Shortlist 2–3 options that all fit the agreed vibe and budget, give each person one vote, and accept the winner. Endless 'pros and cons' threads almost always end in a trip that nobody actually booked.",
  },
  {
    q: "Should one person be the trip organizer?",
    a: "Someone has to drive momentum, but they shouldn't make every decision alone. Use a shared planner where the organizer kicks things off and the group votes, comments and books in parallel. Otherwise the organizer burns out and the trip stalls.",
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
    image: `${SITE}/og-default-v2.png`,
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
      { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE}/guides/how-to-plan-a-group-trip` },
    ],
  };

  return (
    <div className="min-h-dvh bg-[#fafaf9] text-[#1a1a1a]">
      <Helmet>
        <title>{TITLE} | Junto</title>
        <meta name="description" content={DESCRIPTION} />
        <meta
          name="keywords"
          content="how to plan a group trip, group trip planning, plan a trip with friends, group travel guide, group trip itinerary, group trip budget, group trip ideas"
        />
        <link rel="canonical" href={URL} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={URL} />
        <meta property="og:image" content={`${SITE}/og-default-v2.png`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />
        <script type="application/ld+json">{JSON.stringify(article)}</script>
        <script type="application/ld+json">{JSON.stringify(howTo)}</script>
        <script type="application/ld+json">{JSON.stringify(faq)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
      </Helmet>

      <div className="max-w-[720px] mx-auto pt-10 pb-24 px-6 md:px-8">
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <span
          className="block font-bold"
          style={{ fontSize: 14, letterSpacing: "0.18em", color: "#0D9488" }}
        >
          GUIDE
        </span>

        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mt-3 mb-4 leading-tight">
          {TITLE}
        </h1>
        <p className="text-base text-muted-foreground mb-10 leading-relaxed">
          Group trips fail in predictable ways: nobody picks dates, the budget is unspoken, the
          itinerary is over-planned, and the money never quite gets settled. Here's the playbook —
          eight steps that work whether it's four friends for a long weekend or twelve people for a
          wedding abroad.
        </p>

        <ol className="space-y-8 mb-14">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-5">
              <span className="flex-none w-9 h-9 rounded-full bg-[#0D9488] text-white text-sm font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div className="pt-1">
                <h2 className="text-xl font-semibold text-foreground mb-2">{s.title}</h2>
                <p className="text-foreground/85 leading-relaxed">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="rounded-2xl bg-[#0D9488] text-white px-7 py-8 mb-14">
          <h3 className="text-xl font-semibold mb-2">Skip steps 3–8 with Junto</h3>
          <p className="text-white/90 mb-5 leading-relaxed">
            Junto's AI builds the itinerary, splits expenses from a photo of the receipt, and keeps
            every decision attached to the actual plan. Free to try, no credit card.
          </p>
          <Link
            to="/trips/new"
            className="inline-flex items-center gap-1.5 bg-white text-[#0D9488] font-semibold rounded-full px-5 py-2.5 hover:bg-white/90 transition-colors"
          >
            Plan a group trip <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-6">Frequently asked questions</h2>
        <div className="space-y-6 mb-14">
          {FAQ.map((f) => (
            <div key={f.q}>
              <h3 className="text-base font-semibold text-foreground mb-1.5">{f.q}</h3>
              <p className="text-foreground/85 leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>

        <div className="border-t border-[#e5e5e5] pt-8">
          <h2 className="text-lg font-semibold text-foreground mb-3">Need destination ideas?</h2>
          <p className="text-muted-foreground mb-4">
            Browse curated group-trip itineraries by vibe, season and budget.
          </p>
          <Link
            to="/templates"
            className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#0D9488] hover:text-[#064E4E] transition-colors"
          >
            See all trip ideas <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

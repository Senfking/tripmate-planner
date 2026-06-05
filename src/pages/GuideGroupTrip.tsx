import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Sparkles, Check } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { useSmartBack } from "@/hooks/useSmartBack";

const SITE = "https://junto.pro";
const URL = `${SITE}/guides/how-to-plan-a-group-trip`;
const TITLE = "How to Plan a Group Trip (Without the 200-Message Group Chat)";
const DESCRIPTION =
  "The honest playbook for planning a group trip with friends. 8 rules that actually work, the 5 reasons most group trips collapse, and the exact tools to skip the spreadsheet hell.";

// Curated atmospheric photography — not flat-lay stock.
const HERO_IMG =
  "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=2000&q=75&auto=format&fit=crop&fm=webp";

type Step = {
  title: string;
  rule: string;
  body: string;
  pull: string;
  example: string;
  image: string;
  alt: string;
  tag: string;
};

const STEPS: Step[] = [
  {
    tag: "Commitment",
    title: "Kill the maybe tier",
    rule: "10 maybes are worth less than 4 yeses.",
    body: "Send one message. 'Trip in Q3. Who is actually in?' Give people 48 hours. Then close the door. The friends who reply 'yeah maybe lol' are the same ones who drop out two weeks before flights and torch the deposit. You're not being mean — you're protecting the trip from death by indecision.",
    pull: "A locked group of four will out-travel an unlocked group of nine. Every single time.",
    example: "A 9-person Lisbon plan died because three maybes refused to commit. Flights kept climbing past €400. The group quietly stopped replying. A 4-person plan with the same dates would have booked in a week and cost €280.",
    image: "https://images.unsplash.com/photo-1496545672447-f699b503d270?w=1600&q=75&auto=format&fit=crop&fm=webp",
    alt: "Silhouettes of friends standing close together on a hilltop at golden hour",
  },
  {
    tag: "Budget",
    title: "Say the number out loud",
    rule: "One figure. All in. Before anything else.",
    body: "Don't say 'mid-range.' Say €900 per person, flights and accommodation included, for the week. This is the single highest-leverage move in group travel. It filters destinations, hotels, and activities in one sentence. More importantly, it surfaces the awkward gap between the friend on a startup salary and the friend whose parents are paying.",
    pull: "'Mid-range' is not a budget. It's a polite way of avoiding the conversation.",
    example: "Person A pictures €40 hostels and €15 dinners. Person B pictures a private villa and a tasting menu. Both think they agreed to 'a chill week away.' They haven't agreed to anything. Name the number on day one.",
    image: "https://images.unsplash.com/photo-1601597111158-2fceff292cdc?w=1600&q=75&auto=format&fit=crop&fm=webp",
    alt: "A hand holding folded euro banknotes against a deep moody background",
  },
  {
    tag: "Direction",
    title: "Vote the vibe, not the place",
    rule: "Beach reset, city break, adventure, or wedding side-trip. Pick one.",
    body: "Bali vs Tulum vs Lisbon never ends because people are arguing about different trips. Vote the vibe first, then shortlist two or three destinations that fit. Single transferable vote. 24 hours. Winner takes it. No revisits. No 'but what about Croatia.'",
    pull: "Destination-first groups argue for weeks. Vibe-first groups book on Tuesday.",
    example: "A vibe-first group picks 'beach plus nightlife, July, €1k cap' and lands on Ibiza in a day. A destination-first group is still pasting Tulum reels in week three.",
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=75&auto=format&fit=crop&fm=webp",
    alt: "Aerial view of turquoise water meeting a sandy beach with a lone umbrella",
  },
  {
    tag: "Pace",
    title: "Anchors, not schedules",
    rule: "One anchor per day. The rest is air.",
    body: "Over-planning is why group travel feels like a school trip. For each day pick exactly one anchor. A dinner reservation. A hike. A beach club. A museum slot. Everything else is decided that morning over coffee. Anchors create momentum without trapping the friend who wakes up hungover.",
    pull: "Twelve adults cannot be herded through Coyoacán in 35°C heat. Stop trying.",
    example: "Day 3 in Mexico City. Anchor: 8pm reservation at Pujol. That's the whole plan. People split off for markets, naps, walks, and reconverge at 7. Everyone is happy. Nobody filed a complaint.",
    image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&q=75&auto=format&fit=crop&fm=webp",
    alt: "Warm low-lit bar with glassware glowing under pendant lights",
  },
  {
    tag: "Money",
    title: "One person books, everyone pays",
    rule: "Group bookings: one card. Flights: your problem.",
    body: "Accommodation, the big group dinner, the boat day. These go on one person's card and they get paid back the same week. Flights are personal because seat prefs, loyalty miles, and departure cities all differ. Don't try to coordinate six separate flight bookings on one Zoom call. It's a void.",
    pull: "The booker gets a 2% kickback and the gratitude of the group. That's the trade.",
    example: "Set the expectation early so nobody feels they've been volunteered. Rotate the booker between trips if you travel often. The first transfer back happens within seven days, no exceptions.",
    image: "https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=1600&q=75&auto=format&fit=crop&fm=webp",
    alt: "Hands typing on a laptop in a sunlit apartment overlooking a city",
  },
  {
    tag: "Receipts",
    title: "Log it the day it happens",
    rule: "End-of-trip spreadsheets are a love language for resentment.",
    body: "Nobody remembers who paid for the taxi on Tuesday by the time Friday rolls around. Snap the receipt the moment it lands. Tag who it was actually for — the vegetarian didn't have the €60 ribeye. Settle in one transfer at the end.",
    pull: "If the math happens on the flight home, the friendship is already losing altitude.",
    example: "Junto reads the receipt, splits multi-currency on the fly, and shows live balances. A 14-day trip with six people and 80 expenses settles in two Revolut transfers. No spreadsheet. No 'wait, was that wine yours?'",
    image: "https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=1600&q=75&auto=format&fit=crop&fm=webp",
    alt: "Friends raising wine glasses around a candlelit restaurant table",
  },
  {
    tag: "Documents",
    title: "One home for the paperwork",
    rule: "If it lives in someone's inbox, it doesn't exist.",
    body: "Hotel PDFs. Flight tickets. Visa stamps. Vaccination cards. Travel insurance. Passport expiry dates. One shared place that everyone can pull up at a check-in desk at 4am. Then run a passport-validity check eight weeks out — a passport that expires within six months of return will turn you away at immigration in most of Asia.",
    pull: "Most cancelled trips don't get cancelled by airlines. They get cancelled at the gate.",
    example: "A friend missed a Bali flight because his passport had 5 months and 27 days of validity. The airline refused boarding. Eight weeks of warning would have saved €600 and a ruined first day.",
    image: "https://images.unsplash.com/photo-1606768666853-403c90a981ad?w=1600&q=75&auto=format&fit=crop&fm=webp",
    alt: "An open passport lying on a wooden surface in soft morning light",
  },
  {
    tag: "Decisions",
    title: "Move decisions off the chat",
    rule: "If you're voting in WhatsApp, you've already lost the thread.",
    body: "When a comment about a restaurant lives 47 messages above the actual restaurant card, the group is coordinating two parallel realities. Keep comments, reactions, and votes attached to the actual itinerary item. The plan is the source of truth. The chat is for jokes.",
    pull: "A 200-message thread collapses to 12 once decisions sit on the venue card.",
    example: "Everyone can see what was decided, who weighed in, what changed, and when. Nobody re-litigates the museum on day three because they 'missed that part' of the thread.",
    image: "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?w=1600&q=75&auto=format&fit=crop&fm=webp",
    alt: "A small group on a rooftop at dusk, one person looking at a phone screen",
  },
];

const FAILURES: { num: string; title: string; body: string }[] = [
  { num: "01", title: "Nobody commits to dates", body: "Three people stay 'maybe' for four weeks. Flight prices double. The group quietly disbands." },
  { num: "02", title: "Budget never gets named", body: "Two people are planning hostels. Two are planning a villa. The fight starts in the Airbnb scroll." },
  { num: "03", title: "Itinerary becomes a school trip", body: "Someone over-plans. Day 3 has seven activities. Half the group fakes a stomach bug." },
  { num: "04", title: "Money never settles", body: "End-of-trip spreadsheet takes three weeks. Two people never pay back. Resentment compounds." },
  { num: "05", title: "Decisions live in four places", body: "WhatsApp, Notion, a Google Doc, an Instagram DM. Nobody knows what was actually agreed." },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "How far in advance should we start planning?",
    a: "Long weekend: 6 to 8 weeks. Week-long international: 3 to 6 months. The constraint is not planning time, it's flight prices and time-off requests. Anything past 6 months and people forget they agreed.",
  },
  {
    q: "What is the ideal group size?",
    a: "Four to six is the sweet spot. One Airbnb, one dinner reservation, one taxi. Above eight you need sub-groups and a spreadsheet to feed everyone. Above twelve you're running a wedding, not a trip.",
  },
  {
    q: "How do you split group expenses fairly?",
    a: "Log every shared expense the day it happens. Tag who it was actually for (not always 'everyone'). Settle at the end with one transfer per person. Tools like Junto read receipts with AI, handle multi-currency, and show live balances so nobody is doing math in a hostel.",
  },
  {
    q: "What if people disagree about the destination?",
    a: "Don't debate. Vote. Shortlist 2 to 3 options that all fit the agreed vibe and budget. One vote each. 24-hour deadline. Winner takes it. Endless pros-and-cons threads end in a trip that never gets booked.",
  },
  {
    q: "Should one person be the trip organizer?",
    a: "Someone has to drive momentum. They shouldn't make every decision. The organizer kicks things off and pushes deadlines. The group votes, comments, and books in parallel. Otherwise the organizer burns out by week two.",
  },
  {
    q: "What about flights from different cities?",
    a: "Don't try to book together. Agree the arrival window ('land by 6pm Friday'), share booking confirmations in one place, and meet at the accommodation. Coordinating six flights from four cities is the fastest way to delay a trip by a month.",
  },
];

const GRADIENT = "linear-gradient(135deg, #0D9488 0%, #0EA5E9 100%)";

export default function GuideGroupTrip() {
  const back = useSmartBack("/");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const total = doc.scrollHeight - doc.clientHeight;
      setProgress(total > 0 ? Math.min(1, doc.scrollTop / total) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    <div className="relative min-h-dvh bg-white text-[#0B2E2C] antialiased selection:bg-[#0D9488]/20">
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

      {/* Reading progress */}
      <div className="fixed top-0 left-0 right-0 h-[2px] z-50 bg-transparent pointer-events-none">
        <div
          className="h-full transition-[width] duration-150 ease-out"
          style={{ width: `${progress * 100}%`, background: GRADIENT }}
        />
      </div>

      {/* Header — identical to landing Hero overlay (white JUNTO + gradient CTA) */}
      <div
        className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-end px-5 sm:px-10 pointer-events-none"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 18px)",
          paddingBottom: 24,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0) 100%)",
        }}
      >
        <Link
          to="/guides"
          className="pointer-events-auto inline-flex items-center gap-1.5 text-[11px] sm:text-[12px] font-mono tracking-[0.22em] uppercase text-white/75 hover:text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Field Guide
        </Link>
        <Link
          to="/"
          aria-label="Junto home"
          className="pointer-events-auto absolute left-1/2 -translate-x-1/2 text-[19px] font-extrabold tracking-[0.32em] uppercase text-white/80 hover:text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-colors"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 18px)" }}
        >
          Junto
        </Link>
        <Link
          to="/ref"
          className="group pointer-events-auto relative inline-flex items-center rounded-full px-3.5 py-1.5 text-[12px] sm:px-5 sm:py-2 sm:text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(13,148,136,0.65)] transition-transform hover:scale-[1.03] active:scale-95"
          style={{
            background: "linear-gradient(135deg, #0D9488 0%, #14b8a6 50%, #0891b2 100%)",
          }}
        >
          <span className="absolute inset-0 rounded-full bg-gradient-to-r from-white/20 via-transparent to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <span className="relative">Get started</span>
        </Link>
      </div>



      {/* HERO — full bleed cinematic image with overlaid type */}
      <header className="relative w-full bg-black overflow-hidden">
        <div className="relative w-full h-[88vh] min-h-[640px] max-h-[920px]">
          <img
            src={HERO_IMG}
            alt="An airplane wing cutting through clouds at golden hour"
            className="absolute inset-0 w-full h-full object-cover opacity-90"
            loading="eager"
            fetchPriority="high"
          />
          {/* Refined gradient — top dark for nav legibility, bottom dark for type */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/85" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent" />

          <div className="absolute inset-0 flex flex-col justify-end">
            <div className="max-w-[1400px] mx-auto w-full px-5 sm:px-10 pb-16 sm:pb-24">
              <div className="flex items-center gap-3 mb-8">
                <span className="h-px w-10 bg-[#2DD4BF]" />
                <span className="text-[11px] font-bold tracking-[0.32em] uppercase text-[#2DD4BF]">
                  Field Guide · 001
                </span>
              </div>
              <h1
                className="font-medium tracking-[-0.04em] leading-[0.95] text-white max-w-[18ch]"
                style={{ fontSize: "clamp(44px, 8vw, 112px)" }}
              >
                How to plan a group trip that{" "}
                <span className="italic font-light text-[#2DD4BF]">actually</span> happens.
              </h1>
              <div className="mt-10 flex flex-wrap items-end justify-between gap-6">
                <p className="text-[16px] sm:text-[18px] leading-[1.55] text-white/75 max-w-[54ch]">
                  Most group trips don't die at the airport. They die in week three of the WhatsApp
                  thread. Here is the playbook for the ones that don't.
                </p>
                <div className="flex items-center gap-6 text-[11px] font-mono tracking-[0.18em] uppercase text-white/55">
                  <span>8 rules</span>
                  <span className="w-px h-3 bg-white/20" />
                  <span>12 min read</span>
                  <span className="w-px h-3 bg-white/20" />
                  <span>By Junto</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* INTRO — single column drop cap */}
      <section className="bg-white">
        <div className="max-w-[720px] mx-auto px-5 sm:px-8 pt-24 sm:pt-32 pb-16">
          <p
            className="text-[22px] sm:text-[26px] leading-[1.45] text-[#0B2E2C] tracking-[-0.01em]
                       first-letter:float-left first-letter:mr-3 first-letter:mt-1
                       first-letter:text-[88px] first-letter:leading-[0.82] first-letter:font-medium
                       first-letter:text-[#0D9488]"
          >
            The trips that actually happen share a pattern. Tight commitments. Named budgets.
            Anchor-only itineraries. Money settled in real time. Decisions made where the trip
            lives — not buried under 200 messages of memes and "lol so true."
          </p>
          <p className="mt-8 text-[17px] leading-[1.7] text-[#0B2E2C]/70">
            This is that playbook. Eight rules, in order. The first three matter most. Steal what
            works, ignore what doesn't, and your next group trip won't be the one everyone politely
            stops talking about.
          </p>
        </div>
      </section>

      {/* PRE-MORTEM — dark editorial strip */}
      <section className="bg-[#0B2E2C] text-white">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 py-24 sm:py-32">
          <div className="grid grid-cols-12 gap-x-8 mb-14">
            <div className="col-span-12 md:col-span-6">
              <div className="flex items-center gap-3 mb-5">
                <span className="h-px w-8 bg-[#2DD4BF]" />
                <span className="text-[11px] font-bold tracking-[0.3em] uppercase text-[#2DD4BF]">
                  The pre-mortem
                </span>
              </div>
              <h2
                className="font-medium tracking-[-0.03em] leading-[1.02]"
                style={{ fontSize: "clamp(36px, 5vw, 64px)" }}
              >
                Five ways your trip <span className="italic font-light text-white/70">quietly</span> dies.
              </h2>
            </div>
            <div className="hidden md:block col-span-1" />
            <div className="col-span-12 md:col-span-5 mt-6 md:mt-auto">
              <p className="text-[16px] leading-[1.65] text-white/65 max-w-[44ch]">
                If you've planned a group trip before, you've lived at least three of these.
                If you haven't — this is the unsubsidised education.
              </p>
            </div>
          </div>

          <ol className="border-t border-white/10">
            {FAILURES.map((f) => (
              <li
                key={f.num}
                className="grid grid-cols-12 gap-x-8 border-b border-white/10 py-7 sm:py-9 group hover:bg-white/[0.02] transition-colors"
              >
                <div className="col-span-2 md:col-span-1">
                  <span className="font-mono text-[13px] tracking-[0.1em] text-[#2DD4BF] tabular-nums">
                    {f.num}
                  </span>
                </div>
                <h3 className="col-span-10 md:col-span-4 text-[20px] sm:text-[24px] font-medium tracking-[-0.015em] text-white leading-tight">
                  {f.title}
                </h3>
                <p className="col-span-12 md:col-span-7 mt-3 md:mt-0 text-[15px] sm:text-[16px] leading-[1.6] text-white/65">
                  {f.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* RULES — long-form magazine layout */}
      <section className="bg-white">
        {/* Section opener */}
        <div className="max-w-[720px] mx-auto px-5 sm:px-8 pt-28 sm:pt-40 pb-4 text-center">
          <div className="inline-flex items-center gap-3 mb-6">
            <span className="h-px w-8 bg-[#0D9488]" />
            <span className="text-[11px] font-bold tracking-[0.3em] uppercase text-[#0D9488]">
              The Playbook
            </span>
            <span className="h-px w-8 bg-[#0D9488]" />
          </div>
          <h2
            className="font-medium tracking-[-0.035em] leading-[0.98] text-[#0B2E2C]"
            style={{ fontSize: "clamp(40px, 6vw, 80px)" }}
          >
            Eight rules, <span className="italic font-light text-[#0D9488]">in order</span>.
          </h2>
          <p className="mt-6 text-[16px] leading-[1.65] text-[#0B2E2C]/65 max-w-[52ch] mx-auto">
            The first three are non-negotiable. Skip any of them and the trip is on borrowed time.
          </p>
        </div>

        {/* Rule articles */}
        {STEPS.map((s, i) => (
          <article
            key={s.title}
            id={`rule-${i + 1}`}
            className="scroll-mt-20 pt-14 sm:pt-20"
          >
            {/* Hero image with overlaid headline */}
            <figure className="relative w-full overflow-hidden">
              <div className="relative w-full aspect-[16/10] sm:aspect-[21/9] max-h-[640px]">
                <img
                  src={s.image}
                  alt={s.alt}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
                {/* Legibility scrim — strong on left where type sits, fading right */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                {/* Overlaid headline */}
                <div className="absolute inset-0 flex items-center">
                  <div className="max-w-[1400px] mx-auto w-full px-5 sm:px-10">
                    <div className="max-w-[720px]">
                      <div className="flex items-baseline gap-4 mb-2">
                        <span
                          className="font-medium tracking-[-0.05em] tabular-nums leading-none text-[#2DD4BF]"
                          style={{ fontSize: "clamp(44px, 6.5vw, 96px)" }}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="font-mono text-[11px] tracking-[0.28em] uppercase text-white/60 pb-2">
                          / {s.tag}
                        </span>
                      </div>
                      <h3
                        className="font-medium tracking-[-0.03em] leading-[1.02] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.4)]"
                        style={{ fontSize: "clamp(28px, 3.8vw, 52px)" }}
                      >
                        {s.title}.
                      </h3>
                      <p
                        className="mt-4 text-[17px] sm:text-[20px] leading-[1.4] italic font-light tracking-[-0.01em] text-[#2DD4BF] drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
                      >
                        {s.rule}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </figure>


            {/* Body — narrow column */}
            <div className="max-w-[720px] mx-auto px-5 sm:px-8 mt-14 sm:mt-20">
              <p className="text-[18px] sm:text-[19px] leading-[1.75] text-[#0B2E2C]/85">
                {s.body}
              </p>

              {/* Pull quote — typographic, no card */}
              <blockquote className="my-14 sm:my-16 relative">
                <span
                  className="absolute -left-2 -top-6 font-serif text-[120px] leading-none text-[#0D9488]/15 select-none"
                  aria-hidden
                >
                  &ldquo;
                </span>
                <p
                  className="relative text-[28px] sm:text-[34px] leading-[1.2] tracking-[-0.02em] font-medium text-[#0B2E2C]"
                >
                  {s.pull}
                </p>
              </blockquote>

              {/* Field note */}
              <div className="border-t border-[#0B2E2C]/10 pt-6">
                <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#0D9488] mb-3">
                  Field Note
                </div>
                <p className="text-[15px] leading-[1.7] text-[#0B2E2C]/65 italic">
                  {s.example}
                </p>
              </div>
            </div>
          </article>
        ))}
      </section>

      {/* CTA — restrained, no orbs */}
      <section className="bg-white pt-28 sm:pt-40 pb-24 sm:pb-32">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10">
          <div className="relative overflow-hidden rounded-[28px] bg-[#0B2E2C] text-white">
            {/* Soft gradient sheen */}
            <div
              className="absolute inset-0 opacity-60"
              style={{
                background:
                  "radial-gradient(80% 100% at 100% 0%, rgba(14,165,233,0.25) 0%, transparent 55%), radial-gradient(70% 100% at 0% 100%, rgba(13,148,136,0.30) 0%, transparent 55%)",
              }}
              aria-hidden
            />
            <div className="relative grid grid-cols-12 gap-x-8 px-7 sm:px-16 py-16 sm:py-24 items-center">
              <div className="col-span-12 lg:col-span-7">
                <div className="flex items-center gap-3 mb-6">
                  <span className="h-px w-8 bg-[#2DD4BF]" />
                  <span className="font-mono text-[11px] tracking-[0.3em] uppercase text-[#2DD4BF]">
                    Or skip rules 4 → 8
                  </span>
                </div>
                <h2
                  className="font-medium tracking-[-0.03em] leading-[1.02]"
                  style={{ fontSize: "clamp(34px, 4.8vw, 60px)" }}
                >
                  Let Junto build the plan, split the bill, and hold the group{" "}
                  <span className="italic font-light text-[#2DD4BF]">together</span>.
                </h2>
                <p className="mt-6 text-[16px] sm:text-[17px] leading-[1.65] text-white/70 max-w-[52ch]">
                  AI-built itineraries in 30 seconds. Receipt-scanning expenses. Every decision
                  attached to the actual plan. Free. No credit card. Your group joins from a link.
                </p>
              </div>
              <div className="col-span-12 lg:col-span-5 mt-10 lg:mt-0 lg:pl-10 flex flex-col gap-3">
                <Link
                  to="/trips/new"
                  className="group flex items-center justify-between gap-3 rounded-2xl bg-white text-[#0B2E2C] px-6 py-5 font-semibold text-[15px] hover:bg-[#2DD4BF] transition-colors"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Sparkles className="h-4 w-4 text-[#0D9488]" />
                    Plan a group trip free
                  </span>
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  to="/templates"
                  className="group flex items-center justify-between gap-3 rounded-2xl border border-white/20 text-white px-6 py-5 font-semibold text-[15px] hover:bg-white/5 transition-colors"
                >
                  Browse 16 trip ideas
                  <ArrowUpRight className="h-5 w-5 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CHECKLIST — typographic, monospace numerals */}
      <section className="bg-white border-t border-[#0B2E2C]/10">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 py-24 sm:py-32 grid grid-cols-12 gap-x-8">
          <div className="col-span-12 md:col-span-5">
            <div className="md:sticky md:top-24">
              <div className="flex items-center gap-3 mb-5">
                <span className="h-px w-8 bg-[#0D9488]" />
                <span className="font-mono text-[11px] tracking-[0.3em] uppercase text-[#0D9488]">
                  Tear-out
                </span>
              </div>
              <h2
                className="font-medium tracking-[-0.03em] leading-[1.02] text-[#0B2E2C]"
                style={{ fontSize: "clamp(34px, 4.6vw, 56px)" }}
              >
                The 30-second <span className="italic font-light text-[#0D9488]">checklist</span>.
              </h2>
              <p className="mt-5 text-[15px] leading-[1.65] text-[#0B2E2C]/65 max-w-[36ch]">
                Eight lines. Pin it to the chat. If you can tick all eight, the trip is going to
                happen.
              </p>
            </div>
          </div>
          <div className="col-span-12 md:col-span-7 mt-10 md:mt-0">
            <ol className="border-t border-[#0B2E2C]/10">
              {[
                "Group is locked. No maybes.",
                "Budget number is named, in writing.",
                "Vibe is agreed. Destination shortlist is 3 max.",
                "Each day has one anchor. The rest is air.",
                "One person books group items. Flights are personal.",
                "Every receipt is logged the day it happens.",
                "Docs, confirmations, and passport dates live in one shared place.",
                "Decisions live on the plan, not in the chat.",
              ].map((item, idx) => (
                <li
                  key={item}
                  className="flex items-baseline gap-6 border-b border-[#0B2E2C]/10 py-5 group hover:bg-[#F0FDFA] transition-colors px-2 -mx-2 rounded-sm"
                >
                  <span className="flex-none font-mono text-[12px] tracking-[0.1em] text-[#0D9488] tabular-nums pt-0.5">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <Check className="flex-none h-4 w-4 text-[#0D9488]/30 group-hover:text-[#0D9488] transition-colors mt-1.5" strokeWidth={2.5} />
                  <span className="text-[17px] sm:text-[19px] leading-[1.45] text-[#0B2E2C] tracking-[-0.005em]">
                    {item}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-[#F8FAF9] border-t border-[#0B2E2C]/10">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 py-24 sm:py-32 grid grid-cols-12 gap-x-8">
          <div className="col-span-12 md:col-span-4">
            <div className="md:sticky md:top-24">
              <div className="flex items-center gap-3 mb-5">
                <span className="h-px w-8 bg-[#0D9488]" />
                <span className="font-mono text-[11px] tracking-[0.3em] uppercase text-[#0D9488]">
                  Q & A
                </span>
              </div>
              <h2
                className="font-medium tracking-[-0.03em] leading-[1.02] text-[#0B2E2C]"
                style={{ fontSize: "clamp(32px, 4.4vw, 52px)" }}
              >
                Things people keep <span className="italic font-light text-[#0D9488]">emailing</span> us about.
              </h2>
            </div>
          </div>
          <div className="col-span-12 md:col-span-8 mt-10 md:mt-0">
            <div className="border-t border-[#0B2E2C]/10">
              {FAQ.map((f, idx) => (
                <details
                  key={f.q}
                  className="group border-b border-[#0B2E2C]/10"
                  open={idx === 0}
                >
                  <summary className="flex items-baseline gap-6 cursor-pointer list-none py-6 sm:py-7">
                    <span className="flex-none font-mono text-[12px] tracking-[0.1em] text-[#0D9488] tabular-nums pt-1">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 text-[18px] sm:text-[22px] font-medium tracking-[-0.015em] text-[#0B2E2C] leading-snug">
                      {f.q}
                    </span>
                    <span
                      className="flex-none text-[24px] leading-none text-[#0D9488]/60 group-open:rotate-45 transition-transform pt-1"
                      aria-hidden
                    >
                      +
                    </span>
                  </summary>
                  <div className="pb-7 pl-[44px] sm:pl-[52px] pr-10 text-[15px] sm:text-[16px] leading-[1.7] text-[#0B2E2C]/70 max-w-[64ch]">
                    {f.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer / next up */}
      <footer className="bg-white border-t border-[#0B2E2C]/10">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 py-20 sm:py-28">
          <div className="grid grid-cols-12 gap-x-8 items-end">
            <div className="col-span-12 md:col-span-8">
              <div className="flex items-center gap-3 mb-5">
                <span className="h-px w-8 bg-[#0D9488]" />
                <span className="font-mono text-[11px] tracking-[0.3em] uppercase text-[#0D9488]">
                  Up next
                </span>
              </div>
              <h3
                className="font-medium tracking-[-0.025em] leading-[1.05] text-[#0B2E2C]"
                style={{ fontSize: "clamp(30px, 4.2vw, 52px)" }}
              >
                Need somewhere <span className="italic font-light text-[#0D9488]">to go</span>?
              </h3>
              <p className="mt-5 text-[16px] leading-[1.65] text-[#0B2E2C]/65 max-w-[52ch]">
                Sixteen curated group-trip itineraries. Bali, Tokyo, Tulum, Lisbon, Petra, Mexico
                City. Each one opens straight into a working plan.
              </p>
            </div>
            <div className="col-span-12 md:col-span-4 mt-8 md:mt-0 md:text-right">
              <Link
                to="/templates"
                className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#0B2E2C] border-b-2 border-[#0D9488] pb-1 hover:text-[#0D9488] transition-colors"
              >
                See all trip ideas
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
          <div className="mt-16 pt-8 border-t border-[#0B2E2C]/10 flex flex-wrap items-center justify-between gap-4 font-mono text-[11px] tracking-[0.18em] uppercase text-[#0B2E2C]/40">
            <span>Junto Field Guide · 001</span>
            <span>Published June 2026</span>
            <Link to="/" className="hover:text-[#0D9488] transition-colors">
              junto.pro →
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

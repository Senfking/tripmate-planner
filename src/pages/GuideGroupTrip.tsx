import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Sparkles,
  Users,
  Wallet,
  MapPin,
  CalendarCheck,
  CreditCard,
  Receipt,
  FileText,
  MessagesSquare,
} from "lucide-react";
import { Helmet } from "react-helmet-async";
import { useSmartBack } from "@/hooks/useSmartBack";

const SITE = "https://junto.pro";
const URL = `${SITE}/guides/how-to-plan-a-group-trip`;
const TITLE = "How to Plan a Group Trip (Without the 200-Message Group Chat)";
const DESCRIPTION =
  "The honest playbook for planning a group trip with friends. 8 rules that actually work, the 5 reasons most group trips collapse, and the exact tools to skip the spreadsheet hell.";

const HERO_IMG =
  "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1800&q=72&auto=format&fit=crop&fm=webp";

type Step = {
  title: string;
  rule: string;
  body: string;
  pull: string;
  example: string;
  image: string;
  alt: string;
  Icon: typeof Users;
};

const STEPS: Step[] = [
  {
    title: "Kill the maybe tier",
    rule: "10 maybes are worth less than 4 yeses.",
    body: "Send one message. 'Trip in Q3. Who is actually in?' Give people 48 hours. Then close the door. The friends who reply 'yeah maybe lol' are the same ones who drop out two weeks before flights and torch the deposit. You're not being mean. You're protecting the trip from death by indecision.",
    pull: "A locked group of four will out-travel an unlocked group of nine every single time.",
    example: "A 9-person Lisbon plan died because three maybes refused to commit to dates. Flights kept climbing past €400. The group quietly stopped replying. A 4-person plan with the same dates would have booked in a week and cost €280.",
    image: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1400&q=70&auto=format&fit=crop&fm=webp",
    alt: "Friends gathered around a table making travel plans together",
    Icon: Users,
  },
  {
    title: "Say the budget number out loud",
    rule: "One number. All in. Before anything else.",
    body: "Don't say 'mid-range.' Say €900 per person, flights and accommodation included, for the week. This is the single highest-leverage move in group travel. It filters destinations, hotels, and activities in one sentence. More importantly, it surfaces the awkward gap between the friend on a startup salary and the friend whose parents are paying.",
    pull: "Mid-range is not a budget. It's a polite way of avoiding the conversation.",
    example: "Person A pictures €40 hostels and €15 dinners. Person B pictures a private villa and a tasting menu. Both think they agreed to 'a chill week away.' They haven't agreed to anything. Name the number on day one.",
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1400&q=70&auto=format&fit=crop&fm=webp",
    alt: "Euro banknotes fanned out on a wooden table",
    Icon: Wallet,
  },
  {
    title: "Vote the vibe before the place",
    rule: "Beach reset, city break, adventure, or wedding side-trip. Pick one.",
    body: "Bali vs Tulum vs Lisbon never ends because people are arguing about different trips. Vote the vibe first, then shortlist two or three destinations that fit. Single transferable vote. 24 hours. Winner takes it. No revisits. No 'but what about Croatia.'",
    pull: "Destination-first groups argue for weeks. Vibe-first groups book on Tuesday.",
    example: "A vibe-first group picks 'beach plus nightlife, July, €1k cap' and lands on Ibiza in a day. A destination-first group is still pasting Tulum reels in week three.",
    image: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1400&q=70&auto=format&fit=crop&fm=webp",
    alt: "An overhead view of a worn world map with a compass and notebook",
    Icon: MapPin,
  },
  {
    title: "Anchors, not schedules",
    rule: "One anchor per day. The rest is air.",
    body: "Over-planning is why group travel feels like a school trip. For each day pick exactly one anchor. A dinner reservation. A hike. A beach club. A museum slot. Everything else is decided that morning over coffee. Anchors create momentum without trapping the friend who wakes up hungover.",
    pull: "Twelve adults cannot be herded through Coyoacán in 35°C heat. Stop trying.",
    example: "Day 3 in Mexico City. Anchor: 8pm reservation at Pujol. That's the whole plan. People split off for markets, naps, walks, and reconverge at 7. Everyone is happy. Nobody filed a complaint.",
    image: "https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=1400&q=70&auto=format&fit=crop&fm=webp",
    alt: "A long candlelit dinner table outdoors with friends mid-conversation",
    Icon: CalendarCheck,
  },
  {
    title: "One person books, everyone pays",
    rule: "Group bookings: one card. Flights: your problem.",
    body: "Accommodation, the big group dinner, the boat day. These go on one person's card and they get paid back the same week. Flights are personal because seat prefs, loyalty miles, and departure cities all differ. Don't try to coordinate six separate flight bookings on one Zoom call. It's a void.",
    pull: "The booker gets a 2% kickback and the gratitude of the group. That's the trade.",
    example: "Set the expectation early so nobody feels they've been volunteered. Rotate the booker between trips if you travel often. The first transfer back happens within seven days, no exceptions.",
    image: "https://images.unsplash.com/photo-1551918120-9739cb430c6d?w=1400&q=70&auto=format&fit=crop&fm=webp",
    alt: "Laptop screen showing a hotel reservation confirmation",
    Icon: CreditCard,
  },
  {
    title: "Log every receipt the day it happens",
    rule: "End-of-trip spreadsheets are a love language for resentment.",
    body: "Nobody remembers who paid for the taxi on Tuesday by the time Friday rolls around. Snap the receipt the moment it lands. Tag who it was for, because the vegetarian didn't have the €60 ribeye. Settle in one transfer at the end.",
    pull: "If the math happens on the flight home, the friendship is already losing altitude.",
    example: "Junto reads the receipt, splits multi-currency on the fly, and shows live balances. A 14-day trip with six people and 80 expenses settles in two Revolut transfers. No spreadsheet. No 'wait, was that wine yours?'",
    image: "https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=1400&q=70&auto=format&fit=crop&fm=webp",
    alt: "Close-up of a restaurant receipt next to a credit card on dark wood",
    Icon: Receipt,
  },
  {
    title: "One home for docs, passports, visas",
    rule: "If it lives in someone's inbox, it doesn't exist.",
    body: "Hotel PDFs. Flight tickets. Visa stamps. Vaccination cards. Travel insurance. Passport expiry dates. One shared place that everyone can pull up at a check-in desk at 4am. Then run a passport-validity check eight weeks out. A passport that expires within six months of return will turn you away at immigration in most of Asia.",
    pull: "Most cancelled trips don't get cancelled by airlines. They get cancelled at the gate.",
    example: "A friend missed a Bali flight because his passport had 5 months and 27 days of validity. The airline refused boarding. Eight weeks of warning would have saved €600 and a ruined first day.",
    image: "https://images.unsplash.com/photo-1452421822248-d4c2b47f0c81?w=1400&q=70&auto=format&fit=crop&fm=webp",
    alt: "A passport, boarding pass, and a small leather notebook on a wooden surface",
    Icon: FileText,
  },
  {
    title: "Decisions live on the plan, not in the chat",
    rule: "If you're voting in WhatsApp, you've already lost the thread.",
    body: "When a comment about a restaurant lives 47 messages above the actual restaurant card, the group is coordinating two parallel realities. Keep comments, reactions, and votes attached to the actual itinerary item. The plan is the source of truth. The chat is for jokes.",
    pull: "A 200-message thread collapses to 12 once decisions sit on the venue card.",
    example: "Everyone can see what was decided, who weighed in, what changed, and when. Nobody re-litigates the museum on day three because they 'missed that part' of the thread.",
    image: "https://images.unsplash.com/photo-1543269865-cbf427effbad?w=1400&q=70&auto=format&fit=crop&fm=webp",
    alt: "Friends laughing while looking at a single phone screen together",
    Icon: MessagesSquare,
  },
];

const FAILURES: { num: string; title: string; body: string }[] = [
  { num: "01", title: "Nobody commits to dates", body: "Three people stay 'maybe' for four weeks. Flight prices double. The group quietly disbands." },
  { num: "02", title: "Budget never gets named", body: "Two people are planning hostels. Two are planning a villa. Surfaces during the Airbnb scroll." },
  { num: "03", title: "Itinerary becomes a school trip", body: "Someone over-plans. Day 3 has seven activities. Half the group fakes a stomach bug to skip the museum." },
  { num: "04", title: "Money never settles", body: "End-of-trip spreadsheet takes three weeks. Two people never pay back. Resentment compounds." },
  { num: "05", title: "Decisions live in four places", body: "WhatsApp, Notion, Google Doc, Instagram DMs. Nobody knows what was actually agreed." },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "How far in advance should we start planning a group trip?",
    a: "Long weekend: 6 to 8 weeks. Week-long international: 3 to 6 months. The constraint is not planning time, it's flight prices and time-off requests. Anything past 6 months and people forget they agreed.",
  },
  {
    q: "What is the ideal group size?",
    a: "Four to six is the sweet spot. One Airbnb, one dinner reservation, one taxi. Above eight you need sub-groups, two cars, and a spreadsheet to feed everyone. Above twelve you're running a wedding, not a trip.",
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
    a: "Don't try to book together. Agree the arrival window ('land by 6pm Friday'), share booking confirmations in one place, and meet at the accommodation. Trying to coordinate six flights from four cities is the fastest way to delay a trip by a month.",
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
    <div className="min-h-dvh bg-white text-[#134E4A] antialiased">
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

      {/* Reading progress bar */}
      <div className="fixed top-0 left-0 right-0 h-[3px] z-50 bg-transparent pointer-events-none">
        <div
          className="h-full transition-[width] duration-150 ease-out"
          style={{ width: `${progress * 100}%`, background: GRADIENT }}
        />
      </div>

      {/* Top nav */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-[#CCFBF1]">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-3.5 flex items-center justify-between">
          <button
            type="button"
            onClick={back}
            className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#134E4A]/70 hover:text-[#0D9488] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <span className="text-[13px] font-extrabold tracking-[0.28em] uppercase text-[#134E4A]/80">
            Junto
          </span>
          <Link
            to="/trips/new"
            className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-semibold text-white rounded-full px-4 py-2 hover:opacity-90 transition-opacity"
            style={{ background: GRADIENT }}
          >
            Start a trip
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* HERO */}
      <header className="relative overflow-hidden">
        {/* Soft gradient backdrop */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(60% 50% at 80% 0%, rgba(14,165,233,0.10) 0%, transparent 60%), radial-gradient(50% 40% at 10% 20%, rgba(13,148,136,0.10) 0%, transparent 60%)",
          }}
        />
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-14">
          <div className="grid grid-cols-12 gap-x-6 sm:gap-x-10 items-start">
            <div className="col-span-12 lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#F0FDFA] border border-[#CCFBF1] px-3.5 py-1.5 text-[12px] font-semibold text-[#0D9488] mb-7">
                <Sparkles className="h-3.5 w-3.5" />
                The Junto Field Guide · 12 min read
              </div>
              <h1
                className="font-medium tracking-[-0.035em] leading-[1.02] text-[#134E4A]"
                style={{ fontSize: "clamp(40px, 6.5vw, 76px)" }}
              >
                How to plan a group trip{" "}
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: GRADIENT }}
                >
                  that actually happens.
                </span>
              </h1>
              <p className="mt-7 text-[18px] sm:text-[20px] leading-[1.55] text-[#134E4A]/70 max-w-[58ch]">
                Most group trips don't die at the airport. They die in week three of the WhatsApp
                thread, when someone sends a poll nobody answers and flights creep past what anyone
                wanted to pay. Here's the playbook for the ones that don't.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  to="/trips/new"
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold text-white hover:opacity-90 transition-opacity shadow-[0_10px_30px_-12px_rgba(13,148,136,0.55)]"
                  style={{ background: GRADIENT }}
                >
                  Plan a group trip free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#rules"
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold text-[#134E4A] bg-white border border-[#CCFBF1] hover:bg-[#F0FDFA] transition-colors"
                >
                  Read the 8 rules
                </a>
              </div>

              {/* Trust micro-strip */}
              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[#134E4A]/60">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-[#0D9488]" /> Free, no credit card
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-[#0D9488]" /> AI-built in 30 seconds
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-[#0D9488]" /> Group joins from a link
                </span>
              </div>
            </div>

            {/* TOC card */}
            <aside className="col-span-12 lg:col-span-5 mt-10 lg:mt-2">
              <div className="rounded-3xl border border-[#CCFBF1] bg-white shadow-[0_20px_50px_-30px_rgba(13,148,136,0.35)] p-6 sm:p-7">
                <div className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#0D9488] mb-4">
                  In this guide
                </div>
                <ol className="space-y-2.5">
                  {STEPS.map((s, i) => (
                    <li key={s.title}>
                      <a
                        href={`#rule-${i + 1}`}
                        className="group flex items-center gap-3 rounded-xl px-2 py-1.5 -mx-2 hover:bg-[#F0FDFA] transition-colors"
                      >
                        <span
                          className="flex-none w-7 h-7 rounded-full text-white text-[12px] font-bold flex items-center justify-center tabular-nums"
                          style={{ background: GRADIENT }}
                        >
                          {i + 1}
                        </span>
                        <span className="text-[14px] font-medium text-[#134E4A] group-hover:text-[#0D9488] transition-colors">
                          {s.title}
                        </span>
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </aside>
          </div>

          {/* Hero image card */}
          <figure className="mt-14 relative rounded-3xl overflow-hidden border border-[#CCFBF1] shadow-[0_30px_80px_-40px_rgba(13,148,136,0.5)]">
            <div className="relative aspect-[21/9] sm:aspect-[21/8] bg-[#F0FDFA]">
              <img
                src={HERO_IMG}
                alt="A group of friends standing on a coastal cliff at sunset, looking out over the sea"
                className="absolute inset-0 w-full h-full object-cover"
                loading="eager"
                fetchPriority="high"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#134E4A]/40 via-transparent to-transparent" />
            </div>
          </figure>
        </div>
      </header>

      {/* PRE-MORTEM */}
      <section className="bg-[#F0FDFA] border-y border-[#CCFBF1]">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <div className="grid grid-cols-12 gap-x-6 sm:gap-x-10 mb-10">
            <div className="col-span-12 md:col-span-5">
              <div className="text-[11px] font-bold tracking-[0.22em] uppercase text-[#0D9488] mb-3">
                The pre-mortem
              </div>
              <h2
                className="font-medium tracking-[-0.025em] leading-[1.05] text-[#134E4A]"
                style={{ fontSize: "clamp(30px, 4vw, 48px)" }}
              >
                Five ways your trip will quietly die.
              </h2>
            </div>
            <div className="col-span-12 md:col-span-6 md:col-start-7 mt-4 md:mt-3">
              <p className="text-[16px] leading-[1.65] text-[#134E4A]/70 max-w-[52ch]">
                If you've planned a group trip before, you've lived at least three of these. If you
                haven't, this is the unsubsidised education.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {FAILURES.map((f) => (
              <div
                key={f.num}
                className="rounded-2xl bg-white border border-[#CCFBF1] p-5 hover:shadow-[0_12px_30px_-18px_rgba(13,148,136,0.35)] transition-shadow"
              >
                <div
                  className="text-[12px] font-bold tabular-nums mb-3"
                  style={{
                    background: GRADIENT,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  No. {f.num}
                </div>
                <h3 className="text-[16px] font-semibold text-[#134E4A] mb-2 leading-snug">
                  {f.title}
                </h3>
                <p className="text-[13.5px] leading-[1.55] text-[#134E4A]/70">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THE RULES */}
      <section id="rules" className="bg-white">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-20 sm:pt-28 pb-8">
          <div className="text-center max-w-[720px] mx-auto">
            <div className="text-[11px] font-bold tracking-[0.22em] uppercase text-[#0D9488] mb-3">
              The Playbook
            </div>
            <h2
              className="font-medium tracking-[-0.03em] leading-[1.05] text-[#134E4A]"
              style={{ fontSize: "clamp(34px, 5vw, 58px)" }}
            >
              Eight rules, in order.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-[#134E4A]/70">
              The first three are non-negotiable. Skip any of them and the trip is on borrowed time.
            </p>
          </div>
        </div>

        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pb-8">
          {STEPS.map((s, i) => {
            const isEven = i % 2 === 0;
            const { Icon } = s;
            return (
              <article
                key={s.title}
                id={`rule-${i + 1}`}
                className="py-14 sm:py-20 border-b border-[#CCFBF1] last:border-b-0 scroll-mt-24"
              >
                <div className="grid grid-cols-12 gap-x-6 sm:gap-x-12 items-center">
                  {/* Image side */}
                  <div className={`col-span-12 lg:col-span-6 ${isEven ? "" : "lg:order-2"}`}>
                    <div className="relative rounded-3xl overflow-hidden border border-[#CCFBF1] shadow-[0_24px_60px_-30px_rgba(13,148,136,0.45)]">
                      <div className="relative aspect-[4/3] bg-[#F0FDFA]">
                        <img
                          src={s.image}
                          alt={s.alt}
                          className="absolute inset-0 w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      {/* Floating rule chip */}
                      <div
                        className="absolute top-5 left-5 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-bold text-white tabular-nums shadow-lg"
                        style={{ background: GRADIENT }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        Rule {String(i + 1).padStart(2, "0")}
                      </div>
                    </div>
                  </div>

                  {/* Text side */}
                  <div className={`col-span-12 lg:col-span-6 mt-8 lg:mt-0 ${isEven ? "" : "lg:order-1"}`}>
                    <h3
                      className="font-medium tracking-[-0.025em] leading-[1.08] text-[#134E4A]"
                      style={{ fontSize: "clamp(28px, 3.4vw, 42px)" }}
                    >
                      {s.title}.
                    </h3>
                    <p
                      className="mt-3 text-[17px] sm:text-[18px] font-semibold leading-[1.4]"
                      style={{
                        background: GRADIENT,
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}
                    >
                      {s.rule}
                    </p>

                    <p className="mt-6 text-[16px] sm:text-[17px] leading-[1.7] text-[#134E4A]/85">
                      {s.body}
                    </p>

                    <blockquote className="mt-7 rounded-2xl bg-[#F0FDFA] border-l-4 border-[#0D9488] px-5 py-4">
                      <p className="text-[16px] sm:text-[17px] leading-[1.5] font-medium text-[#134E4A]">
                        &ldquo;{s.pull}&rdquo;
                      </p>
                    </blockquote>

                    <div className="mt-6 flex gap-3">
                      <div className="flex-none w-1 rounded-full bg-gradient-to-b from-[#0D9488] to-[#0EA5E9]" />
                      <div>
                        <div className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#0D9488] mb-1.5">
                          Field note
                        </div>
                        <p className="text-[14.5px] leading-[1.6] text-[#134E4A]/75">{s.example}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <div
            className="relative overflow-hidden rounded-[32px] text-white px-7 sm:px-14 py-14 sm:py-20"
            style={{ background: GRADIENT }}
          >
            {/* Decorative orbs */}
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/15 blur-3xl" aria-hidden />
            <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-white/10 blur-3xl" aria-hidden />

            <div className="relative grid grid-cols-12 gap-x-6 sm:gap-x-10 items-center">
              <div className="col-span-12 lg:col-span-7">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 px-3.5 py-1.5 text-[12px] font-semibold mb-6">
                  <Sparkles className="h-3.5 w-3.5" />
                  Or skip rules 4 → 8
                </div>
                <h2
                  className="font-medium tracking-[-0.025em] leading-[1.05]"
                  style={{ fontSize: "clamp(32px, 4.5vw, 56px)" }}
                >
                  Let Junto build the plan, split the bill, and hold the group together.
                </h2>
                <p className="mt-5 text-[16px] sm:text-[17px] leading-[1.65] text-white/85 max-w-[52ch]">
                  AI-built itineraries in 30 seconds. Receipt-scanning expenses. Every decision
                  attached to the actual plan. Free, no credit card, your group joins from a link.
                </p>
              </div>
              <div className="col-span-12 lg:col-span-5 mt-8 lg:mt-0 flex flex-col gap-3">
                <Link
                  to="/trips/new"
                  className="group flex items-center justify-between gap-3 rounded-2xl bg-white text-[#0D9488] px-6 py-4 font-semibold text-[15px] hover:bg-[#F0FDFA] transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Plan a group trip free
                  </span>
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  to="/templates"
                  className="group flex items-center justify-between gap-3 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/25 text-white px-6 py-4 font-semibold text-[15px] hover:bg-white/25 transition-colors"
                >
                  Browse 16 trip ideas
                  <ArrowUpRight className="h-5 w-5 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CHECKLIST */}
      <section className="bg-[#F0FDFA] border-y border-[#CCFBF1]">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-16 sm:py-24 grid grid-cols-12 gap-x-6 sm:gap-x-10">
          <div className="col-span-12 md:col-span-5">
            <div className="text-[11px] font-bold tracking-[0.22em] uppercase text-[#0D9488] mb-3">
              Tear-out
            </div>
            <h2
              className="font-medium tracking-[-0.025em] leading-[1.05] text-[#134E4A]"
              style={{ fontSize: "clamp(30px, 4vw, 44px)" }}
            >
              The 30-second checklist.
            </h2>
            <p className="mt-5 text-[15px] leading-[1.6] text-[#134E4A]/70 max-w-[36ch]">
              Eight lines. Print it. Pin it to the chat. If you can tick all eight, the trip is going
              to happen.
            </p>
          </div>
          <div className="col-span-12 md:col-span-7 mt-8 md:mt-0">
            <ol className="rounded-3xl bg-white border border-[#CCFBF1] divide-y divide-[#CCFBF1] overflow-hidden">
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
                <li key={item} className="flex items-center gap-4 px-5 py-4">
                  <span
                    className="flex-none w-8 h-8 rounded-full text-white text-[13px] font-bold flex items-center justify-center tabular-nums"
                    style={{ background: GRADIENT }}
                  >
                    {idx + 1}
                  </span>
                  <span className="text-[15px] sm:text-[16px] leading-[1.45] text-[#134E4A]">
                    {item}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-16 sm:py-24 grid grid-cols-12 gap-x-6 sm:gap-x-10">
          <div className="col-span-12 md:col-span-4">
            <div className="md:sticky md:top-24">
              <div className="text-[11px] font-bold tracking-[0.22em] uppercase text-[#0D9488] mb-3">
                Q & A
              </div>
              <h2
                className="font-medium tracking-[-0.025em] leading-[1.05] text-[#134E4A]"
                style={{ fontSize: "clamp(30px, 4vw, 48px)" }}
              >
                Things people keep emailing us about.
              </h2>
            </div>
          </div>
          <div className="col-span-12 md:col-span-8 mt-8 md:mt-0">
            <div className="rounded-3xl border border-[#CCFBF1] divide-y divide-[#CCFBF1] overflow-hidden">
              {FAQ.map((f, idx) => (
                <details key={f.q} className="group bg-white open:bg-[#F0FDFA]/50 transition-colors" open={idx === 0}>
                  <summary className="flex items-center gap-4 cursor-pointer list-none px-5 sm:px-6 py-5">
                    <span
                      className="flex-none w-7 h-7 rounded-full text-white text-[12px] font-bold flex items-center justify-center tabular-nums"
                      style={{ background: GRADIENT }}
                    >
                      {idx + 1}
                    </span>
                    <span className="flex-1 text-[16px] sm:text-[17px] font-semibold text-[#134E4A] leading-snug">
                      {f.q}
                    </span>
                    <span
                      className="flex-none text-[22px] leading-none text-[#0D9488] group-open:rotate-45 transition-transform"
                      aria-hidden
                    >
                      +
                    </span>
                  </summary>
                  <div className="px-5 sm:px-6 pb-5 pl-[64px] sm:pl-[68px] text-[15px] leading-[1.65] text-[#134E4A]/80 max-w-[60ch]">
                    {f.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer / next up */}
      <footer className="bg-white border-t border-[#CCFBF1]">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-16 sm:py-20">
          <div className="rounded-3xl bg-[#F0FDFA] border border-[#CCFBF1] p-7 sm:p-10 grid grid-cols-12 gap-x-6 sm:gap-x-10 items-center">
            <div className="col-span-12 md:col-span-8">
              <div className="text-[11px] font-bold tracking-[0.22em] uppercase text-[#0D9488] mb-3">
                Up next
              </div>
              <h3
                className="font-medium tracking-[-0.02em] leading-[1.1] text-[#134E4A]"
                style={{ fontSize: "clamp(26px, 3.4vw, 38px)" }}
              >
                Need somewhere to go?
              </h3>
              <p className="mt-4 text-[15.5px] leading-[1.6] text-[#134E4A]/75 max-w-[52ch]">
                Sixteen curated group-trip itineraries. Bali, Tokyo, Tulum, Lisbon, Petra, Mexico
                City. Each one opens straight into a working plan.
              </p>
            </div>
            <div className="col-span-12 md:col-span-4 mt-6 md:mt-0 md:text-right">
              <Link
                to="/templates"
                className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ background: GRADIENT }}
              >
                See all trip ideas
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

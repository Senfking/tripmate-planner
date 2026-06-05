import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
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
  caption: string;
};

const STEPS: Step[] = [
  {
    title: "Kill the maybe tier",
    rule: "10 maybes are worth less than 4 yeses.",
    body: "Send one message. 'Trip in Q3. Who is actually in?' Give people 48 hours. Then close the door. The friends who reply 'yeah maybe lol' are the same ones who drop out two weeks before flights and torch the deposit. You are not being mean. You are protecting the trip from death by indecision.",
    pull: "A locked group of four will out-travel an unlocked group of nine every single time.",
    example: "A 9-person Lisbon plan died because three maybes refused to commit to dates. Flights kept climbing past €400. The group quietly stopped replying. A 4-person plan with the same dates would have booked in a week and cost €280.",
    image: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=1400&q=70&auto=format&fit=crop&fm=webp",
    alt: "A paper calendar opened to a planning month, pen resting across the page",
    caption: "Pick a fortnight. Stop renegotiating it.",
  },
  {
    title: "Say the budget number out loud",
    rule: "One number. All in. Before anything else.",
    body: "Do not say 'mid-range.' Say €900 per person, flights and accommodation included, for the week. This is the single highest-leverage move in group travel. It filters destinations, hotels, and activities in one sentence. More importantly, it surfaces the awkward gap between the friend on a startup salary and the friend whose parents are paying.",
    pull: "Mid-range is not a budget. It is a polite way of avoiding the conversation.",
    example: "Person A pictures €40 hostels and €15 dinners. Person B pictures a private villa and a tasting menu. Both think they agreed to 'a chill week away.' They have not agreed to anything. Name the number on day one.",
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1400&q=70&auto=format&fit=crop&fm=webp",
    alt: "Mixed Euro banknotes fanned out on a dark wooden table",
    caption: "The number is the contract. Write it down.",
  },
  {
    title: "Vote the vibe before the place",
    rule: "Beach reset, city break, adventure, or wedding side-trip. Pick one.",
    body: "Bali vs Tulum vs Lisbon never ends because people are arguing about different trips. Vote the vibe first, then shortlist two or three destinations that fit. Single transferable vote. 24 hours. Winner takes it. No revisits. No 'but what about Croatia.'",
    pull: "Destination-first groups argue for weeks. Vibe-first groups book on Tuesday.",
    example: "A vibe-first group picks 'beach plus nightlife, July, €1k cap' and lands on Ibiza in a day. A destination-first group is still pasting Tulum Instagram reels in week three.",
    image: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1400&q=70&auto=format&fit=crop&fm=webp",
    alt: "Overhead view of a worn world map with a compass and notebook",
    caption: "Agree on the feeling. The pin drops itself.",
  },
  {
    title: "Anchors, not schedules",
    rule: "One anchor per day. The rest is air.",
    body: "Over-planning is why group travel feels like a school trip. For each day pick exactly one anchor. A dinner reservation. A hike. A beach club. A museum slot. Everything else is decided that morning over coffee. Anchors create momentum without trapping the friend who wakes up hungover.",
    pull: "Twelve adults cannot be herded through Coyoacán in 35°C heat. Stop trying.",
    example: "Day 3 in Mexico City. Anchor: 8pm reservation at Pujol. That is the whole plan. People split off for markets, naps, walks, and reconverge at 7. Everyone is happy. Nobody filed a complaint.",
    image: "https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=1400&q=70&auto=format&fit=crop&fm=webp",
    alt: "A long candlelit dinner table outdoors with friends mid-conversation",
    caption: "One anchor a day is enough to feel like a trip.",
  },
  {
    title: "One person books, everyone pays",
    rule: "Group bookings: one card. Flights: your problem.",
    body: "Accommodation, the big group dinner, the boat day. These go on one person's card and they get paid back the same week. Flights are personal because seat prefs, loyalty miles, and departure cities all differ. Do not try to coordinate six separate flight bookings on one Zoom call. It is a void.",
    pull: "The booker gets a 2% kickback and the gratitude of the group. That is the trade.",
    example: "Set the expectation early so nobody feels they have been volunteered. Rotate the booker between trips if you travel often. The first transfer back happens within seven days, no exceptions.",
    image: "https://images.unsplash.com/photo-1551918120-9739cb430c6d?w=1400&q=70&auto=format&fit=crop&fm=webp",
    alt: "Laptop screen showing a hotel reservation confirmation",
    caption: "Centralised booking. Distributed payment.",
  },
  {
    title: "Log every receipt the day it happens",
    rule: "End-of-trip spreadsheets are a love language for resentment.",
    body: "Nobody remembers who paid for the taxi on Tuesday by the time Friday rolls around. Snap the receipt the moment it lands. Tag who it was for, because the vegetarian did not have the €60 ribeye. Settle in one transfer at the end.",
    pull: "If the math happens on the flight home, the friendship is already losing altitude.",
    example: "Junto reads the receipt, splits multi-currency on the fly, and shows live balances. A 14-day trip with six people and 80 expenses settles in two Revolut transfers. No spreadsheet. No 'wait, was that wine yours?'",
    image: "https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=1400&q=70&auto=format&fit=crop&fm=webp",
    alt: "Close-up of a restaurant receipt next to a credit card on dark wood",
    caption: "Receipt in. Tag the people. Move on.",
  },
  {
    title: "One home for docs, passports, visas",
    rule: "If it lives in someone's inbox, it does not exist.",
    body: "Hotel PDFs. Flight tickets. Visa stamps. Vaccination cards. Travel insurance. Passport expiry dates. One shared place that everyone can pull up at a check-in desk at 4am. Then run a passport-validity check eight weeks out. A passport that expires within six months of return will turn you away at immigration in most of Asia.",
    pull: "Most cancelled trips do not get cancelled by airlines. They get cancelled at the gate.",
    example: "A friend missed a Bali flight because his passport had 5 months and 27 days of validity. The airline refused boarding. Eight weeks of warning would have saved €600 and a ruined first day.",
    image: "https://images.unsplash.com/photo-1452421822248-d4c2b47f0c81?w=1400&q=70&auto=format&fit=crop&fm=webp",
    alt: "A passport, boarding pass, and a small leather notebook on a wooden surface",
    caption: "One folder. Everyone has the link.",
  },
  {
    title: "Decisions live on the plan, not in the chat",
    rule: "If you are voting in WhatsApp, you have already lost the thread.",
    body: "When a comment about a restaurant lives 47 messages above the actual restaurant card, the group is coordinating two parallel realities. Keep comments, reactions, and votes attached to the actual itinerary item. The plan is the source of truth. The chat is for jokes.",
    pull: "A 200-message thread collapses to 12 once decisions sit on the venue card.",
    example: "Everyone can see what was decided, who weighed in, what changed, and when. Nobody re-litigates the museum on day three because they 'missed that part' of the thread.",
    image: "https://images.unsplash.com/photo-1543269865-cbf427effbad?w=1400&q=70&auto=format&fit=crop&fm=webp",
    alt: "Friends laughing while looking at a single phone screen together",
    caption: "Move the decision to where the decision lives.",
  },
];

const FAILURES: { num: string; title: string; body: string }[] = [
  { num: "01", title: "Nobody commits to dates", body: "Three people stay 'maybe' for four weeks. Flight prices double. The group quietly disbands." },
  { num: "02", title: "Budget never gets named", body: "Two people are planning hostels. Two are planning a villa. Surfaces during the Airbnb scroll. Argument follows." },
  { num: "03", title: "Itinerary becomes a school trip", body: "Someone over-plans. Day 3 has seven activities. Half the group fakes a stomach bug to skip the museum." },
  { num: "04", title: "Money never settles", body: "End-of-trip spreadsheet takes three weeks. Two people never pay back. Resentment compounds into next year." },
  { num: "05", title: "Decisions live in four places", body: "WhatsApp, Notion, Google Doc, Instagram DMs. Nobody knows what was actually agreed. Someone double-books." },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "How far in advance should we start planning a group trip?",
    a: "Long weekend: 6 to 8 weeks. Week-long international: 3 to 6 months. The constraint is not planning time, it is flight prices and time-off requests. Anything past 6 months and people forget they agreed.",
  },
  {
    q: "What is the ideal group size?",
    a: "Four to six is the sweet spot. One Airbnb, one dinner reservation, one taxi. Above eight you need sub-groups, two cars, and a spreadsheet to feed everyone. Above twelve you are running a wedding, not a trip.",
  },
  {
    q: "How do you split group expenses fairly?",
    a: "Log every shared expense the day it happens. Tag who it was actually for (not always 'everyone'). Settle at the end with one transfer per person. Tools like Junto read receipts with AI, handle multi-currency, and show live balances so nobody is doing math in a hostel.",
  },
  {
    q: "What if people disagree about the destination?",
    a: "Do not debate. Vote. Shortlist 2 to 3 options that all fit the agreed vibe and budget. One vote each. 24-hour deadline. Winner takes it. Endless pros-and-cons threads end in a trip that never gets booked.",
  },
  {
    q: "Should one person be the trip organizer?",
    a: "Someone has to drive momentum. They should not make every decision. The organizer kicks things off and pushes deadlines. The group votes, comments, and books in parallel. Otherwise the organizer burns out by week two and the trip dies in their inbox.",
  },
  {
    q: "What about flights from different cities?",
    a: "Do not try to book together. Agree the arrival window ('land by 6pm Friday'), share booking confirmations in one place, and meet at the accommodation. Trying to coordinate six flights from four cities is the fastest way to delay a trip by a month.",
  },
];

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
    <div
      className="min-h-dvh bg-[#F0FDFA] text-[#134E4A]"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
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
      <div className="fixed top-0 left-0 right-0 h-[3px] z-50 bg-transparent">
        <div
          className="h-full bg-[#0D9488] transition-[width] duration-150 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Masthead */}
      <div className="border-b border-[#134E4A]/15">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-8 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={back}
            className="inline-flex items-center gap-1.5 text-[11px] tracking-[0.2em] uppercase font-semibold hover:opacity-60 transition-opacity"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div
            className="text-[11px] tracking-[0.3em] uppercase font-semibold"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            Junto · Field Guide № 01
          </div>
          <Link
            to="/templates"
            className="hidden sm:inline-flex items-center gap-1.5 text-[11px] tracking-[0.2em] uppercase font-semibold hover:opacity-60 transition-opacity"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            Index
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* HERO — editorial cover */}
      <header className="border-b border-[#134E4A]/15">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-8 pt-10 sm:pt-16 pb-10">
          <div
            className="grid grid-cols-12 gap-x-5 sm:gap-x-8 text-[11px] tracking-[0.22em] uppercase font-semibold mb-8"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            <div className="col-span-6 sm:col-span-3">Issue · 06 / 2026</div>
            <div className="col-span-6 sm:col-span-3 text-right sm:text-left">8 Rules · 12 Min Read</div>
            <div className="hidden sm:block col-span-3">By the Junto desk</div>
            <div className="hidden sm:block col-span-3 text-right">Filed under: Group Travel</div>
          </div>

          <h1
            className="font-light leading-[0.92] tracking-[-0.035em] text-[#134E4A]"
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: "clamp(48px, 11vw, 168px)",
              fontVariationSettings: "'opsz' 144, 'SOFT' 50",
            }}
          >
            How to plan
            <br />
            a <span style={{ fontStyle: "italic", fontWeight: 300 }}>group trip</span>
            <br />
            that <span className="text-[#0D9488]">actually</span> happens.
          </h1>

          <div className="grid grid-cols-12 gap-x-5 sm:gap-x-8 mt-10 sm:mt-14">
            <div className="col-span-12 sm:col-span-7 md:col-span-6">
              <p className="text-[19px] sm:text-[22px] leading-[1.45] text-[#134E4A]/85 font-normal">
                Most group trips do not die at the airport. They die in week three of the WhatsApp thread,
                when someone sends a poll that nobody answers, the dates slip again, and flights creep
                past what anyone wanted to pay.
              </p>
            </div>
            <div className="hidden md:block col-span-1" />
            <aside className="col-span-12 sm:col-span-5 md:col-span-5 mt-8 sm:mt-0 border-t sm:border-t-0 sm:border-l border-[#134E4A]/20 sm:pl-8 pt-6 sm:pt-2">
              <div
                className="text-[10px] tracking-[0.25em] uppercase font-semibold mb-3 text-[#134E4A]/60"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                In this issue
              </div>
              <ol
                className="space-y-1.5 text-[13px] tabular-nums"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                {STEPS.map((s, i) => (
                  <li key={s.title} className="flex gap-3">
                    <span className="text-[#0D9488] font-semibold">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-[#134E4A]/80">{s.title}</span>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </div>

        {/* Full-bleed hero image with caption */}
        <figure className="relative w-full overflow-hidden border-y border-[#134E4A]/15 bg-[#134E4A]">
          <div className="relative w-full aspect-[21/9] sm:aspect-[21/8]">
            <img
              src={HERO_IMG}
              alt="A group of friends standing on a coastal cliff at sunset, looking out over the sea"
              className="absolute inset-0 w-full h-full object-cover"
              loading="eager"
              fetchPriority="high"
            />
          </div>
          <figcaption
            className="absolute bottom-0 left-0 right-0 px-5 sm:px-8 py-3 bg-gradient-to-t from-black/70 to-transparent text-[11px] tracking-[0.2em] uppercase font-semibold text-white/90"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            Fig. 01 · Six friends. One trip. Zero unresolved polls.
          </figcaption>
        </figure>
      </header>

      {/* INTRO — drop cap */}
      <section className="border-b border-[#134E4A]/15">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-8 py-16 sm:py-24 grid grid-cols-12 gap-x-5 sm:gap-x-8">
          <div className="hidden md:block col-span-2">
            <div
              className="text-[10px] tracking-[0.25em] uppercase font-semibold text-[#134E4A]/50 sticky top-8"
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              § Opening
            </div>
          </div>
          <div className="col-span-12 md:col-span-8">
            <p
              className="text-[20px] sm:text-[24px] leading-[1.45] text-[#134E4A] first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:text-[88px] first-letter:leading-[0.85] first-letter:font-light first-letter:text-[#0D9488]"
              style={{ fontFamily: "'Inter', system-ui, sans-serif", fontVariationSettings: "'opsz' 36, 'SOFT' 30" }}
            >
              The trips that actually happen share a pattern. Tight commitments. Named budgets.
              Anchor-only itineraries. Money settled in real time. Decisions made where the trip
              lives, not buried under 200 messages of memes and 'lol so true.'
            </p>
            <p className="mt-8 text-[17px] leading-[1.65] text-[#134E4A]/80 max-w-[58ch]">
              This is that playbook. Eight rules, in order. The first three matter most. Steal what
              works, ignore what does not, and your next group trip will not be the one everyone
              politely stops talking about.
            </p>
          </div>
        </div>
      </section>

      {/* FAILURE CARDS — index-style */}
      <section className="border-b border-[#134E4A]/15 bg-[#134E4A] text-[#F0FDFA]">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <div className="grid grid-cols-12 gap-x-5 sm:gap-x-8 mb-12">
            <div className="col-span-12 md:col-span-4">
              <div
                className="text-[10px] tracking-[0.25em] uppercase font-semibold text-[#0D9488] mb-4"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                Pre-mortem
              </div>
              <h2
                className="font-light leading-[0.95] tracking-[-0.02em]"
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: "clamp(36px, 5vw, 64px)",
                  fontVariationSettings: "'opsz' 96, 'SOFT' 40",
                }}
              >
                Five ways your trip will <em className="text-[#0D9488]" style={{ fontStyle: "italic" }}>quietly die</em>.
              </h2>
            </div>
            <div className="hidden md:block col-span-1" />
            <div className="col-span-12 md:col-span-7 mt-6 md:mt-3">
              <p className="text-[16px] leading-[1.65] text-[#F0FDFA]/70 max-w-[52ch]">
                If you have planned a group trip before, you have lived at least three of these.
                If you have not, this is the unsubsidised education.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 border-t border-[#F0FDFA]/15">
            {FAILURES.map((f) => (
              <div
                key={f.num}
                className="border-b sm:border-r last:border-r-0 border-[#F0FDFA]/15 px-1 sm:px-5 py-6 sm:py-8"
              >
                <div
                  className="text-[11px] tracking-[0.25em] uppercase font-semibold text-[#0D9488] mb-4 tabular-nums"
                  style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                >
                  No. {f.num}
                </div>
                <h3
                  className="text-[20px] leading-[1.15] mb-3 tracking-[-0.01em]"
                  style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                >
                  {f.title}
                </h3>
                <p className="text-[14px] leading-[1.55] text-[#F0FDFA]/70">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THE 8 RULES */}
      <section className="border-b border-[#134E4A]/15">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-8 pt-20 sm:pt-28 pb-10">
          <div className="grid grid-cols-12 gap-x-5 sm:gap-x-8 items-end">
            <div className="col-span-12 md:col-span-8">
              <div
                className="text-[10px] tracking-[0.25em] uppercase font-semibold text-[#134E4A]/50 mb-4"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                Part Two · The rules
              </div>
              <h2
                className="font-light leading-[0.92] tracking-[-0.03em]"
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: "clamp(44px, 7vw, 96px)",
                  fontVariationSettings: "'opsz' 144, 'SOFT' 50",
                }}
              >
                Eight rules,
                <br />
                in <em style={{ fontStyle: "italic" }}>order</em>.
              </h2>
            </div>
            <div className="col-span-12 md:col-span-4 mt-6 md:mt-0 md:pb-3">
              <p
                className="text-[13px] tracking-[0.05em] text-[#134E4A]/70"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                Rules 01 → 03 are non-negotiable. The rest you can adapt. Skip any of the first three
                and the trip is on borrowed time.
              </p>
            </div>
          </div>
        </div>

        <div>
          {STEPS.map((s, i) => {
            const isEven = i % 2 === 0;
            return (
              <article
                key={s.title}
                className="border-t border-[#134E4A]/15"
              >
                <div className="max-w-[1280px] mx-auto px-5 sm:px-8 py-16 sm:py-24 grid grid-cols-12 gap-x-5 sm:gap-x-8">
                  {/* Big numeral column */}
                  <div className="col-span-12 md:col-span-3 mb-8 md:mb-0">
                    <div
                      className="text-[10px] tracking-[0.25em] uppercase font-semibold text-[#134E4A]/50 mb-2"
                      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                    >
                      Rule
                    </div>
                    <div
                      className="font-light leading-[0.85] text-[#134E4A] tabular-nums tracking-[-0.06em]"
                      style={{
                        fontFamily: "'Inter', system-ui, sans-serif",
                        fontSize: "clamp(96px, 14vw, 220px)",
                        fontVariationSettings: "'opsz' 144, 'SOFT' 50",
                      }}
                    >
                      <span className="text-[#134E4A]/15">0</span>
                      <span className={i < 3 ? "text-[#0D9488]" : "text-[#134E4A]"}>{i + 1}</span>
                    </div>
                  </div>

                  {/* Content column */}
                  <div className={`col-span-12 md:col-span-9 ${isEven ? "" : "md:order-first md:col-start-1 md:col-span-9 md:row-start-1"}`}>
                    {/* This layout block reads naturally; the order swap is a subtle rhythm break */}
                    <div className="md:max-w-[680px] md:ml-auto">
                      <h3
                        className="font-light leading-[0.98] tracking-[-0.025em] text-[#134E4A]"
                        style={{
                          fontFamily: "'Inter', system-ui, sans-serif",
                          fontSize: "clamp(36px, 4.5vw, 60px)",
                          fontVariationSettings: "'opsz' 96, 'SOFT' 40",
                        }}
                      >
                        {s.title}.
                      </h3>
                      <p
                        className="mt-5 text-[18px] sm:text-[20px] leading-[1.4] text-[#0D9488]"
                        style={{ fontFamily: "'Inter', system-ui, sans-serif", fontStyle: "italic", fontVariationSettings: "'opsz' 48" }}
                      >
                        {s.rule}
                      </p>

                      <figure className="mt-9 mb-9">
                        <div className="relative w-full aspect-[3/2] overflow-hidden bg-[#CCFBF1]">
                          <img
                            src={s.image}
                            alt={s.alt}
                            className="absolute inset-0 w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <figcaption
                          className="mt-3 flex items-baseline gap-4 text-[11px] tracking-[0.2em] uppercase font-semibold text-[#134E4A]/60"
                          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                        >
                          <span className="text-[#0D9488]">Fig. {String(i + 2).padStart(2, "0")}</span>
                          <span className="normal-case tracking-normal text-[13px] text-[#134E4A]/65" style={{ fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: 0, fontWeight: 400 }}>
                            {s.caption}
                          </span>
                        </figcaption>
                      </figure>

                      <p className="text-[17px] sm:text-[18px] leading-[1.65] text-[#134E4A]/85">{s.body}</p>

                      <blockquote
                        className="my-10 pl-6 border-l-2 border-[#0D9488]"
                      >
                        <p
                          className="text-[24px] sm:text-[30px] leading-[1.15] tracking-[-0.015em] text-[#134E4A]"
                          style={{
                            fontFamily: "'Inter', system-ui, sans-serif",
                            fontVariationSettings: "'opsz' 72, 'SOFT' 40",
                          }}
                        >
                          &ldquo;{s.pull}&rdquo;
                        </p>
                      </blockquote>

                      <div className="border-t border-[#134E4A]/15 pt-5">
                        <div
                          className="text-[10px] tracking-[0.25em] uppercase font-semibold text-[#134E4A]/50 mb-2"
                          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                        >
                          Field note
                        </div>
                        <p className="text-[15px] leading-[1.6] text-[#134E4A]/75">{s.example}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* CTA — heavy, full-bleed */}
      <section className="bg-[#0D9488] text-[#134E4A] border-b border-[#134E4A]/15">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <div className="grid grid-cols-12 gap-x-5 sm:gap-x-8">
            <div className="col-span-12 md:col-span-7">
              <div
                className="text-[11px] tracking-[0.28em] uppercase font-semibold mb-6"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                Or, skip rules 04 → 08
              </div>
              <h2
                className="font-light leading-[0.94] tracking-[-0.03em]"
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: "clamp(40px, 6vw, 84px)",
                  fontVariationSettings: "'opsz' 144, 'SOFT' 50",
                }}
              >
                Let an AI build it. Let a product hold the group <em style={{ fontStyle: "italic" }}>together</em>.
              </h2>
            </div>
            <div className="col-span-12 md:col-span-5 md:pl-8 md:border-l md:border-[#134E4A]/25 mt-10 md:mt-3">
              <p className="text-[17px] leading-[1.6] mb-8 max-w-[40ch]">
                Junto builds anchor-based itineraries in 30 seconds, reads receipts to settle expenses,
                and keeps every decision on the actual plan. Free. No credit card. Your group joins
                from a link.
              </p>
              <div className="space-y-3">
                <Link
                  to="/trips/new"
                  className="group flex items-center justify-between w-full bg-[#134E4A] text-[#F0FDFA] px-6 py-5 hover:bg-black transition-colors"
                >
                  <span
                    className="text-[14px] tracking-[0.15em] uppercase font-semibold"
                    style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                  >
                    Plan a group trip
                  </span>
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  to="/templates"
                  className="group flex items-center justify-between w-full border border-[#134E4A] px-6 py-5 hover:bg-[#134E4A] hover:text-[#F0FDFA] transition-colors"
                >
                  <span
                    className="text-[14px] tracking-[0.15em] uppercase font-semibold"
                    style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                  >
                    Browse 16 trip ideas
                  </span>
                  <ArrowUpRight className="h-5 w-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CHECKLIST — telegram style */}
      <section className="border-b border-[#134E4A]/15">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-8 py-20 sm:py-28 grid grid-cols-12 gap-x-5 sm:gap-x-8">
          <div className="col-span-12 md:col-span-4">
            <div
              className="text-[10px] tracking-[0.25em] uppercase font-semibold text-[#134E4A]/50 mb-4"
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              Tear-out
            </div>
            <h2
              className="font-light leading-[0.95] tracking-[-0.02em]"
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: "clamp(36px, 4.5vw, 56px)",
                fontVariationSettings: "'opsz' 96, 'SOFT' 40",
              }}
            >
              The <em style={{ fontStyle: "italic" }}>30-second</em> checklist.
            </h2>
            <p className="mt-5 text-[15px] leading-[1.6] text-[#134E4A]/70 max-w-[34ch]">
              Eight lines. Print it. Pin it to the chat. If you can tick all eight, the trip is going
              to happen.
            </p>
          </div>
          <div className="col-span-12 md:col-span-8 mt-10 md:mt-0 md:border-l md:border-[#134E4A]/20 md:pl-10">
            <ol className="divide-y divide-[#134E4A]/15 border-y border-[#134E4A]/15">
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
                <li key={item} className="flex items-baseline gap-6 py-5">
                  <span
                    className="flex-none text-[13px] tabular-nums font-semibold text-[#0D9488] tracking-[0.1em]"
                    style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                  >
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[18px] sm:text-[20px] leading-[1.4] text-[#134E4A]" style={{ fontFamily: "'Inter', system-ui, sans-serif", fontVariationSettings: "'opsz' 36" }}>
                    {item}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-[#134E4A]/15">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-8 py-20 sm:py-28 grid grid-cols-12 gap-x-5 sm:gap-x-8">
          <div className="col-span-12 md:col-span-4">
            <div
              className="text-[10px] tracking-[0.25em] uppercase font-semibold text-[#134E4A]/50 mb-4 md:sticky md:top-8"
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              Q & A
            </div>
            <h2
              className="font-light leading-[0.95] tracking-[-0.02em] md:sticky md:top-16"
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: "clamp(36px, 4.5vw, 60px)",
                fontVariationSettings: "'opsz' 96, 'SOFT' 40",
              }}
            >
              Things people keep <em style={{ fontStyle: "italic" }}>emailing</em> us about.
            </h2>
          </div>
          <div className="col-span-12 md:col-span-8 mt-10 md:mt-0">
            <div className="divide-y divide-[#134E4A]/15 border-y border-[#134E4A]/15">
              {FAQ.map((f, idx) => (
                <details key={f.q} className="group py-7" open={idx === 0}>
                  <summary className="flex items-baseline gap-6 cursor-pointer list-none">
                    <span
                      className="flex-none text-[12px] tabular-nums font-semibold text-[#0D9488]"
                      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span
                      className="flex-1 text-[22px] sm:text-[26px] leading-[1.2] tracking-[-0.015em] text-[#134E4A]"
                      style={{ fontFamily: "'Inter', system-ui, sans-serif", fontVariationSettings: "'opsz' 72, 'SOFT' 40" }}
                    >
                      {f.q}
                    </span>
                    <span
                      className="flex-none text-[20px] text-[#134E4A]/60 group-open:rotate-45 transition-transform"
                      aria-hidden
                    >
                      +
                    </span>
                  </summary>
                  <div className="mt-4 pl-[44px] text-[16px] leading-[1.65] text-[#134E4A]/80 max-w-[58ch]">
                    {f.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Colophon / outro */}
      <footer className="bg-[#134E4A] text-[#F0FDFA]">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <div className="grid grid-cols-12 gap-x-5 sm:gap-x-8">
            <div className="col-span-12 md:col-span-8">
              <div
                className="text-[10px] tracking-[0.25em] uppercase font-semibold text-[#0D9488] mb-4"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                Up next
              </div>
              <h3
                className="font-light leading-[0.95] tracking-[-0.025em]"
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: "clamp(36px, 5vw, 64px)",
                  fontVariationSettings: "'opsz' 96, 'SOFT' 50",
                }}
              >
                Need somewhere <em style={{ fontStyle: "italic" }} className="text-[#0D9488]">to go</em>?
              </h3>
              <p className="mt-5 text-[17px] leading-[1.6] text-[#F0FDFA]/70 max-w-[52ch]">
                Sixteen curated group-trip itineraries. Bali, Tokyo, Tulum, Lisbon, Petra, Mexico City.
                Filtered by vibe, season, and budget. Each one opens straight into a working plan.
              </p>
              <Link
                to="/templates"
                className="mt-8 inline-flex items-center gap-2 text-[13px] tracking-[0.18em] uppercase font-semibold text-[#F0FDFA] border-b border-[#0D9488] pb-1 hover:text-[#0D9488] transition-colors"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                See all trip ideas
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="col-span-12 md:col-span-4 mt-10 md:mt-0 md:border-l md:border-[#F0FDFA]/20 md:pl-8">
              <div
                className="text-[10px] tracking-[0.25em] uppercase font-semibold text-[#F0FDFA]/50 mb-4"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                Colophon
              </div>
              <p
                className="text-[13px] leading-[1.65] text-[#F0FDFA]/60"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                Set in Inter. Built in Junto.<br />
                Written by people who have planned trips that worked, and many more that did not.<br />
                Published by Junto, June 2026.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

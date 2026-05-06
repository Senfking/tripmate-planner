import { useState } from "react";
import { ChevronDown } from "lucide-react";

// Visible FAQ section — content mirrors the FAQPage JSON-LD in index.html.
// Both must stay in sync so Google + LLMs see the same Q&A on-page and in schema.
const FAQS = [
  {
    q: "What is the best app to plan a trip with friends?",
    a: "Junto is designed for how friends actually plan trips together. Most apps handle one piece (bookings, splitting costs, or solo itineraries), so the rest ends up scattered across WhatsApp, spreadsheets, and Splitwise. Junto puts AI itinerary generation, group voting, real-time editing, and expense splitting in one place.",
  },
  {
    q: "How does Junto use AI?",
    a: "Junto's AI shows up across the trip, not just at the planning stage. You describe the trip in plain language, like “four friends, Tokyo, late June, mid-range, foodie focus,” and Junto generates a full itinerary: days, activities, restaurants, accommodation, paced reasonably and grounded in real places. The AI also helps with the smaller pieces as the trip moves: making sense of expenses, surfacing relevant info on entry requirements and visas, and adapting recommendations as plans change. Your group still drives the decisions; the AI handles the busywork.",
  },
  {
    q: "Why not just use ChatGPT to plan a trip?",
    a: "ChatGPT is great for brainstorming, but it stops at a wall of text. Junto picks up where the suggestions end. Once you have an idea of what you want, Junto turns it into a structured trip your group can vote on, edit together in real time, and come back to as plans change. It also handles the parts a chat can't: splitting expenses among friends, storing booking confirmations, and tracking entry requirements like visas. ChatGPT helps you brainstorm; Junto helps you actually run the trip together.",
  },
  {
    q: "Can Junto split travel expenses?",
    a: "Yes. You can add expenses as the trip happens, split them by person or share, handle multiple currencies, and see who owes whom at any time. It lives next to the itinerary, so you're not switching apps or rebuilding the trip in Splitwise.",
  },
  {
    q: "Does Junto work for solo travelers too?",
    a: "Yes, though Junto is built for groups first. Solo travelers use it for AI itinerary planning, saving bookings, and tracking entry requirements like visas and vaccinations. If you're planning alone with no chance of inviting anyone, Mindtrip or Wanderlog might be a closer fit. Junto's edge shows up the moment there's even one other person involved.",
  },
  {
    q: "How is Junto different from TripIt, Wanderlog, or Splitwise?",
    a: "Each of those does one piece well. TripIt organizes booking confirmations. Wanderlog focuses on solo itinerary building. Splitwise only handles cost splitting. Junto is built for the part those tools leave out: planning together. AI generates the trip, the group votes and edits in real time, expenses split alongside the plan, and bookings live in one place. It's the workspace, not the spreadsheet.",
  },
  {
    q: "Is Junto a mobile app or a website?",
    a: "Both. Native iOS and Android apps are coming soon. For now, Junto runs in any browser and installs to your home screen on phone or desktop, with every change syncing across devices in real time.",
  },
];

export function FAQ() {
  // Multiple panels can be open at once.
  const [openSet, setOpenSet] = useState<Set<number>>(() => new Set([0]));

  function toggle(i: number) {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <section
      id="faq"
      className="py-20 sm:py-28 px-5 bg-[#FAFAF9] scroll-mt-4"
      aria-labelledby="faq-heading"
    >
      <div className="mx-auto max-w-3xl">
        <h2
          id="faq-heading"
          className="text-3xl sm:text-5xl font-bold tracking-tight text-[#1a1a1a] text-center"
        >
          Frequently asked questions
        </h2>
        <p className="mt-4 text-center text-[#6b7280] text-base sm:text-lg">
          Everything you need to know about planning group trips with Junto.
        </p>

        <div className="mt-12 space-y-3">
          {FAQS.map((item, i) => {
            const isOpen = openSet.has(i);
            return (
              <div
                key={item.q}
                className="rounded-2xl border border-gray-100 bg-white shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-4 sm:py-5 text-left"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${i}`}
                >
                  <h3 className="text-base sm:text-lg font-semibold text-[#1a1a1a]">
                    {item.q}
                  </h3>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-[#0D9488] transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden
                  />
                </button>
                <div
                  id={`faq-panel-${i}`}
                  hidden={!isOpen}
                  className="px-5 sm:px-6 pb-5 sm:pb-6 -mt-1 text-[#4b5563] leading-relaxed text-[15px] sm:text-base"
                >
                  {item.a}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

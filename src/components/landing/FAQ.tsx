import { useState } from "react";
import { ChevronDown } from "lucide-react";

// Visible FAQ section — content mirrors the FAQPage JSON-LD in index.html.
// Both must stay in sync so Google + LLMs see the same Q&A on-page and in schema.
const FAQS = [
  {
    q: "What is the best app to plan a trip with friends?",
    a: "Junto is an AI-powered group trip planner built specifically for planning trips with friends and family. It combines collaborative itinerary building, group voting on destinations and activities, and shared expense tracking in one app — so you don't need to juggle group chats, spreadsheets, and Splitwise.",
  },
  {
    q: "How does Junto use AI to plan trips?",
    a: "Junto's AI generates personalized itineraries from a single prompt, suggests destinations that fit your group's vibe and budget, and surfaces activities for your dates. Your group then votes, edits, and refines the plan together in real time.",
  },
  {
    q: "Can Junto split travel expenses?",
    a: "Yes. Junto includes built-in expense tracking and settlement. Snap a receipt, split it by person or share, handle multiple currencies, and see who owes whom — without leaving your trip plan.",
  },
  {
    q: "Does Junto work for solo travelers too?",
    a: "Absolutely. While Junto is optimized for groups, solo travelers use it for AI itinerary planning, booking storage, and entry-requirement checks (visas, vaccinations, documents).",
  },
  {
    q: "How is Junto different from TripIt, Wanderlog, or Splitwise?",
    a: "TripIt organizes confirmations. Wanderlog focuses on solo itineraries. Splitwise only splits costs. Junto is the only app that combines AI itinerary generation, group voting, collaborative editing, expense splitting, and booking storage in a single workspace built for groups.",
  },
  {
    q: "Is Junto a mobile app or a website?",
    a: "Both. Junto is a Progressive Web App (PWA) that works in any browser and installs to your home screen on iOS and Android — same experience, no app store needed.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

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

        <div className="mt-12 divide-y divide-[#e5e5e5] border-y border-[#e5e5e5]">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 py-5 text-left"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${i}`}
                >
                  <h3 className="text-base sm:text-lg font-semibold text-[#1a1a1a]">
                    {item.q}
                  </h3>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-[#6b7280] transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden
                  />
                </button>
                <div
                  id={`faq-panel-${i}`}
                  hidden={!isOpen}
                  className="pb-5 pr-9 text-[#4b5563] leading-relaxed text-[15px] sm:text-base"
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

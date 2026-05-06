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
    q: "Why use Junto instead of starting from scratch every trip?",
    a: "Because trips don't really end when you fly home. Junto is built to be your travel hub over time, not a one-off planner you abandon after the trip. Every trip you plan, past, current, and upcoming, lives in one home, with its itinerary, bookings, expenses, and group decisions intact. That means you can look back at what you did in Lisbon two years ago when a friend asks for tips, see who still owes you from the ski trip, or reuse the structure of a trip that worked well as a starting point for the next one. The more you use it, the more useful it gets: your travel history, your favorite spots, the people you travel with, all in one place instead of scattered across chats, screenshots, and folders.",
  },
  {
    q: "How does Junto use AI?",
    a: "Junto's AI shows up across the trip, not just at the planning stage. You describe the trip in plain language, like “four friends, Tokyo, late June, mid-range, foodie focus,” and Junto generates a full itinerary: days, activities, restaurants, accommodation, paced reasonably and grounded in real places. The real magic is everything after that. Snap a photo of a restaurant receipt and the AI reads the total, currency, date and line items, then splits it across the group. Forward a hotel confirmation email or screenshot a flight ticket and the AI pulls out the dates, locations, confirmation numbers and adds them to the trip automatically. It also surfaces visa and entry requirements per traveler, and adapts as plans change. Your group still drives the decisions; the AI handles the busywork so everyone stays on the same page without anyone playing trip secretary.",
  },
  {
    q: "Why not just use ChatGPT to plan a trip?",
    a: "ChatGPT is great for brainstorming, but it stops at a wall of text. Junto picks up where the suggestions end. Once you have an idea of what you want, Junto turns it into a structured trip your group can vote on, edit together in real time, and come back to as plans change. It also handles the parts a chat can't: splitting expenses from a photo of a receipt, parsing booking confirmations from a screenshot, and tracking entry requirements like visas. ChatGPT helps you brainstorm; Junto helps you actually run the trip together.",
  },
  {
    q: "Can Junto split travel expenses?",
    a: "Yes — and you don't have to type anything. Snap a photo of the receipt and Junto's AI reads the total, currency, date and line items, then splits it across the group. Add expenses as the trip happens, split by person or share, handle multiple currencies, and see who owes whom at any time. It lives next to the itinerary, so you're not switching between Junto, your camera roll and Splitwise.",
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
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] sm:gap-x-12 gap-y-2 items-baseline">
          <span className="hidden sm:block text-[11px] font-mono uppercase tracking-[0.22em] text-[#0D9488] pt-3">
            (FAQ)
          </span>
          <div>
            <h2
              id="faq-heading"
              className="text-4xl sm:text-6xl font-bold tracking-tight text-[#1a1a1a] leading-[1.05]"
            >
              Frequently<br />asked questions
            </h2>
            <p className="mt-5 text-[#6b7280] text-base sm:text-lg max-w-md">
              Everything you need to know about planning group trips with Junto.
            </p>
          </div>
        </div>

        <ol className="mt-16 sm:mt-20">
          {FAQS.map((item, i) => {
            const isOpen = openSet.has(i);
            const num = String(i + 1).padStart(2, "0");
            return (
              <li
                key={item.q}
                className="border-t border-[#e7e5e0] last:border-b group"
              >
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  className="w-full flex items-start gap-5 sm:gap-8 py-6 sm:py-7 text-left transition-colors"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${i}`}
                >
                  <span
                    className={`shrink-0 text-[11px] font-mono tracking-widest pt-1.5 transition-colors ${
                      isOpen ? "text-[#0D9488]" : "text-[#9ca3af]"
                    }`}
                  >
                    {num}
                  </span>
                  <h3
                    className={`flex-1 text-lg sm:text-2xl font-semibold tracking-tight transition-colors ${
                      isOpen ? "text-[#0D9488]" : "text-[#1a1a1a] group-hover:text-[#0D9488]"
                    }`}
                  >
                    {item.q}
                  </h3>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 mt-2 transition-all duration-300 ${
                      isOpen ? "rotate-180 text-[#0D9488]" : "text-[#9ca3af] group-hover:text-[#0D9488]"
                    }`}
                    aria-hidden
                  />
                </button>
                <div
                  id={`faq-panel-${i}`}
                  className={`grid transition-all duration-300 ease-out ${
                    isOpen ? "grid-rows-[1fr] opacity-100 pb-7 sm:pb-8" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="pl-9 sm:pl-14 pr-8 sm:pr-12 text-[#4b5563] leading-relaxed text-[15px] sm:text-[17px] max-w-2xl">
                      {item.a}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

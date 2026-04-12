import { Sparkles, MapPin, CalendarDays, Hotel, Star, DollarSign } from "lucide-react";

/* 
  Animated auto-scrolling plan demo in a phone frame.
  Uses a tall inner container with a CSS translateY animation looping.
*/

function StatPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full border border-[#0D9488]/20 text-[#0D9488] bg-[#0D9488]/5">
      {children}
    </span>
  );
}

function ActivityCard({ name, time, cost, rating, img, blur }: { name: string; time: string; cost: string; rating?: string; img?: string; blur?: boolean }) {
  return (
    <div className={`bg-white rounded-xl border border-[#e8e8e8] p-2.5 shadow-sm ${blur ? "opacity-30 blur-[2px]" : ""}`}>
      <div className="flex gap-2.5">
        {img ? (
          <img src={img} alt={name} className="w-11 h-11 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-11 h-11 rounded-lg bg-[#0D9488]/10 shrink-0 flex items-center justify-center">
            <MapPin className="h-3.5 w-3.5 text-[#0D9488]" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-[#1a1a1a] truncate">{name}</p>
          <div className="flex items-center gap-1.5 text-[9px] text-[#9ca3af] mt-0.5">
            <span>{time}</span>
            <span>·</span>
            <span className="text-[#0D9488] font-medium">{cost}</span>
            {rating && (
              <>
                <span>·</span>
                <span className="flex items-center gap-0.5"><Star className="h-2 w-2 fill-amber-400 text-amber-400" />{rating}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const PLAN_CONTENT = [
  {
    dest: "Ubud",
    hotel: "Bisma Eight · $85/night",
    days: [
      {
        num: 1, theme: "Temples & Terraces",
        acts: [
          { name: "Tegallalang Rice Terraces", time: "9:00 AM", cost: "$5", rating: "4.7", img: "https://images.unsplash.com/photo-1558862107-d49ef2a04d72?w=200&q=80&auto=format&fit=crop" },
          { name: "Tirta Empul Temple", time: "12:00 PM", cost: "$3", rating: "4.6" },
          { name: "Ubud Monkey Forest", time: "3:00 PM", cost: "$7", rating: "4.5" },
          { name: "Locavore dinner", time: "7:00 PM", cost: "$45", rating: "4.8" },
        ],
      },
      {
        num: 2, theme: "Sunrise & Coffee",
        acts: [
          { name: "Mount Batur Sunrise Trek", time: "4:00 AM", cost: "$45", rating: "4.8", img: "https://images.unsplash.com/photo-1604999333679-b86d54738315?w=200&q=80&auto=format&fit=crop" },
          { name: "Luwak Coffee Plantation", time: "10:00 AM", cost: "$12", rating: "4.3" },
          { name: "Campuhan Ridge Walk", time: "4:00 PM", cost: "Free", rating: "4.5" },
        ],
      },
    ],
  },
  {
    dest: "Canggu",
    hotel: "The Slow · $120/night",
    days: [
      {
        num: 3, theme: "Surf & Sunset",
        acts: [
          { name: "Echo Beach Surf Lesson", time: "8:00 AM", cost: "$30", rating: "4.6" },
          { name: "La Brisa Beach Club", time: "4:00 PM", cost: "$25", rating: "4.7" },
          { name: "Batu Bolong night market", time: "8:00 PM", cost: "$10", rating: "4.4" },
        ],
      },
      {
        num: 4, theme: "Explore & Relax",
        acts: [
          { name: "Tanah Lot Temple", time: "9:00 AM", cost: "$8", rating: "4.5" },
          { name: "COMO Beach Club", time: "2:00 PM", cost: "$35", rating: "4.6" },
        ],
      },
    ],
  },
  {
    dest: "Nusa Penida",
    hotel: "Penida Colada · $65/night",
    days: [
      {
        num: 5, theme: "Island Paradise",
        acts: [
          { name: "Kelingking Beach", time: "8:00 AM", cost: "Free", rating: "4.9" },
          { name: "Angel's Billabong", time: "11:00 AM", cost: "Free", rating: "4.7" },
          { name: "Crystal Bay Snorkeling", time: "2:00 PM", cost: "$20", rating: "4.8" },
        ],
      },
    ],
  },
];

export function PlanPreviewMockup({ onCTA }: { onCTA: () => void }) {
  return (
    <div className="mx-auto max-w-lg">
      <p className="text-center text-sm font-medium text-[#9ca3af] mb-5">See what Junto AI generates</p>

      {/* Phone frame */}
      <div className="mx-auto max-w-[340px]">
        <div
          className="rounded-[2.5rem] border-[6px] border-[#1a1a1e] bg-[#fafaf9] overflow-hidden relative"
          style={{ boxShadow: "0 25px 60px -12px rgba(0,0,0,0.3)" }}
        >
          {/* Status bar */}
          <div className="bg-white px-5 pt-3 pb-2 flex items-center justify-between sticky top-0 z-10">
            <span className="text-[11px] font-semibold text-[#1a1a1a]">9:41</span>
            <div className="w-20 h-5 bg-black rounded-full" />
            <div className="flex gap-1">
              <div className="w-4 h-2 rounded-sm bg-[#1a1a1a]" />
            </div>
          </div>

          {/* App header */}
          <div className="bg-white px-4 pb-3 border-b border-[#e5e5e5] sticky top-[34px] z-10">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-[#0D9488]" />
              <span className="font-bold text-[14px] text-[#1a1a1a]">Bali Adventure</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <StatPill><CalendarDays className="h-2.5 w-2.5" />7 days</StatPill>
              <StatPill><MapPin className="h-2.5 w-2.5" />3 cities</StatPill>
              <StatPill><Sparkles className="h-2.5 w-2.5" />14 activities</StatPill>
              <StatPill><DollarSign className="h-2.5 w-2.5" />~$1,200</StatPill>
            </div>
          </div>

          {/* Scrolling content */}
          <div className="h-[420px] overflow-hidden relative">
            <div className="plan-auto-scroll">
              <div className="px-4 py-3 space-y-4">
                {PLAN_CONTENT.map((section, si) => (
                  <div key={si}>
                    {/* Destination header */}
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="h-3.5 w-3.5 text-[#0D9488]" />
                      <span className="text-[13px] font-bold text-[#1a1a1a]">{section.dest}</span>
                    </div>
                    {/* Hotel */}
                    <div className={`flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-lg bg-[#0D9488]/5 border border-[#0D9488]/10 ${si >= 2 ? "opacity-30 blur-[2px]" : ""}`}>
                      <Hotel className="h-3 w-3 text-[#0D9488]" />
                      <span className="text-[10px] text-[#0D9488] font-medium">{section.hotel}</span>
                    </div>

                    {section.days.map((day) => (
                      <div key={day.num} className="mb-3">
                        <div className={`flex items-center gap-2 mb-2 ${day.num >= 4 ? "opacity-30 blur-[2px]" : ""}`}>
                          <div className="w-5 h-5 rounded-full bg-[#0D9488] flex items-center justify-center">
                            <span className="text-[8px] font-bold text-white">{day.num}</span>
                          </div>
                          <span className="text-[11px] font-semibold text-[#1a1a1a]">Day {day.num}</span>
                          <span className="text-[10px] text-[#9ca3af]">· {day.theme}</span>
                        </div>
                        <div className="ml-2.5 border-l-2 border-[#0D9488]/15 pl-3 space-y-2">
                          {day.acts.map((a, ai) => (
                            <ActivityCard key={ai} {...a} blur={day.num >= 4} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

                {/* Budget section (blurred) */}
                <div className="opacity-30 blur-[2px] bg-white rounded-xl border border-[#e8e8e8] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-3.5 w-3.5 text-[#0D9488]" />
                    <span className="text-[11px] font-bold text-[#1a1a1a]">Budget breakdown</span>
                  </div>
                  <div className="space-y-1">
                    {["Accommodation $550", "Activities $200", "Food $300", "Transport $150"].map(l => (
                      <div key={l} className="h-2 w-full rounded bg-[#f3f4f6]" />
                    ))}
                  </div>
                </div>

                {/* Spacer for scroll loop */}
                <div className="h-20" />
              </div>
            </div>

            {/* Fade overlay at bottom */}
            <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-[#fafaf9] via-[#fafaf9]/80 to-transparent z-10 pointer-events-none" />
          </div>

          {/* CTA inside phone */}
          <div className="px-4 pb-4 bg-[#fafaf9] relative z-20">
            <button
              onClick={onCTA}
              className="w-full flex items-center justify-center gap-2 text-white font-semibold rounded-xl py-2.5 text-[13px]"
              style={{ background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)" }}
            >
              Sign up free to unlock full plan
            </button>
          </div>
        </div>
      </div>

      <p className="mt-5 text-center text-sm text-[#6b7280] leading-relaxed max-w-md mx-auto">
        Share this plan with your group → they vote, react, and customize it together.
      </p>
    </div>
  );
}

import { Sparkles, MapPin, CalendarDays, Hotel, Star } from "lucide-react";

const DAYS = [
  {
    label: "Day 1",
    location: "Ubud",
    activities: [
      { name: "Tegallalang Rice Terraces", time: "9:00 AM", cost: "$5", rating: "4.7", img: "https://images.unsplash.com/photo-1558862107-d49ef2a04d72?w=200&q=80&auto=format&fit=crop" },
      { name: "Tirta Empul Temple", time: "1:00 PM", cost: "$3", rating: "4.6", img: "https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=200&q=80&auto=format&fit=crop" },
      { name: "Ubud Monkey Forest", time: "4:00 PM", cost: "$7", rating: "4.5", img: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=200&q=80&auto=format&fit=crop" },
    ],
  },
  {
    label: "Day 2",
    location: "Ubud",
    activities: [
      { name: "Mount Batur Sunrise Trek", time: "4:00 AM", cost: "$45", rating: "4.8", img: "https://images.unsplash.com/photo-1604999333679-b86d54738315?w=200&q=80&auto=format&fit=crop" },
      { name: "Luwak Coffee Plantation", time: "10:00 AM", cost: "$12", rating: "4.3", img: "https://images.unsplash.com/photo-1511920170033-f8396924c348?w=200&q=80&auto=format&fit=crop" },
    ],
  },
  {
    label: "Day 3",
    location: "Canggu",
    activities: [
      { name: "Echo Beach Surf Lesson", time: "8:00 AM", cost: "$30", rating: "4.6" },
      { name: "La Brisa Sunset", time: "5:00 PM", cost: "$25", rating: "4.7" },
    ],
  },
  {
    label: "Day 4-7",
    location: "Nusa Penida",
    activities: [
      { name: "Kelingking Beach", time: "9:00 AM", cost: "Free", rating: "4.9" },
      { name: "Snorkeling at Crystal Bay", time: "1:00 PM", cost: "$20", rating: "4.7" },
    ],
  },
];

function ActivityRow({ a, blurred }: { a: typeof DAYS[0]["activities"][0]; blurred?: boolean }) {
  return (
    <div className={`flex items-center gap-3 py-2 ${blurred ? "opacity-30 blur-[2px]" : ""}`}>
      {a.img ? (
        <img src={a.img} alt={a.name} className="w-10 h-10 rounded-lg object-cover shrink-0" loading="lazy" />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-[#0D9488]/10 shrink-0 flex items-center justify-center">
          <MapPin className="h-4 w-4 text-[#0D9488]" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[#1a1a1a] truncate">{a.name}</p>
        <div className="flex items-center gap-2 text-[11px] text-[#9ca3af]">
          <span>{a.time}</span>
          <span>·</span>
          <span>{a.cost}</span>
          {a.rating && (
            <>
              <span>·</span>
              <span className="flex items-center gap-0.5"><Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />{a.rating}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function PlanPreviewMockup({ onCTA }: { onCTA: () => void }) {
  return (
    <div className="mx-auto max-w-lg">
      <p className="text-center text-sm font-medium text-[#9ca3af] mb-5">See what Junto AI generates</p>

      {/* Phone frame */}
      <div className="mx-auto max-w-[340px]">
        <div className="rounded-[2rem] border-[5px] border-[#2a2a2e] bg-[#fafaf9] shadow-2xl shadow-black/20 overflow-hidden">
          {/* Status bar */}
          <div className="bg-white px-5 pt-3 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#1a1a1a]">9:41</span>
            <div className="w-20 h-5 bg-black rounded-full" />
            <div className="flex gap-1">
              <div className="w-4 h-2 rounded-sm bg-[#1a1a1a]" />
            </div>
          </div>

          {/* App header */}
          <div className="bg-white px-4 pb-3 border-b border-[#e5e5e5]">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-[#0D9488]" />
              <span className="font-bold text-[15px] text-[#1a1a1a]">Bali Adventure</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {["7 days", "3 cities", "14 activities", "~$1,200"].map((s) => (
                <span key={s} className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-[#0D9488]/20 text-[#0D9488] bg-[#0D9488]/5">
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Timeline content */}
          <div className="px-4 py-3 space-y-4 max-h-[420px] overflow-hidden relative">
            {DAYS.map((day, di) => {
              const blurred = di >= 2;
              return (
                <div key={di} className={blurred ? "" : ""}>
                  <div className={`flex items-center gap-2 mb-1.5 ${blurred ? "opacity-30 blur-[2px]" : ""}`}>
                    <CalendarDays className="h-3.5 w-3.5 text-[#0D9488]" />
                    <span className="text-[12px] font-bold text-[#0D9488]">{day.label}</span>
                    <span className="text-[11px] text-[#9ca3af]">· {day.location}</span>
                  </div>
                  <div className="ml-1 border-l-2 border-[#0D9488]/20 pl-3">
                    {day.activities.map((a, ai) => (
                      <ActivityRow key={ai} a={a} blurred={blurred} />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Fade overlay */}
            <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-[#fafaf9] to-transparent" />
          </div>

          {/* CTA inside phone */}
          <div className="px-4 pb-4 bg-[#fafaf9] relative z-10">
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

      {/* Group callout */}
      <p className="mt-5 text-center text-sm text-[#6b7280] leading-relaxed max-w-md mx-auto">
        Share this plan with your group → they vote, react, and customize it together. No more 47-message WhatsApp threads.
      </p>
    </div>
  );
}

import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Sparkles, MapPin, CalendarDays, Star, Clock, DollarSign, Hotel } from "lucide-react";
import { getTemplatePlan } from "@/components/landing/samplePlanData";
import { useAuth } from "@/contexts/AuthContext";

export default function TemplateDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const plan = getTemplatePlan(slug || "");

  if (!plan) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#6b7280] mb-4">Template not found</p>
          <Link to="/templates" className="text-[#0D9488] font-medium hover:underline">Browse all templates</Link>
        </div>
      </div>
    );
  }

  const r = plan.result;
  const allActivities = r.destinations.flatMap(d => d.days.flatMap(day => day.activities));

  const handleMakeTrip = () => {
    if (user) {
      // TODO: Copy template into user's trips
      navigate("/app/trips/new");
    } else {
      navigate("/ref");
    }
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-[#e5e5e5] px-5 py-3">
        <div className="max-w-[800px] mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-[#6b7280] hover:text-[#1a1a1a]">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold text-[#1a1a1a] truncate">{r.trip_name}</h1>
          </div>
        </div>
      </div>

      {/* Hero */}
      {plan.heroImg && (
        <div className="relative h-[200px] sm:h-[280px]">
          <img src={plan.heroImg} alt={plan.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-4 left-5 right-5 max-w-[800px] mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">{r.trip_name}</h2>
            <p className="text-white/70 text-sm mt-1">{r.summary}</p>
          </div>
        </div>
      )}

      <div className="max-w-[800px] mx-auto px-5 py-6">
        {/* Stat pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { icon: CalendarDays, label: plan.duration },
            { icon: MapPin, label: `${r.destinations.length} ${r.destinations.length === 1 ? "city" : "cities"}` },
            { icon: Sparkles, label: `${allActivities.length} activities` },
            { icon: DollarSign, label: r.estimated_budget.total },
          ].map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-[#0D9488]/20 text-[#0D9488] bg-[#0D9488]/5">
              <s.icon className="h-3.5 w-3.5" />{s.label}
            </span>
          ))}
        </div>

        {/* Destinations & Days */}
        {r.destinations.map((dest, di) => (
          <div key={di} className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="h-4 w-4 text-[#0D9488]" />
              <h3 className="text-lg font-bold text-[#1a1a1a]">{dest.name}</h3>
            </div>

            {dest.accommodation && (
              <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-white border border-[#e5e5e5]">
                <Hotel className="h-4 w-4 text-[#0D9488]" />
                <div>
                  <span className="text-sm font-medium text-[#1a1a1a]">{dest.accommodation.name}</span>
                  <span className="text-xs text-[#9ca3af] ml-2">{dest.accommodation.area} · {dest.accommodation.price_per_night}/night</span>
                </div>
              </div>
            )}

            {dest.days.map((day) => (
              <div key={day.day_number} className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-[#0D9488] flex items-center justify-center">
                    <span className="text-[11px] font-bold text-white">{day.day_number}</span>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-[#1a1a1a]">{day.date_label}</span>
                    <span className="text-xs text-[#9ca3af] ml-2">{day.theme}</span>
                  </div>
                </div>

                <div className="ml-3.5 border-l-2 border-[#0D9488]/20 pl-5 space-y-3">
                  {day.activities.map((act, ai) => (
                    <div key={ai} className="bg-white rounded-xl border border-[#e5e5e5] p-3 shadow-sm">
                      <div className="flex gap-3">
                        {act.photo_url && (
                          <img src={act.photo_url} alt={act.name} className="w-16 h-16 rounded-lg object-cover shrink-0" loading="lazy" />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-[#1a1a1a]">{act.name}</h4>
                          <p className="text-xs text-[#6b7280] mt-0.5">{act.description}</p>
                          <div className="flex items-center gap-3 mt-2 text-[11px] text-[#9ca3af]">
                            <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{act.time}</span>
                            <span>{act.duration}</span>
                            <span className="text-[#0D9488] font-medium">{act.cost_estimate}</span>
                            {act.rating && (
                              <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{act.rating}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Budget */}
        {Object.keys(r.estimated_budget.breakdown).length > 0 && (
          <div className="bg-white rounded-xl border border-[#e5e5e5] p-4 mb-6">
            <h3 className="text-sm font-bold text-[#1a1a1a] mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-[#0D9488]" />
              Estimated budget
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(r.estimated_budget.breakdown).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-[#6b7280] capitalize">{k}</span>
                  <span className="font-medium text-[#1a1a1a]">{v}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-[#e5e5e5] mt-3 pt-3 flex justify-between text-sm font-bold">
              <span className="text-[#1a1a1a]">Total</span>
              <span className="text-[#0D9488]">{r.estimated_budget.total}</span>
            </div>
          </div>
        )}

        {r.destinations.length === 0 && (
          <div className="text-center py-16">
            <Sparkles className="h-8 w-8 text-[#0D9488] mx-auto mb-3" />
            <p className="text-[#6b7280]">Full itinerary coming soon</p>
            <p className="text-sm text-[#9ca3af] mt-1">Use the AI planner to generate your own custom version</p>
          </div>
        )}
      </div>

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/90 backdrop-blur-md border-t border-[#e5e5e5] px-5 py-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
        <div className="max-w-[800px] mx-auto">
          <button
            onClick={handleMakeTrip}
            className="w-full flex items-center justify-center gap-2 text-white font-semibold rounded-xl py-3.5 text-[15px] transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)", boxShadow: "0 4px 20px rgba(13,148,136,0.35)" }}
          >
            <Sparkles className="h-4 w-4" />
            Make this my trip
          </button>
        </div>
      </div>
    </div>
  );
}

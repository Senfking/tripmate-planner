import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

export interface TripCard {
  name: string;
  slug: string;
  duration: string;
  vibe: string;
  img: string;
}

interface CarouselSection {
  title: string;
  cards: TripCard[];
}

const ALL_CARDS: TripCard[] = [
  { name: "Bali", slug: "bali-7-days", duration: "7 days", vibe: "Culture + beaches", img: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&q=80&auto=format&fit=crop" },
  { name: "Japan", slug: "japan-10-days", duration: "10 days", vibe: "Tokyo to Kyoto", img: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&q=80&auto=format&fit=crop" },
  { name: "Thailand", slug: "thailand-8-days", duration: "8 days", vibe: "Bangkok + islands", img: "https://images.unsplash.com/photo-1528181304800-259b08848526?w=800&q=80&auto=format&fit=crop" },
  { name: "Greece", slug: "greece-5-days", duration: "5 days", vibe: "Island hopping", img: "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&q=80&auto=format&fit=crop" },
  { name: "Italy", slug: "italy-10-days", duration: "10 days", vibe: "Rome to Amalfi", img: "https://images.unsplash.com/photo-1515859005217-8a1f08870f59?w=800&q=80&auto=format&fit=crop" },
  { name: "Portugal", slug: "portugal-7-days", duration: "7 days", vibe: "Lisbon + Porto", img: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800&q=80&auto=format&fit=crop" },
  { name: "Spain", slug: "spain-8-days", duration: "8 days", vibe: "Barcelona to Seville", img: "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800&q=80&auto=format&fit=crop" },
  { name: "Croatia", slug: "croatia-7-days", duration: "7 days", vibe: "Coast + islands", img: "https://images.unsplash.com/photo-1555990793-da11153b2473?w=800&q=80&auto=format&fit=crop" },
  { name: "Colombia", slug: "colombia-9-days", duration: "9 days", vibe: "Cartagena to Medellín", img: "https://images.unsplash.com/photo-1518638150340-f706e86654de?w=800&q=80&auto=format&fit=crop" },
  { name: "Morocco", slug: "morocco-6-days", duration: "6 days", vibe: "Marrakech + desert", img: "https://images.unsplash.com/photo-1489749798305-4fea3ae63d43?w=800&q=80&auto=format&fit=crop" },
  { name: "Peru", slug: "peru-10-days", duration: "10 days", vibe: "Lima to Machu Picchu", img: "https://images.unsplash.com/photo-1526392060635-9d6019884377?w=800&q=80&auto=format&fit=crop" },
  { name: "Costa Rica", slug: "costa-rica-7-days", duration: "7 days", vibe: "Rainforest + surf", img: "https://images.unsplash.com/photo-1519999482648-25049ddd37b1?w=800&q=80&auto=format&fit=crop" },
  { name: "Maldives", slug: "maldives-5-days", duration: "5 days", vibe: "Overwater luxury", img: "https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=800&q=80&auto=format&fit=crop" },
  { name: "Tulum", slug: "tulum-5-days", duration: "5 days", vibe: "Boho + cenotes", img: "https://images.unsplash.com/photo-1682686581580-d99b0230064e?w=800&q=80&auto=format&fit=crop" },
  { name: "Zanzibar", slug: "zanzibar-6-days", duration: "6 days", vibe: "Spice island vibes", img: "https://images.unsplash.com/photo-1609198092458-38a293c7ac4b?w=800&q=80&auto=format&fit=crop" },
  { name: "Phuket", slug: "phuket-5-days", duration: "5 days", vibe: "Thai beach paradise", img: "https://images.unsplash.com/photo-1589394815804-964ed0be2eb5?w=800&q=80&auto=format&fit=crop" },
];

// Keep SECTIONS export for Templates page filters
const SECTIONS: CarouselSection[] = [
  { title: "Trending destinations", cards: ALL_CARDS.slice(0, 4) },
  { title: "Europe classics", cards: ALL_CARDS.slice(4, 8) },
  { title: "Adventure trips", cards: ALL_CARDS.slice(8, 12) },
  { title: "Beach getaways", cards: ALL_CARDS.slice(12, 16) },
];

export function TripCarousels() {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const updateArrows = () => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    return () => el.removeEventListener("scroll", updateArrows);
  }, []);

  const scroll = (dir: number) => {
    ref.current?.scrollBy({ left: dir * 340, behavior: "smooth" });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 px-5 sm:px-10 max-w-[1280px]">
        <h2 className="text-2xl sm:text-3xl font-bold text-[#1a1a1a]">Explore trip plans</h2>
        <Link to="/templates" className="text-sm font-medium text-[#0D9488] hover:underline">See all</Link>
      </div>

      <div className="relative group">
        {canLeft && (
          <button
            onClick={() => scroll(-1)}
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/95 shadow-xl items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="h-5 w-5 text-[#1a1a1a]" />
          </button>
        )}
        {canRight && (
          <button
            onClick={() => scroll(1)}
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/95 shadow-xl items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="h-5 w-5 text-[#1a1a1a]" />
          </button>
        )}

        <div
          ref={ref}
          className="flex gap-5 overflow-x-auto scrollbar-hide snap-x snap-mandatory"
          style={{ paddingLeft: 40, paddingRight: 0 }}
        >
          {ALL_CARDS.map((c) => (
            <Link
              key={c.slug}
              to={`/templates/${c.slug}`}
              className="snap-start shrink-0 w-[280px] sm:w-[320px] group/card"
            >
              <div className="rounded-[20px] overflow-hidden bg-white shadow-md hover:shadow-2xl transition-shadow duration-300">
                <div className="relative h-[320px] sm:h-[360px] overflow-hidden">
                  <img
                    src={c.img}
                    alt={c.name}
                    className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-700"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                  <h4 className="absolute bottom-4 left-4 text-white font-bold text-2xl drop-shadow-lg">{c.name}</h4>
                </div>
                <div className="px-4 py-3.5">
                  <p className="text-[13px] text-[#6b7280]">{c.duration} · {c.vibe}</p>
                  <div className="flex items-center gap-1 mt-1.5">
                    <Sparkles className="h-3 w-3 text-[#0D9488]" />
                    <span className="text-[11px] font-medium text-[#0D9488]">Junto AI plan</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          <div className="shrink-0 w-5 sm:w-10" />
        </div>
      </div>
    </div>
  );
}

export { SECTIONS, ALL_CARDS };

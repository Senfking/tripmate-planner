import { useRef, useState, useEffect, useCallback } from "react";
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

const TRENDING: TripCard[] = [
  { name: "Bali", slug: "bali-7-days", duration: "7 days", vibe: "Culture + beaches", img: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&q=80&auto=format&fit=crop" },
  { name: "Japan", slug: "japan-10-days", duration: "10 days", vibe: "Tokyo to Kyoto", img: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&q=80&auto=format&fit=crop" },
  { name: "Thailand", slug: "thailand-8-days", duration: "8 days", vibe: "Bangkok + islands", img: "https://images.unsplash.com/photo-1528181304800-259b08848526?w=800&q=80&auto=format&fit=crop" },
  { name: "Greece", slug: "greece-5-days", duration: "5 days", vibe: "Island hopping", img: "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&q=80&auto=format&fit=crop" },
  { name: "Mexico", slug: "mexico-7-days", duration: "7 days", vibe: "Ruins + cenotes", img: "https://images.unsplash.com/photo-1518638150340-f706e86654de?w=800&q=80&auto=format&fit=crop" },
  { name: "Vietnam", slug: "vietnam-10-days", duration: "10 days", vibe: "Hanoi to Ho Chi Minh", img: "https://images.unsplash.com/photo-1557750255-c76072a7aee1?w=800&q=80&auto=format&fit=crop" },
  { name: "Turkey", slug: "turkey-8-days", duration: "8 days", vibe: "Istanbul + Cappadocia", img: "https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?w=800&q=80&auto=format&fit=crop" },
  { name: "Egypt", slug: "egypt-7-days", duration: "7 days", vibe: "Pyramids + Nile", img: "https://images.unsplash.com/photo-1539768942893-daf53e736b68?w=800&q=80&auto=format&fit=crop" },
];

const EUROPE: TripCard[] = [
  { name: "Italy", slug: "italy-10-days", duration: "10 days", vibe: "Rome to Amalfi", img: "https://images.unsplash.com/photo-1515859005217-8a1f08870f59?w=800&q=80&auto=format&fit=crop" },
  { name: "Portugal", slug: "portugal-7-days", duration: "7 days", vibe: "Lisbon + Porto", img: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800&q=80&auto=format&fit=crop" },
  { name: "Spain", slug: "spain-8-days", duration: "8 days", vibe: "Barcelona to Seville", img: "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800&q=80&auto=format&fit=crop" },
  { name: "Croatia", slug: "croatia-7-days", duration: "7 days", vibe: "Coast + islands", img: "https://images.unsplash.com/photo-1555990793-da11153b2473?w=800&q=80&auto=format&fit=crop" },
  { name: "France", slug: "france-8-days", duration: "8 days", vibe: "Paris + Provence", img: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80&auto=format&fit=crop" },
  { name: "Switzerland", slug: "switzerland-6-days", duration: "6 days", vibe: "Alps + lakes", img: "https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?w=800&q=80&auto=format&fit=crop" },
  { name: "Netherlands", slug: "netherlands-5-days", duration: "5 days", vibe: "Amsterdam + beyond", img: "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800&q=80&auto=format&fit=crop" },
  { name: "Czech Republic", slug: "czech-5-days", duration: "5 days", vibe: "Prague + Český Krumlov", img: "https://images.unsplash.com/photo-1519677100203-a0e668c92439?w=800&q=80&auto=format&fit=crop" },
];

const ADVENTURE: TripCard[] = [
  { name: "Colombia", slug: "colombia-9-days", duration: "9 days", vibe: "Cartagena to Medellín", img: "https://images.unsplash.com/photo-1526392060635-9d6019884377?w=800&q=80&auto=format&fit=crop" },
  { name: "Morocco", slug: "morocco-6-days", duration: "6 days", vibe: "Marrakech + desert", img: "https://images.unsplash.com/photo-1489749798305-4fea3ae63d43?w=800&q=80&auto=format&fit=crop" },
  { name: "Peru", slug: "peru-10-days", duration: "10 days", vibe: "Lima to Machu Picchu", img: "https://images.unsplash.com/photo-1526392060635-9d6019884377?w=800&q=80&auto=format&fit=crop" },
  { name: "Costa Rica", slug: "costa-rica-7-days", duration: "7 days", vibe: "Rainforest + surf", img: "https://images.unsplash.com/photo-1519046904884-53103b34b206?w=800&q=80&auto=format&fit=crop" },
  { name: "Nepal", slug: "nepal-12-days", duration: "12 days", vibe: "Himalaya trekking", img: "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&q=80&auto=format&fit=crop" },
  { name: "Jordan", slug: "jordan-6-days", duration: "6 days", vibe: "Petra + Wadi Rum", img: "https://images.unsplash.com/photo-1579606032821-4e6161c81571?w=800&q=80&auto=format&fit=crop" },
  { name: "South Africa", slug: "south-africa-10-days", duration: "10 days", vibe: "Safari + Cape Town", img: "https://images.unsplash.com/photo-1516426122078-c23e76319801?w=800&q=80&auto=format&fit=crop" },
  { name: "Iceland", slug: "iceland-7-days", duration: "7 days", vibe: "Ring Road adventure", img: "https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800&q=80&auto=format&fit=crop" },
];

const BEACH: TripCard[] = [
  { name: "Maldives", slug: "maldives-5-days", duration: "5 days", vibe: "Overwater luxury", img: "https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=800&q=80&auto=format&fit=crop" },
  { name: "Tulum", slug: "tulum-5-days", duration: "5 days", vibe: "Boho + cenotes", img: "https://images.unsplash.com/photo-1682686581580-d99b0230064e?w=800&q=80&auto=format&fit=crop" },
  { name: "Zanzibar", slug: "zanzibar-6-days", duration: "6 days", vibe: "Spice island vibes", img: "https://images.unsplash.com/photo-1609198092458-38a293c7ac4b?w=800&q=80&auto=format&fit=crop" },
  { name: "Phuket", slug: "phuket-5-days", duration: "5 days", vibe: "Thai beach paradise", img: "https://images.unsplash.com/photo-1589394815804-964ed0be2eb5?w=800&q=80&auto=format&fit=crop" },
  { name: "Fiji", slug: "fiji-7-days", duration: "7 days", vibe: "Island paradise", img: "https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=800&q=80&auto=format&fit=crop" },
  { name: "Seychelles", slug: "seychelles-6-days", duration: "6 days", vibe: "Pristine beaches", img: "https://images.unsplash.com/photo-1589979481223-deb893043163?w=800&q=80&auto=format&fit=crop" },
  { name: "Sardinia", slug: "sardinia-7-days", duration: "7 days", vibe: "Mediterranean charm", img: "https://images.unsplash.com/photo-1586500036744-3a tried-dcf8c191b7?w=800&q=80&auto=format&fit=crop" },
  { name: "Bora Bora", slug: "bora-bora-5-days", duration: "5 days", vibe: "Ultimate luxury", img: "https://images.unsplash.com/photo-1589197331516-4d84b72ebde3?w=800&q=80&auto=format&fit=crop" },
];

const SECTIONS: CarouselSection[] = [
  { title: "Trending destinations", cards: TRENDING },
  { title: "Europe classics", cards: EUROPE },
  { title: "Adventure trips", cards: ADVENTURE },
  { title: "Beach getaways", cards: BEACH },
];

const ALL_CARDS = [...TRENDING, ...EUROPE, ...ADVENTURE, ...BEACH];

/* ── Reusable carousel row ── */
function CarouselRow({ title, cards, seeAll }: { title: string; cards: TripCard[]; seeAll?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const updateArrows = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows]);

  const scroll = (dir: number) => {
    ref.current?.scrollBy({ left: dir * 340, behavior: "smooth" });
  };

  return (
    <div className="mb-12">
      <div className="flex items-center justify-between mb-5 px-5 sm:px-10 lg:px-16">
        <h3 className="text-xl sm:text-2xl font-bold text-[#1a1a1a]">{title}</h3>
        {seeAll && <Link to="/templates" className="text-sm font-medium text-[#0D9488] hover:underline">See all</Link>}
      </div>

      <div className="relative group">
        {canLeft && (
          <button
            onClick={() => scroll(-1)}
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg border border-[#e5e5e5] items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="h-5 w-5 text-[#1a1a1a]" />
          </button>
        )}
        {canRight && (
          <button
            onClick={() => scroll(1)}
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg border border-[#e5e5e5] items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="h-5 w-5 text-[#1a1a1a]" />
          </button>
        )}

        <div ref={ref} className="flex gap-4 overflow-x-auto scrollbar-hide px-5 sm:px-10 lg:px-16">
          {cards.map((c) => (
            <Link
              key={c.slug}
              to={`/templates/${c.slug}`}
              className="shrink-0 w-[260px] sm:w-[300px] group/card"
            >
              <div className="rounded-2xl overflow-hidden bg-white shadow-md hover:shadow-xl transition-shadow duration-300">
                <div className="relative h-[280px] sm:h-[320px] overflow-hidden">
                  <img
                    src={c.img}
                    alt={c.name}
                    className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-700"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                  <h4 className="absolute bottom-3 left-3 text-white font-bold text-xl drop-shadow-lg">{c.name}</h4>
                </div>
                <div className="px-3.5 py-3">
                  <p className="text-[12px] text-[#6b7280]">{c.duration} · {c.vibe}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Sparkles className="h-2.5 w-2.5 text-[#0D9488]" />
                    <span className="text-[10px] font-medium text-[#0D9488]">Junto AI plan</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TripCarousels() {
  return (
    <div>
      <div className="flex items-center justify-between mb-8 px-5 sm:px-10 lg:px-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-[#1a1a1a]">Explore trip plans</h2>
        <Link to="/templates" className="text-sm font-medium text-[#0D9488] hover:underline">See all</Link>
      </div>
      {SECTIONS.map((s) => (
        <CarouselRow key={s.title} title={s.title} cards={s.cards} />
      ))}
    </div>
  );
}

export { SECTIONS, ALL_CARDS };

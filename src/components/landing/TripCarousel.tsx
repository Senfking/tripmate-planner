import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { LandingCarouselNav, useLandingCarousel } from "@/components/landing/useLandingCarousel";

export interface TripCard {
  name: string;
  slug: string;
  duration: string;
  vibe: string;
  img: string;
  chips: string[];
}

interface CarouselSection {
  title: string;
  cards: TripCard[];
}

const TRENDING: TripCard[] = [
  { name: "Bali", slug: "bali-7-days", duration: "7 days", vibe: "Culture + beaches", chips: ["Beach", "Wellness", "Romantic"], img: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&q=80&auto=format&fit=crop" },
  { name: "Japan", slug: "japan-10-days", duration: "10 days", vibe: "Tokyo to Kyoto", chips: ["City", "Food", "Culture"], img: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&q=80&auto=format&fit=crop" },
  { name: "Thailand", slug: "thailand-8-days", duration: "8 days", vibe: "Bangkok + islands", chips: ["Beach", "Food", "Nightlife"], img: "https://images.unsplash.com/photo-1528181304800-259b08848526?w=800&q=80&auto=format&fit=crop" },
  { name: "Greece", slug: "greece-5-days", duration: "5 days", vibe: "Island hopping", chips: ["Beach", "History", "Romantic"], img: "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&q=80&auto=format&fit=crop" },
  { name: "Mexico", slug: "mexico-7-days", duration: "7 days", vibe: "Ruins + cenotes", chips: ["Culture", "Adventure", "Beach"], img: "https://images.unsplash.com/photo-1518638150340-f706e86654de?w=800&q=80&auto=format&fit=crop" },
  { name: "Vietnam", slug: "vietnam-10-days", duration: "10 days", vibe: "Hanoi to Ho Chi Minh", chips: ["Food", "Culture", "Budget"], img: "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&q=80&auto=format&fit=crop" },
  { name: "Turkey", slug: "turkey-8-days", duration: "8 days", vibe: "Istanbul + Cappadocia", chips: ["History", "Photo", "Culture"], img: "https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?w=800&q=80&auto=format&fit=crop" },
  { name: "Egypt", slug: "egypt-7-days", duration: "7 days", vibe: "Pyramids + Nile", chips: ["History", "Adventure", "Photo"], img: "https://images.unsplash.com/photo-1553913861-c0fddf2619ee?w=800&q=80&auto=format&fit=crop" },
];

const EUROPE: TripCard[] = [
  { name: "Italy", slug: "italy-10-days", duration: "10 days", vibe: "Rome to Amalfi", chips: ["Food", "History", "Romantic"], img: "https://images.unsplash.com/photo-1515859005217-8a1f08870f59?w=800&q=80&auto=format&fit=crop" },
  { name: "Portugal", slug: "portugal-7-days", duration: "7 days", vibe: "Lisbon + Porto", chips: ["City", "Food", "Coast"], img: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800&q=80&auto=format&fit=crop" },
  { name: "Spain", slug: "spain-8-days", duration: "8 days", vibe: "Barcelona to Seville", chips: ["City", "Food", "Culture"], img: "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800&q=80&auto=format&fit=crop" },
  { name: "Croatia", slug: "croatia-7-days", duration: "7 days", vibe: "Coast + islands", chips: ["Beach", "Sailing", "Nature"], img: "https://images.unsplash.com/photo-1555990793-da11153b2473?w=800&q=80&auto=format&fit=crop" },
  { name: "France", slug: "france-8-days", duration: "8 days", vibe: "Paris + Provence", chips: ["City", "Romantic", "Food"], img: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80&auto=format&fit=crop" },
  { name: "Switzerland", slug: "switzerland-6-days", duration: "6 days", vibe: "Alps + lakes", chips: ["Nature", "Adventure", "Photo"], img: "https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?w=800&q=80&auto=format&fit=crop" },
  { name: "Netherlands", slug: "netherlands-5-days", duration: "5 days", vibe: "Amsterdam + beyond", chips: ["City", "Culture", "Bike"], img: "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800&q=80&auto=format&fit=crop" },
  { name: "Czech Republic", slug: "czech-5-days", duration: "5 days", vibe: "Prague + Český Krumlov", chips: ["History", "City", "Budget"], img: "https://images.unsplash.com/photo-1519677100203-a0e668c92439?w=800&q=80&auto=format&fit=crop" },
];

const ADVENTURE: TripCard[] = [
  { name: "Colombia", slug: "colombia-9-days", duration: "9 days", vibe: "Cartagena to Medellín", chips: ["Adventure", "Culture", "Food"], img: "https://images.unsplash.com/photo-1526392060635-9d6019884377?w=800&q=80&auto=format&fit=crop" },
  { name: "Morocco", slug: "morocco-6-days", duration: "6 days", vibe: "Marrakech + desert", chips: ["Culture", "Adventure", "Photo"], img: "https://images.unsplash.com/photo-1489749798305-4fea3ae63d43?w=800&q=80&auto=format&fit=crop" },
  { name: "Peru", slug: "peru-10-days", duration: "10 days", vibe: "Lima to Machu Picchu", chips: ["Adventure", "History", "Hiking"], img: "https://images.unsplash.com/photo-1526392060635-9d6019884377?w=800&q=80&auto=format&fit=crop" },
  { name: "Costa Rica", slug: "costa-rica-7-days", duration: "7 days", vibe: "Rainforest + surf", chips: ["Nature", "Adventure", "Beach"], img: "https://images.unsplash.com/photo-1519046904884-53103b34b206?w=800&q=80&auto=format&fit=crop" },
  { name: "Nepal", slug: "nepal-12-days", duration: "12 days", vibe: "Himalaya trekking", chips: ["Hiking", "Adventure", "Nature"], img: "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&q=80&auto=format&fit=crop" },
  { name: "Jordan", slug: "jordan-6-days", duration: "6 days", vibe: "Petra + Wadi Rum", chips: ["History", "Desert", "Photo"], img: "https://upload.wikimedia.org/wikipedia/commons/5/56/Mountain_in_Wadi_Rum%2C_Jordan.jpg" },
  { name: "South Africa", slug: "south-africa-10-days", duration: "10 days", vibe: "Safari + Cape Town", chips: ["Wildlife", "Adventure", "Nature"], img: "https://images.unsplash.com/photo-1516426122078-c23e76319801?w=800&q=80&auto=format&fit=crop" },
  { name: "Iceland", slug: "iceland-7-days", duration: "7 days", vibe: "Ring Road adventure", chips: ["Nature", "Adventure", "Photo"], img: "https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800&q=80&auto=format&fit=crop" },
];

const BEACH: TripCard[] = [
  { name: "Maldives", slug: "maldives-5-days", duration: "5 days", vibe: "Overwater luxury", chips: ["Beach", "Luxury", "Romantic"], img: "https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=800&q=80&auto=format&fit=crop" },
  { name: "Tulum", slug: "tulum-5-days", duration: "5 days", vibe: "Boho + cenotes", chips: ["Beach", "Wellness", "Photo"], img: "https://images.unsplash.com/photo-1682686581580-d99b0230064e?w=800&q=80&auto=format&fit=crop" },
  { name: "Zanzibar", slug: "zanzibar-6-days", duration: "6 days", vibe: "Spice island vibes", chips: ["Beach", "Culture", "Food"], img: "https://images.unsplash.com/photo-1609198092458-38a293c7ac4b?w=800&q=80&auto=format&fit=crop" },
  { name: "Phuket", slug: "phuket-5-days", duration: "5 days", vibe: "Thai beach paradise", chips: ["Beach", "Nightlife", "Food"], img: "https://images.unsplash.com/photo-1589394815804-964ed0be2eb5?w=800&q=80&auto=format&fit=crop" },
  { name: "Fiji", slug: "fiji-7-days", duration: "7 days", vibe: "Island paradise", chips: ["Beach", "Snorkel", "Romantic"], img: "https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=800&q=80&auto=format&fit=crop" },
  { name: "Seychelles", slug: "seychelles-6-days", duration: "6 days", vibe: "Pristine beaches", chips: ["Beach", "Luxury", "Nature"], img: "https://images.unsplash.com/photo-1589979481223-deb893043163?w=800&q=80&auto=format&fit=crop" },
  { name: "Sardinia", slug: "sardinia-7-days", duration: "7 days", vibe: "Mediterranean charm", chips: ["Beach", "Food", "Coast"], img: "https://images.unsplash.com/photo-1580216643062-cf460548a66a?w=800&q=80&auto=format&fit=crop" },
  { name: "Bora Bora", slug: "bora-bora-5-days", duration: "5 days", vibe: "Ultimate luxury", chips: ["Beach", "Luxury", "Romantic"], img: "https://images.unsplash.com/photo-1589197331516-4d84b72ebde3?w=800&q=80&auto=format&fit=crop" },
];

const SECTIONS: CarouselSection[] = [
  { title: "Trending destinations", cards: TRENDING },
  { title: "Europe classics", cards: EUROPE },
  { title: "Adventure trips", cards: ADVENTURE },
  { title: "Beach getaways", cards: BEACH },
];

const ALL_CARDS = [...TRENDING, ...EUROPE, ...ADVENTURE, ...BEACH];

function CarouselRow({ title, cards, seeAll = false }: { title: string; cards: TripCard[]; seeAll?: boolean }) {
  const { containerRef, canLeft, canRight, isAtStart, scrollPrev, scrollNext } = useLandingCarousel();

  return (
    <div className="mb-12">
      <div className="mb-5 flex items-center justify-between px-5 sm:px-10 lg:px-16">
        <h3 className="text-xl font-bold text-foreground sm:text-2xl">{title}</h3>
        {seeAll ? <Link to="/templates" className="text-sm font-medium text-primary hover:underline">See all</Link> : null}
      </div>

      <div className="group/carousel relative">
        <LandingCarouselNav canLeft={canLeft} canRight={canRight} onPrev={scrollPrev} onNext={scrollNext} />

        <div
          ref={containerRef}
          className="scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth overscroll-x-contain pb-6 pl-5 sm:pl-10 lg:pl-16 scroll-pl-5 sm:scroll-pl-10 lg:scroll-pl-16"
        >
          {cards.map((card) => (
            <Link
              key={card.slug}
              to={`/templates/${card.slug}`}
              data-carousel-card="true"
              className="group/card w-[280px] shrink-0 snap-start sm:w-[320px]"
            >
              <div className="overflow-hidden rounded-[1.25rem] border border-border/40 bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08),0_8px_24px_-8px_rgba(0,0,0,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_-6px_rgba(0,0,0,0.12),0_12px_36px_-10px_rgba(0,0,0,0.1)]">
                <div className="relative aspect-[3/2] overflow-hidden">
                  <img
                    src={card.img}
                    alt={card.name}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover/card:scale-[1.03]"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                  <h4 className="absolute bottom-3 left-4 right-4 text-xl font-bold text-white drop-shadow-lg">
                    {card.name} · {card.duration}
                  </h4>
                </div>
                <div className="px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {card.chips.map((chip) => (
                      <span key={chip} className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-700">
                        {chip}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-primary" />
                    <span className="text-[11px] font-medium text-primary">Junto AI plan</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {/* Right spacer so last card has padding at initial position */}
          <div className="shrink-0 w-5 sm:w-10 lg:w-16" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

export function TripCarousels() {
  return (
    <div>
      <div className="mb-8 flex items-center justify-between px-5 sm:px-10 lg:px-16">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Explore trip plans</h2>
        <Link to="/templates" className="text-sm font-medium text-primary hover:underline">See all</Link>
      </div>

      {SECTIONS.map((section, index) => (
        <CarouselRow key={section.title} title={section.title} cards={section.cards} seeAll={index === 0} />
      ))}
    </div>
  );
}

export { SECTIONS, ALL_CARDS };

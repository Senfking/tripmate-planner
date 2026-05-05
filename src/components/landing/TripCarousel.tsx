import { Link } from "react-router-dom";
import { LandingCarouselNav, useLandingCarousel } from "@/components/landing/useLandingCarousel";
import { useTripTemplates, groupByCategory, type TripTemplate } from "@/hooks/useTripTemplates";
import { TemplateCard } from "@/components/templates/TemplateCard";

function CarouselRow({ title, cards, seeAll = false }: { title: string; cards: TripTemplate[]; seeAll?: boolean }) {
  const { containerRef, canLeft, canRight, scrollPrev, scrollNext } = useLandingCarousel();

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
            <TemplateCard key={card.slug} template={card} variant="carousel" />
          ))}
          <div className="shrink-0 w-5 sm:w-10 lg:w-16" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function CarouselSkeleton() {
  return (
    <div className="mb-12">
      <div className="mb-5 px-5 sm:px-10 lg:px-16">
        <div className="h-7 w-48 rounded bg-muted animate-pulse" />
      </div>
      <div className="flex gap-4 overflow-hidden pb-6 pl-5 sm:pl-10 lg:pl-16">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-[280px] shrink-0 sm:w-[320px] aspect-[3/4] rounded-[1.25rem] bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// Preferred ordering for the curated landing slice. Categories not in this
// list still appear (in source order) after these, but the `limit` prop
// caps how many sections actually render.
const CATEGORY_ORDER = [
  "Adventure trips",
  "Beach getaways",
  "City breaks",
  "Cultural journeys",
];

function orderSections(sections: { title: string; cards: TripTemplate[] }[]) {
  const map = new Map(sections.map((s) => [s.title, s]));
  const ordered: typeof sections = [];
  for (const name of CATEGORY_ORDER) {
    const s = map.get(name);
    if (s) {
      ordered.push(s);
      map.delete(name);
    }
  }
  return [...ordered, ...Array.from(map.values())];
}

export function TripCarousels({
  showHeader = true,
  limit,
  showSeeAllFooter = false,
}: {
  showHeader?: boolean;
  limit?: number;
  showSeeAllFooter?: boolean;
} = {}) {
  const { data, isLoading } = useTripTemplates();
  const allSections = data ? orderSections(groupByCategory(data)) : [];
  const sections = typeof limit === "number" ? allSections.slice(0, limit) : allSections;

  return (
    <div>
      {showHeader && (
        <div className="mb-8 flex items-center justify-between px-5 sm:px-10 lg:px-16">
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Explore trip plans</h2>
          <Link to="/templates" className="text-sm font-medium text-primary hover:underline">See all</Link>
        </div>
      )}

      {isLoading && (
        <>
          <CarouselSkeleton />
          <CarouselSkeleton />
        </>
      )}

      {sections.map((section) => (
        <CarouselRow key={section.title} title={section.title} cards={section.cards} seeAll />
      ))}

      {showSeeAllFooter && !isLoading && (
        <div className="mt-2 flex justify-center">
          <Link
            to="/templates"
            className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#0D9488] hover:text-[#064E4E] transition-colors"
          >
            See all trip ideas →
          </Link>
        </div>
      )}
    </div>
  );
}

import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { LandingCarouselNav, useLandingCarousel } from "@/components/landing/useLandingCarousel";
import { useTripTemplates, groupByCategory, type TripTemplate } from "@/hooks/useTripTemplates";

function durationLabel(days: number) {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

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
            <Link
              key={card.slug}
              to={`/templates/${card.slug}`}
              data-carousel-card="true"
              className="group/card w-[280px] shrink-0 snap-start sm:w-[320px]"
            >
              <div className="overflow-hidden rounded-[1.25rem] border border-border/40 bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08),0_8px_24px_-8px_rgba(0,0,0,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_-6px_rgba(0,0,0,0.12),0_12px_36px_-10px_rgba(0,0,0,0.1)]">
                <div className="relative aspect-[3/2] overflow-hidden">
                  <img
                    src={card.cover_image_url}
                    alt={card.destination}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover/card:scale-[1.03]"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                  <h4 className="absolute bottom-3 left-4 right-4 text-xl font-bold text-white drop-shadow-lg">
                    {card.destination} · {durationLabel(card.duration_days)}
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
          <div key={i} className="w-[280px] shrink-0 sm:w-[320px]">
            <div className="overflow-hidden rounded-[1.25rem] border border-border/40 bg-card">
              <div className="aspect-[3/2] bg-muted animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TripCarousels({ showHeader = true }: { showHeader?: boolean } = {}) {
  const { data, isLoading } = useTripTemplates();
  const sections = data ? groupByCategory(data) : [];

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
    </div>
  );
}

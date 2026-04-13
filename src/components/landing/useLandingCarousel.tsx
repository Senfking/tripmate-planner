import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function useLandingCarousel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateState = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    setCanLeft(el.scrollLeft > 6);
    setCanRight(maxScrollLeft > 6 && el.scrollLeft < maxScrollLeft - 6);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    updateState();

    let frame = 0;
    const handleScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateState);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => updateState())
      : null;

    resizeObserver?.observe(el);
    Array.from(el.children).forEach((child) => resizeObserver?.observe(child));
    window.addEventListener("resize", updateState);

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", handleScroll);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateState);
    };
  }, [updateState]);

  const scrollByCard = useCallback((direction: 1 | -1) => {
    const el = containerRef.current;
    if (!el) return;

    const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-carousel-card='true']"));
    if (!cards.length) return;

    const styles = window.getComputedStyle(el);
    const paddingStart = Number.parseFloat(styles.paddingLeft || "0") || 0;
    const anchor = el.scrollLeft + paddingStart;

    let target = 0;

    if (direction === 1) {
      const nextCard = cards.find((card) => card.offsetLeft > anchor + 8);
      target = nextCard ? Math.max(0, nextCard.offsetLeft - paddingStart) : el.scrollWidth - el.clientWidth;
    } else {
      const previousCards = cards.filter((card) => card.offsetLeft < anchor - 8);
      const previousCard = previousCards[previousCards.length - 1];
      target = previousCard ? Math.max(0, previousCard.offsetLeft - paddingStart) : 0;
    }

    el.scrollTo({ left: target, behavior: "smooth" });
    window.setTimeout(updateState, 450);
  }, [updateState]);

  return {
    containerRef,
    canLeft,
    canRight,
    isAtStart: !canLeft,
    scrollPrev: () => scrollByCard(-1),
    scrollNext: () => scrollByCard(1),
  };
}

interface LandingCarouselNavProps {
  canLeft: boolean;
  canRight: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export function LandingCarouselNav({ canLeft, canRight, onPrev, onNext }: LandingCarouselNavProps) {
  const buttonClass =
    "pointer-events-auto hidden h-11 w-11 items-center justify-center rounded-full border border-border bg-card/95 text-foreground shadow-[0_12px_32px_-18px_hsl(var(--foreground)/0.35)] backdrop-blur-md transition-all duration-200 hover:scale-[1.02] sm:flex group-hover/carousel:opacity-100 group-focus-within/carousel:opacity-100";

  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-20 hidden sm:block">
      {canLeft ? (
        <button
          type="button"
          aria-label="Scroll left"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onPrev}
          className={`${buttonClass} absolute left-3 top-1/2 -translate-y-1/2 opacity-0`}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : null}

      {canRight ? (
        <button
          type="button"
          aria-label="Scroll right"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onNext}
          className={`${buttonClass} absolute right-3 top-1/2 -translate-y-1/2 opacity-0`}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  );
}

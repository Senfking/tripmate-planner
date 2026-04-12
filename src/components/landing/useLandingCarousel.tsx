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
    setCanRight(el.scrollLeft < maxScrollLeft - 6);
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

  const scrollByStep = useCallback((direction: 1 | -1) => {
    const el = containerRef.current;
    if (!el) return;

    const firstCard = el.querySelector<HTMLElement>("[data-carousel-card='true']");
    const styles = window.getComputedStyle(el);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
    const step = firstCard ? firstCard.getBoundingClientRect().width + gap : el.clientWidth * 0.82;

    el.scrollBy({ left: step * direction, behavior: "smooth" });
    window.setTimeout(updateState, 420);
  }, [updateState]);

  return {
    containerRef,
    canLeft,
    canRight,
    scrollPrev: () => scrollByStep(-1),
    scrollNext: () => scrollByStep(1),
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
    "pointer-events-auto hidden sm:flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/95 text-foreground shadow-[0_12px_32px_-18px_hsl(var(--foreground)/0.35)] backdrop-blur-md transition-opacity duration-200 group-hover/carousel:opacity-100 group-focus-within/carousel:opacity-100";

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

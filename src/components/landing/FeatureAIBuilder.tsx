import { useEffect, useRef, useState } from "react";
import featureAIBuilder from "@/assets/feature-ai-builder.png";

// Auto-scrolling browser-window screenshot section.
// Image LEFT on desktop, stacks above copy on mobile.
export function FeatureAIBuilder() {
  const sectionRef = useRef<HTMLElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [scrollEnd, setScrollEnd] = useState<string>("calc(-100% + 480px)");

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          io.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Compute scroll distance from real image height vs viewport height
  useEffect(() => {
    function compute() {
      const img = imgRef.current;
      const vp = viewportRef.current;
      if (!img || !vp) return;
      const imgH = img.getBoundingClientRect().height;
      const vpH = vp.getBoundingClientRect().height;
      const diff = Math.max(0, imgH - vpH);
      setScrollEnd(`-${diff}px`);
    }
    compute();
    const img = imgRef.current;
    if (img && !img.complete) img.addEventListener("load", compute);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("resize", compute);
      if (img) img.removeEventListener("load", compute);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`landing-reveal ${visible ? "landing-visible" : ""} w-full py-24 sm:py-32 lg:py-[120px] px-5 sm:px-8 bg-white`}
    >
      <div className="mx-auto max-w-6xl grid gap-12 lg:gap-20 lg:grid-cols-2 items-center">
        {/* Browser-window frame with auto-scrolling screenshot */}
        <div className="order-1 lg:order-1">
          <div
            className="rounded-[14px] bg-white overflow-hidden border border-[#e7e2dc]"
            style={{
              boxShadow:
                "0 30px 60px -25px rgba(180, 120, 80, 0.18), 0 12px 28px -12px rgba(60, 40, 25, 0.10), 0 2px 6px rgba(60, 40, 25, 0.05)",
            }}
          >
            {/* Browser chrome */}
            <div className="flex items-center gap-1.5 px-3.5 py-2.5 border-b border-[#f0ece6] bg-[#fafaf9]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#E5E7EB]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#E5E7EB]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#E5E7EB]" />
            </div>
            {/* Viewport */}
            <div
              ref={viewportRef}
              className="relative w-full overflow-hidden bg-white"
              style={{ height: "min(480px, 60vh)" }}
            >
              <img
                ref={imgRef}
                src={featureAIBuilder}
                alt="Junto AI trip builder showing a generated Singapore itinerary with budget breakdown, hotel, daily activities, and packing essentials"
                className="auto-scroll-screenshot block w-full h-auto"
                style={{ ["--scroll-end" as string]: scrollEnd } as React.CSSProperties}
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </div>

        {/* Copy */}
        <div className="order-2 lg:order-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#0D9488] mb-4">
            Junto AI
          </p>
          <h2 className="text-[34px] sm:text-[44px] lg:text-[52px] leading-[1.05] tracking-tight font-bold text-[#1a1a1a] mb-6">
            Junto AI plans the trip.
          </h2>
          <p className="text-[16px] sm:text-[17px] leading-relaxed text-[#4b5563] max-w-xl font-sans">
            Tell Junto where you're going, who's coming, and what you're into.
            Get a real itinerary in minutes — hotels, restaurants, day-by-day
            plans your group will actually agree on.
          </p>
        </div>
      </div>
    </section>
  );
}

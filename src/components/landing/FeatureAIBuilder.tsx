import { useEffect, useRef, useState } from "react";
import mockupAIBuilder from "@/assets/mockup-ai-builder.webp";

// Static premium device shot — the laptop mockup PNG is the entire visual.
// No CSS frame, no overlay, no scroll animation.
export function FeatureAIBuilder() {
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

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

  return (
    <section
      ref={sectionRef}
      className={`landing-reveal ${visible ? "landing-visible" : ""} w-full py-24 sm:py-32 lg:py-[120px] px-5 sm:px-8 bg-[#FAFAF9] overflow-hidden`}
    >
      {/* Copy — centered above the hero asset */}
      <div className="mx-auto max-w-3xl text-center mb-14 sm:mb-20">
        <p
          className="landing-reveal-child text-[12px] font-semibold uppercase tracking-[0.18em] text-[#0D9488] mb-4"
          style={{ ["--stagger-index" as string]: 0 }}
        >
          Junto AI
        </p>
        <h2
          className="landing-reveal-child text-[34px] sm:text-[44px] lg:text-[56px] leading-[1.05] tracking-tight font-bold text-[#1a1a1a] mb-6"
          style={{ ["--stagger-index" as string]: 1 }}
        >
          Junto AI plans the trip.
        </h2>
        <p
          className="landing-reveal-child text-[16px] sm:text-[17px] leading-relaxed text-[#4b5563] max-w-xl mx-auto font-sans"
          style={{ ["--stagger-index" as string]: 2 }}
        >
          Tell Junto where you're going, who's coming, and what you're into.
          Get a real itinerary in minutes - hotels, restaurants, day-by-day
          plans your group will actually agree on.
        </p>
      </div>

      {/* Hero laptop — large, full-bleed feel */}
      <div
        className="mx-auto w-full max-w-[1400px] landing-reveal-mockup"
        style={{ ["--stagger-index" as string]: 3 }}
      >
        <img
          src={mockupAIBuilder}
          alt="Junto AI trip builder showing a Singapore itinerary with interactive map, day tabs, budget breakdown and a featured activity card"
          className="block w-full h-auto select-none"
          draggable={false}
          loading="lazy"
          decoding="async"
        />
      </div>
    </section>
  );
}

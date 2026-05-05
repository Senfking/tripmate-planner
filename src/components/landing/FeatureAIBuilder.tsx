import { useEffect, useRef, useState } from "react";
import macbookMockup from "@/assets/mockup-ai-builder.png";
import featureAIBuilder from "@/assets/feature-ai-builder.png";

// Photorealistic MacBook mockup (transparent PNG, head-on view) with an
// auto-scrolling screenshot overlaid inside the screen rectangle.
// Image LEFT on desktop, stacks above copy on mobile.
//
// Screen rectangle as a percentage of the mockup PNG (1672x941) — measured
// by sampling the bezel/screen transitions in the source image:
//   left   17.5%   top    11.5%
//   right  82.4%   bottom 67.7%
const SCREEN = {
  left: "17.5%",
  top: "11.5%",
  width: "64.9%",   // 82.4 - 17.5
  height: "56.2%",  // 67.7 - 11.5
};

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
      className={`landing-reveal ${visible ? "landing-visible" : ""} w-full py-24 sm:py-32 lg:py-[120px] px-5 sm:px-8 bg-white`}
    >
      <div className="mx-auto max-w-6xl grid gap-12 lg:gap-20 lg:grid-cols-2 items-center">
        {/* MacBook mockup with HTML scroll overlay */}
        <div className="order-1 lg:order-1">
          <div className="relative w-full max-w-[640px] mx-auto">
            {/* Static laptop frame — already shows top viewport baked in */}
            <img
              src={macbookMockup}
              alt=""
              aria-hidden
              className="block w-full h-auto select-none pointer-events-none"
              draggable={false}
              loading="lazy"
              decoding="async"
            />
            {/* Screen overlay: auto-scrolling screenshot */}
            <div
              className="absolute overflow-hidden"
              style={{
                left: SCREEN.left,
                top: SCREEN.top,
                width: SCREEN.width,
                height: SCREEN.height,
              }}
              aria-hidden
            >
              <img
                src={featureAIBuilder}
                alt=""
                draggable={false}
                className="ai-builder-scroll block w-full h-auto select-none"
                loading="lazy"
                decoding="async"
              />
            </div>
            {/* Accessible label for the whole composition */}
            <span className="sr-only">
              Junto AI trip builder showing a generated Singapore itinerary
              with budget breakdown, hotel, daily activities, and packing essentials.
            </span>
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

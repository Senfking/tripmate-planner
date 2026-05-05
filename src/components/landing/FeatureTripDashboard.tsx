import { useEffect, useRef, useState } from "react";
import mockup from "@/assets/mockup-trip-dashboard.png";

// Phone mockup RIGHT on desktop, stacks above copy on mobile.
// Mockup image already includes its own iPhone frame, lighting and shadow.
export function FeatureTripDashboard() {
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
      className={`landing-reveal ${visible ? "landing-visible" : ""} relative w-full py-24 sm:py-32 lg:py-[120px] px-5 sm:px-8 bg-[#F5EEE9]`}
      style={{
        backgroundImage:
          "radial-gradient(ellipse 70% 60% at 80% 50%, rgba(255,238,220,0.55), transparent 70%)",
      }}
    >
      <div className="mx-auto max-w-6xl grid gap-12 lg:gap-20 lg:grid-cols-2 items-center relative">
        {/* Copy — left on desktop, below image on mobile */}
        <div className="order-2 lg:order-1">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#0D9488] mb-4">
            Your trip
          </p>
          <h2 className="text-[34px] sm:text-[44px] lg:text-[52px] leading-[1.05] tracking-tight font-bold text-[#1a1a1a] mb-6">
            Everything in one place.
          </h2>
          <p className="text-[16px] sm:text-[17px] leading-relaxed text-[#4b5563] max-w-xl font-sans">
            Trip plan, group activity, expenses, flights, visa requirements —
            every part of your trip in one shared dashboard. Built around how
            groups actually travel.
          </p>
        </div>

        {/* Phone mockup — render as-is, no extra frame/shadow */}
        <div className="order-1 lg:order-2 flex justify-center lg:justify-end">
          <img
            src={mockup}
            alt="Junto trip dashboard on iPhone showing a Singapore trip with members, AI plan, expenses, flight and visa info"
            className="w-full max-w-[520px] h-auto"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
    </section>
  );
}

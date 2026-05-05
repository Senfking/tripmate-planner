import { useEffect, useRef, useState } from "react";
import mockup from "@/assets/mockup-trip-dashboard.webp";

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
      className={`landing-reveal ${visible ? "landing-visible" : ""} relative w-full py-24 sm:py-32 lg:py-[120px] px-5 sm:px-8 bg-[#FAFAF9]`}
    >
      <div className="mx-auto max-w-6xl grid gap-12 lg:gap-20 lg:grid-cols-2 items-center relative">
        <div className="order-1 lg:order-1">
          <p
            className="landing-reveal-child text-[12px] font-semibold uppercase tracking-[0.18em] text-[#0D9488] mb-4"
            style={{ ["--stagger-index" as string]: 0 }}
          >
            Your trip dashboard
          </p>
          <h2
            className="landing-reveal-child text-[34px] sm:text-[44px] lg:text-[52px] leading-[1.05] tracking-tight font-bold text-[#1a1a1a] mb-6"
            style={{ ["--stagger-index" as string]: 1 }}
          >
            Everything in one place.
          </h2>
          <p
            className="landing-reveal-child text-[16px] sm:text-[17px] leading-relaxed text-[#4b5563] max-w-xl font-sans"
            style={{ ["--stagger-index" as string]: 2 }}
          >
            Trip plan, group activity, expenses, flights, visa requirements.
            Junto AI keeps every part of your trip in one shared dashboard,
            organized around how groups actually travel.
          </p>
        </div>

        <div
          className="order-2 lg:order-2 flex justify-center lg:justify-end landing-reveal-mockup"
          style={{ ["--stagger-index" as string]: 3 }}
        >
          <img
            src={mockup}
            alt="Junto trip dashboard on iPhone showing a Singapore trip with members, AI plan, expenses, flight and visa info"
            width={720}
            height={899}
            className="w-full max-w-[600px] h-auto"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
    </section>
  );
}

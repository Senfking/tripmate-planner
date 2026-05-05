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
      className={`landing-reveal ${visible ? "landing-visible" : ""} relative w-full py-20 sm:py-24 lg:py-28 px-5 sm:px-8 bg-[#FAFAF9]`}
    >
      <div className="mx-auto max-w-6xl flex flex-col items-center text-center">
        <div className="max-w-[640px] mb-12 sm:mb-14">
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
            className="landing-reveal-child text-[16px] sm:text-[17px] leading-relaxed text-[#4b5563] font-sans"
            style={{ ["--stagger-index" as string]: 2 }}
          >
            Trip plan, group activity, expenses, flights, visa requirements.
            Junto AI keeps every part of your trip in one shared dashboard,
            organized around how groups actually travel.
          </p>
        </div>

        <div
          className="landing-reveal-mockup w-full flex justify-center"
          style={{ ["--stagger-index" as string]: 3 }}
        >
          <img
            src={mockup}
            alt="Junto trip dashboard on iPhone showing a Singapore trip with members, AI plan, expenses, flight and visa info"
            className="w-full max-w-[460px] h-auto"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
    </section>
  );
}

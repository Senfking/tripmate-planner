import { useEffect, useRef, useState } from "react";

type Props = {
  eyebrow: string;
  headline: string;
  body: string;
  image: string;
  alt: string;
  /** Deprecated — layout is now always a vertical stack (text above phone). */
  imageSide?: "left" | "right";
  /** Deprecated — all feature sections now use the unified #FAFAF9 surface. */
  background?: "white" | "sand";
};

export function FeaturePhoneSection({ eyebrow, headline, body, image, alt }: Props) {
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
            {eyebrow}
          </p>
          <h2
            className="landing-reveal-child text-[34px] sm:text-[44px] lg:text-[52px] leading-[1.05] tracking-tight font-bold text-[#1a1a1a] mb-6"
            style={{ ["--stagger-index" as string]: 1 }}
          >
            {headline}
          </h2>
          <p
            className="landing-reveal-child text-[16px] sm:text-[17px] leading-relaxed text-[#4b5563] font-sans"
            style={{ ["--stagger-index" as string]: 2 }}
          >
            {body}
          </p>
        </div>

        <div
          className="landing-reveal-mockup w-full flex justify-center"
          style={{ ["--stagger-index" as string]: 3 }}
        >
          <img
            src={image}
            alt={alt}
            className="w-full max-w-[460px] h-auto"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
    </section>
  );
}

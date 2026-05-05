import { useEffect, useRef, useState } from "react";

type Props = {
  eyebrow: string;
  headline: string;
  body: string;
  image: string;
  alt: string;
  imageSide: "left" | "right";
  /** Deprecated — all feature sections now use the unified #FAFAF9 surface. */
  background?: "white" | "sand";
};

export function FeaturePhoneSection({
  eyebrow,
  headline,
  body,
  image,
  alt,
  imageSide,
}: Props) {
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

  const imageOrder = imageSide === "right" ? "lg:order-2" : "lg:order-1";
  const copyOrder = imageSide === "right" ? "lg:order-1" : "lg:order-2";
  const imageJustify = imageSide === "right" ? "lg:justify-end" : "lg:justify-start";

  return (
    <section
      ref={sectionRef}
      className={`landing-reveal ${visible ? "landing-visible" : ""} relative w-full py-24 sm:py-32 lg:py-[120px] px-5 sm:px-8 bg-[#FAFAF9]`}
    >
      <div className="mx-auto max-w-6xl grid gap-12 lg:gap-20 lg:grid-cols-2 items-center relative">
        <div
          className={`order-1 ${imageOrder} flex justify-center ${imageJustify} landing-reveal-mockup`}
          style={{ ["--stagger-index" as string]: 3 }}
        >
          <img
            src={image}
            alt={alt}
            className="w-full max-w-[520px] h-auto"
            loading="lazy"
            decoding="async"
          />
        </div>

        <div className={`order-2 ${copyOrder}`}>
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
            className="landing-reveal-child text-[16px] sm:text-[17px] leading-relaxed text-[#4b5563] max-w-xl font-sans"
            style={{ ["--stagger-index" as string]: 2 }}
          >
            {body}
          </p>
        </div>
      </div>
    </section>
  );
}

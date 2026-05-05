import { useEffect, useRef, useState } from "react";

type Props = {
  eyebrow: string;
  headline: string;
  body: string;
  image: string;
  alt: string;
  imageSide: "left" | "right";
  background?: "white" | "sand";
};

// Reusable two-column feature section: phone mockup + copy.
// Mockup PNGs already include their iPhone frame, lighting and shadow —
// rendered as-is, no extra CSS frame.
export function FeaturePhoneSection({
  eyebrow,
  headline,
  body,
  image,
  alt,
  imageSide,
  background = "white",
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

  const bg = background === "sand" ? "bg-[#FAFAF9]" : "bg-white";
  const imageOrder = imageSide === "right" ? "lg:order-2" : "lg:order-1";
  const copyOrder = imageSide === "right" ? "lg:order-1" : "lg:order-2";
  const imageJustify = imageSide === "right" ? "lg:justify-end" : "lg:justify-start";

  return (
    <section
      ref={sectionRef}
      className={`landing-reveal ${visible ? "landing-visible" : ""} w-full py-24 sm:py-32 lg:py-[120px] px-5 sm:px-8 ${bg}`}
    >
      <div className="mx-auto max-w-6xl grid gap-12 lg:gap-20 lg:grid-cols-2 items-center">
        {/* Phone mockup */}
        <div className={`order-1 ${imageOrder} flex justify-center ${imageJustify}`}>
          <img
            src={image}
            alt={alt}
            className="w-full max-w-[520px] h-auto"
            loading="lazy"
            decoding="async"
          />
        </div>

        {/* Copy */}
        <div className={`order-2 ${copyOrder}`}>
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#0D9488] mb-4">
            {eyebrow}
          </p>
          <h2 className="text-[34px] sm:text-[44px] lg:text-[52px] leading-[1.05] tracking-tight font-bold text-[#1a1a1a] mb-6">
            {headline}
          </h2>
          <p className="text-[16px] sm:text-[17px] leading-relaxed text-[#4b5563] max-w-xl font-sans">
            {body}
          </p>
        </div>
      </div>
    </section>
  );
}

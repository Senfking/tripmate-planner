import { useEffect, useRef, useState } from "react";
import { MessageCircle, Users, MapPin, type LucideIcon } from "lucide-react";

type Step = {
  num: string;
  Icon: LucideIcon;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    num: "01",
    Icon: MessageCircle,
    title: "Tell Junto.",
    body: "Destination, dates, vibe. Junto drafts the trip in minutes.",
  },
  {
    num: "02",
    Icon: Users,
    title: "Invite your group.",
    body: "Everyone votes, suggests, and edits in one shared plan.",
  },
  {
    num: "03",
    Icon: MapPin,
    title: "Go.",
    body: "Junto's there during the trip too — bookings, expenses, and updates.",
  },
];

export function HowItWorks() {
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
      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-16 sm:mb-20">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#0D9488] mb-4">
            How it works
          </p>
          <h2 className="text-[34px] sm:text-[44px] lg:text-[52px] leading-[1.05] tracking-tight font-bold text-[#1a1a1a] max-w-3xl mx-auto">
            Three steps to your group's next trip.
          </h2>
        </div>

        <div className="grid gap-12 lg:gap-0 lg:grid-cols-3 lg:divide-x lg:divide-[#e7e2dc]">
          {STEPS.map(({ num, Icon, title, body }) => (
            <div
              key={num}
              className="flex flex-col items-start text-left lg:px-10 first:lg:pl-0 last:lg:pr-0"
            >
              <Icon className="h-6 w-6 text-[#0D9488] mb-5" strokeWidth={1.5} />
              <p
                className="text-[44px] sm:text-[52px] leading-none font-medium text-[#0D9488] mb-5 tracking-tight"
                style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
              >
                {num}
              </p>
              <h3 className="text-[20px] sm:text-[22px] font-bold text-[#1a1a1a] mb-2.5 tracking-tight">
                {title}
              </h3>
              <p className="text-[15px] leading-relaxed text-[#4b5563] max-w-xs font-sans">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

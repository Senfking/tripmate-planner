import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

type PublicHeroHeaderProps = {
  leftLabel: string;
  leftTo: string;
};

const topBarStyle = {
  paddingTop: "calc(env(safe-area-inset-top, 0px) + 18px)",
  paddingBottom: 24,
  background:
    "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0) 100%)",
};

const logoStyle = { top: "calc(env(safe-area-inset-top, 0px) + 18px)" };

const ctaStyle = {
  background: "linear-gradient(135deg, #0D9488 0%, #14b8a6 50%, #0891b2 100%)",
};

function HeaderContent({ leftLabel, leftTo }: PublicHeroHeaderProps) {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-5 sm:px-10 pointer-events-none"
      style={topBarStyle}
    >
      <Link
        to={leftTo}
        className="pointer-events-auto text-[13px] font-semibold text-white/85 hover:text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-colors whitespace-nowrap"
      >
        {leftLabel}
      </Link>
      <Link
        to="/"
        aria-label="Junto home"
        className="pointer-events-auto absolute left-1/2 -translate-x-1/2 text-[19px] font-extrabold tracking-[0.32em] uppercase text-white/80 hover:text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-colors"
        style={logoStyle}
      >
        Junto
      </Link>
      <Link
        to="/ref"
        className="group pointer-events-auto relative inline-flex items-center rounded-full px-3.5 py-1.5 text-[12px] sm:px-5 sm:py-2 sm:text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(13,148,136,0.65)] transition-transform hover:scale-[1.03] active:scale-95"
        style={ctaStyle}
      >
        <span className="absolute inset-0 rounded-full bg-gradient-to-r from-white/20 via-transparent to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        <span className="relative">Get started</span>
      </Link>
    </div>
  );
}

export function PublicHeroHeader(props: PublicHeroHeaderProps) {
  if (typeof document === "undefined") {
    return <HeaderContent {...props} />;
  }

  return createPortal(<HeaderContent {...props} />, document.body);
}
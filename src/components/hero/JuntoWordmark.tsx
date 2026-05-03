import { Link } from "react-router-dom";

// Junto wordmark — mirrors the inline pattern used elsewhere
// (ReferralLanding, Landing) so we can swap to a real logo later in one
// place without hunting through every page.
export function JuntoWordmark({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label="Junto home"
      className={`inline-block text-[15px] font-extrabold tracking-[0.32em] uppercase text-foreground hover:text-primary transition-colors ${className}`}
    >
      Junto
    </Link>
  );
}

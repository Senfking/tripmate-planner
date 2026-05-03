import { Link } from "react-router-dom";

type Variant = "default" | "light";

// Junto wordmark — `light` variant inverts colors for use on dark/photo
// backgrounds (e.g. the atmospheric Hero). Default stays foreground-toned
// for the rest of the app.
export function JuntoWordmark({
  className = "",
  variant = "default",
}: {
  className?: string;
  variant?: Variant;
}) {
  const colorClasses =
    variant === "light"
      ? "text-white hover:text-white/80 drop-shadow-sm"
      : "text-foreground hover:text-primary";

  return (
    <Link
      to="/"
      aria-label="Junto home"
      className={`inline-block text-[15px] font-extrabold tracking-[0.32em] uppercase transition-colors ${colorClasses} ${className}`}
    >
      Junto
    </Link>
  );
}

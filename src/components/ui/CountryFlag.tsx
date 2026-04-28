import { cn } from "@/lib/utils";

interface CountryFlagProps {
  code: string;
  size?: number;
  className?: string;
}

/**
 * Circular country flag image, served from jsdelivr CDN (HatScripts/circle-flags).
 * Reliable, immutable, CDN-cached. No npm dependency on a third-party CDN domain.
 */
export function CountryFlag({ code, size = 20, className }: CountryFlagProps) {
  const cc = (code || "xx").toLowerCase();
  const src = `https://cdn.jsdelivr.net/gh/HatScripts/circle-flags/flags/${cc}.svg`;
  return (
    <img
      src={src}
      alt={code.toUpperCase()}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={cn("rounded-full object-cover", className)}
      style={{ width: size, height: size }}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).src =
          "https://cdn.jsdelivr.net/gh/HatScripts/circle-flags/flags/xx.svg";
      }}
    />
  );
}

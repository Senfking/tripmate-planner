import { useEffect } from "react";
import {
  type UnsplashPhotoMeta,
  UNSPLASH_HOME,
  pingUnsplashDownload,
  withUtm,
} from "@/lib/unsplashAttribution";

type Props = {
  photo: UnsplashPhotoMeta;
  /** Light text on dark backgrounds (hero, theme cards). Defaults to dark on light. */
  variant?: "light" | "dark";
  className?: string;
};

/**
 * Unsplash attribution per https://help.unsplash.com/en/articles/2511315
 * Renders: "Photo by <Photographer> on Unsplash" with both names linked
 * and utm_source=junto&utm_medium=referral params. Also fires a debounced
 * download ping the first time this photoId is mounted in a session.
 */
export function UnsplashAttribution({ photo, variant = "light", className = "" }: Props) {
  useEffect(() => {
    pingUnsplashDownload(photo);
  }, [photo]);

  const tone =
    variant === "light"
      ? "text-white/70 hover:[&_a]:text-white"
      : "text-gray-500 hover:[&_a]:text-gray-800";

  return (
    <p
      className={`text-[10.5px] sm:text-[11px] leading-tight ${tone} ${className}`}
    >
      Photo by{" "}
      <a
        href={withUtm(photo.photographerUrl)}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 transition-colors"
      >
        {photo.photographerName}
      </a>{" "}
      on{" "}
      <a
        href={UNSPLASH_HOME}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 transition-colors"
      >
        Unsplash
      </a>
    </p>
  );
}

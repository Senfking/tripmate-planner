import { useEffect } from "react";

/**
 * Sets <link rel="canonical"> to the given path on the junto.pro apex.
 * SPA pages share index.html's static canonical (which points to "/"),
 * so non-root public pages must override it on mount and restore on unmount.
 */
export function useCanonical(path: string) {
  useEffect(() => {
    const href = `https://junto.pro${path.startsWith("/") ? path : `/${path}`}`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const previous = link?.href ?? null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = href;
    return () => {
      if (link && previous !== null) link.href = previous;
    };
  }, [path]);
}

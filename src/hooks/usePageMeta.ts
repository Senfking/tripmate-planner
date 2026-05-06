import { useEffect } from "react";

/**
 * Sets the document <title> and <meta name="description"> on mount,
 * restoring previous values on unmount. Lightweight DOM-mutation pattern,
 * mirrors useCanonical.
 */
export function usePageMeta({ title, description }: { title: string; description: string }) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    let metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = metaDesc?.content ?? null;
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.name = "description";
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = description;

    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc !== null) metaDesc.content = prevDesc;
    };
  }, [title, description]);
}

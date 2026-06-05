import { useEffect } from "react";

type PageMetaArgs = {
  title: string;
  description: string;
  /** Route path used for og:url (e.g. "/trips/new"). */
  path?: string;
  /** Optional custom og:image / twitter:image URL for this page. */
  ogImage?: string;
};

function getMeta(selector: string): HTMLMetaElement | null {
  return document.querySelector<HTMLMetaElement>(selector);
}

function ensureMeta(nameOrProperty: string, value: string): HTMLMetaElement {
  const isProperty = nameOrProperty.startsWith("og:");
  let el = getMeta(isProperty ? `meta[property="${nameOrProperty}"]` : `meta[name="${nameOrProperty}"]`);
  if (!el) {
    el = document.createElement("meta");
    if (isProperty) {
      el.setAttribute("property", nameOrProperty);
    } else {
      el.name = nameOrProperty;
    }
    document.head.appendChild(el);
  }
  el.content = value;
  return el;
}

/**
 * Sets the document <title>, <meta name="description">, and Open Graph /
 * Twitter meta tags on mount, restoring previous values on unmount.
 * Lightweight DOM-mutation pattern, mirrors useCanonical.
 */
export function usePageMeta({ title, description, path, ogImage }: PageMetaArgs) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    const metaDesc = ensureMeta("description", description);
    const prevDesc = metaDesc.getAttribute("data-prev-content") ?? metaDesc.content;
    metaDesc.setAttribute("data-prev-content", prevDesc);

    const ogTitle = ensureMeta("og:title", title);
    const prevOgTitle = ogTitle.getAttribute("data-prev-content") ?? ogTitle.content;
    ogTitle.setAttribute("data-prev-content", prevOgTitle);

    const ogDesc = ensureMeta("og:description", description);
    const prevOgDesc = ogDesc.getAttribute("data-prev-content") ?? ogDesc.content;
    ogDesc.setAttribute("data-prev-content", prevOgDesc);

    const ogUrlValue = path
      ? `https://junto.pro${path.startsWith("/") ? path : `/${path}`}`
      : "https://junto.pro/";
    const ogUrl = ensureMeta("og:url", ogUrlValue);
    const prevOgUrl = ogUrl.getAttribute("data-prev-content") ?? ogUrl.content;
    ogUrl.setAttribute("data-prev-content", prevOgUrl);

    const twTitle = ensureMeta("twitter:title", title);
    const prevTwTitle = twTitle.getAttribute("data-prev-content") ?? twTitle.content;
    twTitle.setAttribute("data-prev-content", prevTwTitle);

    const twDesc = ensureMeta("twitter:description", description);
    const prevTwDesc = twDesc.getAttribute("data-prev-content") ?? twDesc.content;
    twDesc.setAttribute("data-prev-content", prevTwDesc);

    let ogImageEl: HTMLMetaElement | null = null;
    let prevOgImage: string | null = null;
    let twImageEl: HTMLMetaElement | null = null;
    let prevTwImage: string | null = null;

    if (ogImage) {
      ogImageEl = ensureMeta("og:image", ogImage);
      prevOgImage = ogImageEl.getAttribute("data-prev-content") ?? ogImageEl.content;
      ogImageEl.setAttribute("data-prev-content", prevOgImage);

      twImageEl = ensureMeta("twitter:image", ogImage);
      prevTwImage = twImageEl.getAttribute("data-prev-content") ?? twImageEl.content;
      twImageEl.setAttribute("data-prev-content", prevTwImage);
    }

    return () => {
      document.title = prevTitle;
      if (metaDesc) metaDesc.content = prevDesc;
      if (ogTitle) ogTitle.content = prevOgTitle;
      if (ogDesc) ogDesc.content = prevOgDesc;
      if (ogUrl) ogUrl.content = prevOgUrl;
      if (twTitle) twTitle.content = prevTwTitle;
      if (twDesc) twDesc.content = prevTwDesc;
      if (ogImageEl && prevOgImage !== null) ogImageEl.content = prevOgImage;
      if (twImageEl && prevTwImage !== null) twImageEl.content = prevTwImage;
    };
  }, [title, description, path, ogImage]);
}

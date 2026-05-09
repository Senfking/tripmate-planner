// Unsplash attribution + download-tracking helpers.
//
// Per Unsplash API guidelines, every time a photo is used in production we must:
//  (a) attribute the photographer + Unsplash with utm_source=junto&utm_medium=referral
//  (b) trigger a "download" by hitting the photo's download_location URL with the
//      Access Key. We do (b) server-side via the unsplash-download-ping Edge
//      Function and debounce per-session so we don't spam the API.
//
// References: https://help.unsplash.com/en/articles/2511315-guideline-attribution

import { supabase } from "@/integrations/supabase/client";

export type UnsplashPhotoMeta = {
  url: string;
  photoId: string;
  photographerName: string;
  photographerUrl: string;
  downloadLocation: string;
};

export function isUnsplashMeta(p: unknown): p is UnsplashPhotoMeta {
  return (
    !!p &&
    typeof p === "object" &&
    typeof (p as any).url === "string" &&
    typeof (p as any).photoId === "string"
  );
}

const UTM = "utm_source=junto&utm_medium=referral";

export function withUtm(url: string): string {
  if (!url) return url;
  return url.includes("?") ? `${url}&${UTM}` : `${url}?${UTM}`;
}

export const UNSPLASH_HOME = `https://unsplash.com/?${UTM}`;

/** Debounced ping — fires at most once per photoId per session. */
const PING_KEY = "unsplash_pinged_v1";

function getPinged(): Set<string> {
  try {
    const raw = sessionStorage.getItem(PING_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function savePinged(set: Set<string>) {
  try {
    sessionStorage.setItem(PING_KEY, JSON.stringify([...set]));
  } catch {
    /* noop */
  }
}

export function pingUnsplashDownload(photo: UnsplashPhotoMeta | null | undefined): void {
  if (!photo || !photo.photoId || !photo.downloadLocation) return;
  const pinged = getPinged();
  if (pinged.has(photo.photoId)) return;
  pinged.add(photo.photoId);
  savePinged(pinged);

  // Fire-and-forget. The edge function adds the Authorization header
  // server-side using the UNSPLASH_ACCESS_KEY secret.
  supabase.functions
    .invoke("unsplash-download-ping", {
      body: { downloadLocation: photo.downloadLocation, photoId: photo.photoId },
    })
    .catch(() => {
      /* swallow — analytics-style call, don't disrupt UX */
    });
}

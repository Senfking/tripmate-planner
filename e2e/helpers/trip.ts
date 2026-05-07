import { Page, expect } from "@playwright/test";

/**
 * Submit a free-text prompt via the home Hero. Works in both signed-in
 * (/app/trips) and signed-out (/trips/new) modes since both surfaces
 * render the same Hero textarea + submit button.
 */
export async function submitTripPrompt(page: Page, prompt: string): Promise<void> {
  // The home hero textarea has aria-label "Plan with Junto AI" on the submit
  // button; the textarea itself is identified by being the only multiline
  // input on the page after navigation.
  const textarea = page.locator("textarea").first();
  await textarea.waitFor({ timeout: 30_000 });
  await textarea.fill(prompt);
  await page.getByRole("button", { name: /plan with junto ai/i }).click();
}

/**
 * Wait until streaming generation finishes. Generation takes 60-90s in
 * production. Completion is signaled by either:
 *   - the trip preview rendering (title + day cards), or
 *   - navigation to /app/trips/:id (saved trip view).
 */
export async function waitForGenerationComplete(page: Page, opts: { timeoutMs?: number } = {}): Promise<void> {
  const timeout = opts.timeoutMs ?? 150_000;
  // The streaming UI eventually renders the day-by-day preview with at
  // least one "Day 1" heading.
  await expect(page.getByText(/^day\s*1\b/i).first()).toBeVisible({ timeout });
}

export interface TripPreviewSnapshot {
  title: string | null;
  dayCount: number;
  activityCount: number;
  imageCount: number;
  brokenImageCount: number;
  hasMap: boolean;
  hasHotel: boolean;
}

/**
 * Read structural facts from the rendered trip preview. Used by tests to
 * assert "≥15 activities", "all images load", etc. Doesn't require any
 * specific component structure — just walks the DOM.
 */
export async function snapshotTripPreview(page: Page): Promise<TripPreviewSnapshot> {
  // Wait a beat for lazy images to start loading.
  await page.waitForTimeout(2000);

  const snapshot = await page.evaluate(() => {
    const dayHeadings = Array.from(document.querySelectorAll("*")).filter((el) =>
      /^day\s*\d+\b/i.test((el.textContent ?? "").trim())
    );
    const dayCount = new Set(
      dayHeadings.map((el) => (el.textContent ?? "").match(/day\s*(\d+)/i)?.[1])
    ).size;

    const images = Array.from(document.querySelectorAll<HTMLImageElement>("img"));
    // "Activity photos" are the larger non-icon images that render inside
    // activity cards. Heuristic: width >= 80 OR height >= 80 (rules out
    // 16/24px lucide-react SVGs rendered as <img>, though those are
    // typically <svg> not <img>).
    const activityImages = images.filter((img) => {
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      return w >= 80 || h >= 80;
    });
    const broken = activityImages.filter((img) => img.complete && img.naturalWidth === 0);

    // Activity cards: links or buttons mentioning a venue/time. Fall back
    // to counting headings under day sections.
    const activityCount = document.querySelectorAll('[data-activity], [class*="activity-card"], [class*="ActivityCard"]').length
      || dayHeadings.length * 0; // sentinel — overridden below if found

    const text = document.body.innerText.toLowerCase();
    const hasMap = !!document.querySelector(".leaflet-container, [class*='leaflet']");
    const hasHotel = /hotel|stay|accommod/i.test(text);

    // Title: the first <h1> on the page, falling back to <title>.
    const h1 = document.querySelector("h1");
    const title = (h1?.textContent ?? document.title ?? "").trim() || null;

    return {
      title,
      dayCount,
      activityImages: activityImages.length,
      brokenImages: broken.length,
      hasMap,
      hasHotel,
      activityCount,
    };
  });

  // Activities: count distinct time-prefixed entries (e.g. "9:00", "13:30")
  // anywhere in the preview. This is a robust fallback that doesn't depend
  // on exact class names, which change frequently.
  const activityCount = await page.evaluate(() => {
    const text = document.body.innerText;
    const matches = text.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g) ?? [];
    return matches.length;
  });

  return {
    title: snapshot.title,
    dayCount: snapshot.dayCount,
    activityCount: Math.max(snapshot.activityCount, activityCount),
    imageCount: snapshot.activityImages,
    brokenImageCount: snapshot.brokenImages,
    hasMap: snapshot.hasMap,
    hasHotel: snapshot.hasHotel,
  };
}

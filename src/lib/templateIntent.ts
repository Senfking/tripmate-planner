/**
 * Template intent stash — used when an unauthenticated visitor clicks
 * "Use this trip" or "Personalize for me" on a template detail page.
 * We stash the intent in sessionStorage, send them through the auth flow
 * (/ref), and on first authenticated render the destination route drains
 * the intent and executes it (clone or open the personalize builder).
 */

const KEY = "template_intent";

export type TemplateIntentAction = "clone" | "personalize";

export type TemplateIntent = {
  action: TemplateIntentAction;
  slug: string;
};

export function stashIntent(action: TemplateIntentAction, slug: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ action, slug }));
  } catch {
    /* storage might be unavailable (private mode, quota) — silently noop */
  }
}

export function drainIntent(): TemplateIntent | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.slug === "string" &&
      (parsed.action === "clone" || parsed.action === "personalize")
    ) {
      return parsed as TemplateIntent;
    }
    return null;
  } catch {
    return null;
  }
}

export function peekIntent(): TemplateIntent | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.slug === "string" &&
      (parsed.action === "clone" || parsed.action === "personalize")
    ) {
      return parsed as TemplateIntent;
    }
    return null;
  } catch {
    return null;
  }
}

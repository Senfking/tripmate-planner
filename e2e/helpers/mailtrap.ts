import { env } from "./env";

/**
 * Minimal Mailtrap (Email Testing) inbox client. Polls the inbox for a
 * message addressed to `to` whose subject matches `subjectPattern`, then
 * returns the body. Used to pull Supabase confirmation links for fresh
 * signup flows.
 *
 * Docs: https://api-docs.mailtrap.io/docs/mailtrap-api-docs/
 */

interface MailtrapMessage {
  id: number;
  to_email: string;
  subject: string;
  sent_at: string;
  html_body: string | null;
  text_body: string | null;
}

async function mailtrapFetch(path: string): Promise<unknown> {
  const { apiToken, accountId } = env.mailtrap;
  const res = await fetch(`https://mailtrap.io/api/accounts/${accountId}${path}`, {
    headers: {
      "Api-Token": apiToken!,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Mailtrap ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function findMessage(opts: {
  to: string;
  subjectPattern: RegExp;
  timeoutMs?: number;
}): Promise<MailtrapMessage> {
  const timeout = opts.timeoutMs ?? 60_000;
  const deadline = Date.now() + timeout;
  const { inboxId } = env.mailtrap;
  while (Date.now() < deadline) {
    const list = (await mailtrapFetch(
      `/inboxes/${inboxId}/messages?search=${encodeURIComponent(opts.to)}`
    )) as MailtrapMessage[];
    const hit = list.find(
      (m) => m.to_email.toLowerCase() === opts.to.toLowerCase() && opts.subjectPattern.test(m.subject)
    );
    if (hit) {
      // Hydrate body — list endpoint returns it on most plans but not all.
      if (hit.html_body || hit.text_body) return hit;
      const full = (await mailtrapFetch(
        `/inboxes/${inboxId}/messages/${hit.id}/body.html`
      )) as { body?: string };
      return { ...hit, html_body: full.body ?? null };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Mailtrap: no message to ${opts.to} matching ${opts.subjectPattern} within ${timeout}ms`);
}

/**
 * Extract the first http(s) link from an email body. Supabase confirmation
 * emails embed the redirect URL as the only meaningful link, so naive
 * extraction is sufficient.
 */
export function extractFirstLink(message: MailtrapMessage): string {
  const body = message.html_body ?? message.text_body ?? "";
  const match = body.match(/https?:\/\/[^\s"'<>]+/);
  if (!match) throw new Error("No link found in email body");
  return match[0];
}

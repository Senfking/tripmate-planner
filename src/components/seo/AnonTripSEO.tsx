import { Helmet } from "react-helmet-async";

const SITE_URL = "https://junto.pro";
const DEFAULT_OG = `${SITE_URL}/og-default-v2.png`;

interface AnonTripSEOProps {
  id: string;
  title?: string | null;
  description?: string | null;
  heroImage?: string | null;
}

function trim(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

/**
 * Per-trip OG / Twitter meta for /trips/anon/:id. Rendered via react-helmet-async
 * so the hosted prerender pipeline can serve crawler-visible meta tags.
 */
export function AnonTripSEO({ id, title, description, heroImage }: AnonTripSEOProps) {
  const url = `${SITE_URL}/trips/anon/${id}`;
  const cleanTitle = (title ?? "").trim() || "A trip plan from Junto";
  const ogTitle = `${cleanTitle} | Junto`;
  const rawDesc =
    (description ?? "").trim() ||
    `${cleanTitle} — an AI-built trip plan with day-by-day activities, places and tips. Customize and share with friends on Junto.`;
  const desc = trim(rawDesc, 155);
  const image = heroImage && /^https?:\/\//i.test(heroImage) ? heroImage : DEFAULT_OG;

  return (
    <Helmet>
      <title>{ogTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={url} />

      <meta property="og:type" content="article" />
      <meta property="og:site_name" content="Junto" />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={ogTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:image" content={image} />
      <meta property="og:image:secure_url" content={image} />
      <meta property="og:image:alt" content={cleanTitle} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={ogTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={image} />
    </Helmet>
  );
}

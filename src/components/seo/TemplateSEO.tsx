import { Helmet } from "react-helmet-async";

const SITE_URL = "https://junto.pro";
const DEFAULT_OG = `${SITE_URL}/og-default-v2.png`;

interface TemplateSEOProps {
  slug: string;
  destination: string;
  country?: string | null;
  durationDays: number;
  description?: string | null;
  heroImage?: string | null;
  recommendedSeason?: string | null;
  chips?: string[] | null;
}

function trim(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

export function TemplateSEO({
  slug,
  destination,
  country,
  durationDays,
  description,
  heroImage,
  recommendedSeason,
  chips,
}: TemplateSEOProps) {
  const url = `${SITE_URL}/templates/${slug}`;
  const title = `${durationDays} Days in ${destination} — Itinerary & Trip Plan | Junto`;
  const rawDesc =
    description ||
    `A ${durationDays}-day ${destination} itinerary with daily plans, top sights, food, and tips. Plan, customize, and share your trip with friends on Junto.`;
  const desc = trim(rawDesc, 158);
  const image = heroImage || DEFAULT_OG;

  const keywords = [
    `${durationDays} days in ${destination}`,
    `${destination} itinerary`,
    `${destination} ${durationDays} day trip`,
    `things to do in ${destination}`,
    `${destination} travel guide`,
    country ? `${country} itinerary` : null,
    ...(chips ?? []).slice(0, 6).map((c) => `${destination} ${c.toLowerCase()}`),
  ]
    .filter(Boolean)
    .join(", ");

  const touristTrip = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: `${durationDays} Days in ${destination}`,
    description: rawDesc,
    url,
    image,
    touristType: chips ?? [],
    itinerary: {
      "@type": "ItemList",
      numberOfItems: durationDays,
      itemListElement: Array.from({ length: durationDays }).map((_, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `Day ${i + 1} in ${destination}`,
      })),
    },
    ...(country
      ? {
          subjectOf: {
            "@type": "Place",
            name: destination,
            address: { "@type": "PostalAddress", addressCountry: country },
          },
        }
      : {}),
    ...(recommendedSeason ? { temporalCoverage: recommendedSeason } : {}),
    provider: {
      "@type": "Organization",
      name: "Junto",
      url: SITE_URL,
    },
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Trip Templates", item: `${SITE_URL}/templates` },
      {
        "@type": "ListItem",
        position: 3,
        name: `${destination} · ${durationDays} days`,
        item: url,
      },
    ],
  };

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={desc} />
      <meta name="keywords" content={keywords} />
      <link rel="canonical" href={url} />

      <meta property="og:type" content="article" />
      <meta property="og:site_name" content="Junto" />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={desc} />
      <meta property="og:image" content={image} />
      <meta property="og:image:secure_url" content={image} />
      <meta property="og:image:alt" content={`${destination} — ${durationDays} day itinerary`} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={image} />

      <script type="application/ld+json">{JSON.stringify(touristTrip)}</script>
      <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
    </Helmet>
  );
}

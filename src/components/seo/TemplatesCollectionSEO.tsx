import { Helmet } from "react-helmet-async";
import type { TripTemplate } from "@/hooks/useTripTemplates";

const SITE_URL = "https://junto.pro";

interface Props {
  templates: TripTemplate[];
}

export function TemplatesCollectionSEO({ templates }: Props) {
  const url = `${SITE_URL}/templates`;
  const itemList = {
    "@type": "ItemList",
    numberOfItems: templates.length,
    itemListElement: templates.slice(0, 50).map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/templates/${t.slug}`,
      name: `${t.duration_days ?? ""} Days in ${t.destination}`.trim(),
    })),
  };

  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Trip Templates — Junto",
    description:
      "Curated group trip templates for inspiration. Browse itineraries by destination, vibe and season, then personalize one with AI in seconds.",
    url,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    mainEntity: itemList,
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Trip Templates", item: url },
    ],
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(collection)}</script>
      <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
    </Helmet>
  );
}

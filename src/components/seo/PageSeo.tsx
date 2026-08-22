import { Helmet } from "react-helmet-async";

const SITE_URL = "https://junto.pro";
const DEFAULT_OG = `${SITE_URL}/og-default-v2.png`;

export interface PageSeoProps {
  /** Page title. Keep under 60 characters including the " | Junto" suffix. */
  title: string;
  /** Meta description. Aim for 120-158 characters. */
  description: string;
  /** Route path, e.g. "/templates". Used for canonical and og:url. */
  path: string;
  image?: string;
  /** Keep the page out of search results (app shells, utility routes). */
  noindex?: boolean;
  type?: "website" | "article";
  children?: React.ReactNode;
}

/**
 * Single source of truth for per-route head tags. Canonical and og:url always
 * self-reference the route so social crawlers and Ahrefs stop reporting the
 * homepage URL on every page.
 */
export function PageSeo({
  title,
  description,
  path,
  image = DEFAULT_OG,
  noindex = false,
  type = "website",
  children,
}: PageSeoProps) {
  const url = `${SITE_URL}${path}`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex ? <meta name="robots" content="noindex, follow" /> : null}

      <meta property="og:type" content={type} />
      <meta property="og:site_name" content="Junto" />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      {children}
    </Helmet>
  );
}

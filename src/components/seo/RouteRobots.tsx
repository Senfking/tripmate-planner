import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

const SITE_URL = "https://junto.pro";
const DEFAULT_OG = `${SITE_URL}/og-default-v2.png`;
const DEFAULT_TITLE = "Junto — AI Group Trip Planner | Plan Trips With Friends";
const DEFAULT_DESC =
  "Junto is the AI group trip planner for friends. Build itineraries together, vote on destinations, split expenses, and keep every trip in one place.";

/**
 * Public, indexable surface of the site. Everything else (the signed-in app,
 * invite/share tokens, auth callbacks, internal tools) is marked
 * noindex, follow so crawlers stop reporting them as thin/orphan pages.
 */
const INDEXABLE = [
  /^\/$/,
  /^\/templates\/?$/,
  /^\/templates\/[^/]+\/?$/,
  /^\/guides\/?$/,
  /^\/guides\/[^/]+\/?$/,
  /^\/privacy\/?$/,
  /^\/terms\/?$/,
  /^\/ref\/?$/,
  /^\/trips\/new\/?$/,
];

// /templates/:slug/personalize is a tool, not content.
const FORCE_NOINDEX = [/^\/templates\/[^/]+\/personalize\/?$/];

/**
 * Site-wide head defaults, rendered above the router outlet so any per-route
 * <Helmet> mounted deeper overrides them. Because the static tags in
 * index.html carry data-rh (so Helmet can replace instead of duplicate them),
 * this component is what guarantees every route still has exactly one
 * description, canonical, og:url and twitter card.
 */
export function RouteRobots() {
  const { pathname } = useLocation();
  const indexable =
    INDEXABLE.some((re) => re.test(pathname)) &&
    !FORCE_NOINDEX.some((re) => re.test(pathname));
  const url = `${SITE_URL}${pathname === "/" ? "/" : pathname.replace(/\/$/, "")}`;

  return (
    <Helmet>
      <title>{DEFAULT_TITLE}</title>
      <meta name="description" content={DEFAULT_DESC} />
      <link rel="canonical" href={url} />
      {indexable ? (
        <meta name="robots" content="index, follow" />
      ) : (
        <meta name="robots" content="noindex, follow" />
      )}

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Junto" />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={DEFAULT_TITLE} />
      <meta property="og:description" content={DEFAULT_DESC} />
      <meta property="og:image" content={DEFAULT_OG} />
      <meta property="og:image:secure_url" content={DEFAULT_OG} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Junto — AI group trip planner" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={DEFAULT_TITLE} />
      <meta name="twitter:description" content={DEFAULT_DESC} />
      <meta name="twitter:image" content={DEFAULT_OG} />
    </Helmet>
  );
}

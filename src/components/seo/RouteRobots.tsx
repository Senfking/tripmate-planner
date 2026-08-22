import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

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

export function RouteRobots() {
  const { pathname } = useLocation();
  const indexable =
    INDEXABLE.some((re) => re.test(pathname)) &&
    !FORCE_NOINDEX.some((re) => re.test(pathname));

  if (indexable) return null;

  return (
    <Helmet>
      <meta name="robots" content="noindex, follow" />
    </Helmet>
  );
}

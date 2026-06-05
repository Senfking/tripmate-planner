import { Link, useParams, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, ArrowUpRight, Check } from "lucide-react";
import { GUIDES, CATEGORIES, getGuide, guideUrl } from "@/data/guides";

const SITE = "https://junto.pro";

export default function GuidePlaceholder() {
  const { slug = "" } = useParams();
  const guide = getGuide(slug);

  if (!guide) return <Navigate to="/guides" replace />;
  // Live guides have their own dedicated component.
  if (guide.status === "live") return <Navigate to={guideUrl(guide.slug)} replace />;

  const URL = `${SITE}${guideUrl(guide.slug)}`;
  const related = GUIDES.filter((g) => g.slug !== guide.slug).slice(0, 3);

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#0B2E2C]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Helmet>
        <title>{guide.longTitle} — Junto Field Guide</title>
        <meta name="description" content={guide.description} />
        <link rel="canonical" href={URL} />
        <meta property="og:title" content={guide.longTitle} />
        <meta property="og:description" content={guide.description} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={URL} />
        <meta property="og:image" content={guide.image} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: guide.longTitle,
            description: guide.description,
            url: URL,
            image: guide.image,
            isPartOf: { "@type": "CollectionPage", url: `${SITE}/guides` },
          })}
        </script>
      </Helmet>

      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-[#FAF8F4]/85 backdrop-blur border-b border-[#0B2E2C]/10">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 h-14 flex items-center justify-between">
          <Link to="/guides" className="inline-flex items-center gap-2 text-[12px] font-mono tracking-[0.2em] uppercase text-[#0B2E2C]/65 hover:text-[#0B2E2C] transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            Field Guide
          </Link>
          <Link to="/" className="text-[15px] font-extrabold tracking-[0.32em] uppercase text-[#0B2E2C]">
            Junto
          </Link>
          <Link
            to="/ref"
            className="inline-flex items-center rounded-full px-4 py-1.5 text-[12px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #0D9488 0%, #14b8a6 50%, #0891b2 100%)" }}
          >
            Get started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-[1100px] mx-auto px-5 sm:px-10 pt-16 sm:pt-24 pb-12">
        <div className="flex items-center gap-3 mb-8">
          <span className="h-px w-10 bg-[#0D9488]" />
          <span className="font-mono text-[11px] font-bold tracking-[0.32em] uppercase text-[#0D9488]">
            {CATEGORIES[guide.category].label} · {guide.number}
          </span>
        </div>
        <h1
          className="font-medium tracking-[-0.035em] leading-[1.0] text-[#0B2E2C] max-w-[22ch]"
          style={{ fontSize: "clamp(36px, 6vw, 80px)" }}
        >
          {guide.title}
        </h1>
        <p className="mt-8 max-w-[58ch] text-[17px] sm:text-[19px] leading-[1.6] text-[#0B2E2C]/70">
          {guide.description}
        </p>
        <div className="mt-8 flex items-center gap-5 font-mono text-[11px] tracking-[0.2em] uppercase text-[#0B2E2C]/45">
          <span>{guide.readTime}</span>
          <span className="w-px h-3 bg-[#0B2E2C]/20" />
          <span className="text-[#0D9488]">In the works</span>
        </div>
      </section>

      {/* Cover image */}
      <section className="max-w-[1400px] mx-auto px-5 sm:px-10">
        <div className="relative overflow-hidden rounded-sm bg-black aspect-[16/7]">
          <img src={guide.image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" loading="eager" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        </div>
      </section>

      {/* Placeholder body */}
      <section className="max-w-[760px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
        <p className="text-[19px] sm:text-[22px] leading-[1.55] text-[#0B2E2C] font-light tracking-[-0.005em]">
          {guide.placeholder?.promise}
        </p>

        <div className="mt-14">
          <div className="flex items-center gap-3 mb-6">
            <span className="h-px w-8 bg-[#0D9488]" />
            <span className="font-mono text-[11px] tracking-[0.3em] uppercase text-[#0D9488]">
              What this guide will cover
            </span>
          </div>
          <ul className="border-t border-[#0B2E2C]/10">
            {guide.placeholder?.bullets.map((b, i) => (
              <li
                key={b}
                className="flex items-baseline gap-5 border-b border-[#0B2E2C]/10 py-5"
              >
                <span className="flex-none font-mono text-[12px] tracking-[0.1em] text-[#0D9488] tabular-nums pt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Check className="flex-none h-4 w-4 text-[#0D9488]/40 mt-1.5" strokeWidth={2.5} />
                <span className="text-[16px] sm:text-[18px] leading-[1.5] text-[#0B2E2C]">{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <div className="mt-16 p-8 sm:p-10 rounded-sm bg-white border border-[#0B2E2C]/10">
          <h2 className="text-[22px] sm:text-[26px] font-medium tracking-[-0.02em] leading-[1.2] text-[#0B2E2C]">
            Want this one when it drops?
          </h2>
          <p className="mt-3 text-[15px] leading-[1.6] text-[#0B2E2C]/65 max-w-[52ch]">
            Junto is the planning tool we wished existed while writing the Field Guide. Start a trip
            and we'll email you when this article goes live.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/trips/new"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #0D9488 0%, #14b8a6 50%, #0891b2 100%)" }}
            >
              Start a trip
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              to="/guides"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-[#0B2E2C] border border-[#0B2E2C]/15 hover:border-[#0D9488] hover:text-[#0D9488] transition-colors"
            >
              Back to the Field Guide
            </Link>
          </div>
        </div>
      </section>

      {/* Related */}
      <section className="bg-white border-t border-[#0B2E2C]/10">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 py-20">
          <div className="flex items-center gap-3 mb-8">
            <span className="h-px w-8 bg-[#0D9488]" />
            <span className="font-mono text-[11px] tracking-[0.3em] uppercase text-[#0D9488]">
              Keep reading
            </span>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {related.map((g) => (
              <li key={g.slug}>
                <Link to={guideUrl(g.slug)} className="group block">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-black mb-4">
                    <img src={g.image} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-85 group-hover:opacity-100 group-hover:scale-[1.03] transition-all duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                    <div className="absolute bottom-4 left-4 font-mono text-[10px] tracking-[0.25em] uppercase text-white/85">
                      {CATEGORIES[g.category].label} · {g.number}
                    </div>
                  </div>
                  <h3 className="text-[18px] font-medium tracking-[-0.015em] leading-[1.25] text-[#0B2E2C] group-hover:text-[#0D9488] transition-colors">
                    {g.title}
                  </h3>
                  <div className="mt-2 font-mono text-[10.5px] tracking-[0.2em] uppercase text-[#0B2E2C]/45">
                    {g.status === "live" ? g.readTime : "Coming soon"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

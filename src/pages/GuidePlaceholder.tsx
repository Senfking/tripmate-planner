import { useEffect, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, ArrowUpRight, Check } from "lucide-react";
import { CATEGORIES, getGuide, getRelatedGuides, guideUrl } from "@/data/guides";

const SITE = "https://junto.pro";
const GRADIENT = "linear-gradient(135deg, #0D9488 0%, #14b8a6 50%, #0891b2 100%)";

export default function GuidePlaceholder() {
  const { slug = "" } = useParams();
  const guide = getGuide(slug);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? Math.min(1, h.scrollTop / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [slug]);

  if (!guide) return <Navigate to="/guides" replace />;
  // Guide 001 has its own bespoke page; the route maps it before this component.
  // Any other guide without article content shouldn't render this template.
  if (!guide.article) return <Navigate to="/guides" replace />;

  const URL = `${SITE}${guideUrl(guide.slug)}`;
  const related = getRelatedGuides(guide.slug, 3);
  const { article } = guide;
  const accent = guide.heroAccent;
  const parts = guide.heroTitle.split(new RegExp(`\\b(${accent})\\b`));

  return (
    <div className="relative min-h-dvh bg-white text-[#0B2E2C] antialiased selection:bg-[#0D9488]/20">
      <Helmet>
        <title>{guide.longTitle} | Junto</title>
        <meta name="description" content={guide.description} />
        <link rel="canonical" href={URL} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={guide.longTitle} />
        <meta property="og:description" content={guide.description} />
        <meta property="og:url" content={URL} />
        <meta property="og:image" content={guide.image} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={guide.longTitle} />
        <meta name="twitter:description" content={guide.description} />
        <meta name="twitter:image" content={guide.image} />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: guide.longTitle,
            description: guide.description,
            url: URL,
            image: guide.image,
            datePublished: "2026-06-05",
            author: { "@type": "Organization", name: "Junto" },
            publisher: { "@type": "Organization", name: "Junto" },
            isPartOf: { "@type": "CollectionPage", url: `${SITE}/guides` },
          })}
        </script>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
              { "@type": "ListItem", position: 2, name: "Field Guide", item: `${SITE}/guides` },
              { "@type": "ListItem", position: 3, name: guide.title, item: URL },
            ],
          })}
        </script>
      </Helmet>

      {/* Reading progress */}
      <div className="fixed top-0 left-0 right-0 h-[2px] z-50 bg-transparent pointer-events-none">
        <div
          className="h-full transition-[width] duration-150 ease-out"
          style={{ width: `${progress * 100}%`, background: GRADIENT }}
        />
      </div>

      {/* Header overlay */}
      <div
        className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-5 sm:px-10 pointer-events-none"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 18px)",
          paddingBottom: 24,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0) 100%)",
        }}
      >
        <Link
          to="/guides"
          className="pointer-events-auto inline-flex items-center gap-1.5 text-[11px] sm:text-[12px] font-mono tracking-[0.22em] uppercase text-white/75 hover:text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Field Guide
        </Link>
        <Link
          to="/"
          aria-label="Junto home"
          className="pointer-events-auto absolute left-1/2 -translate-x-1/2 text-[19px] font-extrabold tracking-[0.32em] uppercase text-white/80 hover:text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-colors"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 18px)" }}
        >
          Junto
        </Link>
        <Link
          to="/ref"
          className="group pointer-events-auto relative inline-flex items-center rounded-full px-3.5 py-1.5 text-[12px] sm:px-5 sm:py-2 sm:text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(13,148,136,0.65)] transition-transform hover:scale-[1.03] active:scale-95"
          style={{ background: GRADIENT }}
        >
          <span className="absolute inset-0 rounded-full bg-gradient-to-r from-white/20 via-transparent to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <span className="relative">Get started</span>
        </Link>
      </div>

      {/* HERO */}
      <header className="relative w-full bg-black overflow-hidden">
        <div className="relative w-full h-[88vh] min-h-[640px] max-h-[920px]">
          <img
            src={guide.image}
            alt={guide.imageAlt}
            className="absolute inset-0 w-full h-full object-cover opacity-90"
            loading="eager"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/85" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent" />

          <div className="absolute inset-0 flex flex-col justify-end">
            <div className="max-w-[1400px] mx-auto w-full px-5 sm:px-10 pb-16 sm:pb-24">
              <div className="flex items-center gap-3 mb-8">
                <span className="h-px w-10 bg-[#2DD4BF]" />
                <span className="text-[11px] font-bold tracking-[0.32em] uppercase text-[#2DD4BF]">
                  Field Guide · {guide.number}
                </span>
              </div>
              <h1
                className="font-medium tracking-[-0.04em] leading-[0.95] text-white max-w-[20ch]"
                style={{ fontSize: "clamp(40px, 7.4vw, 104px)" }}
              >
                {parts.map((part, i) =>
                  part === accent ? (
                    <span key={i} className="italic font-light text-[#2DD4BF]">
                      {part}
                    </span>
                  ) : (
                    <span key={i}>{part}</span>
                  )
                )}
              </h1>
              <div className="mt-10 flex flex-wrap items-end justify-between gap-6">
                <p className="text-[16px] sm:text-[18px] leading-[1.55] text-white/75 max-w-[54ch]">
                  {guide.description}
                </p>
                <div className="flex items-center gap-6 text-[11px] font-mono tracking-[0.18em] uppercase text-white/55">
                  <span>{CATEGORIES[guide.category].label}</span>
                  <span className="w-px h-3 bg-white/20" />
                  <span>{guide.readTime}</span>
                  <span className="w-px h-3 bg-white/20" />
                  <span>By Junto</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* STANDFIRST */}
      <section className="bg-white">
        <div className="max-w-[720px] mx-auto px-5 sm:px-8 pt-24 sm:pt-32 pb-12">
          <p className="text-[20px] sm:text-[24px] leading-[1.5] text-[#0B2E2C] font-light tracking-[-0.005em] first-letter:float-left first-letter:mr-3 first-letter:text-[64px] first-letter:sm:text-[84px] first-letter:font-medium first-letter:leading-[0.85] first-letter:text-[#0D9488] first-letter:pt-2">
            {article.standfirst}
          </p>
        </div>
      </section>

      {/* PULL QUOTE */}
      <section className="bg-[#0B2E2C] text-white">
        <div className="max-w-[1100px] mx-auto px-5 sm:px-10 py-24 sm:py-32 relative">
          <span
            aria-hidden
            className="absolute top-10 left-5 sm:left-10 text-[140px] sm:text-[200px] leading-none font-serif text-[#2DD4BF]/15 select-none"
          >
            "
          </span>
          <blockquote
            className="relative font-medium tracking-[-0.025em] leading-[1.1] max-w-[24ch]"
            style={{ fontSize: "clamp(28px, 4vw, 52px)" }}
          >
            {article.pullQuote}
          </blockquote>
        </div>
      </section>

      {/* CHAPTERS */}
      <section className="bg-white">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 py-24 sm:py-32 grid grid-cols-12 gap-x-8">
          <aside className="col-span-12 md:col-span-3">
            <div className="md:sticky md:top-24">
              <div className="flex items-center gap-3 mb-5">
                <span className="h-px w-8 bg-[#0D9488]" />
                <span className="font-mono text-[11px] tracking-[0.3em] uppercase text-[#0D9488]">
                  Contents
                </span>
              </div>
              <ol className="space-y-3">
                {article.chapters.map((c, i) => (
                  <li key={c.title} className="flex items-baseline gap-3">
                    <span className="flex-none font-mono text-[11px] tracking-[0.1em] tabular-nums text-[#0B2E2C]/40 pt-0.5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <a
                      href={`#ch-${i + 1}`}
                      className="text-[14px] leading-[1.4] text-[#0B2E2C]/70 hover:text-[#0D9488] transition-colors"
                    >
                      {c.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </aside>

          <div className="col-span-12 md:col-span-9 mt-12 md:mt-0">
            <ol className="border-t border-[#0B2E2C]/10">
              {article.chapters.map((c, i) => (
                <li
                  key={c.title}
                  id={`ch-${i + 1}`}
                  className="grid grid-cols-12 gap-x-6 py-12 sm:py-16 border-b border-[#0B2E2C]/10 scroll-mt-24"
                >
                  <div className="col-span-12 sm:col-span-1">
                    <span className="block font-mono text-[12px] tracking-[0.1em] text-[#0D9488] tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="col-span-12 sm:col-span-11">
                    <h2 className="text-[26px] sm:text-[34px] font-medium tracking-[-0.022em] leading-[1.1] text-[#0B2E2C]">
                      {c.title}
                    </h2>
                    <div className="mt-6 space-y-5 max-w-[64ch]">
                      {c.body.split("\n\n").map((p, idx) => (
                        <p
                          key={idx}
                          className="text-[16px] sm:text-[17px] leading-[1.7] text-[#0B2E2C]/80"
                        >
                          {p}
                        </p>
                      ))}
                    </div>

                    {c.list && (
                      <ul className="mt-7 max-w-[64ch] border-t border-[#0B2E2C]/10">
                        {c.list.items.map((item, idx) => (
                          <li
                            key={idx}
                            className="flex items-baseline gap-5 border-b border-[#0B2E2C]/10 py-4"
                          >
                            {c.list!.kind === "ordered" ? (
                              <span className="flex-none font-mono text-[12px] tracking-[0.1em] text-[#0D9488] tabular-nums pt-0.5 w-6">
                                {String(idx + 1).padStart(2, "0")}
                              </span>
                            ) : (
                              <Check
                                className="flex-none h-4 w-4 text-[#0D9488] mt-1.5"
                                strokeWidth={2.5}
                              />
                            )}
                            <span className="text-[15px] sm:text-[16px] leading-[1.6] text-[#0B2E2C]/85">
                              {item}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#F8FAF9] border-t border-[#0B2E2C]/10">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 py-24 sm:py-28 grid grid-cols-12 gap-x-8">
          <div className="col-span-12 md:col-span-8">
            <div className="flex items-center gap-3 mb-5">
              <span className="h-px w-8 bg-[#0D9488]" />
              <span className="font-mono text-[11px] tracking-[0.3em] uppercase text-[#0D9488]">
                The point
              </span>
            </div>
            <h2
              className="font-medium tracking-[-0.03em] leading-[1.02] text-[#0B2E2C] max-w-[18ch]"
              style={{ fontSize: "clamp(32px, 4.6vw, 60px)" }}
            >
              The tool we wrote this <span className="italic font-light text-[#0D9488]">for</span>.
            </h2>
            <p className="mt-6 text-[16px] sm:text-[17px] leading-[1.65] text-[#0B2E2C]/70 max-w-[52ch]">
              {article.closing}
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                to="/trips/new"
                className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(13,148,136,0.6)] transition-transform hover:scale-[1.02] active:scale-95"
                style={{ background: GRADIENT }}
              >
                Start a trip in Junto
                <ArrowUpRight className="h-4 w-4 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                to="/guides"
                className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold text-[#0B2E2C] border border-[#0B2E2C]/15 hover:border-[#0D9488] hover:text-[#0D9488] transition-colors"
              >
                Back to the Field Guide
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Related */}
      <section className="bg-white border-t border-[#0B2E2C]/10">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 py-20 sm:py-24">
          <div className="flex items-end justify-between gap-6 mb-10">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="h-px w-8 bg-[#0D9488]" />
                <span className="font-mono text-[11px] tracking-[0.3em] uppercase text-[#0D9488]">
                  More from the Field Guide
                </span>
              </div>
              <h3
                className="font-medium tracking-[-0.025em] leading-[1.05] text-[#0B2E2C] max-w-[22ch]"
                style={{ fontSize: "clamp(26px, 3.6vw, 42px)" }}
              >
                Keep the planning <span className="italic font-light text-[#0D9488]">honest</span>.
              </h3>
            </div>
            <Link
              to="/guides"
              className="hidden sm:inline-flex items-center gap-2 text-[13px] font-semibold text-[#0B2E2C] border-b-2 border-[#0D9488] pb-1 hover:text-[#0D9488] transition-colors"
            >
              All guides
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {related.map((g) => (
              <li key={g.slug}>
                <Link to={guideUrl(g.slug)} className="group block">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-black mb-4">
                    <img
                      src={g.image}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover opacity-85 group-hover:opacity-100 group-hover:scale-[1.03] transition-all duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                    <div className="absolute bottom-4 left-4 font-mono text-[10px] tracking-[0.25em] uppercase text-white/85">
                      {CATEGORIES[g.category].label} · {g.number}
                    </div>
                  </div>
                  <h4 className="text-[18px] font-medium tracking-[-0.015em] leading-[1.25] text-[#0B2E2C] group-hover:text-[#0D9488] transition-colors">
                    {g.title}
                  </h4>
                  <div className="mt-2 font-mono text-[10.5px] tracking-[0.2em] uppercase text-[#0B2E2C]/45">
                    {g.readTime}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-[#0B2E2C]/10">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 py-12 flex flex-wrap items-center justify-between gap-4 font-mono text-[11px] tracking-[0.18em] uppercase text-[#0B2E2C]/40">
          <span>Junto Field Guide · {guide.number}</span>
          <span>Published {guide.publishedAt}</span>
          <Link to="/" className="hover:text-[#0D9488] transition-colors">
            junto.pro →
          </Link>
        </div>
      </footer>
    </div>
  );
}

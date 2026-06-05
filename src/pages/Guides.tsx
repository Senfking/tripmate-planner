import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowUpRight } from "lucide-react";
import { GUIDES, CATEGORIES, guideUrl, type GuideCategory } from "@/data/guides";

const SITE = "https://junto.pro";
const URL = `${SITE}/guides`;
const TITLE = "The Junto Field Guide — Honest writing about group travel";
const DESCRIPTION =
  "A growing library of plain-spoken guides for planning trips with friends — splitting money, picking destinations, packing, and the apps that survive contact with a real group.";

const ORDER: GuideCategory[] = ["planning", "money", "on-the-road"];

export default function Guides() {
  const featured = GUIDES.find((g) => g.status === "live") ?? GUIDES[0];

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#0B2E2C]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Helmet>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href={URL} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={URL} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: TITLE,
            description: DESCRIPTION,
            url: URL,
            hasPart: GUIDES.map((g) => ({
              "@type": "Article",
              headline: g.longTitle,
              url: `${SITE}${guideUrl(g.slug)}`,
            })),
          })}
        </script>
      </Helmet>

      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-[#FAF8F4]/85 backdrop-blur border-b border-[#0B2E2C]/10">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 h-14 flex items-center justify-between">
          <Link to="/" className="text-[15px] font-extrabold tracking-[0.32em] uppercase text-[#0B2E2C]">
            Junto
          </Link>
          <nav className="flex items-center gap-6 text-[13px]">
            <Link to="/templates" className="text-[#0B2E2C]/65 hover:text-[#0B2E2C] transition-colors">
              Templates
            </Link>
            <span className="font-medium text-[#0B2E2C]">Field Guide</span>
            <Link
              to="/ref"
              className="inline-flex items-center rounded-full px-4 py-1.5 text-[12px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #0D9488 0%, #14b8a6 50%, #0891b2 100%)" }}
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-[1400px] mx-auto px-5 sm:px-10 pt-20 sm:pt-28 pb-16 sm:pb-20">
        <div className="flex items-center gap-3 mb-8">
          <span className="h-px w-10 bg-[#0D9488]" />
          <span className="font-mono text-[11px] font-bold tracking-[0.32em] uppercase text-[#0D9488]">
            The Field Guide
          </span>
        </div>
        <h1
          className="font-medium tracking-[-0.04em] leading-[0.98] text-[#0B2E2C] max-w-[20ch]"
          style={{ fontSize: "clamp(40px, 7vw, 96px)" }}
        >
          Honest writing about <span className="italic font-light text-[#0D9488]">group travel</span>.
        </h1>
        <p className="mt-8 max-w-[58ch] text-[17px] sm:text-[19px] leading-[1.6] text-[#0B2E2C]/70">
          The stuff your group chat keeps re-litigating — budgets, destinations, who books what, who
          owes who, and the gear nobody remembered. Built from real trips. Updated when we learn
          something new.
        </p>
      </section>

      {/* Featured */}
      {featured && (
        <section className="max-w-[1400px] mx-auto px-5 sm:px-10 pb-20">
          <Link
            to={guideUrl(featured.slug)}
            className="group block relative overflow-hidden rounded-sm bg-black"
          >
            <div className="relative aspect-[16/8] sm:aspect-[16/6]">
              <img
                src={featured.image}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-85 group-hover:opacity-95 group-hover:scale-[1.02] transition-all duration-700"
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/20" />
              <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-12">
                <div className="flex items-center gap-3 mb-4">
                  <span className="h-px w-8 bg-[#2DD4BF]" />
                  <span className="font-mono text-[10px] sm:text-[11px] font-bold tracking-[0.32em] uppercase text-[#2DD4BF]">
                    Featured · {featured.number}
                  </span>
                </div>
                <h2
                  className="font-medium tracking-[-0.03em] leading-[1.02] text-white max-w-[22ch]"
                  style={{ fontSize: "clamp(26px, 4.2vw, 56px)" }}
                >
                  {featured.title}
                </h2>
                <div className="mt-5 flex items-center gap-5 font-mono text-[11px] tracking-[0.18em] uppercase text-white/65">
                  <span>{CATEGORIES[featured.category].label}</span>
                  <span className="w-px h-3 bg-white/25" />
                  <span>{featured.readTime}</span>
                  <span className="hidden sm:inline w-px h-3 bg-white/25" />
                  <span className="hidden sm:inline-flex items-center gap-1 text-white group-hover:text-[#2DD4BF] transition-colors">
                    Read <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* Categories */}
      {ORDER.map((cat) => {
        const items = GUIDES.filter((g) => g.category === cat);
        if (!items.length) return null;
        return (
          <section key={cat} className="border-t border-[#0B2E2C]/10">
            <div className="max-w-[1400px] mx-auto px-5 sm:px-10 py-16 sm:py-24 grid grid-cols-12 gap-x-8">
              <div className="col-span-12 md:col-span-4">
                <div className="md:sticky md:top-24">
                  <div className="flex items-center gap-3 mb-5">
                    <span className="h-px w-8 bg-[#0D9488]" />
                    <span className="font-mono text-[11px] tracking-[0.3em] uppercase text-[#0D9488]">
                      {CATEGORIES[cat].label}
                    </span>
                  </div>
                  <h3
                    className="font-medium tracking-[-0.03em] leading-[1.05] text-[#0B2E2C] max-w-[16ch]"
                    style={{ fontSize: "clamp(28px, 3.6vw, 44px)" }}
                  >
                    {CATEGORIES[cat].blurb}
                  </h3>
                </div>
              </div>

              <div className="col-span-12 md:col-span-8 mt-10 md:mt-0">
                <ul className="border-t border-[#0B2E2C]/10">
                  {items.map((g) => (
                    <li key={g.slug} className="border-b border-[#0B2E2C]/10">
                      <Link
                        to={guideUrl(g.slug)}
                        className="group flex items-start gap-5 sm:gap-8 py-7 sm:py-9 px-2 -mx-2 rounded-sm hover:bg-white transition-colors"
                      >
                        <span className="flex-none font-mono text-[12px] tracking-[0.1em] text-[#0D9488] tabular-nums pt-2">
                          {g.number}
                        </span>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[20px] sm:text-[26px] font-medium tracking-[-0.02em] leading-[1.18] text-[#0B2E2C] group-hover:text-[#0D9488] transition-colors">
                            {g.title}
                          </h4>
                          <p className="mt-3 text-[14px] sm:text-[15px] leading-[1.6] text-[#0B2E2C]/65 max-w-[62ch]">
                            {g.description}
                          </p>
                          <div className="mt-4 flex items-center gap-4 font-mono text-[10.5px] tracking-[0.2em] uppercase text-[#0B2E2C]/45">
                            <span>{g.readTime}</span>
                            {g.status === "coming-soon" ? (
                              <>
                                <span className="w-px h-3 bg-[#0B2E2C]/20" />
                                <span className="text-[#0D9488]">Coming soon</span>
                              </>
                            ) : (
                              <>
                                <span className="w-px h-3 bg-[#0B2E2C]/20" />
                                <span>{g.publishedAt}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <ArrowUpRight className="hidden sm:block flex-none h-5 w-5 text-[#0B2E2C]/30 group-hover:text-[#0D9488] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all mt-2" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        );
      })}

      {/* Footer */}
      <footer className="border-t border-[#0B2E2C]/10 bg-white">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 py-16 flex flex-wrap items-center justify-between gap-6 font-mono text-[11px] tracking-[0.18em] uppercase text-[#0B2E2C]/45">
          <Link to="/" className="hover:text-[#0D9488] transition-colors">← junto.pro</Link>
          <span>The Junto Field Guide</span>
          <Link to="/templates" className="hover:text-[#0D9488] transition-colors">Trip templates →</Link>
        </div>
      </footer>
    </div>
  );
}

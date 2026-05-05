import { ArrowRight } from "lucide-react";

type Props = {
  onPrimary: () => void;
  onBrowse: () => void;
};

// Dark teal gradient CTA mirroring the budget-card visual family used on
// trip detail pages. Full-bleed, centered content, ambient glow on button.
export function FinalCTA({ onPrimary, onBrowse }: Props) {
  return (
    <section
      className="relative w-full overflow-hidden isolate"
      style={{
        background:
          "linear-gradient(135deg, #0D9488 0%, #0b7a72 45%, #064E4E 100%)",
      }}
    >
      {/* Dotted grid texture */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      {/* Soft top-left glow */}
      <div
        aria-hidden
        className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(45,212,191,0.35) 0%, rgba(45,212,191,0) 70%)",
        }}
      />
      {/* Soft bottom-right shadow vignette */}
      <div
        aria-hidden
        className="absolute -bottom-32 -right-24 h-[420px] w-[420px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 70%)",
        }}
      />

      <div className="relative mx-auto max-w-3xl px-6 sm:px-8 py-24 sm:py-32 lg:py-40 text-center">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.22em] text-[#a7f3d0] mb-5">
          Ready?
        </p>
        <h2 className="text-[36px] sm:text-[48px] lg:text-[60px] leading-[1.05] tracking-tight font-bold text-white mb-5">
          Your next trip starts here.
        </h2>
        <p className="text-[16px] sm:text-[17px] leading-relaxed text-white/70 max-w-md mx-auto mb-10 font-sans">
          Plan smarter. Travel better. No spreadsheets required.
        </p>

        <div className="relative inline-block">
          {/* Ambient glow */}
          <div
            aria-hidden
            className="absolute inset-0 -m-6 rounded-full blur-2xl opacity-60 pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.45) 0%, transparent 70%)" }}
          />
          <button
            onClick={onPrimary}
            className="relative inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-[16px] font-semibold text-[#064E4E] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.3)] transition-transform hover:scale-[1.02] active:scale-[0.99]"
          >
            Start planning
            <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="mt-8">
          <button
            onClick={onBrowse}
            className="text-[14px] text-white/60 hover:text-white/90 transition-colors font-medium"
          >
            Or browse trip ideas →
          </button>
        </div>
      </div>
    </section>
  );
}

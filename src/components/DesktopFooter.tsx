import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function DesktopFooter() {
  const { profile } = useAuth();

  const handleShare = () => {
    const name = profile?.display_name || "A friend";
    const code = profile?.referral_code || "";
    const refUrl = `https://junto.pro/ref${code ? `?ref=${code}` : ""}`;
    const msg = `✈️ ${name} thinks you'd love Junto.\nGroup trips are chaos - 200-message threads, spreadsheets, nobody knowing who booked what.\nJunto fixes that.\nTry it free → ${refUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <footer className="hidden md:flex items-center justify-between w-full h-12 px-8 mt-auto border-t border-[#E5E7EB] bg-white shrink-0 flex-none">
      {/* Left */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>© 2026 Junto</span>
        <span>·</span>
        <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
        <span>·</span>
        <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
      </div>

      {/* Center */}
      <a
        href="https://junto.pro/ref"
        className="text-xs text-muted-foreground hover:text-[#0D9488] transition-colors"
      >
        Plan your next trip →
      </a>

      {/* Right */}
      <button
        onClick={handleShare}
        className="border border-[#E5E7EB] rounded-[20px] px-3 py-1 text-xs font-medium text-[#0D9488] hover:bg-[#F0FDFA] transition-colors"
      >
        ✈️ Share Junto
      </button>
    </footer>
  );
}

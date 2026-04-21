import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { friendlyError } from "@/lib/friendlyError";
import { lovable } from "@/integrations/lovable/index";
import { trackEvent } from "@/lib/analytics";
import { Loader2 } from "lucide-react";
import posterImage from "@/assets/video-poster.png";


/* ── Verified working video sources (diverse scenery) ── */
const VIDEOS = [
  "https://videos.pexels.com/video-files/1093662/1093662-hd_1920_1080_30fps.mp4",
  "https://videos.pexels.com/video-files/2519660/2519660-hd_1920_1080_24fps.mp4",
];

const STATEMENTS = [
  { problem: "Planning a group trip is chaos.", solution: "One shared space for the whole trip. Itinerary, decisions, everything." },
  { problem: "Splitting costs always gets awkward.", solution: "Log expenses, scan receipts with Junto AI, and settle up in any currency." },
  { problem: "Group chats, spreadsheets, random screenshots.", solution: "No more digging through 200 messages. Flights, hotels, visas, all in one place." },
  { problem: "Making decisions in a group is painful.", solution: "Vote on options, lock in the plan, and actually move forward." },
];

/* ── Video slideshow - only mount active + next to save resources ── */
function VideoSlideshow({ activeIndex }: { activeIndex: number }) {
  const prevIndex = useRef(activeIndex);
  const [visible, setVisible] = useState<Set<number>>(new Set([activeIndex]));

  useEffect(() => {
    // Keep both previous and current visible during crossfade
    setVisible(new Set([prevIndex.current, activeIndex]));
    const timer = setTimeout(() => {
      prevIndex.current = activeIndex;
      setVisible(new Set([activeIndex]));
    }, 1600);
    return () => clearTimeout(timer);
  }, [activeIndex]);

  return (
    <>
      {VIDEOS.map((src, i) => {
        if (!visible.has(i)) return null;
        return (
          <AutoPlayVideo
            key={src}
            src={src}
            active={i === activeIndex}
          />
        );
      })}
    </>
  );
}

function AutoPlayVideo({ src, active }: { src: string; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    v.defaultMuted = true;
    v.muted = true;
    v.playsInline = true;
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "true");

    const attemptPlay = async () => {
      try {
        await v.play();
      } catch {
        setReady(false);
      }
    };

    const handleCanPlay = () => {
      setReady(true);
      void attemptPlay();
    };

    v.addEventListener("canplay", handleCanPlay);
    void attemptPlay();

    return () => {
      v.removeEventListener("canplay", handleCanPlay);
    };
  }, [src]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    if (active) {
      void v.play().catch(() => setReady(false));
    } else {
      v.pause();
    }
  }, [active]);

  return (
    <div
      className="absolute inset-0"
      style={{
        opacity: active ? 1 : 0,
        transition: "opacity 1.5s ease-in-out",
        WebkitTransform: "translateZ(0)",
        transform: "translateZ(0)",
        backgroundImage: ready ? undefined : `url(${posterImage})`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <video
        ref={ref}
        autoPlay
        loop
        muted
        playsInline
        tabIndex={-1}
        aria-hidden="true"
        disablePictureInPicture
        controls={false}
        controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
        preload={active ? "auto" : "metadata"}
        poster={posterImage}
        className="ref-hero-video absolute inset-0 h-full w-full object-cover"
        style={{
          opacity: ready ? 1 : 0,
          pointerEvents: "none",
          WebkitTransform: "translateZ(0)",
          transform: "translateZ(0)",
        }}
        src={src}
        onContextMenu={(e) => e.preventDefault()}
        onLoadedData={() => setReady(true)}
        onPlaying={() => setReady(true)}
        onPause={() => {
          if (active) {
            const v = ref.current;
            if (v) void v.play().catch(() => setReady(false));
          }
        }}
        onError={(e) => {
          setReady(false);
          (e.currentTarget as HTMLVideoElement).style.display = "none";
        }}
      />
    </div>
  );
}

/* ── Google icon SVG ── */
function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function ReferralLanding() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = params.get("ref");
  const redirectAfterAuth = params.get("redirect");
  const referralCode = useRef(code || "");
  const [referrer, setReferrer] = useState<{ display_name: string | null } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [statementIndex, setStatementIndex] = useState(0);
  const [statementVisible, setStatementVisible] = useState(true);
  const [formOpen, setFormOpen] = useState(!!code);

  // Auth state
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleForgotPassword = async () => {
    setError(null);
    setInfo(null);
    if (!email) {
      setError("Enter your email above, then tap Forgot password.");
      return;
    }
    setResetLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);
    if (err) {
      setError(friendlyError(err.message));
    } else {
      setInfo(`We sent a reset link to ${email}. Check your inbox.`);
    }
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && user) {
      navigate(redirectAfterAuth || "/app/trips", { replace: true });
    }
  }, [authLoading, user, navigate, redirectAfterAuth]);

  // Store referral code
  useEffect(() => {
    if (code) {
      localStorage.setItem("junto_referral_code", code);
    }
  }, [code]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    trackEvent("landing_page_view", {
      referral_code: code || null,
      utm_source: sp.get("utm_source"),
      utm_medium: sp.get("utm_medium"),
      utm_campaign: sp.get("utm_campaign"),
    });
    if (!code) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("referral_code", code)
        .maybeSingle();
      if (data) setReferrer(data);
    })();
  }, [code]);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % VIDEOS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setStatementVisible(false);
      setTimeout(() => {
        setStatementIndex((i) => (i + 1) % STATEMENTS.length);
        setStatementVisible(true);
      }, 400);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    const callbackUrl = `${window.location.origin}/auth/callback${redirectAfterAuth ? `?redirect=${encodeURIComponent(redirectAfterAuth)}` : ""}`;
    const { error: err } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: callbackUrl,
    });
    setGoogleLoading(false);
    if (err) setError(friendlyError(String(err)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === "signin") {
      const { error: err } = await signIn(email, password);
      setLoading(false);
      if (err) {
        setError(friendlyError(err.message));
      } else {
        navigate(redirectAfterAuth || "/app/trips", { replace: true });
      }
    } else {
      const { error: err, data } = await signUp(email, password, displayName);
      setLoading(false);
      if (err) {
        setError(friendlyError(err.message));
      } else {
        if (referralCode.current && data?.user?.id) {
          const { data: referrerId } = await supabase
            .rpc("resolve_referral_code", { _code: referralCode.current });
          if (referrerId) {
            await supabase
              .from("profiles")
              .update({ referred_by: referrerId })
              .eq("id", data.user.id);
          }
        }
        navigate(redirectAfterAuth || "/app/trips", { replace: true });
      }
    }
  };

  return (
    <div className="bg-black" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
      {/* All 5 videos stacked */}
      <VideoSlideshow activeIndex={activeIndex} />

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0.3) 55%, rgba(0,0,0,0.85) 78%, rgba(0,0,0,0.96) 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-[2] flex flex-col min-h-full">
        {/* Wordmark with gradient backing */}
        <div
          className="text-center shrink-0 relative z-[1]"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 18px)",
            paddingBottom: 24,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0) 100%)",
          }}
        >
          <span className="text-[19px] font-extrabold tracking-[0.32em] uppercase text-white/80">
            Junto
          </span>
        </div>

        {/* Let the video breathe */}
        <div className="flex-1" />

        {/* Bottom content */}
        <div
          className="px-6 shrink-0 max-w-[480px] mx-auto w-full text-center"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
        >
          {/* Referrer pill */}
          {referrer?.display_name && (
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] text-white/80 backdrop-blur-md mb-4 mx-auto"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <span
                className="flex items-center justify-center rounded-full text-[10px] font-bold text-white shrink-0"
                style={{ width: 22, height: 22, background: "#0D9488" }}
              >
                {referrer.display_name.charAt(0).toUpperCase()}
              </span>
              {referrer.display_name} invited you
            </div>
          )}

          {/* Headline */}
          <h1
            className="text-white font-bold"
            style={{ fontSize: 34, lineHeight: 1.08, letterSpacing: "-0.02em" }}
          >
            Plan trips
            <br />
            together.
          </h1>

          {/* Subline */}
          <p
            className="mt-2"
            style={{
              fontSize: 15,
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.75)",
              textShadow: "0 1px 8px rgba(0,0,0,0.5)",
            }}
          >
            Ditch the group chat chaos. Plan, split & decide, all in one place.
          </p>

          {/* Rotating statement panel */}
          <div
            className="relative mt-5"
            style={{
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 16,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              WebkitTransform: 'translateZ(0)',
              transform: 'translateZ(0)',
              isolation: 'isolate',
            }}
          >
            <div aria-hidden="true" className="pointer-events-none invisible grid px-5 py-5">
              {STATEMENTS.map((statement) => (
                <div key={statement.problem} className="[grid-area:1/1]">
                  <p className="text-white font-bold" style={{ fontSize: 16, lineHeight: 1.3 }}>
                    {statement.problem}
                  </p>
                  <p className="mt-2 font-medium" style={{ fontSize: 14, color: "#0D9488" }}>
                    {statement.solution}
                  </p>
                </div>
              ))}
            </div>

            <div className="absolute inset-0 flex flex-col justify-center px-5 py-5">
              <div style={{ position: 'relative', zIndex: 1, WebkitTransform: 'translateZ(0)', opacity: statementVisible ? 1 : 0, transition: "opacity 0.4s ease-in-out" }}>
                <p className="text-white font-bold" style={{ fontSize: 16, lineHeight: 1.3 }}>
                  {STATEMENTS[statementIndex].problem}
                </p>
                <p className="mt-2 font-medium" style={{ fontSize: 14, color: "#0D9488" }}>
                  {STATEMENTS[statementIndex].solution}
                </p>
              </div>
            </div>
          </div>

          {/* Statement dots */}
          <div className="flex items-center justify-center mt-3" style={{ gap: 6 }}>
            {STATEMENTS.map((_, i) => (
              <span
                key={i}
                className="transition-all duration-300"
                style={{
                  width: i === statementIndex ? 20 : 4,
                  height: 4,
                  borderRadius: i === statementIndex ? 2 : "50%",
                  background: i === statementIndex ? "white" : "rgba(255,255,255,0.3)",
                }}
              />
            ))}
          </div>

          {/* ── CTA / Auth section ── */}
          {!formOpen && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => {
                  trackEvent("get_started_click", { referral_code: code || null });
                  setFormOpen(true);
                }}
                className="w-full flex items-center justify-center text-white font-semibold rounded-2xl active:scale-[0.97] transition-transform"
                style={{
                  height: 52,
                  fontSize: 16,
                  background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)",
                  boxShadow: "0 4px 24px rgba(13,148,136,0.35)",
                }}
              >
                Get Started
              </button>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateRows: formOpen ? "1fr" : "0fr",
              opacity: formOpen ? 1 : 0,
              transition: "grid-template-rows 0.4s ease-out, opacity 0.35s ease-out",
            }}
          >
            <div style={{ overflow: "hidden" }}>
              <div className="mt-6 space-y-4">
                {/* Error message */}
                {error && (
                  <p
                    className="rounded-xl px-3 py-2 text-sm text-left"
                    style={{ background: "rgba(220,38,38,0.15)", color: "#fca5a5" }}
                  >
                    {error}
                  </p>
                )}
                {info && (
                  <p
                    className="rounded-xl px-3 py-2 text-sm text-left"
                    style={{ background: "rgba(13,148,136,0.18)", color: "#5eead4" }}
                  >
                    {info}
                  </p>
                )}

                {/* Google OAuth */}
                <button
                  type="button"
                  disabled={googleLoading}
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-2 font-medium rounded-2xl active:scale-[0.97] transition-transform"
                  style={{
                    height: 52,
                    fontSize: 15,
                    background: "rgba(255,255,255,0.95)",
                    color: "#1f1f1f",
                  }}
                >
                  {googleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GoogleIcon />
                  )}
                  Continue with Google
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.15)" }} />
                  <span className="text-[12px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>or</span>
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.15)" }} />
                </div>

                {/* Email/password form */}
                <form onSubmit={handleSubmit} className="space-y-3">
                  {mode === "signup" && (
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Display name"
                      className="w-full rounded-xl px-4 text-white placeholder:text-white/40 outline-none focus:ring-1 focus:ring-white/30"
                      style={{
                        height: 48,
                        fontSize: 15,
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.12)",
                      }}
                    />
                  )}
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full rounded-xl px-4 text-white placeholder:text-white/40 outline-none focus:ring-1 focus:ring-white/30"
                    style={{
                      height: 48,
                      fontSize: 15,
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.12)",
                    }}
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full rounded-xl px-4 text-white placeholder:text-white/40 outline-none focus:ring-1 focus:ring-white/30"
                    style={{
                      height: 48,
                      fontSize: 15,
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.12)",
                    }}
                  />
                  {mode === "signin" && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        disabled={resetLoading}
                        className="text-[13px] underline underline-offset-2 disabled:opacity-50"
                        style={{ color: "rgba(255,255,255,0.55)" }}
                      >
                        {resetLoading ? "Sending…" : "Forgot password?"}
                      </button>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 text-white font-semibold rounded-2xl active:scale-[0.97] transition-transform"
                    style={{
                      height: 52,
                      fontSize: 16,
                      background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)",
                      boxShadow: "0 4px 24px rgba(13,148,136,0.35)",
                    }}
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {mode === "signup" ? "Create account" : "Sign in"}
                  </button>
                </form>

                {/* Toggle mode */}
                <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {mode === "signup" ? (
                    <>
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => { setMode("signin"); setError(null); }}
                        className="underline underline-offset-2"
                        style={{ color: "rgba(255,255,255,0.55)" }}
                      >
                        Sign in
                      </button>
                    </>
                  ) : (
                    <>
                      Don't have an account?{" "}
                      <button
                        type="button"
                        onClick={() => { setMode("signup"); setError(null); }}
                        className="underline underline-offset-2"
                        style={{ color: "rgba(255,255,255,0.55)" }}
                      >
                        Create account
                      </button>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

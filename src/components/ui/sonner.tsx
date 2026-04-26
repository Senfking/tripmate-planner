import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const IOS_STANDALONE_TOP_FLOOR_PX = 60;
const VISUAL_GUTTER_PX = 16;
const SAFE_BOTTOM_CSS = "calc(env(safe-area-inset-bottom, 0px) + 16px)";

type ProbeReading = { measured: number; envValue: string };

function measureSafeAreaTop(): ProbeReading {
  if (typeof document === "undefined") return { measured: 0, envValue: "" };
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:env(safe-area-inset-top,0px);left:0;width:1px;height:1px;visibility:hidden;pointer-events:none;";
  document.body.appendChild(probe);
  const measured = probe.getBoundingClientRect().top;
  const envValue = getComputedStyle(probe).top;
  document.body.removeChild(probe);
  return { measured, envValue };
}

function isIosStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneMq = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const legacyStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isIos = /iPhone|iPad|iPod/.test(window.navigator.userAgent);
  return (standaloneMq || legacyStandalone) && isIos;
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const [topOffsetPx, setTopOffsetPx] = useState<number>(0);

  useEffect(() => {
    const recompute = () => {
      const { measured, envValue } = measureSafeAreaTop();
      const standalone = isIosStandalone();
      const next = standalone ? Math.max(measured, IOS_STANDALONE_TOP_FLOOR_PX) : measured;
      // Diagnostic — verify in iOS Safari devtools whether the measurement works.
      // eslint-disable-next-line no-console
      console.log(
        "[sonner] standalone:",
        standalone,
        "measured safeTop:",
        measured,
        "env value:",
        envValue,
        "applied:",
        next,
      );
      setTopOffsetPx(next);
    };
    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("orientationchange", recompute);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("orientationchange", recompute);
    };
  }, []);

  const offset = {
    top: `${topOffsetPx + VISUAL_GUTTER_PX}px`,
    bottom: SAFE_BOTTOM_CSS,
    left: 16,
    right: 16,
  };

  return (
    <Sonner
      position="top-center"
      expand={false}
      visibleToasts={3}
      offset={offset}
      mobileOffset={offset}
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          // Premium Junto styling for sonner's built-in toast variants
          // (success/info/warning). toast.custom variants render their own shells.
          "--normal-bg": "rgba(255, 255, 255, 0.92)",
          "--normal-border": "rgb(243, 244, 246)",
          "--normal-text": "#0F172A",
          "--success-bg": "rgba(255, 255, 255, 0.92)",
          "--success-border": "rgb(243, 244, 246)",
          "--success-text": "#0F172A",
          fontFamily: "'IBM Plex Sans', Inter, system-ui, sans-serif",
        } as React.CSSProperties
      }
      toastOptions={{
        duration: 4000,
        unstyled: false,
        classNames: {
          toast:
            "group toast !rounded-2xl !border !border-gray-100 !backdrop-blur-xl !shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-8px_rgba(15,23,42,0.12),0_24px_48px_-16px_rgba(15,23,42,0.08)] !text-[13.5px] !font-medium !tracking-[-0.005em] !px-3.5 !py-3 animate-in fade-in-0 slide-in-from-top-2 duration-[250ms] ease-out",
          title: "!text-[13.5px] !font-semibold !tracking-[-0.005em]",
          description: "!text-[12px] !text-slate-500 !leading-relaxed",
          actionButton:
            "!bg-gradient-to-b !from-[#0D9488] !to-[#0F766E] !text-white !rounded-xl !px-3 !py-1.5 !text-[12px] !font-semibold",
          cancelButton:
            "!bg-slate-100 !text-slate-700 !rounded-xl !px-3 !py-1.5 !text-[12px] !font-medium",
          success: "!text-slate-900",
          error: "!text-slate-900",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };

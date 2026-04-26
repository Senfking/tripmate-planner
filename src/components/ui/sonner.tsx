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
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };

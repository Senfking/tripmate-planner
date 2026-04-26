import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const SAFE_TOP = "calc(env(safe-area-inset-top, 0px) + 16px)";
const SAFE_BOTTOM = "calc(env(safe-area-inset-bottom, 0px) + 16px)";
const SAFE_OFFSET = { top: SAFE_TOP, bottom: SAFE_BOTTOM, left: 16, right: 16 };

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      position="top-center"
      expand={false}
      visibleToasts={3}
      offset={SAFE_OFFSET}
      mobileOffset={SAFE_OFFSET}
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

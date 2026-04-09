import { useState, useCallback, useRef } from "react";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { subscribeToPush } from "@/lib/pushSubscription";
import { toast } from "sonner";

const LS_KEY = "push_opt_in_shown";

/**
 * Hook that returns a trigger function and a Drawer/Dialog component
 * for the one-time push notification opt-in prompt.
 */
export function usePushOptIn(onDismiss?: () => void) {
  const [open, setOpen] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const showOptIn = useCallback(() => {
    if (localStorage.getItem(LS_KEY)) {
      // Already shown - fire dismiss callback immediately
      onDismissRef.current?.();
      return;
    }
    setOpen(true);
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(LS_KEY, "true");
    setOpen(false);
    onDismissRef.current?.();
  }, []);

  const handleEnable = useCallback(async () => {
    localStorage.setItem(LS_KEY, "true");
    setOpen(false);
    try {
      const sub = await subscribeToPush();
      if (sub) {
        toast.success("Notifications enabled! 🔔");
      }
    } catch {
      // permission denied or error - silently move on
    }
    onDismissRef.current?.();
  }, []);

  const PushOptInDrawer = useCallback(
    () => (
      <ResponsiveModal open={open} onOpenChange={(v) => !v && dismiss()} title="">
        <div className="flex flex-col items-center text-center px-2 pb-2 space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Bell className="h-7 w-7 text-primary" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold text-foreground">
              Stay in sync with your group
            </p>
            <p className="text-sm text-muted-foreground">
              Get notified about new expenses, polls, and trip updates.
            </p>
          </div>
          <div className="w-full space-y-2 pt-2">
            <Button className="w-full" onClick={handleEnable}>
              Enable notifications
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={dismiss}>
              Not now
            </Button>
          </div>
        </div>
      </ResponsiveModal>
    ),
    [open, dismiss, handleEnable],
  );

  return { showOptIn, PushOptInDrawer };
}

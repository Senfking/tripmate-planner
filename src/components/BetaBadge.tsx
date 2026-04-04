import { useState } from "react";
import { Info, X } from "lucide-react";

export function BetaBadge() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20"
      >
        Beta
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />

          {/* Card */}
          <div className="relative w-full max-w-sm rounded-2xl bg-background border border-border shadow-xl p-6 animate-fade-in">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <Info className="h-4 w-4 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Junto is in Beta</h3>
            </div>

            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
              Welcome to the early days of Junto! We're currently in <strong className="text-foreground">beta</strong>, 
                which means the app is live and functional, but still evolving based on real feedback from users like you.
              </p>
              <p>
                Junto is a <strong className="text-foreground">web app</strong>, not a native app (yet). 
                You can install it on your home screen for the best experience, but it runs in your browser under the hood.
              </p>
              <p>
                Your feedback shapes what we build next. If something feels off or you have an idea, 
                tap the feedback button — we read every single message.
              </p>
            </div>

            <button
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

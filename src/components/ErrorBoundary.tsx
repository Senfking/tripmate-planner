import { Component, type ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";
import { pushError } from "@/lib/errorBuffer";
import { captureReactError } from "@/lib/sentry";

interface Props {
  children: ReactNode;
  userId?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

// Errors thrown by Vite's lazy() when a chunk hash on the CDN no longer
// matches the one referenced by the live tab — typically because Lovable
// redeployed. The app code on the user's tab is stale; the only safe
// recovery is a hard reload to pick up the new chunk manifest.
const STALE_CHUNK_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk \d+ failed/i;

function isStaleChunkError(err: unknown): boolean {
  if (!err) return false;
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  return STALE_CHUNK_RE.test(message);
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });

    // Stale chunk after a redeploy: don't capture as a React crash — it's a
    // routine "user has an old tab" event. Track it so we know how often it
    // happens, but skip Sentry and the dev console noise.
    if (isStaleChunkError(error)) {
      trackEvent("app_error", {
        type: "stale_chunk",
        message: error.message,
        route: window.location.pathname,
        severity: "low",
      }, this.props.userId || undefined);
      return;
    }

    // Print every relevant field as its own console.error call so browsers
    // that collapse multi-arg console output (and Sentry/source-map tooling)
    // still surface the message, stack, and component stack in full.
    console.error("[ErrorBoundary] Caught error:", error);
    console.error("[ErrorBoundary] name:", error.name);
    console.error("[ErrorBoundary] message:", error.message);
    console.error("[ErrorBoundary] stack:\n" + (error.stack ?? "(no stack)"));
    console.error("[ErrorBoundary] componentStack:" + (info.componentStack ?? "(none)"));
    console.error("[ErrorBoundary] route:", window.location.pathname);

    captureReactError(error, info.componentStack, this.props.userId);

    trackEvent("app_error", {
      type: "react_crash",
      message: error.message,
      stack: error.stack?.slice(0, 500),
      component: info.componentStack?.split("\n")[1]?.trim(),
      route: window.location.pathname,
      severity: "critical",
    }, this.props.userId || undefined);

    pushError({
      source: "react_crash",
      name: error.name || "Error",
      message: error.message ?? null,
      route: window.location.pathname,
      extra: {
        component: info.componentStack?.split("\n")[1]?.trim(),
        stack: error.stack?.slice(0, 500),
      },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, componentStack: null });
  };

  handleHardReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { error, componentStack } = this.state;

      // Stale-chunk path: the user's tab is running pre-redeploy code that
      // can't reach the new chunk hashes. Offer an opt-in reload — never
      // auto-reload, since the user might have unsaved input.
      if (isStaleChunkError(error)) {
        return (
          <div className="flex min-h-screen w-screen flex-col items-center justify-center gap-4 p-6 text-center">
            <h1 className="text-xl font-semibold">App was updated</h1>
            <p className="text-sm text-muted-foreground max-w-md">
              Reload to get the latest version.
            </p>
            <button
              onClick={this.handleHardReload}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Reload
            </button>
          </div>
        );
      }

      return (
        <div className="flex min-h-screen w-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            An unexpected error occurred. Try refreshing the page.
          </p>
          {error && (
            <details className="max-w-2xl w-full rounded-lg border border-border bg-muted/30 p-3 text-left text-xs">
              <summary className="cursor-pointer font-medium select-none break-words">
                {error.name}: {error.message}
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
{error.stack || "(no stack)"}
{componentStack ? `\n--- Component stack ---${componentStack}` : ""}
              </pre>
            </details>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={this.handleReset}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Refresh page
            </button>
            <button
              onClick={this.handleHardReload}
              className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Hard reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

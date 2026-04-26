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

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Print every relevant field as its own console.error call so browsers
    // that collapse multi-arg console output (and Sentry/source-map tooling)
    // still surface the message, stack, and component stack in full.
    console.error("[ErrorBoundary] Caught error:", error);
    console.error("[ErrorBoundary] name:", error.name);
    console.error("[ErrorBoundary] message:", error.message);
    console.error("[ErrorBoundary] stack:\n" + (error.stack ?? "(no stack)"));
    console.error("[ErrorBoundary] componentStack:" + (info.componentStack ?? "(none)"));
    console.error("[ErrorBoundary] route:", window.location.pathname);

    this.setState({ componentStack: info.componentStack ?? null });

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

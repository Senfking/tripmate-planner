import { Component, type ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";

interface Props {
  children: ReactNode;
  userId?: string;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Uncaught error:", error, info.componentStack);
    trackEvent("app_error", {
      type: "react_crash",
      message: error.message,
      stack: error.stack?.slice(0, 500),
      component: info.componentStack?.split("\n")[1]?.trim(),
      route: window.location.pathname,
      severity: "critical",
    }, this.props.userId || undefined);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            An unexpected error occurred. Try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Refresh page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

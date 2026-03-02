"use client";

import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Custom fallback UI — overrides the default error card */
  fallback?: ReactNode;
  /** Optional label shown in the error card heading */
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Generic React error boundary.
 *
 * Wrap any tree that may throw during render:
 * ```tsx
 * <ErrorBoundary label="Camera feed">
 *   <CameraStream />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console in dev; swap for Sentry / PostHog in production
    if (process.env.NODE_ENV !== "production") {
      console.error("[ErrorBoundary]", error, info.componentStack);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    const label = this.props.label ?? "This section";

    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">
            {label} encountered an error
          </h3>
          {this.state.error && (
            <p className="max-w-xs text-xs text-muted-foreground">
              {this.state.error.message}
            </p>
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={this.handleReset}
          className="gap-2"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      </div>
    );
  }
}

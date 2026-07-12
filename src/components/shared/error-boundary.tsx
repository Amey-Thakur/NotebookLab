/*
 * Name: error-boundary.tsx
 * Purpose: Global error boundary.
 * Description: Catches unhandled errors in the component tree and renders a
 *   fallback UI instead of a white screen. Class component
 *   required because React error boundaries do not support hooks.
 *   Offers a "Reload" button to recover from transient errors.
 * Tech Stack: React 19
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { Component, type ErrorInfo, type ReactNode } from "react";


interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}


export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-bg text-text-1 gap-4 p-8">
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="text-sm text-text-3 text-center max-w-md">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            className="px-4 py-2 text-sm bg-accent-dim text-bg font-medium"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

"use client";
// Ported from Masayume 68f7a09:web/src/components/states/ErrorBoundary.tsx

import { diagnosis } from "@cwf/core";
import { Component, type ReactNode } from "react";
import { ErrorState } from "./ErrorState";

interface ErrorBoundaryProps {
  children: ReactNode;
  backHref?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <ErrorState
        variant="boundary"
        diagnosis={diagnosis("unknown", error.message)}
        retry={() => this.setState({ error: null })}
        backHref={this.props.backHref}
      />
    );
  }
}

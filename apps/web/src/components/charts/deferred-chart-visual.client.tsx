"use client";

import {
  Component,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactNode
} from "react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type RenderBoundaryProps = {
  children: ReactNode;
  resetKey: number;
  onRetry: () => void;
};

class ChartRenderBoundary extends Component<
  RenderBoundaryProps,
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The user-facing state below is the recovery surface. Runtime logging is
    // intentionally left to the app-level error reporter.
  }

  componentDidUpdate(previousProps: RenderBoundaryProps) {
    if (
      previousProps.resetKey !== this.props.resetKey &&
      this.state.error !== null
    ) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return <ChartLoadError onRetry={this.props.onRetry} />;
    }

    return this.props.children;
  }
}

function ChartLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert role="alert" className="min-h-60 content-center">
      <AlertTitle>Не удалось загрузить график</AlertTitle>
      <AlertDescription>
        Табличное представление остаётся доступным. Попробуйте загрузить график ещё раз.
      </AlertDescription>
      <AlertAction>
        <Button type="button" variant="outline" size="xs" onClick={onRetry}>
          Повторить
        </Button>
      </AlertAction>
    </Alert>
  );
}

export function DeferredChartVisual<Props extends object>({
  Visual,
  componentProps
}: {
  Visual: ComponentType<Props>;
  componentProps: Props;
}) {
  const hydrationEndMarkedRef = useRef(false);
  const [attempt, setAttempt] = useState(0);

  // Task 10 hydration instrumentation: first settled layout effect after the
  // statically imported visual commits records "qc-chart-hydration-end".
  useLayoutEffect(() => {
    if (
      !hydrationEndMarkedRef.current &&
      typeof performance !== "undefined" &&
      typeof performance.mark === "function"
    ) {
      hydrationEndMarkedRef.current = true;
      performance.mark("qc-chart-hydration-end");
    }
  }, []);

  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  return (
    <div
      data-slot="deferred-chart-visual"
      data-deferred-state="ready"
      className="min-w-0"
    >
      <ChartRenderBoundary resetKey={attempt} onRetry={retry}>
        <Visual key={attempt} {...componentProps} />
      </ChartRenderBoundary>
    </div>
  );
}

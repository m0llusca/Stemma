"use client";

import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode
} from "react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type DeferredModule<Props extends object> = {
  default: ComponentType<Props>;
};

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
  load,
  componentProps,
  loadingLabel,
  fallbackClassName,
  fallbackStyle,
  armed = false
}: {
  load: () => Promise<DeferredModule<Props>>;
  componentProps: Props;
  loadingLabel: string;
  fallbackClassName: string;
  // Charts whose height is data-driven pass the same computed height here so
  // the loading skeleton matches the final visual and avoids a layout shift.
  fallbackStyle?: CSSProperties;
  armed?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hydrationEndMarkedRef = useRef(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [Loaded, setLoaded] = useState<ComponentType<Props> | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);

  // Task 10 hydration instrumentation (approved additive-only change): the
  // first settled layout effect of the commit that mounts the loaded rich
  // component records "qc-chart-hydration-end". Child layout effects run
  // before this parent effect, so the chart subtree is committed when the mark
  // is set. The shared mark name may repeat (once per island instance, guarded
  // by hydrationEndMarkedRef); the measurement harness pairs the single
  // module-evaluation start mark with the earliest end mark.
  useLayoutEffect(() => {
    if (
      Loaded &&
      !hydrationEndMarkedRef.current &&
      typeof performance !== "undefined" &&
      typeof performance.mark === "function"
    ) {
      hydrationEndMarkedRef.current = true;
      performance.mark("qc-chart-hydration-end");
    }
  }, [Loaded]);

  useEffect(() => {
    if (armed) {
      setShouldLoad(true);
    }
  }, [armed]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || shouldLoad) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px 0px" }
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) {
      return;
    }

    let cancelled = false;
    setLoaded(null);
    setLoadError(null);

    load()
      .then((module) => {
        if (!cancelled) {
          setLoaded(() => module.default);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error : new Error("Chart chunk failed to load")
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, load, shouldLoad]);

  const retry = useCallback(() => {
    setShouldLoad(true);
    setAttempt((current) => current + 1);
  }, []);

  const state = loadError
    ? "error"
    : Loaded
      ? "ready"
      : shouldLoad
        ? "loading"
        : "waiting";

  return (
    <div
      ref={rootRef}
      data-slot="deferred-chart-visual"
      data-deferred-state={state}
      className="min-w-0"
    >
      {loadError ? <ChartLoadError onRetry={retry} /> : null}
      {!loadError && Loaded ? (
        <ChartRenderBoundary resetKey={attempt} onRetry={retry}>
          <Loaded {...componentProps} />
        </ChartRenderBoundary>
      ) : null}
      {!loadError && !Loaded ? (
        <div
          role="status"
          aria-label={loadingLabel}
          className={cn("relative grid overflow-hidden", fallbackClassName)}
          style={fallbackStyle}
        >
          <Skeleton
            aria-hidden="true"
            data-qc-motion="none"
            className="h-full w-full motion-reduce:animate-none"
          />
        </div>
      ) : null}
    </div>
  );
}

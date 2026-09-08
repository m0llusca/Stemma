"use client";

import {
  Component,
  useCallback,
  useState,
  type ErrorInfo,
  type ReactNode
} from "react";
import dynamic from "next/dynamic";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ExecRiskChartPending, ExecRiskEmptyState } from "@/components/dashboard/exec-risk-empty";
import { isExecRiskBarsEmpty, type ExecRiskChartBar } from "@/lib/dashboard/exec-risk-home";

const ExecRiskChart = dynamic(
  () =>
    import("@/components/dashboard/exec-risk-chart.client").then((mod) => mod.ExecRiskChart),
  {
    ssr: false,
    loading: () => <ExecRiskChartPending />
  }
);

function ChartLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert role="alert" className="min-h-[240px] content-center">
      <AlertTitle>Не удалось загрузить график</AlertTitle>
      <AlertDescription>
        Плитки риска выше открывают те же срезы очереди. Попробуйте загрузить график ещё раз.
      </AlertDescription>
      <AlertAction>
        <Button type="button" variant="outline" size="xs" onClick={onRetry}>
          Повторить
        </Button>
      </AlertAction>
    </Alert>
  );
}

class ExecRiskChartBoundary extends Component<
  { children: ReactNode; resetKey: number; onRetry: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // User-facing recovery is the alert below. App-level reporting stays global.
  }

  componentDidUpdate(previousProps: { resetKey: number }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error !== null) {
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

function ExecRiskChartIslandLive({ bars }: { bars: readonly ExecRiskChartBar[] }) {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  return (
    <div data-slot="exec-risk-chart-island">
      <ExecRiskChartBoundary resetKey={attempt} onRetry={retry}>
        <ExecRiskChart key={attempt} bars={bars} />
      </ExecRiskChartBoundary>
    </div>
  );
}

export function ExecRiskChartIsland({
  bars,
  resetHref
}: {
  bars: readonly ExecRiskChartBar[];
  resetHref: string;
}) {
  if (isExecRiskBarsEmpty(bars)) {
    return <ExecRiskEmptyState resetHref={resetHref} />;
  }

  return <ExecRiskChartIslandLive bars={bars} />;
}

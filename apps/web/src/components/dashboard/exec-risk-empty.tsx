import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export function ExecRiskChartPending() {
  return (
    <div
      className="h-[240px] w-full rounded-lg bg-muted/40"
      role="status"
      aria-label="Загрузка графика"
      data-slot="exec-risk-chart-pending"
    />
  );
}

export function ExecRiskEmptyState({ resetHref }: { resetHref: string }) {
  return (
    <div data-slot="exec-risk-empty">
      <EmptyState
        size="inline"
        className="min-h-[200px] justify-center"
        icon={<ClipboardCheck size={20} aria-hidden="true" />}
        title="Нет сигналов за период"
        description="Это не сертификат «всё в порядке». Откройте очередь без фильтра, чтобы проверить объём."
        action={
          <Button render={<Link href={resetHref} />} nativeButton={false} variant="outline" size="sm">
            Открыть очередь без фильтра
          </Button>
        }
      />
    </div>
  );
}

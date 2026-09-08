import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

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

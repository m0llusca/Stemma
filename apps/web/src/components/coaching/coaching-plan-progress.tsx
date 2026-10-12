import { Progress } from "@/components/ui/progress";

type CoachingPlanProgressProps = {
  title: string;
  done: number;
  total: number;
};

export function CoachingPlanProgress({ title, done, total }: CoachingPlanProgressProps) {
  const label = total > 0 ? `${done}/${total} закрыто` : "В плане пока нет задач";

  return (
    <div className="flex items-center gap-2">
      <Progress
        className="min-w-0 flex-1"
        value={done}
        max={Math.max(total, 1)}
        aria-label={`Прогресс плана «${title}»`}
        aria-valuetext={label}
      />
      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{label}</span>
    </div>
  );
}

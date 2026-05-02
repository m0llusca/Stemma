import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: string;
  helper: string;
  icon?: ReactNode;
};

export function MetricCard({ label, value, helper, icon }: MetricCardProps) {
  return (
    <article className="panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-[#667085]">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-[#17202a]">{value}</p>
        </div>
        {icon ? <div className="rounded-md border border-[#d7dce5] bg-[#eef4f4] p-2 text-[#0b4f52]">{icon}</div> : null}
      </div>
      <p className="mt-3 text-sm leading-5 text-[#667085]">{helper}</p>
    </article>
  );
}

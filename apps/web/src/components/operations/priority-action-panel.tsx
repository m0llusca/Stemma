import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { SemanticTone } from "@/lib/ui/semantic-status";

export function PriorityActionPanel({
  title,
  description,
  actionLabel,
  href,
  tone = "info"
}: {
  title: string;
  description: string;
  actionLabel: string;
  href: string;
  tone?: SemanticTone;
}) {
  return (
    <section className={clsx("priority-action-panel", `semantic-status--${tone}`)}>
      <div className="priority-action-panel__copy">
        <p className="page-kicker">Сделать сейчас</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <Link href={href} className="action-button action-button--primary priority-action-panel__link">
        <span>{actionLabel}</span>
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}

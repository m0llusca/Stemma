import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";

export function SectionHeader({
  eyebrow,
  title,
  description
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="min-w-0">
      {eyebrow ? <p className="text-xs font-semibold uppercase text-[#667085]">{eyebrow}</p> : null}
      <h3 className={`${eyebrow ? "mt-1 " : ""}text-sm font-semibold text-[#17202a]`}>{title}</h3>
      {description ? <p className="mt-1 max-w-3xl text-sm leading-5 text-[#667085] compact-text">{description}</p> : null}
    </div>
  );
}

export function Surface({
  title,
  description,
  children,
  className = "",
  bodyClassName = "p-4"
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`panel min-w-0 overflow-hidden ${className}`}>
      {title ? (
        <div className="border-b border-[#d7dce5] px-5 py-4">
          <SectionHeader title={title} description={description} />
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

export function DataTable({
  title,
  description,
  minWidth = "min-w-[720px]",
  children,
  className = ""
}: {
  title?: string;
  description?: string;
  minWidth?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Surface title={title} description={description} bodyClassName="p-0" className={className}>
      <div className="scroll-area">
        <table className={`table-fixed-copy w-full ${minWidth} border-collapse text-left text-sm`}>{children}</table>
      </div>
    </Surface>
  );
}

export function CodeBlock({ children, maxHeight = "max-h-[320px]" }: { children: string; maxHeight?: string }) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <div className="flex justify-end">
        <CopyButton value={children} />
      </div>
      <pre className={`${maxHeight} overflow-auto rounded-md bg-[#17202a] p-4 text-xs leading-5 text-white`}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function CodeExampleCard({
  title,
  description,
  children,
  maxHeight,
  className = ""
}: {
  title: string;
  description?: string;
  children: string;
  maxHeight?: string;
  className?: string;
}) {
  return (
    <Surface title={title} description={description} className={className}>
      <CodeBlock maxHeight={maxHeight}>{children}</CodeBlock>
    </Surface>
  );
}

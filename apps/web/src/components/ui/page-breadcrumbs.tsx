"use client";

import { Fragment } from "react";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export function PageBreadcrumbs({ items, className }: {
  items: readonly { label: string; href?: string }[];
  className?: string;
}) {
  return (
    <Breadcrumb className={cn("min-w-0 max-w-full", className)} aria-label="Навигационная цепочка">
      <BreadcrumbList className="min-w-0 max-w-full">
        {items.map((item, index) => (
          <Fragment key={`${item.href ?? "current"}:${index}`}>
            {index > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem className="min-w-0 max-w-full">
              {item.href ? (
                <BreadcrumbLink render={<Link href={item.href} prefetch={false} />} className="truncate" title={item.label}>
                  {item.label}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="truncate" title={item.label}>{item.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

"use client";

import { Fragment } from "react";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator
} from "@/components/ui/breadcrumb";

export function PageBreadcrumbs({ items, className }: {
  items: readonly { label: string; href?: string }[];
  className?: string;
}) {
  return (
    <Breadcrumb className={className} aria-label="Навигационная цепочка">
      <BreadcrumbList>
        {items.map((item, index) => (
          <Fragment key={`${item.href ?? "current"}:${index}`}>
            {index > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem className="min-w-0">
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

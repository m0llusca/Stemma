"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function userInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => Array.from(part)[0]).join("").toLocaleUpperCase("ru-RU") || "?";
}

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar size="sm" className={className} aria-hidden="true">
      <AvatarFallback>{userInitials(name)}</AvatarFallback>
    </Avatar>
  );
}

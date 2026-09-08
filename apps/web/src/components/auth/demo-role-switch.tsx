"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type ToggleEvent } from "react";
import { ChevronDown } from "lucide-react";
import { demoRoleSwitchFormData, type DemoRoleSwitcher } from "@/lib/auth/demo-users";
import { switchCurrentUser } from "@/lib/user-actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Mirrors UA `details.open` for aria-expanded after remount. Open itself is
 * the native details bit — LIVE Agent only opened this control as `<details>`.
 */
let accountMenuExpanded = false;

export function resetAccountMenuExpandedForTests() {
  accountMenuExpanded = false;
}

type AccountMenuDisclosureProps = {
  triggerAriaLabel: string;
  triggerTitle?: string;
  triggerClassName?: string;
  panelClassName?: string;
  align?: "start" | "end";
  /** Parent sets this to the current route so navigation dismisses the panel. */
  dismissKey?: string;
  children: ReactNode;
  panel: ReactNode;
};

/**
 * Native `<details>` / `<summary>` owns open. React only mirrors `details.open`
 * onto `aria-expanded` via the `toggle` event. No preventDefault on the
 * summary (that fought the UA on LIVE). No `open={...}` prop (that fights UA).
 * No useLayoutEffect rewriting the DOM.
 */
export function AccountMenuDisclosure({
  triggerAriaLabel,
  triggerTitle,
  triggerClassName,
  panelClassName,
  align = "end",
  dismissKey,
  children,
  panel
}: AccountMenuDisclosureProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const prevDismissKeyRef = useRef(dismissKey);
  const [expanded, setExpanded] = useState(() => accountMenuExpanded);
  const menuId = useId();

  const syncExpanded = (isOpen: boolean) => {
    accountMenuExpanded = isOpen;
    setExpanded(isOpen);
  };

  useEffect(() => {
    const root = detailsRef.current;
    if (root && accountMenuExpanded && !root.open) {
      root.open = true;
    }
  }, []);

  useEffect(() => {
    if (prevDismissKeyRef.current === dismissKey) {
      return;
    }
    prevDismissKeyRef.current = dismissKey;
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
    syncExpanded(false);
  }, [dismissKey]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !detailsRef.current?.open) {
        return;
      }
      detailsRef.current.open = false;
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <details
      ref={detailsRef}
      className={cn("relative open:z-50", align === "start" && "w-full")}
      onToggle={(event: ToggleEvent<HTMLDetailsElement>) => {
        syncExpanded(event.currentTarget.open);
      }}
    >
      <summary
        role="button"
        data-slot="account-menu"
        title={triggerTitle}
        aria-label={triggerAriaLabel}
        aria-haspopup="menu"
        aria-expanded={expanded ? "true" : "false"}
        aria-controls={menuId}
        className={cn(
          triggerClassName,
          "cursor-pointer list-none [&::-webkit-details-marker]:hidden [&_*]:pointer-events-none"
        )}
      >
        {children}
      </summary>
      <div
        id={menuId}
        role="menu"
        data-slot="account-menu-panel"
        className={cn(
          "absolute z-50 mt-2 min-w-32 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10",
          align === "end" ? "right-0" : "left-0",
          panelClassName
        )}
      >
        {panel}
      </div>
    </details>
  );
}

export function DemoRoleSwitchMenu({ switcher }: { switcher: DemoRoleSwitcher }) {
  return (
    <div role="group" aria-label="Сменить роль">
      <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Сменить роль</div>
      {switcher.users.map((user) => {
        const isCurrent = user.id === switcher.currentUserId;

        return (
          <button
            key={user.id}
            type="button"
            role="menuitem"
            aria-current={isCurrent ? "true" : undefined}
            aria-disabled={isCurrent ? true : undefined}
            className={cn(
              "relative flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none",
              "focus:bg-accent focus:text-accent-foreground",
              isCurrent && "pointer-events-none opacity-50"
            )}
            onClick={() => {
              if (isCurrent) {
                return;
              }

              void switchCurrentUser(demoRoleSwitchFormData(user.id));
            }}
          >
            <span className="min-w-0 truncate">{user.optionLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

type DemoAccountMenuProps = {
  switcher: DemoRoleSwitcher;
  logout: ReactNode;
};

/** Single account menu for surfaces without AppNav (VIEWER pending-access). */
export function DemoAccountMenu({ switcher, logout }: DemoAccountMenuProps) {
  const currentName =
    switcher.users.find((user) => user.id === switcher.currentUserId)?.name ?? switcher.roleLabel;

  return (
    <AccountMenuDisclosure
      triggerAriaLabel={`Профиль: ${switcher.roleLabel}, ${currentName}`}
      triggerClassName={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full min-h-11 gap-1.5")}
      align="start"
      panelClassName="w-72"
      panel={
        <>
          <DemoRoleSwitchMenu switcher={switcher} />
          <div className="-mx-1 my-1 h-px bg-border" role="separator" />
          {logout}
        </>
      }
    >
      <span className="min-w-0 truncate">{switcher.roleLabel}</span>
      <span className="min-w-0 truncate text-muted-foreground">{currentName}</span>
      <ChevronDown data-icon="inline-end" />
    </AccountMenuDisclosure>
  );
}

"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { demoRoleSwitchFormData, type DemoRoleSwitcher } from "@/lib/auth/demo-users";
import { switchCurrentUser } from "@/lib/user-actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
 * Account / demo switcher: native button + in-flow panel.
 * Base UI Menu/Popover treat the opening click as outside-press on LIVE
 * (Agent /self-review), so the popup never stays open.
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    setOpen(false);
  }, [dismissKey]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    // After this turn so the opening pointerdown cannot dismiss the panel.
    const timeoutId = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div className={cn("relative", open && "z-50")} ref={rootRef}>
      <button
        type="button"
        data-slot="account-menu"
        title={triggerTitle}
        aria-label={triggerAriaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={triggerClassName}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {children}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className={cn(
            "absolute z-50 mt-2 min-w-32 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10",
            align === "end" ? "right-0" : "left-0",
            panelClassName
          )}
        >
          {panel}
        </div>
      ) : null}
    </div>
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

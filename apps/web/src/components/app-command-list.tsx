"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { takeNextReview } from "@/lib/queue-view-actions";
import { takeNextFormDataFromLocation } from "@/lib/review/queue-href-filters";
import type { ShellCommandItem } from "@/lib/shell/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from "@/components/ui/command";

function commandMatches(command: ShellCommandItem, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [command.label, command.description, command.modeLabel, ...command.aliases].some((value) =>
    value.toLowerCase().includes(normalized)
  );
}


export default function AppCommandList({ commands, canTakeNextCase, onClose }: {
  commands: readonly ShellCommandItem[];
  canTakeNextCase: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const visibleCommands = useMemo(
    () =>
      commands
        .filter((command) => canTakeNextCase || command.actionId !== "take-next")
        .filter((command) => commandMatches(command, query))
        .slice(0, 9),
    [commands, query, canTakeNextCase]
  );
  function runCommand(command: ShellCommandItem) {
    onClose();
    if (command.actionId === "take-next") {
      const { pathname, search } = window.location;
      void takeNextReview(takeNextFormDataFromLocation(pathname, search));
    } else if (command.href) {
      router.push(command.href);
    }
  }

  return (
    <Command shouldFilter={false} className="rounded-xl!">
      <CommandInput
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder="Найти раздел, очередь, интеграцию или действие"
        aria-label="Поиск или команда"
      />
      <CommandList>
        <CommandEmpty>
          Ничего не найдено. Попробуйте “очередь”, “интеграции” или “обучение”.
        </CommandEmpty>
        <CommandGroup>
          {visibleCommands.map((command) => (
            <CommandItem
              key={`${command.kind}:${command.actionId ?? command.href}:${command.label}`}
              value={`${command.label} ${command.description} ${command.modeLabel} ${command.aliases.join(" ")}`}
              onSelect={() => runCommand(command)}
              className="items-start py-2"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">{command.label}</span>
                <span className="text-xs text-muted-foreground">{command.description}</span>
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5 self-center">
                {command.kind === "action" ? (
                  <Badge variant="outline" className="font-normal">
                    Действие
                  </Badge>
                ) : null}
                <CommandShortcut className="tracking-normal normal-case">
                  {command.modeLabel}
                </CommandShortcut>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

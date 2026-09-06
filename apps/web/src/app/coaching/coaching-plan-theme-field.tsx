"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  coachingThemeCasesHref,
  coachingThemeSourceLabel,
  type CoachingThemeSuggestion
} from "@/lib/coaching-themes";

type CoachingPlanThemeFieldProps = {
  themesByAgent: Record<string, CoachingThemeSuggestion[]>;
  defaultAgentName?: string;
  defaultFocusArea?: string;
};

/**
 * Focus-area input + chip suggestions derived from recent failed criteria /
 * findings for the currently selected plan agent (NativeSelect #plan-agentName).
 */
export function CoachingPlanThemeField({
  themesByAgent,
  defaultAgentName = "",
  defaultFocusArea = ""
}: CoachingPlanThemeFieldProps) {
  const [agentName, setAgentName] = useState(defaultAgentName);
  const [focusArea, setFocusArea] = useState(defaultFocusArea);
  const themes = themesByAgent[agentName] ?? [];

  useEffect(() => {
    const select = document.getElementById("plan-agentName") as HTMLSelectElement | null;
    if (!select) {
      return;
    }

    const sync = () => {
      const next = select.value.trim();
      setAgentName(next);
      if (!focusArea && themesByAgent[next]?.[0]?.label) {
        setFocusArea(themesByAgent[next][0].label);
      }
    };

    select.addEventListener("change", sync);
    return () => select.removeEventListener("change", sync);
  }, [focusArea, themesByAgent]);

  return (
    <Field className="sm:col-span-2">
      <FieldLabel htmlFor="plan-focusArea">Фокус-тема</FieldLabel>
      <Input
        id="plan-focusArea"
        name="focusArea"
        placeholder="Например: работа с возражениями"
        value={focusArea}
        onChange={(event) => setFocusArea(event.target.value)}
      />
      {themes.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2" aria-label="Темы из недавних проверок">
          <p className="text-xs text-muted-foreground">
            Из последних проверок оператора — нажмите чип, чтобы подставить тему.
          </p>
          <ul className="flex flex-wrap gap-2">
            {themes.map((theme) => {
              const casesHref = coachingThemeCasesHref({ agentName, theme });
              return (
                <li key={`${theme.source}:${theme.label}`} className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setFocusArea(theme.label)}
                    aria-label={`Подставить тему «${theme.label}»`}
                  >
                    <Chip tone={theme.source === "failed_criterion" ? "warning" : "accent"}>
                      {theme.label}
                      <span className="tabular-nums opacity-80"> · {theme.count}</span>
                    </Chip>
                  </button>
                  <span className="text-[11px] text-muted-foreground">{coachingThemeSourceLabel(theme.source)}</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto px-0 text-xs"
                    render={<Link href={casesHref} />}
                    nativeButton={false}
                  >
                    Открыть кейсы по теме
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {agentName
            ? "Нет недавних провалов по критериям или замечаний для этого оператора."
            : "Выберите оператора — подскажем темы из последних финализированных проверок."}
        </p>
      )}
    </Field>
  );
}

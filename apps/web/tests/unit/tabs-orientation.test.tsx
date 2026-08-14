import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

describe("Tabs orientation", () => {
  it("forwards vertical orientation to the accessible Base UI tab model", () => {
    const { container } = render(
      <Tabs orientation="vertical" defaultValue="overview">
        <TabsList aria-label="Разделы">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="details">Детали</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Сводка</TabsContent>
        <TabsContent value="details">Подробности</TabsContent>
      </Tabs>
    );

    expect(
      container.querySelector('[data-slot="tabs"]')?.getAttribute("data-orientation")
    ).toBe("vertical");
    expect(
      screen.getByRole("tablist", { name: "Разделы" }).getAttribute("aria-orientation")
    ).toBe("vertical");
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "Обзор" }).getAttribute("aria-selected")).toBe(
      "true"
    );
  });
});

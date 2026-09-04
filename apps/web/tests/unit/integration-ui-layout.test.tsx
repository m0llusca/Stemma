import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IntegrationFact } from "@/components/integrations/integration-ui";

describe("IntegrationFact", () => {
  it("marks only explicitly technical values for technical wrapping", () => {
    render(
      <>
        <IntegrationFact label="Адрес источника" technical>
          https://support.example.test/very/long/path
        </IntegrationFact>
        <IntegrationFact label="Статус интеграции">Источник ожидает настройки</IntegrationFact>
      </>
    );

    expect(screen.getByText("Адрес источника")).toBeInTheDocument();
    expect(screen.getByText(/support\.example/)).toHaveAttribute("data-technical", "true");
    expect(screen.getByText("Источник ожидает настройки")).not.toHaveAttribute("data-technical");
  });
});

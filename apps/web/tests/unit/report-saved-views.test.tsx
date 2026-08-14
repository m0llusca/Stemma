import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReportSavedViews } from "@/components/reports/report-saved-views";

vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    scroll,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    prefetch?: boolean;
    scroll?: boolean;
  }) => (
    <a
      href={href}
      data-prefetch={prefetch == null ? undefined : String(prefetch)}
      data-scroll={scroll == null ? undefined : String(scroll)}
      {...props}
    />
  )
}));

const savedViews = [
  {
    id: "view-high-risk",
    name: "HIGH+",
    href:
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&risk=high_plus&chartView=graph&series=score%2Cvolume",
    scope: "shared"
  },
  {
    id: "view-freshdesk",
    name: "Freshdesk / Processes",
    href:
      "/reports?view=performance&period=vk-current&compare=previous&grain=week&source=freshdesk&block=processes-aabbccddee&section=drivers&chartView=table&series=score",
    scope: "private"
  },
  {
    id: "view-team",
    name: "Снижение 2ЛП",
    href:
      "/reports?view=overview&period=calendar-current&compare=year&grain=week&team=declining-team-0123456789&section=drivers&chartView=graph&series=score%2Cprevious",
    scope: "private"
  },
  {
    id: "view-ai-drift",
    name: "AI drift",
    href:
      "/reports?view=performance&period=quarter-current&compare=previous&grain=week&section=ai-drift&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget",
    scope: "shared"
  }
];

describe("ReportSavedViews", () => {
  it("suppresses prefetch for report-local saved views while preserving scroll only for evidence", async () => {
    const evidenceView = {
      id: "legacy-evidence",
      name: "Legacy evidence",
      href: `/reports?view=overview&evidenceType=trend&evidenceKey=${`ev1_${"A".repeat(43)}`}`,
      scope: "private"
    };
    render(
      <ReportSavedViews
        currentHref={savedViews[0].href}
        savedViews={[evidenceView, savedViews[0]]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Сохранённый вид: HIGH+" })
    );
    const menu = await screen.findByRole("menu");
    const evidenceLink = within(menu).getByRole("menuitem", {
      name: evidenceView.name
    });
    const ordinaryLink = within(menu).getByRole("menuitem", {
      name: savedViews[0].name
    });
    expect(evidenceLink).toHaveAttribute("data-prefetch", "false");
    expect(evidenceLink).toHaveAttribute("data-scroll", "false");
    expect(ordinaryLink).toHaveAttribute("data-prefetch", "false");
    expect(ordinaryLink).not.toHaveAttribute("data-scroll");
  });

  it("renders saved views as one compact menu with ordinary push-compatible canonical links", async () => {
    render(
      <ReportSavedViews
        currentHref={savedViews[3].href}
        savedViews={savedViews}
      />
    );

    const trigger = screen.getByRole("button", {
      name: "Сохранённый вид: AI drift"
    });
    fireEvent.click(trigger);

    const menu = await screen.findByRole("menu");
    for (const view of savedViews) {
      const link = within(menu).getByRole("menuitem", { name: view.name });
      expect(link).toHaveAttribute("href", view.href);
      expect(link).not.toHaveAttribute("data-replace", "true");
    }
    expect(screen.queryByText("Раскрыть")).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="card"]')).not.toBeInTheDocument();
  });

  it("shows only the view name on the trigger while the full label stays the accessible name", () => {
    render(
      <ReportSavedViews
        currentHref={savedViews[2].href}
        savedViews={savedViews}
      />
    );

    const trigger = screen.getByRole("button", {
      name: "Сохранённый вид: Снижение 2ЛП"
    });

    expect(trigger).toHaveAttribute(
      "aria-label",
      "Сохранённый вид: Снижение 2ЛП"
    );
    expect(trigger).toHaveTextContent("Снижение 2ЛП");
    expect(trigger.textContent).not.toContain("Сохранённый вид:");
  });

  it("keeps the save form keyboard-reachable without turning every view into a badge wall", async () => {
    render(
      <ReportSavedViews
        currentHref={savedViews[0].href}
        savedViews={savedViews}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Сохранённый вид: HIGH+" })
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Сохранить текущий вид" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Сохранить текущий вид"
    });
    expect(within(dialog).getByLabelText("Название")).toBeRequired();
    expect(within(dialog).getByLabelText("Доступ")).toHaveValue("private");
    expect(within(dialog).getByRole("button", { name: "Сохранить" })).toBeInTheDocument();
    await waitFor(() => {
      expect(within(dialog).getByLabelText("Название")).toHaveFocus();
    });
  });
});

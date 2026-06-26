import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricValue } from "@/components/ui/metric-value";
import { StatusBadge } from "@/components/ui/status-badge";

describe("StatusBadge", () => {
  it("renders label and value spans with the semantic tone class contract", () => {
    const { container } = render(<StatusBadge label="SLA" value="2 open" tone="warning" />);
    const badge = container.querySelector(".status-badge");

    expect(badge).toHaveClass("status-tone", "status-tone--warning");
    expect(badge).toHaveTextContent("SLA 2 open");
    expect(badge?.querySelector(".status-badge__label")).toHaveTextContent("SLA");
    expect(badge?.querySelector(".status-badge__value")).toHaveTextContent("2 open");
  });

  it("keeps label and value separated in DOM text", () => {
    const { container } = render(<StatusBadge label="SLA" value="31.05.2026" tone="info" />);
    const badge = container.querySelector(".status-badge");

    expect(badge?.textContent).toBe("SLA 31.05.2026");
  });

  it("applies custom classes without replacing alignment classes", () => {
    const { container } = render(<StatusBadge label="Quality" value="94" tone="positive" className="queue-status" />);
    const badge = container.querySelector(".status-badge");

    expect(badge).toHaveClass("status-badge", "status-tone", "status-tone--positive", "queue-status");
  });
});

describe("MetricValue", () => {
  it("renders an optional label and value with semantic tone classes", () => {
    const { container } = render(<MetricValue label="Average" value="87" tone="info" />);
    const metric = container.querySelector(".metric-value");

    expect(metric).toHaveClass("status-tone", "status-tone--info");
    expect(metric?.textContent).toBe("Average 87");
    expect(screen.getByText("Average")).toHaveClass("metric-value__label");
    expect(screen.getByText("87")).toHaveClass("metric-value__value");
  });
});

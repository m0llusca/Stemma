import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CertificationEvidenceList } from "@/components/integrations/integration-ui";
import { certificationEvidenceEmptyText } from "@/lib/integrations/probe-honesty";

describe("CertificationEvidenceList", () => {
  it("renders a full Russian empty state without half-English leftovers", () => {
    render(<CertificationEvidenceList evidence={[]} />);

    expect(screen.getByText(certificationEvidenceEmptyText)).toBeInTheDocument();
    expect(screen.queryByText(/Evidence/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\benvGate\b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\brun\b/)).not.toBeInTheDocument();
  });

  it("shows Russian run and env-gate labels for recorded evidence", () => {
    render(
      <CertificationEvidenceList
        evidence={[
          {
            id: "ev-1",
            runId: "run-abcd1234",
            result: "passed",
            envGate: "HELPDESK_LIVE_SMOKE=1;protected:live-smoke",
            recordedAt: "2026-04-01T12:00:00.000Z",
            actor: { name: "Анна", email: "anna@example.com" }
          }
        ]}
      />
    );

    expect(screen.getByText("Пройдено")).toBeInTheDocument();
    expect(screen.getByText("Св")).toBeInTheDocument();
    expect(screen.getByText(/запуск run-abcd/)).toBeInTheDocument();
    expect(screen.getByText(/Защищённый live-контур/)).toBeInTheDocument();
    expect(screen.queryByText(/HELPDESK_LIVE_SMOKE/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\benvGate\b/)).not.toBeInTheDocument();
  });
});

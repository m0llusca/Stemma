import { describe, expect, it } from "vitest";
import { formatQueueMetrics } from "@/lib/observability/metrics";

describe("formatQueueMetrics", () => {
  it("renders Prometheus text-exposition format for a sample input", () => {
    const output = formatQueueMetrics({
      queued: 3,
      running: 1,
      failed: 2,
      succeeded: 10,
      oldestQueuedAgeSeconds: 42
    });

    expect(output).toBe(
      [
        "# HELP qc_backend_jobs_queued Number of QUEUED backend jobs",
        "# TYPE qc_backend_jobs_queued gauge",
        "qc_backend_jobs_queued 3",
        "# HELP qc_backend_jobs_running Number of RUNNING backend jobs",
        "# TYPE qc_backend_jobs_running gauge",
        "qc_backend_jobs_running 1",
        "# HELP qc_backend_jobs_failed Number of FAILED backend jobs",
        "# TYPE qc_backend_jobs_failed gauge",
        "qc_backend_jobs_failed 2",
        "# HELP qc_backend_jobs_succeeded Number of SUCCEEDED backend jobs",
        "# TYPE qc_backend_jobs_succeeded gauge",
        "qc_backend_jobs_succeeded 10",
        "# HELP qc_backend_jobs_oldest_queued_age_seconds Age in seconds of the oldest QUEUED backend job",
        "# TYPE qc_backend_jobs_oldest_queued_age_seconds gauge",
        "qc_backend_jobs_oldest_queued_age_seconds 42",
        ""
      ].join("\n")
    );
  });

  it("omits the oldest-age line when age is null", () => {
    const output = formatQueueMetrics({
      queued: 0,
      running: 0,
      failed: 0,
      succeeded: 0,
      oldestQueuedAgeSeconds: null
    });

    expect(output).not.toContain("qc_backend_jobs_oldest_queued_age_seconds");
    expect(output).toContain("qc_backend_jobs_queued 0");
    expect(output.endsWith("\n")).toBe(true);
  });
});

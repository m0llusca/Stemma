type QueueMetricsInput = {
  queued: number;
  running: number;
  failed: number;
  succeeded: number;
  oldestQueuedAgeSeconds: number | null;
};

type GaugeSpec = {
  name: string;
  help: string;
  value: number;
};

function renderGauge({ name, help, value }: GaugeSpec): string {
  return [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name} ${value}`].join("\n");
}

export function formatQueueMetrics(input: QueueMetricsInput): string {
  const gauges: GaugeSpec[] = [
    { name: "qc_backend_jobs_queued", help: "Number of QUEUED backend jobs", value: input.queued },
    { name: "qc_backend_jobs_running", help: "Number of RUNNING backend jobs", value: input.running },
    { name: "qc_backend_jobs_failed", help: "Number of FAILED backend jobs", value: input.failed },
    { name: "qc_backend_jobs_succeeded", help: "Number of SUCCEEDED backend jobs", value: input.succeeded }
  ];

  if (input.oldestQueuedAgeSeconds !== null) {
    gauges.push({
      name: "qc_backend_jobs_oldest_queued_age_seconds",
      help: "Age in seconds of the oldest QUEUED backend job",
      value: input.oldestQueuedAgeSeconds
    });
  }

  return `${gauges.map(renderGauge).join("\n")}\n`;
}

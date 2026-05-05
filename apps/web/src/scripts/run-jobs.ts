import { runDueBackendJobs } from "@/lib/jobs/queue";

const defaultLimit = 10;
const defaultIntervalMs = 5000;

type WorkerOptions = {
  limit: number;
  intervalMs: number;
  queueName?: string;
  workerId: string;
  once: boolean;
};

function numberArg(args: string[], name: string, defaultValue: number) {
  const value = Number(args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1]);

  return Number.isInteger(value) && value > 0 ? value : defaultValue;
}

function stringArg(args: string[], name: string) {
  const value = args.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=").trim();

  return value || undefined;
}

function parseWorkerOptions(args: string[]): WorkerOptions {
  return {
    limit: numberArg(args, "limit", defaultLimit),
    intervalMs: numberArg(args, "interval-ms", defaultIntervalMs),
    queueName: stringArg(args, "queue"),
    workerId: stringArg(args, "worker-id") ?? `cli-${process.pid}`,
    once: args.includes("--once")
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runWorkerIteration(options: WorkerOptions) {
  const results = await runDueBackendJobs({
    limit: options.limit,
    workerId: options.workerId,
    queueName: options.queueName
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        processed: results.length,
        results
      },
      null,
      2
    )}\n`
  );
}

async function main() {
  const options = parseWorkerOptions(process.argv.slice(2));

  do {
    await runWorkerIteration(options);

    if (!options.once) {
      await sleep(options.intervalMs);
    }
  } while (!options.once);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});

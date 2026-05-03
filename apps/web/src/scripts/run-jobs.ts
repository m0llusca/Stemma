import { runDueBackendJobs } from "@/lib/jobs/queue";

const limitArg = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 10);

runDueBackendJobs({
  limit: Number.isFinite(limitArg) ? limitArg : 10,
  workerId: `cli-${process.pid}`
})
  .then((results) => {
    process.stdout.write(`${JSON.stringify({ processed: results.length, results }, null, 2)}\n`);
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  });


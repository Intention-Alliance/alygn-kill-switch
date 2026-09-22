/**
 * Job-runner smoke verification (Phase 2 acceptance).
 *
 * Exercises the job-runner lifecycle with a trivial smoke command:
 *   queued → running → succeeded, with logTail captured.
 *
 * Run: bun run scripts/verify-job-runner.ts
 */

import { enqueueRun, getRun, listRuns } from "../src/lib/job-runner";
import type { BuiltCommand } from "../src/lib/run-commands";

const smokeCommand: BuiltCommand = {
  args: ["sh", "-c", "echo 'hello from smoke'; echo 'line2'; sleep 0.2; echo 'done'"],
  cwd: process.cwd(),
};

async function main(): Promise<void> {
  const outcome = await enqueueRun("training", { dryRun: true }, smokeCommand);
  if (!outcome.ok) {
    console.error("FAIL: enqueue returned busy unexpectedly");
    process.exit(1);
  }
  console.log(`enqueued runId=${outcome.runId}`);

  // Poll until the run finishes (max ~5s).
  let run = await getRun(outcome.runId);
  const seen: string[] = [];
  for (let i = 0; i < 50; i++) {
    run = await getRun(outcome.runId);
    if (run) {
      seen.push(run.status);
      if (run.status === "succeeded" || run.status === "failed") break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  if (!run) {
    console.error("FAIL: run not found");
    process.exit(1);
  }

  console.log(`status transitions seen: ${seen.join(" -> ")}`);
  console.log(`final status: ${run.status}`);
  console.log(`exitCode: ${run.exitCode}`);
  console.log(`logTail:\n${run.logTail}`);
  console.log(`artifactPath: ${run.artifactPath}`);

  const ok =
    seen.includes("queued") &&
    seen.includes("running") &&
    run.status === "succeeded" &&
    run.exitCode === 0 &&
    run.logTail.includes("hello from smoke") &&
    run.logTail.includes("done");

  if (!ok) {
    console.error("FAIL: lifecycle or logTail assertion failed");
    process.exit(1);
  }

  // Verify listRuns returns it.
  const runs = await listRuns("training", 5);
  const found = runs.some((r) => r.id === outcome.runId);
  console.log(`listRuns found run: ${found}`);
  if (!found) {
    console.error("FAIL: listRuns did not return the run");
    process.exit(1);
  }

  console.log("\nPASS: job-runner lifecycle verified");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});

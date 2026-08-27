/**
 * Auth-guard + eval-reader verification (Phase 2 acceptance).
 *
 * 1. Unauthenticated POST → 401 (requireAuth returns a 401 NextResponse).
 * 2. GET /api/eval returns empty shape when no artifacts.
 * 3. GET /api/eval returns real shape when pointed at a sample report file.
 *
 * Run: bun run scripts/verify-auth-eval.ts
 */

import { requireAuth } from "../src/lib/auth-guard";
import { emptyReport, readNewestEvalReport } from "../src/lib/eval-report";

async function main(): Promise<void> {
  // 1. Unauthenticated request → 401.
  const request = new Request("http://localhost/api/training/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dryRun: true }),
  });
  const result = await requireAuth(request);
  if (!(result instanceof Response)) {
    console.error("FAIL: requireAuth did not return a Response for unauthenticated request");
    process.exit(1);
  }
  if (result.status !== 401) {
    console.error(`FAIL: expected 401, got ${result.status}`);
    process.exit(1);
  }
  const body = (await result.json()) as { success: boolean; error: { code: string } };
  console.log(`unauthenticated POST → ${result.status} ${JSON.stringify(body)}`);
  if (body.success !== false || body.error.code !== "UNAUTHORIZED") {
    console.error("FAIL: 401 body shape incorrect");
    process.exit(1);
  }

  // 2. Empty shape when no artifacts (point EVAL_DIR at an empty dir).
  const emptyDir = "/tmp/dignity-empty-eval";
  process.env.DIGNITY_EVAL_DIR = emptyDir;
  const empty = await readNewestEvalReport();
  console.log(`empty eval report: ${JSON.stringify(empty)}`);
  if (empty !== null) {
    console.error("FAIL: expected null report for empty eval dir");
    process.exit(1);
  }
  const emptyShape = emptyReport();
  console.log(`emptyReport shape: ${JSON.stringify(emptyShape)}`);
  if (emptyShape.runId !== null || emptyShape.accuracy !== null) {
    console.error("FAIL: emptyReport shape incorrect");
    process.exit(1);
  }

  // 3. Real shape when pointed at a sample report file.
  const fixtureDir = "/tmp/dignity-fixture-eval";
  const { mkdir, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const runDir = path.join(fixtureDir, "eval-results", "2026-08-27T00-00-00-000Z");
  await mkdir(runDir, { recursive: true });
  const fixture = {
    runId: "2026-08-27T00-00-00-000Z",
    accuracy: 0.88,
    fpr: 0.02,
    fnr: 0.05,
    confusionMatrix: {
      expected: ["SAFE", "UNSAFE", "REVIEW", "INJECTION"],
      actual: ["SAFE", "UNSAFE", "REVIEW", "INJECTION"],
      counts: [
        [10, 0, 0, 0],
        [0, 8, 1, 0],
        [0, 0, 5, 0],
        [0, 0, 0, 2],
      ],
    },
    perCategory: [{ category: "safe-factual", count: 10, total: 10, accuracyPct: 100 }],
    latencyP95Ms: 412,
    generatedAt: "2026-08-27T00:00:00.000Z",
    model: "qwen2.5:0.5B",
    suite: "v1",
    set: "all",
    gitSha: "abc123",
    count: 26,
  };
  await writeFile(path.join(runDir, "report.json"), JSON.stringify(fixture), "utf-8");

  process.env.DIGNITY_EVAL_DIR = fixtureDir;
  const real = await readNewestEvalReport();
  console.log(`real eval report: ${JSON.stringify(real)}`);
  if (!real || real.runId !== fixture.runId || real.accuracy !== 0.88) {
    console.error("FAIL: real eval report not read correctly");
    process.exit(1);
  }
  if (real.perCategory.length !== 1 || real.perCategory[0]?.accuracyPct !== 100) {
    console.error("FAIL: perCategory not mapped");
    process.exit(1);
  }

  console.log("\nPASS: auth-guard + eval-reader verified");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});

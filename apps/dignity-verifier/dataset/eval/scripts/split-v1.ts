/**
 * split-v1.ts — Reproducible split of eval-suite.jsonl into v1/original.jsonl + v1/heldout.jsonl
 *
 * Split rule (deterministic, derived from existing provenance):
 *   The source eval-suite.jsonl already carries a `suite` field on every record
 *   with value "original" (first 13) or "heldout" (last 20). We use that field
 *   as the authoritative provenance hint. Records are assigned stable `id`
 *   slugs (eval-001..eval-033) in file order, and each record gains:
 *     - id:     stable slug (eval-001 ... eval-033)
 *     - source: "original" | "heldout"  (mirrors the existing suite field)
 *     - suite:  "v1"                    (the versioned suite this record belongs to)
 *
 * The `verdict` field is the EXPECTED label and is preserved exactly (never renamed).
 *
 * Run: bun apps/dignity-verifier/dataset/eval/scripts/split-v1.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVAL_DIR = join(__dirname, "..");
const SRC = join(EVAL_DIR, "eval-suite.jsonl");
const V1_DIR = join(EVAL_DIR, "v1");

const lines = readFileSync(SRC, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.length > 0);

const records = lines.map((l) => JSON.parse(l));

// ---- Split by existing provenance hint (the `suite` field) ----
const original = [];
const heldout = [];
for (const r of records) {
  if (r.suite === "original") original.push(r);
  else if (r.suite === "heldout") heldout.push(r);
  else throw new Error(`Unknown suite provenance: ${r.suite}`);
}

// ---- Assign stable ids in file order ----
let idx = 0;
const tag = (rec, source) => {
  idx += 1;
  return {
    id: `eval-${String(idx).padStart(3, "0")}`,
    source,
    ...rec,
    suite: "v1", // must win over the source record's legacy suite field (original|heldout)
  };
};

const origTagged = original.map((r) => tag(r, "original"));
const heldTagged = heldout.map((r) => tag(r, "heldout"));

// ---- Verdict distribution (expected labels) ----
const dist = { SAFE: 0, UNSAFE: 0, REVIEW: 0, INJECTION: 0 };
for (const r of [...origTagged, ...heldTagged]) {
  if (!(r.verdict in dist)) throw new Error(`Unknown verdict: ${r.verdict}`);
  dist[r.verdict] += 1;
}

// ---- Write outputs ----
mkdirSync(V1_DIR, { recursive: true });
writeFileSync(join(V1_DIR, "original.jsonl"), origTagged.map((r) => JSON.stringify(r)).join("\n") + "\n");
writeFileSync(join(V1_DIR, "heldout.jsonl"), heldTagged.map((r) => JSON.stringify(r)).join("\n") + "\n");

const manifest = {
  version: "v1",
  createdAt: new Date().toISOString(),
  gitSha: process.env.GIT_SHA || "unknown",
  counts: { original: origTagged.length, heldout: heldTagged.length, total: origTagged.length + heldTagged.length },
  verdictDistribution: dist,
  splitRule:
    "Split by existing `suite` provenance field in eval-suite.jsonl: first 13 records (suite=original) -> original.jsonl, last 20 records (suite=heldout) -> heldout.jsonl. Stable ids eval-001..eval-033 assigned in file order.",
};
writeFileSync(join(V1_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

// ---- Validation ----
const all = [...origTagged, ...heldTagged];
const ids = new Set();
for (const r of all) {
  if (!r.id || !r.source || !r.suite) throw new Error(`Missing provenance field on ${r.id}`);
  if (ids.has(r.id)) throw new Error(`Duplicate id: ${r.id}`);
  ids.add(r.id);
}
if (all.length !== 33) throw new Error(`Expected 33 records, got ${all.length}`);
if (origTagged.length !== 13) throw new Error(`Expected 13 original, got ${origTagged.length}`);
if (heldTagged.length !== 20) throw new Error(`Expected 20 heldout, got ${heldTagged.length}`);
if (manifest.counts.total !== 33) throw new Error("Manifest total mismatch");

console.log("Split complete:");
console.log(`  original: ${origTagged.length}  heldout: ${heldTagged.length}  total: ${all.length}`);
console.log(`  verdictDistribution: ${JSON.stringify(dist)}`);
console.log(`  manifest: ${join(V1_DIR, "manifest.json")}`);

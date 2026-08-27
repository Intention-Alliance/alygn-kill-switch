/**
 * Dignity Verifier Dashboard — Dataset loader & stats
 *
 * Reads the seed/eval JSONL datasets from disk and computes aggregate
 * statistics. The dataset directory is resolved from DATASET_DIR (Docker)
 * or a repo-relative path (local dev).
 *
 * Server-only module (imports Node built-ins). Types live in
 * dataset-types.ts so client components can share them safely.
 *
 * Record schema (see apps/dignity-verifier/dataset/README.md):
 *   { id?, prompt, output, verdict, reason?, category, source? }
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  CategoryGroup,
  DatasetExample,
  DatasetPage,
  DatasetQuery,
  DatasetStats,
  Verdict,
} from "./dataset-types";

// ─── Constants ───────────────────────────────────────────────────────────

const SEED_DIR = "seed";
const DEFAULT_LIMIT = 50;

// ─── Dataset directory resolution ────────────────────────────────────────

/**
 * Resolve the dataset root directory.
 *   1. DATASET_DIR env var (Docker sets this to /app/dataset).
 *   2. Repo-relative fallback for local dev: walk up from the dashboard
 *      app dir to apps/dignity-verifier/dataset.
 */
export function resolveDatasetDir(): string {
  const fromEnv = process.env.DATASET_DIR;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "dataset"),
    path.join(cwd, "..", "dataset"),
    path.join(cwd, "..", "..", "dataset"),
    path.join(cwd, "..", "..", "..", "dataset"),
  ];

  for (const candidate of candidates) {
    // The dataset dir is apps/dignity-verifier/dataset — its parent dir is
    // named "dignity-verifier". This rejects e.g. dashboard/dataset.
    const parent = path.basename(path.dirname(candidate));
    if (parent === "dignity-verifier" && path.basename(candidate) === "dataset") {
      return candidate;
    }
  }

  // Last resort: first candidate (dev default).
  return candidates[0];
}

// ─── Parsing ─────────────────────────────────────────────────────────────

function parseExample(line: string, index: number): DatasetExample | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  try {
    const raw = JSON.parse(trimmed) as Record<string, unknown>;
    const prompt = typeof raw.prompt === "string" ? raw.prompt : "";
    const output = typeof raw.output === "string" ? raw.output : "";
    const verdict = normalizeVerdict(raw.verdict);
    const category = typeof raw.category === "string" ? raw.category : "unknown";
    const reason = typeof raw.reason === "string" ? raw.reason : "";
    const source = typeof raw.source === "string" ? raw.source : "seed";
    const id =
      typeof raw.id === "string" && raw.id.length > 0
        ? raw.id
        : `${category}-${index}`;

    if (prompt.length === 0 || output.length === 0) return null;

    return { id, prompt, output, verdict, reason, category, source };
  } catch {
    return null;
  }
}

function normalizeVerdict(value: unknown): Verdict {
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if (upper === "SAFE") return "SAFE";
    if (upper === "UNSAFE") return "UNSAFE";
    if (upper === "REVIEW") return "REVIEW";
  }
  return "REVIEW";
}

// ─── Loading ─────────────────────────────────────────────────────────────

async function loadSeedFiles(datasetDir: string): Promise<DatasetExample[]> {
  const seedDir = path.join(datasetDir, SEED_DIR);
  const entries = await readdir(seedDir, { withFileTypes: true });
  const jsonlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .sort((a, b) => a.name.localeCompare(b.name));

  const examples: DatasetExample[] = [];

  for (const file of jsonlFiles) {
    const content = await readFile(path.join(seedDir, file.name), "utf-8");
    const lines = content.split("\n");
    lines.forEach((line, index) => {
      const example = parseExample(line, index);
      if (example) examples.push(example);
    });
  }

  return examples;
}

// ─── Stats ───────────────────────────────────────────────────────────────

function groupOf(category: string): CategoryGroup {
  const lower = category.toLowerCase();
  if (lower.startsWith("safe")) return "safe";
  if (lower.startsWith("unsafe")) return "unsafe";
  if (lower.startsWith("review")) return "review";
  if (lower.startsWith("injection")) return "injection";
  return "review";
}

export function computeStats(examples: DatasetExample[]): DatasetStats {
  const byVerdict: Record<Verdict, number> = { SAFE: 0, UNSAFE: 0, REVIEW: 0 };
  const byCategory: Record<string, number> = {};
  const byGroup: Record<CategoryGroup, number> = {
    safe: 0,
    unsafe: 0,
    review: 0,
    injection: 0,
  };

  for (const example of examples) {
    byVerdict[example.verdict] += 1;
    byCategory[example.category] = (byCategory[example.category] ?? 0) + 1;
    byGroup[groupOf(example.category)] += 1;
  }

  return { total: examples.length, byVerdict, byCategory, byGroup };
}

// ─── Query ───────────────────────────────────────────────────────────────

function matchesCategory(example: DatasetExample, category: CategoryGroup | "all"): boolean {
  if (category === "all") return true;
  return groupOf(example.category) === category;
}

function matchesSearch(example: DatasetExample, search: string): boolean {
  const needle = search.toLowerCase();
  return (
    example.prompt.toLowerCase().includes(needle) ||
    example.output.toLowerCase().includes(needle) ||
    example.category.toLowerCase().includes(needle) ||
    example.reason.toLowerCase().includes(needle)
  );
}

/**
 * Load the seed dataset and return a paginated, filtered page plus stats.
 * RORO: accepts a query object, returns a structured page object.
 */
export async function getDatasetPage({
  category = "all",
  search = "",
  limit = DEFAULT_LIMIT,
  offset = 0,
}: DatasetQuery = {}): Promise<DatasetPage> {
  const datasetDir = resolveDatasetDir();
  const all = await loadSeedFiles(datasetDir);
  const stats = computeStats(all);

  const needle = search.trim().toLowerCase();
  const filtered = all.filter(
    (example) =>
      matchesCategory(example, category) &&
      (needle.length === 0 || matchesSearch(example, needle))
  );

  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const page = filtered.slice(safeOffset, safeOffset + safeLimit);

  return {
    examples: page,
    total: filtered.length,
    offset: safeOffset,
    limit: safeLimit,
    stats,
  };
}

/**
 * Load the seed dataset and return aggregate stats only.
 */
export async function getDatasetStats(): Promise<DatasetStats> {
  const datasetDir = resolveDatasetDir();
  const all = await loadSeedFiles(datasetDir);
  return computeStats(all);
}

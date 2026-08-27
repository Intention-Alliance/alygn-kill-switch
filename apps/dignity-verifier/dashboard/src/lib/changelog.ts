/**
 * Dignity Verifier Dashboard — Changelog
 *
 * Server-side reader for the model changelog. Entries live in
 * `docs/changelog.json` (next to the dashboard source) and are rendered in
 * reverse chronological order (newest first).
 *
 * To update: append a new entry object to `docs/changelog.json` after each
 * training run or framework milestone. The page picks it up automatically.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  description: string;
}

const CHANGELOG_PATH = join(process.cwd(), "docs", "changelog.json");

/**
 * Load changelog entries from `docs/changelog.json`, newest first.
 *
 * Returns an empty array if the file is missing or malformed so the page
 * degrades gracefully instead of crashing.
 */
export async function getChangelog(): Promise<ChangelogEntry[]> {
  try {
    const raw = await readFile(CHANGELOG_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries = parsed.filter(isChangelogEntry);
    return entries.sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

function isChangelogEntry(value: unknown): value is ChangelogEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.version === "string" &&
    typeof entry.date === "string" &&
    typeof entry.title === "string" &&
    typeof entry.description === "string"
  );
}

/**
 * types.ts — Shared types for the Andler Develops content pipeline.
 *
 * Pipeline: CURATE → DRAFT → SCORE → APPROVE (auto/human) → POST
 */

export type Platform = 'x-single' | 'x-thread' | 'linkedin' | 'tiktok' | 'youtube' | 'instagram';
export type Audience = 'web3' | 'cto' | 'eng-lead' | 'personal';
export type Decision = 'auto-publish' | 'queue-for-review';

// ═══════════════════════════════════════════════════════════════════
// STAGE 1: CURATE
// ═══════════════════════════════════════════════════════════════════
export interface CuratedItem {
  id: string;
  raw: string;
  topic: string;
  audience: Audience;
  source: string;
  curatedAt: string; // ISO 8601
}

export interface CuratedOutput {
  run_id: string;
  since: string;
  source: string;
  generated_at: string;
  items: CuratedItem[];
}

// ═══════════════════════════════════════════════════════════════════
// STAGE 2: DRAFT
// ═══════════════════════════════════════════════════════════════════
export interface DraftedItem extends CuratedItem {
  platform: Platform;
  body: string;
  hashtags: string[];
  cta: string;
  draftedAt: string;
}

export interface DraftOutput {
  run_id: string;
  generated_at: string;
  drafts: DraftedItem[];
}

// ═══════════════════════════════════════════════════════════════════
// STAGE 3: SCORE
// ═══════════════════════════════════════════════════════════════════
export interface ScoreBreakdown {
  brandVoice: number;       // 0–25
  length: number;           // 0–15
  hashtags: number;         // 0–10
  cta: number;              // 0–15
  technicalDensity: number; // 0–15
  ndaFilter: number;        // 0–20 (fail if NDA leak)
}

export interface ScoredItem extends DraftedItem {
  score: number;            // 0–100
  scoreBreakdown: ScoreBreakdown;
  decision: Decision;
  scoredAt: string;
}

export interface ScoredOutput {
  run_id: string;
  generated_at: string;
  threshold: number;
  scored: ScoredItem[];
}

// ═══════════════════════════════════════════════════════════════════
// STAGE 4: PUBLISH / QUEUE
// ═══════════════════════════════════════════════════════════════════
export interface PublishedItem extends ScoredItem {
  publishedAt: string;
  publishedUrl: string;
}

export interface PublishedOutput {
  run_id: string;
  generated_at: string;
  published: PublishedItem[];
}

export interface QueuedItem extends ScoredItem {
  notionPageId?: string;
  queuedAt: string;
}

export interface QueuedOutput {
  run_id: string;
  generated_at: string;
  queued: QueuedItem[];
}

// ═══════════════════════════════════════════════════════════════════
// NDA FILTER
// ═══════════════════════════════════════════════════════════════════
export const NDA_PATTERNS = [
  'alygn',
  'alyyygn',
  'aialygn',
  'bitcash',
  'masterbots',
  'tanialeaidm',
  'alyyygn@gmail',
] as const;

/**
 * Returns true if the text contains any NDA pattern (case-insensitive).
 */
export function hasNdaViolation(text: string): boolean {
  const lower = text.toLowerCase();
  return NDA_PATTERNS.some((pattern) => lower.includes(pattern));
}

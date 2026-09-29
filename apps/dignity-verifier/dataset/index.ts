/**
 * Dignity Verifier — Dataset Index
 *
 * Builds an in-memory index over the dataset for fast keyword queries and
 * semantic search. Semantic search uses the local Ollama embedding model
 * (`nomic-embed-text-v2-moe`) via Ollama's `/api/embed` endpoint.
 *
 * Owned by Zuldrak. Strict TypeScript, no `any`. All functions are async.
 */

import { readDataset } from './storage';
import type { Category, DatasetExample, Verdict } from './types';

/** Default Ollama base URL. */
const DEFAULT_OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';

/** Default embedding model. */
const DEFAULT_EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'nomic-embed-text-v2-moe:latest';

/** Default number of results for search. */
const DEFAULT_LIMIT = 10;

/** A single indexed example with its derived keyword tokens. */
interface IndexedExample {
  example: DatasetExample;
  /** Lowercased tokens from prompt + output. */
  tokens: Set<string>;
}

/** In-memory index over the dataset. */
export class DatasetIndex {
  private readonly examples: IndexedExample[] = [];
  private readonly byId = new Map<string, IndexedExample>();
  private readonly byVerdict = new Map<Verdict, IndexedExample[]>();
  private readonly byCategory = new Map<Category, IndexedExample[]>();
  private readonly tokenIndex = new Map<string, Set<number>>();
  private readonly ollamaUrl: string;
  private readonly embeddingModel: string;

  private constructor(ollamaUrl: string, embeddingModel: string) {
    this.ollamaUrl = ollamaUrl;
    this.embeddingModel = embeddingModel;
  }

  /**
   * Build an index over the dataset. Reads all JSONL files under the dataset
   * root and indexes them in memory.
   */
  static async buildIndex(
    ollamaUrl: string = DEFAULT_OLLAMA_URL,
    embeddingModel: string = DEFAULT_EMBEDDING_MODEL,
  ): Promise<DatasetIndex> {
    const index = new DatasetIndex(ollamaUrl, embeddingModel);
    const examples = await readDataset();
    for (const example of examples) index.add(example);
    return index;
  }

  /** Add a single example to the index. */
  private add(example: DatasetExample): void {
    const tokens = tokenize(`${example.prompt} ${example.output}`);
    const entry: IndexedExample = { example, tokens };
    const idx = this.examples.length;
    this.examples.push(entry);
    this.byId.set(example.id, entry);

    const verdictBucket = this.byVerdict.get(example.verdict) ?? [];
    verdictBucket.push(entry);
    this.byVerdict.set(example.verdict, verdictBucket);

    const categoryBucket = this.byCategory.get(example.category) ?? [];
    categoryBucket.push(entry);
    this.byCategory.set(example.category, categoryBucket);

    for (const token of tokens) {
      const bucket = this.tokenIndex.get(token) ?? new Set<number>();
      bucket.add(idx);
      this.tokenIndex.set(token, bucket);
    }
  }

  /** Total number of indexed examples. */
  get size(): number {
    return this.examples.length;
  }

  /** Get an example by id. Returns undefined if not indexed. */
  getById(id: string): DatasetExample | undefined {
    return this.byId.get(id)?.example;
  }

  /** Get examples by verdict. */
  byVerdictValue(verdict: Verdict): DatasetExample[] {
    return (this.byVerdict.get(verdict) ?? []).map((e) => e.example);
  }

  /** Get examples by category. */
  byCategoryValue(category: Category): DatasetExample[] {
    return (this.byCategory.get(category) ?? []).map((e) => e.example);
  }

  /**
   * Keyword search over prompt+output. Scores examples by the number of
   * matching tokens (simple TF-style overlap). Returns top `limit` results.
   */
  search(query: string, limit: number = DEFAULT_LIMIT): DatasetExample[] {
    const queryTokens = tokenize(query);
    if (queryTokens.size === 0) return [];

    const scores = new Map<number, number>();
    for (const token of queryTokens) {
      const bucket = this.tokenIndex.get(token);
      if (!bucket) continue;
      for (const idx of bucket) {
        scores.set(idx, (scores.get(idx) ?? 0) + 1);
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([idx]) => this.examples[idx]!.example);
  }

  /**
   * Semantic search via Ollama embeddings. Embeds the query text, then returns
   * the `limit` most similar examples by cosine similarity. Falls back to
   * keyword search if the embedding call fails.
   */
  async semanticSearch(text: string, limit: number = DEFAULT_LIMIT): Promise<DatasetExample[]> {
    const queryVector = await this.embed(text);
    if (queryVector.length === 0) return this.search(text, limit);

    const scored: Array<{ example: DatasetExample; score: number }> = [];
    for (const entry of this.examples) {
      const vec = await this.embed(`${entry.example.prompt} ${entry.example.output}`);
      if (vec.length === 0) continue;
      scored.push({ example: entry.example, score: cosine(queryVector, vec) });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.example);
  }

  /**
   * Get examples semantically similar to a given example id. Returns the
   * `limit` most similar examples (excluding the example itself).
   */
  async getSimilar(exampleId: string, limit: number = DEFAULT_LIMIT): Promise<DatasetExample[]> {
    const target = this.byId.get(exampleId);
    if (!target) return [];

    const targetVec = await this.embed(`${target.example.prompt} ${target.example.output}`);
    if (targetVec.length === 0) return [];

    const scored: Array<{ example: DatasetExample; score: number }> = [];
    for (const entry of this.examples) {
      if (entry.example.id === exampleId) continue;
      const vec = await this.embed(`${entry.example.prompt} ${entry.example.output}`);
      if (vec.length === 0) continue;
      scored.push({ example: entry.example, score: cosine(targetVec, vec) });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.example);
  }

  /**
   * Embed text via Ollama's `/api/embed` endpoint. Returns an empty array on
   * failure (caller falls back to keyword search).
   */
  private async embed(text: string): Promise<number[]> {
    try {
      const res = await fetch(`${this.ollamaUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.embeddingModel, input: text }),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { embeddings?: number[][] };
      const embeddings = data.embeddings;
      if (!embeddings || embeddings.length === 0) return [];
      return embeddings[0] ?? [];
    } catch {
      return [];
    }
  }
}

/** Tokenize text into lowercased alphanumeric tokens. */
function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of text.toLowerCase().matchAll(/[a-z0-9]+/g)) {
    tokens.add(match[0]);
  }
  return tokens;
}

/** Cosine similarity between two vectors. Returns 0 for empty/zero vectors. */
function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Dignity Verifier Dashboard — Drizzle schema
 *
 * Self-contained SQLite schema for Better-Auth (super-admin only) plus
 * the training-framework domain tables (datasets, training runs, reports).
 *
 * Auth tables mirror the Better-Auth drizzle adapter contract:
 *   users, sessions, accounts, verifications, webauthn_credential
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ─── Better-Auth tables ─────────────────────────────────────────────────

export const users = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("super-admin"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const sessions = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const accounts = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  password: text("password"),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  idToken: text("id_token"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verifications = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// WebAuthn (FIDO2) credential storage — mirrors kill-switch ADR-143.
export const webauthnCredential = sqliteTable("webauthn_credential", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  transports: text("transports"),
  deviceType: text("device_type"),
  backedUp: integer("backed_up", { mode: "boolean" }).notNull().default(false),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ─── Training Framework domain tables ────────────────────────────────────

/** A single dataset example (seed or augmented). */
export const datasetExamples = sqliteTable("dataset_example", {
  id: text("id").primaryKey(),
  prompt: text("prompt").notNull(),
  output: text("output").notNull(),
  verdict: text("verdict").notNull(), // SAFE | UNSAFE | REVIEW
  reason: text("reason"),
  category: text("category").notNull(),
  source: text("source").notNull().default("seed"), // seed | augmented
  verifiedByTeacher: integer("verified_by_teacher", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/** A training run (LoRA fine-tune execution). */
export const trainingRuns = sqliteTable("training_run", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("pending"), // pending | running | completed | failed
  baseModel: text("base_model").notNull(),
  targetModel: text("target_model").notNull(),
  loraRank: integer("lora_rank").notNull().default(8),
  epochs: integer("epochs").notNull().default(3),
  batchSize: integer("batch_size").notNull().default(4),
  learningRate: text("learning_rate").notNull().default("2e-4"),
  datasetSize: integer("dataset_size").notNull().default(0),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  accuracy: integer("accuracy"), // 0-100 eval accuracy
  logPath: text("log_path"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/** Eval suite results. */
export const evalResults = sqliteTable("eval_result", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => trainingRuns.id, { onDelete: "set null" }),
  model: text("model").notNull(),
  totalTests: integer("total_tests").notNull(),
  passed: integer("passed").notNull(),
  accuracy: integer("accuracy").notNull(), // 0-100
  details: text("details"), // JSON of per-test results
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/**
 * A job-runner run record (training / augment / calibrate).
 *
 * The dashboard triggers teaching pipelines as subprocesses. Each trigger
 * persists a row here so the UI can track queued → running → succeeded/failed
 * lifecycle, capture a bounded log tail, and surface the exit code.
 */
export const runs = sqliteTable("run", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // training | augment | calibrate
  status: text("status").notNull().default("queued"), // queued | running | succeeded | failed
  params: text("params").notNull().default("{}"), // JSON of the trigger params
  startedAt: integer("started_at", { mode: "timestamp" }),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  exitCode: integer("exit_code"),
  logTail: text("log_tail").notNull().default(""), // bounded tail (≤100 lines)
  artifactPath: text("artifact_path"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

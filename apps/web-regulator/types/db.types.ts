/**
 * Database row types for the dashboard.
 *
 * Local definitions replacing the generated Supabase types that lived in
 * `packages/db-schema` (removed in 9452c77 — the legacy Supabase schema was
 * dropped when the project moved to owned databases: SQLite/PostgreSQL).
 *
 * Field shapes are preserved from the last generated Supabase types
 * (git history, 9452c77^) so existing consumers keep compiling unchanged.
 * If the live schema drifts from these shapes, update them here — this file
 * is now the source of truth for dashboard-side row types.
 */

export interface ComplianceAuditLogRow {
	dpu_id: string;
	id: string;
	intent_hash: string;
	/** JSON payload; shape not consumed by the dashboard, kept permissive. */
	proof_data: unknown;
	redline_violated: string | null;
	timestamp: string;
}

export interface DpuClusterRow {
	avg_latency: number | null;
	created_at: string | null;
	gpus: number;
	id: string;
	last_heartbeat: string | null;
	last_seen: string | null;
	location: string;
	name: string;
	policy_violations: number | null;
	slug: string;
	status: string;
	total_requests: number | null;
	updated_at: string | null;
	uptime: number | null;
}

export interface ClusterGpuRow {
	cluster_id: string;
	cores: number;
	created_at: string | null;
	id: string;
	memory_gb: number;
	model: string;
	updated_at: string | null;
}

export interface AuditLogEntry extends ComplianceAuditLogRow {}

export interface Cluster extends DpuClusterRow {
	cluster_gpus?: ClusterGPU[];
}

export interface ClusterGPU extends ClusterGpuRow {}
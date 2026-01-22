import type { Tables } from "@packages/db-schema";

export interface AuditLogEntry extends Tables<"compliance_audit_log"> {}
export interface Cluster extends Tables<"dpu_clusters"> {
	cluster_gpus?: ClusterGPU[];
}
export interface ClusterGPU extends Tables<"cluster_gpus"> {}

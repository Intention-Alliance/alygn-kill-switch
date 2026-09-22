import type { Tables } from "@packages/db-schema";

export type AuditLogEntry = Tables<"compliance_audit_log">;
export interface Cluster extends Tables<"dpu_clusters"> {
	cluster_gpus?: ClusterGPU[];
}
export type ClusterGPU = Tables<"cluster_gpus">;

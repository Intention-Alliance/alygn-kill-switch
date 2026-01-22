import type { Tables } from "@packages/db-schema";

export interface AuditLogEntry extends Tables<"compliance_audit_log"> {}
export interface Cluster extends Tables<"dpu_clusters"> {}

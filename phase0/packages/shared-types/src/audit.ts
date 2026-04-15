// Stub — will be expanded in Phase B2
export interface OllamaAuditEntry {
  id: string;
  createdAt: string;
  model: string;
  method: string;
  endpoint: string;
  promptTokens: number | null;
  completionTokens: number | null;
  clientIp: string;
  clientId: string | null;
  statusCode: number;
  latencyMs: number;
  errorMessage: string | null;
  killSwitchState: string;
  traceId: string | null;
}

export interface OllamaAuditStats {
  totalRequests: number;
  avgLatencyMs: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  topModels: { model: string; count: number }[];
  requestsPerMinute: number;
}

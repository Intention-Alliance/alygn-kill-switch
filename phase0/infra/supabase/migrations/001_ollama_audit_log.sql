-- Ollama Request Audit Log
-- Phase B2: Structured logging for Ollama API requests
-- All Ollama requests proxied through Next.js BFF are logged here

CREATE TABLE IF NOT EXISTS ollama_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Request metadata
  model TEXT NOT NULL,
  method TEXT NOT NULL,           -- POST /api/generate, POST /api/chat, etc.
  endpoint TEXT NOT NULL,         -- /api/generate, /api/chat, /api/embeddings
  prompt_tokens INT,              -- Estimated from request
  completion_tokens INT,          -- From response

  -- Client info
  client_ip TEXT NOT NULL,
  client_id TEXT,                 -- API key or user identifier

  -- Response metadata
  status_code INT NOT NULL,
  latency_ms INT NOT NULL,
  error_message TEXT,

  -- Kill switch state at time of request
  kill_switch_state TEXT NOT NULL DEFAULT 'ARMED',

  -- Trace correlation
  trace_id TEXT
);

-- Indexes for dashboard queries
CREATE INDEX idx_audit_created_at ON ollama_audit_log(created_at DESC);
CREATE INDEX idx_audit_model ON ollama_audit_log(model);
CREATE INDEX idx_audit_client_ip ON ollama_audit_log(client_ip);
CREATE INDEX idx_audit_status_code ON ollama_audit_log(status_code);
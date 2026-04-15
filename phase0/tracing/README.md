# Distributed Tracing - Phase 0 Infrastructure

## Quick Start

```bash
cd /home/andlersrv/.openclaw/workspace/phase0/tracing
docker compose up -d
# Jaeger UI: http://localhost:16686
# OTel Collector: grpc://localhost:4317
```

## Architecture

```
Services → OTLP (4317/4318) → OTel Collector → Jaeger (4317)
                                        ↓
                               Tail Sampling:
                               • 100% errors
                               • Latency >2s
                               • Chaos experiment spans
                               • 10% health checks
```

## Node.js Integration

```javascript
// At the TOP of your entry file:
import './phase0/tracing/tracing-sdk.mjs';

import { recordSpan, getTraceHeaders } from './phase0/tracing/tracing-sdk.mjs';

// Record a span
await recordSpan('my.operation', { 'operation.type': 'critical' }, async (span) => {
  span.setAttribute('custom.key', 'value');
  // ... do work
});

// Propagate trace headers to outgoing requests
const headers = getTraceHeaders();
await fetch('http://other-service/api', { headers });
```

## Express Middleware

```javascript
import { traceContextMiddleware } from './phase0/tracing/trace-context-middleware.mjs';
app.use(traceContextMiddleware());
```

## Cross-ADR Headers

| Header | Source | Purpose |
|--------|--------|---------|
| `X-Trace-ID` | ADR-115 | Distributed tracing correlation |
| `X-Chaos-Experiment-ID` | ADR-117 | Chaos impact tracking |
| `X-Feature-Flag-Context` | ADR-116 | Flag evaluation context |

## Required NPM Packages

```bash
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-grpc @opentelemetry/api \
  @opentelemetry/semantic-conventions
```
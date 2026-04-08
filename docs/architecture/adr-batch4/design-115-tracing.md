# ADR-115: Distributed Tracing

## Status
Proposed

## Context
As the system grows in complexity, debugging requests that span multiple services becomes difficult. We lack a unified view of a request's lifecycle across the distributed system.

## Decision
Integrate Distributed Tracing using the OpenTelemetry (OTel) standard:
1. **OTel Instrumentation**: Add OTel SDKs to all services to capture spans and traces.
2. **Context Propagation**: Ensure Trace IDs are passed via HTTP headers (W3C Trace Context) across all service boundaries.
3. **Span Collection**: Deploy an OTel Collector to aggregate traces from various services.
4. **Visualization**: Export data to Jaeger or Zipkin for trace analysis and bottleneck identification.

## Consequences
- **Easier**: Pinpointing exactly where a request is slowing down or failing in a microservices chain.
- **More Difficult**: Slight overhead in request latency and storage costs for trace data.

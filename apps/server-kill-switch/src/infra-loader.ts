// Infrastructure module loader — bridges cross-rootDir imports for TypeScript
// At runtime, Bun resolves these paths from the workspace's node_modules.
// The .mjs modules live under src/infra/ so Bun resolves their deps
// (@opentelemetry/*, redis) from apps/server-kill-switch/node_modules.

export async function loadRedisPool() {
  const { RedisPool } = await import('./infra/redis-cluster-pool.mjs');
  return RedisPool;
}

export async function loadTracing() {
  try {
    const { recordSpan } = await import('./infra/tracing-sdk.mjs');
    return { recordSpan };
  } catch (err: any) {
    console.error('[tracing] OTel SDK load failed, using no-op tracer:', err.message);
    return { recordSpan: async (name: string, _attrs: any, fn: (span: any) => any) => fn({ spanContext: () => ({ traceId: 'noop' }), setAttribute: () => {} }) };
  }
}

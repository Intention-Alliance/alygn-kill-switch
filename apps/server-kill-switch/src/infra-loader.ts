// Infrastructure module loader — bridges cross-rootDir imports for TypeScript
// At runtime, Bun resolves these paths from the workspace root.
// Path: ../../.. from apps/server-kill-switch/src/ = workspace_root/
// Then infra/redis/ and infra/tracing/

export async function loadRedisPool() {
  const { RedisPool } = await import('../../../infra/redis/redis-cluster-pool.mjs');
  return RedisPool;
}

export async function loadTracing() {
  try {
    const { recordSpan } = await import('../../../infra/tracing/tracing-sdk.mjs');
    return { recordSpan };
  } catch (err: any) {
    console.error('[tracing] OTel SDK load failed, using no-op tracer:', err.message);
    return { recordSpan: async (name: string, _attrs: any, fn: (span: any) => any) => fn({ spanContext: () => ({ traceId: 'noop' }), setAttribute: () => {} }) };
  }
}

// Infrastructure module loader — bridges cross-rootDir imports for TypeScript
// At runtime, Bun resolves these paths from the workspace root.
// Path: ../../.. from apps/server-kill-switch/src/ = workspace_root/
// Then infra/redis/ and infra/tracing/

export async function loadRedisPool() {
  const { RedisPool } = await import('../../../infra/redis/redis-cluster-pool.mjs');
  return RedisPool;
}

export async function loadTracing() {
  const { recordSpan } = await import('../../../infra/tracing/tracing-sdk.mjs');
  return { recordSpan };
}

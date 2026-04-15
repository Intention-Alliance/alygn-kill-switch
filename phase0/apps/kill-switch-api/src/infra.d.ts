// Type declarations for infra .mjs modules
// These are plain JS modules without type declarations
// Using wildcard module declaration since relative paths in declare module
// don't resolve well with bundler moduleResolution

declare module '*redis-cluster-pool.mjs' {
  export class RedisPool {
    constructor(opts: { urls: string[]; poolSize?: number });
    connect(): Promise<void>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    publish(channel: string, message: string): Promise<void>;
    subscribe(channel: string, handler: (message: string) => void): Promise<void>;
    healthCheck(): Promise<{ redis: string }>;
    chaosKillSwitchKey(): string;
  }
}

declare module '*tracing-sdk.mjs' {
  export function recordSpan<T>(
    name: string,
    attributes: Record<string, string>,
    fn: (span: any) => Promise<T>,
  ): Promise<T>;
  export const tracer: any;
}
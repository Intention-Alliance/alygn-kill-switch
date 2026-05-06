// Redis Pool type — local definition to avoid cross-rootDir imports
// Matches infra/redis/redis-cluster-pool.mjs interface

export interface RedisPool {
  acquire(): Promise<any>;
  release(client: any): void;
  withClient<T>(fn: (client: any) => Promise<T>): Promise<T>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<string | null>;
  del(key: string): Promise<number>;
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string, callback: (message: string) => void): Promise<void>;
  healthCheck(): Promise<{ redis: string }>;
  chaosKillSwitchKey(): string;
  connect(): Promise<void>;
}
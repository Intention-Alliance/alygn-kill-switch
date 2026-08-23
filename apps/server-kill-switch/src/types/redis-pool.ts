// Redis Pool type — local definition to avoid cross-rootDir imports
// Matches src/infra/redis-cluster-pool.mjs interface

export interface RedisPool {
  getClient(): Promise<any>;
  release(client: any): void;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<string | null>;
  del(key: string): Promise<number>;
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string, callback: (message: string) => void): Promise<void>;
  healthCheck(): Promise<{ redis: string }>;
  chaosKillSwitchKey(): string;
  connect(): Promise<void>;
  withClient?(fn: (client: any) => any): any;
  acquire?(): Promise<any>;
  releaseClient?(client: any): void;
}
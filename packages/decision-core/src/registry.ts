/**
 * Provider registry — name → DecisionProvider.
 *
 * Registration is presence-based: `jev` is registered only when an api key
 * exists, `remote` only when a mother URL exists. Absence is NOT an error;
 * the selector turns a missing provider into the fail-closed review path.
 */

import type { DecisionProvider, ProviderName } from '@align/shared-types';
import { KeywordProvider } from './providers/keyword';
import { OllamaProvider, type VerifierLike } from './providers/ollama';
import { JevProvider } from './providers/jev';
import { RemoteProvider } from './providers/remote';

export class ProviderRegistry {
  private readonly providers = new Map<string, DecisionProvider>();

  register(provider: DecisionProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): DecisionProvider | undefined {
    return this.providers.get(name);
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  names(): string[] {
    return [...this.providers.keys()];
  }
}

export interface BuildRegistryOpts {
  threshold: number;
  verifier?: VerifierLike;
  jev?: { apiKey: string; baseUrl?: string; model?: string; timeoutMs?: number };
  remote?: { motherUrl: string; apiKey: string; machineId: string };
}

/**
 * Builds the registry for a given process.
 *   server:      keyword + ollama + jev (when TYPESAFE_API_KEY set)
 *   agent-plane: keyword + ollama + remote (when a mother URL is set)
 */
export function buildRegistry(opts: BuildRegistryOpts): ProviderRegistry {
  const registry = new ProviderRegistry();

  registry.register(new KeywordProvider(opts.threshold));

  if (opts.verifier) {
    registry.register(new OllamaProvider(opts.verifier));
  }

  if (opts.jev && opts.jev.apiKey) {
    registry.register(
      new JevProvider({
        apiKey: opts.jev.apiKey,
        baseUrl: opts.jev.baseUrl,
        model: opts.jev.model,
        timeoutMs: opts.jev.timeoutMs,
      }),
    );
  }

  if (opts.remote && opts.remote.motherUrl) {
    registry.register(
      new RemoteProvider({
        motherUrl: opts.remote.motherUrl,
        apiKey: opts.remote.apiKey,
        machineId: opts.remote.machineId,
      }),
    );
  }

  return registry;
}

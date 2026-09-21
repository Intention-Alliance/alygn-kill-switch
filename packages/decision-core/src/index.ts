/**
 * @align/decision-core — DecisionProvider implementations + fail-closed selector.
 *
 * One interface for keyword / ollama / jev / remote (and later the distilled
 * dignity model). The selector is the single safety-critical entry point:
 * it NEVER throws and NEVER returns action='forward' when degraded === true.
 */

export * from './providers/keyword';
export * from './providers/ollama';
export * from './providers/jev';
export * from './providers/remote';
export * from './registry';
export * from './selector';

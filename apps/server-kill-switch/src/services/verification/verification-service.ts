/**
 * Verification Service — orchestration layer for inference verification.
 *
 * Decides WHEN to verify and WHAT to do with the verdict. This is the module
 * the middleware/route calls.
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §b.3 + P1-1 (Andler's refinement).
 *
 * Modes:
 *   - ASYNC (default): fire-and-forget verification, return immediately.
 *     Zero added latency. An UNSAFE result halts the offending fingerprint
 *     for the NEXT request from it.
 *   - SYNC (opt-in): await verification and return the result. The middleware
 *     rejects UNSAFE with 403 before the response is sent.
 *
 * UNSAFE verdict handling (P1-1 — scoped halt, NOT global STOPPED):
 *   1. The offending fingerprint is BLOCKED (per-fingerprint blocklist in
 *      services/fingerprint-halt.ts) — its own generation requests get 503
 *      while the rest of the fleet keeps flowing.
 *   2. The UNSAFE verdict is recorded in the fingerprint's eval-window
 *      history.
 *   3. The GLOBAL kill_switch_state is flipped to STOPPED ONLY when ALL
 *      active fingerprints show UNSAFE inside the eval window (escalation
 *      rule) — a single UNSAFE never flips the global state.
 *   4. Self-heal: a later SAFE verdict from the fingerprint unblocks it, or
 *      the block TTL expires (10 min default).
 *
 * The fingerprint identifier is persisted via verification_event.machineId
 * so the audit trail records which identity was halted.
 */

import type { KillSwitchService } from '../kill-switch';
import { recordVerificationEvent, type PublishFn } from './verification-event';
import { InferenceVerifier, type VerificationResult } from './verifier';
import {
  blockFingerprint,
  isFingerprintBlocked,
  recordSafeVerdict,
  recordUnsafeVerdict,
  shouldEscalateToGlobal,
  unblockFingerprint,
  type FingerprintBlock,
} from '../fingerprint-halt';

export type VerificationMode = 'async' | 'sync';

export interface VerificationServiceOpts {
  verifier?: InferenceVerifier;
  mode?: VerificationMode;          // default 'async'
  autoKillOnUnsafe?: boolean;       // default true — scoped halt + escalation policy
  killSwitch?: KillSwitchService;   // injected for the escalated STOPPED transition
  publish?: PublishFn;              // Redis pubsub for bcp:verification:events
  persistEvents?: boolean;          // default true — write verification_event rows
}

export interface VerificationContext {
  prompt: string;
  output: string;
  requestId: string;
  machineId?: string;
  /** Derived fingerprint identity (P1-1) — persisted via machineId. */
  fingerprint?: string;
  /** Fingerprint source label for the block record. */
  fingerprintSource?: FingerprintBlock['source'];
}

export interface HandleInferenceResult {
  mode: VerificationMode;
  result?: VerificationResult;
  /** P1-1: set when the verdict blocked the request's fingerprint. */
  blockedFingerprint?: FingerprintBlock;
  /** P1-1: set when the verdict escalated to a global STOPPED. */
  escalatedToGlobal?: boolean;
}

export class VerificationService {
  private readonly verifier: InferenceVerifier;
  /** Verification mode — 'async' (default) or 'sync'. Public so the middleware can branch. */
  readonly mode: VerificationMode;
  private readonly autoKillOnUnsafe: boolean;
  private readonly killSwitch?: KillSwitchService;
  private readonly publish?: PublishFn;
  private readonly persistEvents: boolean;

  constructor(opts: VerificationServiceOpts = {}) {
    this.verifier = opts.verifier ?? new InferenceVerifier();
    this.mode = opts.mode ?? 'async';
    this.autoKillOnUnsafe = opts.autoKillOnUnsafe ?? true;
    this.killSwitch = opts.killSwitch;
    this.publish = opts.publish;
    this.persistEvents = opts.persistEvents ?? true;
  }

  /**
   * Called by the inference middleware/route with the request context.
   *
   * ASYNC mode: fire-and-forget verification, return immediately. The
   * verifier runs in a detached task that cannot throw into the response
   * path (wrapped in try/catch, never rejects the request).
   *
   * SYNC mode: await verification and return the result.
   */
  async handleInferenceRequest(ctx: VerificationContext): Promise<HandleInferenceResult> {
    if (this.mode === 'sync') {
      return this.verifyAndAct(ctx);
    }

    // ASYNC — fire-and-forget. Detached task; never reject the request.
    void this.verifyAndAct(ctx).catch((err) => {
      console.error('[verification] Async verification failed (non-fatal):', err instanceof Error ? err.message : err);
    });
    return { mode: 'async' };
  }

  /**
   * Run verification + act on the verdict.
   *
   * P1-1: UNSAFE → scoped fingerprint halt (block + record), escalate to
   * global STOPPED only when ALL active fingerprints are UNSAFE in the eval
   * window. SAFE → unblock the fingerprint (self-heal).
   */
  private async verifyAndAct(ctx: VerificationContext): Promise<HandleInferenceResult> {
    const result = await this.verifier.verify({ prompt: ctx.prompt, output: ctx.output });

    let triggeredKill = false;
    let blockedFingerprint: FingerprintBlock | undefined;
    let escalatedToGlobal = false;

    if (result.verdict === 'UNSAFE' && this.autoKillOnUnsafe) {
      if (ctx.fingerprint) {
        // Scoped halt: block THIS fingerprint, never the whole fleet.
        blockedFingerprint = blockFingerprint(ctx.fingerprint, ctx.fingerprintSource ?? 'ip-ua');
        recordUnsafeVerdict(ctx.fingerprint);
        console.warn(
          `[verification] UNSAFE verdict — fingerprint ${ctx.fingerprint} blocked (scoped halt, TTL ${blockedFingerprint.expiresAt - Date.now()}ms)`,
        );

        // Escalation rule: global STOPPED ONLY when ALL active fingerprints
        // show UNSAFE in the eval window.
        if (shouldEscalateToGlobal()) {
          console.error(
            '[verification] ESCALATION: all active fingerprints UNSAFE in eval window — transitioning to global STOPPED',
          );
          triggeredKill = await this.triggerStop(ctx.machineId);
          escalatedToGlobal = triggeredKill;
        }
      } else {
        // No fingerprint derivable — cannot scope. Per P1-1 the global state
        // is NEVER flipped on a single UNSAFE; log loudly instead.
        console.error(
          '[verification] UNSAFE verdict but no fingerprint derivable — cannot scope halt; global state NOT flipped (P1-1)',
        );
      }
    } else if (result.verdict === 'SAFE' && ctx.fingerprint) {
      // Self-heal: a later SAFE verdict from a blocked fingerprint re-enters it.
      recordSafeVerdict(ctx.fingerprint);
      if (isFingerprintBlocked(ctx.fingerprint)) {
        unblockFingerprint(ctx.fingerprint);
        console.log(`[verification] SAFE verdict — fingerprint ${ctx.fingerprint} unblocked (self-heal)`);
      }
    }

    if (this.persistEvents) {
      await recordVerificationEvent(
        {
          requestId: ctx.requestId,
          // P1-1: persist the fingerprint identifier via machineId so the
          // audit trail records which identity was halted.
          machineId: ctx.fingerprint ?? ctx.machineId,
          prompt: ctx.prompt,
          output: ctx.output,
          result,
          triggeredKill,
        },
        this.publish,
      );
    } else if (this.publish) {
      // Still publish even if not persisting rows.
      try {
        await this.publish('bcp:verification:events', JSON.stringify({
          type: 'verification-event',
          payload: {
            requestId: ctx.requestId,
            machineId: ctx.fingerprint ?? ctx.machineId ?? null,
            verdict: result.verdict,
            confidence: result.confidence,
            reason: result.reason || null,
            model: result.model,
            degraded: result.degraded,
            triggeredKill,
            latencyMs: result.latencyMs,
            timestamp: new Date().toISOString(),
          },
        }));
      } catch (err) {
        console.warn('[verification] Redis publish dropped:', err instanceof Error ? err.message : err);
      }
    }

    return { mode: this.mode, result, blockedFingerprint, escalatedToGlobal };
  }

  /**
   * Record a degraded verification_event row WITHOUT running the verifier.
   *
   * P2-8: used when a generation request body is malformed JSON — the
   * verification cannot run, but the audit trail must show the skip
   * (verdict REVIEW + degraded=1) instead of silently dropping it.
   * Best-effort: never throws into the request path.
   */
  async recordDegradedEvent(opts: {
    requestId: string;
    machineId?: string;
    reason: string;
  }): Promise<void> {
    const result: VerificationResult = {
      verdict: 'REVIEW',
      confidence: 0,
      reason: opts.reason,
      latencyMs: 0,
      model: this.verifier.model,
      degraded: true,
    };
    try {
      await recordVerificationEvent(
        {
          requestId: opts.requestId,
          machineId: opts.machineId,
          prompt: '',
          output: '',
          result,
          triggeredKill: false,
        },
        this.publish,
      );
    } catch (err) {
      console.warn('[verification] Failed to record degraded event:', err instanceof Error ? err.message : err);
    }
  }

  /**
   * Trigger the STOPPED transition via the kill switch (escalation path
   * only — P1-1). Guards against the STOPPED→STOPPED double-transition
   * (invalid per VALID_TRANSITIONS) to avoid audit log spam: if already
   * STOPPED, log the event but skip the transition.
   *
   * @param machineId the machine whose inference was flagged UNSAFE — threaded
   *   into the transition metadata so the audit log records which machine
   *   triggered the automated kill (spec §d.1).
   */
  private async triggerStop(machineId?: string): Promise<boolean> {
    if (!this.killSwitch) {
      console.warn('[verification] Escalation requires killSwitch injected — cannot transition to STOPPED');
      return false;
    }

    try {
      const current = await this.killSwitch.getCurrentState();
      if (current === 'STOPPED') {
        // Already stopped — skip the double-transition to avoid audit spam.
        console.warn('[verification] Escalation: kill-switch already STOPPED — skipping transition');
        return false;
      }

      await this.killSwitch.transitionTo('STOPPED', {
        reason: 'inference-unsafe',
        userId: 'system:verifier',
        ip: 'internal',
        machineId,
      });
      return true;
    } catch (err: unknown) {
      // 409 invalid-transition (e.g. concurrent STOPPED) — ignore, already handled.
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 409) {
        console.warn('[verification] Kill-switch transition rejected (409) — likely already STOPPED:', err instanceof Error ? err.message : err);
        return false;
      }
      console.error('[verification] Failed to trigger STOPPED:', err instanceof Error ? err.message : err);
      return false;
    }
  }
}

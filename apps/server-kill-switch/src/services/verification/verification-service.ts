/**
 * Verification Service — orchestration layer for inference verification.
 *
 * Decides WHEN to verify and WHAT to do with the verdict. This is the module
 * the middleware/route calls.
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §b.3.
 *
 * Modes:
 *   - ASYNC (default): fire-and-forget verification, return immediately.
 *     Zero added latency. An UNSAFE result triggers STOPPED for the NEXT
 *     request.
 *   - SYNC (opt-in): await verification and return the result. The middleware
 *     rejects UNSAFE with 403 before the response is sent.
 *
 * UNSAFE verdict → killSwitch.transitionTo('STOPPED', { reason:
 * 'inference-unsafe', userId: 'system:verifier', ip: 'internal' }). This uses
 * the internal-kill-switch path (not the human WebAuthn path).
 *
 * STOPPED→STOPPED double-transition guard: if already STOPPED, don't
 * transition again (avoid audit log spam). Log the event but skip the
 * transition.
 */

import type { KillSwitchService } from '../kill-switch';
import { recordVerificationEvent, type PublishFn } from './verification-event';
import { InferenceVerifier, type VerificationResult } from './verifier';

export type VerificationMode = 'async' | 'sync';

export interface VerificationServiceOpts {
  verifier?: InferenceVerifier;
  mode?: VerificationMode;          // default 'async'
  autoKillOnUnsafe?: boolean;       // default true
  killSwitch?: KillSwitchService;   // injected for the STOPPED transition
  publish?: PublishFn;              // Redis pubsub for bcp:verification:events
  persistEvents?: boolean;          // default true — write verification_event rows
}

export interface VerificationContext {
  prompt: string;
  output: string;
  requestId: string;
  machineId?: string;
}

export interface HandleInferenceResult {
  mode: VerificationMode;
  result?: VerificationResult;
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
      const result = await this.verifyAndAct(ctx);
      return { mode: 'sync', result };
    }

    // ASYNC — fire-and-forget. Detached task; never reject the request.
    void this.verifyAndAct(ctx).catch((err) => {
      console.error('[verification] Async verification failed (non-fatal):', err instanceof Error ? err.message : err);
    });
    return { mode: 'async' };
  }

  /**
   * Run verification + act on the verdict.
   */
  private async verifyAndAct(ctx: VerificationContext): Promise<VerificationResult> {
    const result = await this.verifier.verify({ prompt: ctx.prompt, output: ctx.output });

    let triggeredKill = false;

    if (result.verdict === 'UNSAFE' && this.autoKillOnUnsafe) {
      triggeredKill = await this.triggerStop();
    }

    // REVIEW or degraded → publish event, no kill.
    if (result.verdict === 'REVIEW' || result.degraded) {
      // (already handled above for UNSAFE; this branch covers REVIEW/degraded)
    }

    if (this.persistEvents) {
      await recordVerificationEvent(
        {
          requestId: ctx.requestId,
          machineId: ctx.machineId,
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
            machineId: ctx.machineId ?? null,
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

    return result;
  }

  /**
   * Trigger the STOPPED transition via the kill switch. Guards against the
   * STOPPED→STOPPED double-transition (invalid per VALID_TRANSITIONS) to
   * avoid audit log spam: if already STOPPED, log the event but skip the
   * transition.
   */
  private async triggerStop(): Promise<boolean> {
    if (!this.killSwitch) {
      console.warn('[verification] UNSAFE verdict but no killSwitch injected — cannot auto-kill');
      return false;
    }

    try {
      const current = await this.killSwitch.getCurrentState();
      if (current === 'STOPPED') {
        // Already stopped — skip the double-transition to avoid audit spam.
        console.warn('[verification] UNSAFE verdict but kill-switch already STOPPED — skipping transition');
        return false;
      }

      await this.killSwitch.transitionTo('STOPPED', {
        reason: 'inference-unsafe',
        userId: 'system:verifier',
        ip: 'internal',
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

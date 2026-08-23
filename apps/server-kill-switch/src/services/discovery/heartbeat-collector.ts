/**
 * Heartbeat Collector — agent registration + heartbeat wrapper.
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §a.3.
 *
 * A thin service that wraps the existing `orchestrator.handleHeartbeat()` and
 * adds agent registration + online/offline bookkeeping. Called by the existing
 * `POST /v1/discovery/heartbeat` route. The collector adds agent upsert +
 * liveness; it does NOT change the existing route contract.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/index';
import { agents, machines } from '../../db/schema';
import type { DiscoveryOrchestrator } from './orchestrator';
import type {
  HardwareFingerprint,
  IntegrityDrift,
  IntegritySignature,
} from '@align/shared-types';

export interface AgentHeartbeat {
  machineId: string;
  hostname: string;
  agentId?: string;       // optional — if present, upsert the agent row
  agentName?: string;
  agentVersion?: string;
  capabilities?: string[];
  fingerprint?: HardwareFingerprint;
}

export interface HeartbeatResult {
  drift: IntegrityDrift | null;
  signature: IntegritySignature;
  agentRegistered: boolean;
}

export class HeartbeatCollector {
  constructor(private orchestrator: DiscoveryOrchestrator) {}

  /**
   * Upsert machine (via orchestrator.handleHeartbeat) + optional agent, touch
   * lastSeen. Returns the drift report, signature, and whether an agent row
   * was registered.
   */
  async handleAgentHeartbeat(hb: AgentHeartbeat): Promise<HeartbeatResult> {
    const { drift, signature } = await this.orchestrator.handleHeartbeat({
      machineId: hb.machineId,
      hostname: hb.hostname,
      fingerprint: hb.fingerprint,
    });

    let agentRegistered = false;
    if (hb.agentId) {
      agentRegistered = await this.upsertAgent(hb);
    }

    return { drift, signature, agentRegistered };
  }

  /**
   * Upsert the agent row for a machine, but ONLY if the machine exists in the
   * `machines` inventory table (i.e. it has been admitted/onboarded).
   *
   * `agents.machineId` FKs to `machines.id` (the inventory table), NOT to
   * `discovered_machine.id`. For discovered-but-not-admitted machines, the
   * machineId is a `discovered_machine.id` that has no matching `machines`
   * row, so an agent upsert would throw a foreign-key violation. In that case
   * we skip the agent upsert (log a debug message) — the heartbeat still
   * updates `discovered_machines.lastSeen` via the orchestrator.
   */
  private async upsertAgent(hb: AgentHeartbeat): Promise<boolean> {
    const agentId = hb.agentId as string;

    // Only admit agent rows for machines present in the inventory table.
    const machine = await db
      .select({ id: machines.id })
      .from(machines)
      .where(eq(machines.id, hb.machineId))
      .get();

    if (!machine) {
      // Discovered-but-not-admitted machine — skip agent upsert to avoid the
      // agents.machineId → machines.id FK violation. The heartbeat still
      // touched discovered_machines.lastSeen via the orchestrator.
      console.debug(
        `[heartbeat-collector] Skipping agent upsert for machine '${hb.machineId}' — ` +
        `machine not admitted to inventory (no machines row). Agent '${agentId}' not registered.`,
      );
      return false;
    }

    const now = new Date();
    const capabilities = hb.capabilities ? JSON.stringify(hb.capabilities) : null;

    const existing = await db
      .select({ id: agents.id, name: agents.name, version: agents.version, capabilities: agents.capabilities })
      .from(agents)
      .where(eq(agents.id, agentId))
      .get();

    if (existing) {
      await db
        .update(agents)
        .set({
          machineId: hb.machineId,
          name: hb.agentName ?? existing.name,
          version: hb.agentVersion ?? existing.version,
          capabilities: capabilities ?? existing.capabilities,
          lastHeartbeat: now,
        })
        .where(eq(agents.id, agentId));
      return false; // updated, not newly registered
    }

    await db.insert(agents).values({
      id: agentId,
      machineId: hb.machineId,
      name: hb.agentName ?? hb.hostname,
      version: hb.agentVersion ?? 'unknown',
      capabilities,
      lastHeartbeat: now,
      createdAt: now,
    });
    return true;
  }
}

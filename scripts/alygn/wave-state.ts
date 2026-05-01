#!/usr/bin/env bun

/**
 * Wave State Management Utilities
 * Manages wave-based outreach tracking with atomic file operations
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "fs";
import { dirname } from "path";

// ============================================================
// Type Definitions
// ============================================================

export interface WaveState {
  wave: {
    number: number;
    date: string;
    nextDate: string;
    status: "idle" | "in_progress" | "complete";
  };
  entities: {
    [entityId: string]: {
      status:
        | "discovered"
        | "validated"
        | "researched"
        | "personalized"
        | "approved"
        | "sent"
        | "replied";
      lastContact: string | null;
      waveNumber: number;
    };
  };
  lastRun: string;
  phaseCompleted:
    | "discover"
    | "validate"
    | "research"
    | "personalize"
    | "review"
    | "send"
    | "verify"
    | null;
}

export type WaveType = "vc" | "muni";
export type EntityStatus = WaveState["entities"][string]["status"];
export type PhaseType = WaveState["phaseCompleted"];

// ============================================================
// Constants
// ============================================================

const STATE_DIR = "/reports/alygn";
const STATE_FILES: Record<WaveType, string> = {
  vc: `${process.env.HOME || "/home/andlersrv"}/.openclaw/workspace/reports/alygn/alygn-vc-wave-state.json`,
  muni: `${process.env.HOME || "/home/andlersrv"}/.openclaw/workspace/reports/alygn/alygn-muni-wave-state.json`,
};

const DEFAULT_WAVE_INTERVAL_DAYS = 7;

// ============================================================
// State File Paths
// ============================================================

function getStateFile(type: WaveType): string {
  return STATE_FILES[type];
}

// ============================================================
// State Loading/Saving (Atomic Operations)
// ============================================================

/**
 * Load wave state from file
 * Creates new state if file doesn't exist
 */
export function loadWaveState(type: WaveType): WaveState {
  const filePath = getStateFile(type);

  if (!existsSync(filePath)) {
    return createInitialState(type);
  }

  try {
    const content = readFileSync(filePath, "utf8");
    const state = JSON.parse(content) as WaveState;
    return state;
  } catch (error) {
    console.error(`Error loading wave state from ${filePath}:`, error);
    return createInitialState(type);
  }
}

/**
 * Save wave state atomically (write to temp then rename)
 */
export function saveWaveState(type: WaveType, state: WaveState): void {
  const filePath = getStateFile(type);
  const tempPath = `${filePath}.tmp`;

  try {
    // Ensure directory exists
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write to temp file first
    writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf8");

    // Atomic rename
    renameSync(tempPath, filePath);
  } catch (error) {
    console.error(`Error saving wave state to ${filePath}:`, error);
    // Clean up temp file if it exists
    if (existsSync(tempPath)) {
      try {
        writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf8");
        renameSync(tempPath, filePath);
      } catch {
        // Last resort - direct write
        writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
      }
    }
    throw error;
  }
}

/**
 * Create initial state for a new wave
 */
function createInitialState(type: WaveType): WaveState {
  const now = new Date();
  const nextWeek = new Date(
    now.getTime() + DEFAULT_WAVE_INTERVAL_DAYS * 24 * 60 * 60 * 1000,
  );

  return {
    wave: {
      number: 1,
      date: now.toISOString().split("T")[0],
      nextDate: nextWeek.toISOString().split("T")[0],
      status: "idle",
    },
    entities: {},
    lastRun: now.toISOString(),
    phaseCompleted: null,
  };
}

// ============================================================
// Wave Initialization
// ============================================================

/**
 * Initialize a new wave
 * Marks current wave as complete and starts next wave
 */
export function initWave(type: WaveType): WaveState {
  const state = loadWaveState(type);
  const now = new Date();
  const nextWeek = new Date(
    now.getTime() + DEFAULT_WAVE_INTERVAL_DAYS * 24 * 60 * 60 * 1000,
  );

  state.wave = {
    number: state.wave.number + 1,
    date: now.toISOString().split("T")[0],
    nextDate: nextWeek.toISOString().split("T")[0],
    status: "idle",
  };

  // Reset entities for new wave (keep replied entities)
  const repliedEntities: Record<string, WaveState["entities"][string]> = {};
  for (const [id, entity] of Object.entries(state.entities)) {
    if (entity.status === "replied") {
      repliedEntities[id] = entity;
    }
  }
  state.entities = repliedEntities;
  state.lastRun = now.toISOString();
  state.phaseCompleted = null;

  saveWaveState(type, state);
  console.log(
    `[Wave ${state.wave.number}] Initialized new wave (${state.wave.date} → ${state.wave.nextDate})`,
  );

  return state;
}

// ============================================================
// Phase Management
// ============================================================

/**
 * Advance to a new phase
 */
export function advancePhase(type: WaveType, phase: PhaseType): void {
  const state = loadWaveState(type);

  state.phaseCompleted = phase;
  state.lastRun = new Date().toISOString();

  // Update wave status based on phase
  if (phase === "send") {
    state.wave.status = "complete";
  } else if (phase !== null) {
    state.wave.status = "in_progress";
  }

  saveWaveState(type, state);
  console.log(`[Wave ${state.wave.number}] Phase advanced to: ${phase}`);
}

// ============================================================
// Entity Status Management
// ============================================================

/**
 * Update entity status within a wave
 */
export function updateEntityStatus(
  type: WaveType,
  entityId: string,
  status: EntityStatus,
): void {
  const state = loadWaveState(type);

  if (!state.entities[entityId]) {
    state.entities[entityId] = {
      status,
      lastContact: null,
      waveNumber: state.wave.number,
    };
  } else {
    state.entities[entityId].status = status;
    state.entities[entityId].waveNumber = state.wave.number;
  }

  if (status === "sent" || status === "replied") {
    state.entities[entityId].lastContact = new Date().toISOString();
  }

  state.lastRun = new Date().toISOString();
  saveWaveState(type, state);
}

/**
 * Get entity status
 */
export function getEntityStatus(
  type: WaveType,
  entityId: string,
): WaveState["entities"][string] | null {
  const state = loadWaveState(type);
  return state.entities[entityId] ?? null;
}

/**
 * Get all entities in a specific status
 */
export function getEntitiesByStatus(
  type: WaveType,
  status: EntityStatus,
): Array<{ id: string; entity: WaveState["entities"][string] }> {
  const state = loadWaveState(type);
  const results: Array<{ id: string; entity: WaveState["entities"][string] }> =
    [];

  for (const [id, entity] of Object.entries(state.entities)) {
    if (entity.status === status) {
      results.push({ id, entity });
    }
  }

  return results;
}

// ============================================================
// Wave Date Validation
// ============================================================

/**
 * Check if wave is within cooldown period
 * Returns true if within cooldown (should NOT run)
 */
export function isWithinCooldown(type: WaveType): boolean {
  const state = loadWaveState(type);
  const now = new Date();
  const waveDate = new Date(state.wave.date);
  const nextDate = new Date(state.wave.nextDate);

  // If current date is before nextDate, we're in cooldown
  return now < nextDate;
}

/**
 * Get time remaining until next wave (in milliseconds)
 * Returns 0 if next wave date has passed
 */
export function getTimeUntilNextWave(type: WaveType): number {
  const state = loadWaveState(type);
  const now = new Date();
  const nextDate = new Date(state.wave.nextDate);

  const remaining = nextDate.getTime() - now.getTime();
  return remaining > 0 ? remaining : 0;
}

/**
 * Validate that wave is ready to run
 * Throws if within cooldown period
 */
export function validateWaveReady(type: WaveType): void {
  if (isWithinCooldown(type)) {
    const remaining = getTimeUntilNextWave(type);
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    throw new Error(
      `Wave ${loadWaveState(type).wave.number} is within cooldown period. ` +
        `Next wave available in ${hours}h ${minutes}m`,
    );
  }
}

// ============================================================
// Wave Status Reporting
// ============================================================

/**
 * Get summary of current wave state
 */
export function getWaveSummary(type: WaveType): {
  waveNumber: number;
  waveDate: string;
  nextDate: string;
  status: WaveState["wave"]["status"];
  phaseCompleted: PhaseType;
  entityCounts: Record<EntityStatus, number>;
  lastRun: string;
} {
  const state = loadWaveState(type);

  const entityCounts: Record<EntityStatus, number> = {
    discovered: 0,
    validated: 0,
    researched: 0,
    personalized: 0,
    approved: 0,
    sent: 0,
    replied: 0,
  };

  for (const entity of Object.values(state.entities)) {
    entityCounts[entity.status]++;
  }

  return {
    waveNumber: state.wave.number,
    waveDate: state.wave.date,
    nextDate: state.wave.nextDate,
    status: state.wave.status,
    phaseCompleted: state.phaseCompleted,
    entityCounts,
    lastRun: state.lastRun,
  };
}

// ============================================================
// CLI Interface
// ============================================================

interface CliArgs {
  action?: string;
  type?: WaveType;
  entityId?: string;
  status?: EntityStatus;
  phase?: PhaseType;
}

function parseCliArgs(): CliArgs {
  const args: CliArgs = {};

  for (let i = 2; i < Bun.argv.length; i++) {
    const arg = Bun.argv[i];

    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");

      switch (key) {
        case "action":
          args.action = value;
          break;
        case "type":
          args.type = value as WaveType;
          break;
        case "entity-id":
          args.entityId = value;
          break;
        case "status":
          args.status = value as EntityStatus;
          break;
        case "phase":
          args.phase = value as PhaseType;
          break;
      }
    }
  }

  return args;
}

async function runCli() {
  const args = parseCliArgs();
  const { action, type = "muni" } = args;

  if (!action) {
    console.log(`
Wave State Utilities CLI
Usage: bun wave-state.ts --action=<action> [options]

Actions:
  load              Load and display current wave state
  init              Initialize a new wave
  advance-phase     Advance to a new phase
  update-entity     Update entity status
  get-entity        Get entity status
  get-entities      Get all entities by status
  validate-ready    Validate if wave is ready to run
  summary           Get wave summary
  is-cooldown       Check if within cooldown

Options:
  --type=<vc|muni>          Wave type (default: muni)
  --entity-id=<id>          Entity ID
  --status=<status>         Entity status
  --phase=<phase>           Phase to advance to

Examples:
  bun wave-state.ts --action=load --type=muni
  bun wave-state.ts --action=init --type=vc
  bun wave-state.ts --action=advance-phase --type=muni --phase=research
  bun wave-state.ts --action=update-entity --type=muni --entity-id=xxx --status=sent
  bun wave-state.ts --action=summary --type=vc
    `);
    process.exit(0);
  }

  try {
    switch (action) {
      case "load": {
        const state = loadWaveState(type);
        console.log(`Wave State (${type}):`);
        console.log(JSON.stringify(state, null, 2));
        break;
      }

      case "init": {
        const state = initWave(type);
        console.log(`✅ Initialized new wave ${state.wave.number}`);
        break;
      }

      case "advance-phase": {
        if (!args.phase) {
          throw new Error("--phase is required");
        }
        advancePhase(type, args.phase);
        console.log(`✅ Advanced phase to: ${args.phase}`);
        break;
      }

      case "update-entity": {
        if (!args.entityId || !args.status) {
          throw new Error("--entity-id and --status are required");
        }
        updateEntityStatus(type, args.entityId, args.status);
        console.log(
          `✅ Updated entity ${args.entityId} to status: ${args.status}`,
        );
        break;
      }

      case "get-entity": {
        if (!args.entityId) {
          throw new Error("--entity-id is required");
        }
        const entity = getEntityStatus(type, args.entityId);
        if (entity) {
          console.log(`Entity ${args.entityId}:`);
          console.log(JSON.stringify(entity, null, 2));
        } else {
          console.log(`Entity ${args.entityId} not found`);
        }
        break;
      }

      case "get-entities": {
        if (!args.status) {
          throw new Error("--status is required");
        }
        const entities = getEntitiesByStatus(type, args.status);
        console.log(`Entities with status '${args.status}':`);
        console.log(JSON.stringify(entities, null, 2));
        break;
      }

      case "validate-ready": {
        try {
          validateWaveReady(type);
          console.log(`✅ Wave is ready to run`);
        } catch (error) {
          console.log(`❌ ${(error as Error).message}`);
          process.exit(1);
        }
        break;
      }

      case "is-cooldown": {
        const inCooldown = isWithinCooldown(type);
        console.log(`Within cooldown: ${inCooldown}`);
        if (inCooldown) {
          const remaining = getTimeUntilNextWave(type);
          const hours = Math.floor(remaining / (1000 * 60 * 60));
          const minutes = Math.floor(
            (remaining % (1000 * 60 * 60)) / (1000 * 60),
          );
          console.log(`Time until next wave: ${hours}h ${minutes}m`);
        }
        break;
      }

      case "summary": {
        const summary = getWaveSummary(type);
        console.log(`Wave Summary (${type}):`);
        console.log(JSON.stringify(summary, null, 2));
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (err) {
    console.error(`❌ Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

// Run CLI if executed directly
if (import.meta.main) {
  runCli();
}

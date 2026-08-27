/**
 * Dignity Verifier Dashboard — Run hook
 *
 * Shared client hook for the Phase 2 teaching-action run lifecycle:
 * start a run via a POST endpoint, then poll GET /api/runs/[id] every
 * ~2s until the run reaches a terminal status (succeeded | failed).
 *
 * Exposes loading / error / active-run state so callers can disable
 * buttons and render status + logTail. Polling stops automatically on
 * terminal status or unmount.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type RunRecord,
  type RunStartResponse,
  isTerminalRunStatus,
} from "@/lib/run-types";

const POLL_INTERVAL_MS = 2000;

interface UseRunOptions {
  /** POST endpoint that starts the run, e.g. "/api/training/run". */
  startUrl: string;
  /** Whether a run of this type is already active (disables start). */
  alreadyActive?: boolean;
}

interface UseRunResult {
  /** The run currently being polled (or last completed run). */
  run: RunRecord | null;
  /** True while a run is queued/running (polling active). */
  isActive: boolean;
  /** True while the start POST is in flight. */
  isStarting: boolean;
  /** Friendly inline error message (401 / 409 / network / other). */
  error: string | null;
  /** Start a new run with the given body. */
  start: (body?: Record<string, unknown>) => Promise<void>;
  /** Clear the current run + error (e.g. after a terminal run). */
  reset: () => void;
}

/** Map an HTTP status to a friendly inline error message. */
function friendlyError(status: number, fallback: string): string {
  if (status === 401) {
    return "You are not signed in. Please sign in to run teaching actions.";
  }
  if (status === 409) {
    return "A run of this type is already in progress. Wait for it to finish before starting another.";
  }
  return fallback;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const json = (await response.json()) as { error?: string | null };
    return json.error ?? friendlyError(response.status, fallback);
  } catch {
    return friendlyError(response.status, fallback);
  }
}

export function useRun({ startUrl, alreadyActive = false }: UseRunOptions): UseRunResult {
  const [run, setRun] = useState<RunRecord | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRunId = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    activeRunId.current = null;
    setIsActive(false);
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setRun(null);
    setError(null);
  }, [stopPolling]);

  const pollRun = useCallback(
    async (runId: string) => {
      try {
        const response = await fetch(`/api/runs/${runId}`);
        if (!response.ok) {
          // If the detail fetch fails mid-poll, surface it but keep polling.
          setError(await readError(response, "Failed to fetch run status."));
          return;
        }
        const json = (await response.json()) as {
          success: boolean;
          data?: { run: RunRecord };
          error?: string | null;
        };
        if (!json.success || !json.data) {
          setError(json.error ?? "Failed to fetch run status.");
          return;
        }
        setRun(json.data.run);
        setError(null);
        if (isTerminalRunStatus(json.data.run.status)) {
          stopPolling();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch run status.");
      }
    },
    [stopPolling]
  );

  const start = useCallback(
    async (body?: Record<string, unknown>) => {
      if (alreadyActive || isActive || isStarting) return;
      setError(null);
      setIsStarting(true);
      try {
        const response = await fetch(startUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
        });
        const json = (await response.json()) as RunStartResponse;
        if (!response.ok || !json.success || !json.data) {
          setError(await readError(response, json.error ?? "Failed to start run."));
          return;
        }
        const runId = json.data.runId;
        activeRunId.current = runId;
        setIsActive(true);
        // Fetch immediately, then poll.
        await pollRun(runId);
        if (pollTimer.current !== null) clearInterval(pollTimer.current);
        pollTimer.current = setInterval(() => {
          void pollRun(runId);
        }, POLL_INTERVAL_MS);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start run.");
      } finally {
        setIsStarting(false);
      }
    },
    [alreadyActive, isActive, isStarting, pollRun, startUrl]
  );

  // Stop polling on unmount.
  useEffect(() => {
    return () => {
      if (pollTimer.current !== null) clearInterval(pollTimer.current);
    };
  }, []);

  return { run, isActive, isStarting, error, start, reset };
}

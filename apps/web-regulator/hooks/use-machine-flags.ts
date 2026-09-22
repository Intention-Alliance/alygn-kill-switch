"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPut, apiDelete } from "@/lib/api-client";
import {
  joinGlobalValues,
  type MachineFlagEntry,
  type MachineFlagOverride,
  type MachineFlagsResponse,
} from "@/lib/machine-flags";

export interface UseMachineFlagsReturn {
  flags: Array<MachineFlagEntry & { globalValue: boolean | number | string | null }>;
  overrides: MachineFlagOverride[];
  isLoading: boolean;
  error: string | null;
  pendingKeys: Set<string>;
  refetch: () => Promise<void>;
  setOverride: (key: string, value: unknown) => Promise<void>;
  clearOverride: (key: string) => Promise<void>;
}

const POLL_MS = 15_000;

/**
 * Per-machine flag state (S4).
 *
 * Fetches the merged view (GET /api/machines/:id/flags) AND the global flags
 * (GET /api/flags) so the row can show provenance without a backend change.
 * Refetch-on-mutation plus a 15s poll (same pattern as ActivationHistory).
 *
 * No WebSocket: the contract makes the flag-override broadcast optional, and
 * useKillSwitchWebSocket does not expose raw messages.
 */
export function useMachineFlags(machineId: string): UseMachineFlagsReturn {
  const [flags, setFlags] = useState<UseMachineFlagsReturn["flags"]>([]);
  const [overrides, setOverrides] = useState<MachineFlagOverride[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    if (!machineId) {
      setFlags([]);
      setOverrides([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [merged, globals] = await Promise.all([
        apiGet<MachineFlagsResponse>(`/api/machines/${machineId}/flags`),
        apiGet<{ flags: Array<{ key: string; value: boolean | number | string }> }>("/api/flags"),
      ]);
      if (!mountedRef.current) return;
      setFlags(joinGlobalValues(merged.flags ?? [], globals.flags ?? []));
      setOverrides(merged.overrides ?? []);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load machine flags");
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [machineId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // 15s poll — keeps the panel fresh without a second WebSocket subscription.
  useEffect(() => {
    if (!machineId) return;
    const t = setInterval(() => {
      refetch();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [machineId, refetch]);

  const setPending = useCallback((key: string, on: boolean) => {
    setPendingKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const setOverride = useCallback(
    async (key: string, value: unknown) => {
      setPending(key, true);
      try {
        await apiPut(`/api/machines/${machineId}/flags/${key}`, { value });
        await refetch();
      } finally {
        setPending(key, false);
      }
    },
    [machineId, refetch, setPending],
  );

  const clearOverride = useCallback(
    async (key: string) => {
      setPending(key, true);
      try {
        await apiDelete(`/api/machines/${machineId}/flags/${key}`);
        await refetch();
      } finally {
        setPending(key, false);
      }
    },
    [machineId, refetch, setPending],
  );

  return {
    flags,
    overrides,
    isLoading,
    error,
    pendingKeys,
    refetch,
    setOverride,
    clearOverride,
  };
}

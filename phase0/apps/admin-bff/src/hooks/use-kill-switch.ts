'use client';

// Kill Switch polling hook — BFF version

import { useState, useEffect, useCallback, useRef } from 'react';
import type { KillSwitchStatus } from '@/components/kill-switch/types';
import { getStatus } from '@/components/kill-switch/api';

interface UseKillSwitchPollingReturn {
  status: KillSwitchStatus | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useKillSwitchPolling(
  pollInterval: number = 5000,
  onStateChange?: (prevState: string | null, newState: string) => void
): UseKillSwitchPollingReturn {
  const [status, setStatus] = useState<KillSwitchStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevStateRef = useRef<string | null>(null);
  const lastKnownRef = useRef<KillSwitchStatus | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getStatus();
      if (prevStateRef.current !== null && prevStateRef.current !== data.state) {
        onStateChange?.(prevStateRef.current, data.state);
      }
      prevStateRef.current = data.state;
      lastKnownRef.current = data;
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      if (!loading) setStatus(lastKnownRef.current);
    } finally {
      setLoading(false);
    }
  }, [loading, onStateChange]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, pollInterval);
    return () => clearInterval(id);
  }, [pollInterval, fetchStatus]);

  const refetch = useCallback(async () => {
    setLoading(true);
    await fetchStatus();
  }, [fetchStatus]);

  return { status, loading, error, refetch };
}
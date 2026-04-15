import { useState, useEffect, useCallback, useRef } from 'react';
import type { KillSwitchStatus } from './types';
import { getStatus } from './api';

interface UseKillSwitchPollingReturn {
  status: KillSwitchStatus | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  lastKnownStatus: KillSwitchStatus | null;
}

export function useKillSwitchPolling(
  pollInterval: number = 5000,
  onStateChange?: (prevState: string | null, newState: string) => void
): UseKillSwitchPollingReturn {
  const [status, setStatus] = useState<KillSwitchStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastKnownStatusRef = useRef<KillSwitchStatus | null>(null);
  const prevStateRef = useRef<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getStatus();
      
      // Detect state change
      if (prevStateRef.current !== null && prevStateRef.current !== data.state) {
        onStateChange?.(prevStateRef.current, data.state);
      }
      
      prevStateRef.current = data.state;
      lastKnownStatusRef.current = data;
      setStatus(data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(message);
      // Keep last known status on error
      if (!loading) {
        setStatus(lastKnownStatusRef.current);
      }
    } finally {
      setLoading(false);
    }
  }, [loading, onStateChange]);

  useEffect(() => {
    // Initial fetch
    fetchStatus();

    // Set up polling interval
    intervalRef.current = setInterval(fetchStatus, pollInterval);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [pollInterval, fetchStatus]);

  const refetch = useCallback(async () => {
    setLoading(true);
    await fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    loading,
    error,
    refetch,
    lastKnownStatus: lastKnownStatusRef.current,
  };
}

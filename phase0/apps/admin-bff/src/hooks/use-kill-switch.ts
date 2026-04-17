'use client';

// Kill Switch hook — SSE-first with polling fallback

import { useState, useEffect, useCallback, useRef } from 'react';
import type { KillSwitchStatus } from '@/components/kill-switch/types';
import { getStatus } from '@/components/kill-switch/api';

type ConnectionMethod = 'sse' | 'polling';

interface UseKillSwitchPollingReturn {
  status: KillSwitchStatus | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  connectionMethod: ConnectionMethod;
}

const SSE_URL = '/api/kill-switch/events';
const SSE_RECONNECT_DELAY = 3000;

export function useKillSwitchPolling(
  pollInterval: number = 5000,
  onStateChange?: (prevState: string | null, newState: string) => void
): UseKillSwitchPollingReturn {
  const [status, setStatus] = useState<KillSwitchStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>('sse');
  const prevStateRef = useRef<string | null>(null);
  const lastKnownRef = useRef<KillSwitchStatus | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const updateStatus = useCallback(
    (data: KillSwitchStatus) => {
      if (!mountedRef.current) return;
      if (prevStateRef.current !== null && prevStateRef.current !== data.state) {
        onStateChange?.(prevStateRef.current, data.state);
      }
      prevStateRef.current = data.state;
      lastKnownRef.current = data;
      setStatus(data);
      setError(null);
      setLoading(false);
    },
    [onStateChange]
  );

  // --- Polling fallback ---
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    setConnectionMethod('polling');
    const poll = async () => {
      try {
        const data = await getStatus();
        updateStatus(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        if (lastKnownRef.current) setStatus(lastKnownRef.current);
      }
    };
    poll();
    pollingRef.current = setInterval(poll, pollInterval);
  }, [pollInterval, updateStatus]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // --- SSE ---
  const connectSSE = useCallback(() => {
    if (!mountedRef.current) return;
    stopPolling();

    const es = new EventSource(SSE_URL, { withCredentials: true });
    sseRef.current = es;

    es.addEventListener('state-change', (e) => {
      if (!mountedRef.current) return;
      try {
        const data: KillSwitchStatus = JSON.parse(e.data);
        setConnectionMethod('sse');
        updateStatus(data);
      } catch {
        // Malformed data — ignore
      }
    });

    es.addEventListener('heartbeat', () => {
      // Connection alive
      if (mountedRef.current) setConnectionMethod('sse');
    });

    es.onerror = () => {
      if (!mountedRef.current) return;
      es.close();
      sseRef.current = null;
      // Fall back to polling
      startPolling();
      // Attempt SSE reconnect after delay
      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) connectSSE();
      }, SSE_RECONNECT_DELAY);
    };
  }, [stopPolling, startPolling, updateStatus]);

  // Initial SSE connection
  useEffect(() => {
    mountedRef.current = true;
    connectSSE();
    return () => {
      mountedRef.current = false;
      sseRef.current?.close();
      sseRef.current = null;
      stopPolling();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connectSSE, stopPolling]);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStatus();
      updateStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [updateStatus]);

  return { status, loading, error, refetch, connectionMethod };
}
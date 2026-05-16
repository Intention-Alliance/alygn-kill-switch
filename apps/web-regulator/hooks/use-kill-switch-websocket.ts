"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { apiGet } from "@/lib/api-client";
import { toast } from "sonner";
import type {
  KillSwitchStatus,
  Flag,
  Machine,
  ActivationRecord,
  StateChangeMessage,
  FlagUpdateMessage,
  AgentEventMessage,
  AuditEntryMessage,
} from "@/types/shared";

// ─── Constants ──────────────────────────────────────────────────

const BACKOFF_SCHEDULE = [1_000, 2_000, 4_000, 8_000, 16_000];
const MAX_RETRIES = 5;
const POLL_INTERVAL = 5_000;
const HEARTBEAT_TIMEOUT = 10_000;

// ─── Backend Flag Shape ─────────────────────────────────────────

interface BackendFlag {
  id: string;
  key: string;
  value: boolean;
  description: string | null;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface MachinesResponse {
  data: Machine[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Helpers ────────────────────────────────────────────────────

function adaptFlags(backendFlags: BackendFlag[]): Flag[] {
  return backendFlags.map((f) => ({
    id: f.id,
    name: f.key,
    key: f.key,
    description: f.description ?? "",
    enabled: f.enabled,
    value: f.value,
    segments: [],
    rolloutPercentage: 100,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    updatedBy: f.createdBy ?? "api",
  }));
}

function getWsUrl(token: string): string {
  if (typeof window === "undefined") return "";

  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (isLocalhost) {
    const proto =
      window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://localhost:3000/ws?token=${encodeURIComponent(token)}`;
  }

  const host =
    process.env.NEXT_PUBLIC_WS_HOST ||
    "andlersrv.tail62d797.ts.net:8443";
  return `wss://${host}/ws?token=${encodeURIComponent(token)}`;
}

async function getSessionToken(): Promise<string | null> {
  try {
    const res = await authClient.getSession();
    const data = res.data as Record<string, unknown> | undefined;
    const session = data?.session as Record<string, unknown> | undefined;
    const token = session?.token as string | undefined;
    if (token) return token;
  } catch {
    // authClient.getSession may throw
  }

  if (typeof window !== "undefined") {
    return localStorage.getItem("admin_token");
  }

  return null;
}

// ─── Hook Return Type ───────────────────────────────────────────

export interface UseKillSwitchWebSocketReturn {
  status: KillSwitchStatus | null;
  flags: Flag[];
  machines: Machine[];
  agentEvents: AgentEventMessage["payload"][];
  auditLog: ActivationRecord[];
  isConnected: boolean;
  reconnectAttempt: number;
}

// ─── Hook ───────────────────────────────────────────────────────

export function useKillSwitchWebSocket(): UseKillSwitchWebSocketReturn {
  const [status, setStatus] = useState<KillSwitchStatus | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [agentEvents, setAgentEvents] = useState<
    AgentEventMessage["payload"][]
  >([]);
  const [auditLog, setAuditLog] = useState<ActivationRecord[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  // Refs that survive re-renders and don't trigger them
  const wsRef = useRef<WebSocket | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptRef = useRef(0);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // ─── Polling Fallback ────────────────────────────────────────

  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return;

    // eslint-disable-next-line no-console
    console.warn("[ws] Max retries exceeded, falling back to HTTP polling");

    async function poll() {
      if (!mountedRef.current) return;

      try {
        const [statusData, flagsData] = await Promise.allSettled([
          apiGet<KillSwitchStatus>("/api/kill-switch/status"),
          apiGet<{ flags: BackendFlag[] }>("/api/flags"),
        ]);

        if (statusData.status === "fulfilled" && mountedRef.current) {
          setStatus(statusData.value);
        }

        if (flagsData.status === "fulfilled" && mountedRef.current) {
          const adapted = adaptFlags(flagsData.value.flags ?? []);
          if (mountedRef.current) setFlags(adapted);
        }

        // Also poll machines
        try {
          const machinesData = await apiGet<MachinesResponse>(
            "/api/machines",
          );
          if (mountedRef.current) setMachines(machinesData.data ?? []);
        } catch {
          // Machines API may not be available yet
        }

        // Poll activations for audit log
        try {
          const activationsData = await apiGet<{
            data: ActivationRecord[];
          }>(`/api/kill-switch/activations?limit=50`);
          if (mountedRef.current) {
            setAuditLog(activationsData.data ?? []);
          }
        } catch {
          // Activations may not be available
        }
      } catch {
        // Silent — polling failure is expected during backend restarts
      }
    }

    // Initial poll
    poll();
    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL);
    setIsConnected(false);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // ─── Heartbeat Watcher ──────────────────────────────────────

  const resetHeartbeatTimer = useCallback(
    (ws: WebSocket) => {
      if (heartbeatTimerRef.current) {
        clearTimeout(heartbeatTimerRef.current);
      }

      heartbeatTimerRef.current = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn("[ws] Heartbeat timeout — reconnecting");
        ws.close();
      }, HEARTBEAT_TIMEOUT);
    },
    [],
  );

  const clearHeartbeatTimer = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  // ─── Message Handler ────────────────────────────────────────

  const handleMessage = useCallback((event: MessageEvent) => {
    if (!mountedRef.current) return;

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(event.data as string) as Record<string, unknown>;
    } catch {
      return; // Ignore invalid JSON
    }

    const type = msg.type as string | undefined;

    switch (type) {
      case "state-change": {
        const payload = (msg as unknown as StateChangeMessage).payload;
        setStatus((prev) =>
          prev
            ? { ...prev, state: payload.state }
            : ({
                state: payload.state,
                lastActivation: payload.timestamp,
                lastActivationBy: payload.user,
                activeExperiments: 0,
                activatedAt: payload.timestamp,
                reason: payload.reason,
              } as KillSwitchStatus),
        );

        // Also add to audit log
        const record: ActivationRecord = {
          id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: payload.timestamp,
          user: payload.user,
          reason: payload.reason,
          previousState: payload.previousState,
          newState: payload.state,
          traceId: `ws-trace-${Date.now()}`,
        };
        setAuditLog((prev) => [record, ...prev].slice(0, 200));

        if (
          payload.state === "STOPPED" ||
          payload.state === "STOPPING"
        ) {
          toast.warning(
            `Kill Switch: ${payload.state} — ${payload.reason}`,
          );
        }
        break;
      }

      case "flag-update": {
        const payload = (msg as unknown as FlagUpdateMessage).payload;
        const action = (payload as Record<string, unknown>)
          .action as string | undefined;

        if (action === "deleted") {
          setFlags((prev) =>
            prev.filter((f) => f.id !== payload.flagId),
          );
        } else if (action === "updated") {
          setFlags((prev) =>
            prev.map((f) =>
              f.id === payload.flagId
                ? {
                    ...f,
                    value: payload.value,
                    enabled:
                      payload.value === "true" || Boolean(payload.value),
                  }
                : f,
            ),
          );
        } else {
          // "created" or unknown — trigger a full refetch
          apiGet<{ flags: BackendFlag[] }>("/api/flags")
            .then((data) => {
              if (mountedRef.current) {
                setFlags(adaptFlags(data.flags ?? []));
              }
            })
            .catch(() => {
              // Ignore refetch failures
            });
        }
        break;
      }

      case "agent-event": {
        const payload = (msg as unknown as AgentEventMessage).payload;
        setAgentEvents((prev) => [payload, ...prev].slice(0, 100));

        if (payload.event === "request_blocked") {
          toast.warning(
            `Agent ${payload.agentId}: Request blocked (score: ${payload.score ?? "?"})`,
          );
        }
        break;
      }

      case "audit-entry": {
        const payload = (msg as unknown as AuditEntryMessage).payload;
        setAuditLog((prev) => [payload, ...prev].slice(0, 200));
        break;
      }

      case "heartbeat": {
        // Respond with pong
        wsRef.current?.send(JSON.stringify({ type: "pong" }));
        if (wsRef.current) {
          resetHeartbeatTimer(wsRef.current);
        }
        break;
      }

      case "machine-registered":
      case "machine-updated":
      case "machine-removed":
      case "machine-heartbeat": {
        // Trigger a full machines refetch
        apiGet<MachinesResponse>("/api/machines")
          .then((data) => {
            if (mountedRef.current) {
              setMachines(data.data ?? []);
            }
          })
          .catch(() => {
            // Ignore refetch failures
          });
        break;
      }

      default:
        break;
    }
  }, [resetHeartbeatTimer]);

  // ─── WebSocket Connection ───────────────────────────────────

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;

    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const token = await getSessionToken();
    if (!token) {
      // No token available — go straight to polling
      startPolling();
      return;
    }

    const url = getWsUrl(token);
    if (!url) {
      startPolling();
      return;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      startPolling();
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }

      // eslint-disable-next-line no-console
      console.log("[ws] Connected");
      setIsConnected(true);
      setReconnectAttempt(0);
      attemptRef.current = 0;
      stopPolling();
      clearHeartbeatTimer();

      // Start heartbeat watcher
      resetHeartbeatTimer(ws);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      handleMessage(event);
    };

    ws.onerror = () => {
      // onclose will handle reconnection
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;

      // eslint-disable-next-line no-console
      console.warn(
        `[ws] Disconnected (code: ${event.code})`,
      );

      clearHeartbeatTimer();
      setIsConnected(false);

      // If auth failed, don't retry — go to polling
      if (event.code === 4001) {
        startPolling();
        return;
      }

      // Exponential backoff
      const attempt = attemptRef.current + 1;
      attemptRef.current = attempt;
      setReconnectAttempt(attempt);

      if (attempt > MAX_RETRIES) {
        startPolling();
        return;
      }

      const delay = BACKOFF_SCHEDULE[attempt - 1];
      // eslint-disable-next-line no-console
      console.log(`[ws] Reconnecting in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);

      setTimeout(() => {
        connect();
      }, delay);
    };
  }, [
    startPolling,
    stopPolling,
    handleMessage,
    resetHeartbeatTimer,
    clearHeartbeatTimer,
  ]);

  // ─── Lifecycle ──────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearHeartbeatTimer();
      stopPolling();

      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Reconnect on auth change ──────────────────────────────

  // Listen for storage events (when another tab updates admin_token)
  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key === "admin_token") {
        // eslint-disable-next-line no-console
        console.log("[ws] Token changed — reconnecting");
        stopPolling();
        attemptRef.current = 0;
        setReconnectAttempt(0);
        connect();
      }
    }

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [connect, stopPolling]);

  return {
    status,
    flags,
    machines,
    agentEvents,
    auditLog,
    isConnected,
    reconnectAttempt,
  };
}

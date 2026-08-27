/**
 * WebSocket Manager — Real-time Event Broadcast (ADR-133)
 * Uses Bun.serve() native WebSocket for reliable upgrades through nginx.
 */
import { createHash } from 'node:crypto';
import { sqlite as sqliteDb } from '../db/index';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C8AB5DC85B11';
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 10000;
const MAX_CONNS_PER_IP = 5;

const REDIS_CHANNELS = [
  'bcp:kill-switch:chaos',
  'bcp:flags:updates',
  'bcp:agents:events',
  'bcp:machines:events',
  'bcp:machines:metrics',
  'bcp:settings:updates',
  'bcp:verification:events',
];

interface WsClient {
  send: (data: any) => void;
  close: (code?: number) => void;
  userId: string;
  ip: string;
  lastPong: number;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  alive: boolean;
}

export class WebSocketManager {
  private clients = new Map<string, Set<WsClient>>();
  private ipCounts = new Map<string, number>();

  setRedisSubscribe(fn: any): void {
    for (const channel of REDIS_CHANNELS) {
      fn(channel, (message: string) => { this.onRedisMessage(channel, message); });
    }
    console.log('[ws] Subscribed to Redis channels:', REDIS_CHANNELS.join(', '));
  }

  handleBunUpgrade(ws: any): void {
    const userId = ws.data?.userId || 'unknown';
    const ip = ws.data?.ip || 'unknown';

    const client: WsClient = {
      userId, ip,
      lastPong: Date.now(),
      alive: true,
      send: (data: any) => { try { ws.send(data); } catch {} },
      close: (code?: number) => { try { ws.close(code || 1000); } catch {} },
      heartbeatTimer: null,
    };

    if (!this.clients.has(userId)) this.clients.set(userId, new Set());
    this.clients.get(userId)!.add(client);
    this.ipCounts.set(ip, (this.ipCounts.get(ip) || 0) + 1);

    client.heartbeatTimer = setInterval(() => {
      if (!client.alive) { clearInterval(client.heartbeatTimer!); this.removeClient(client, 4005); return; }
      if (Date.now() - client.lastPong > 40000) { clearInterval(client.heartbeatTimer!); this.removeClient(client, 4005); return; }
      client.alive = false;
      try { ws.ping(); } catch { this.removeClient(client, 4005); }
    }, HEARTBEAT_INTERVAL);

    console.log('[ws] Client connected: ' + userId + ' (' + ip + ') total=' + this.totalClients());
  }

  private removeClient(client: WsClient, code: number = 1000): void {
    client.alive = false;
    if (client.heartbeatTimer) { clearInterval(client.heartbeatTimer); client.heartbeatTimer = null; }

    const userClients = this.clients.get(client.userId);
    if (userClients) { userClients.delete(client); if (userClients.size === 0) this.clients.delete(client.userId); }

    const count = this.ipCounts.get(client.ip) || 0;
    if (count > 1) this.ipCounts.set(client.ip, count - 1);
    else this.ipCounts.delete(client.ip);

    try { client.close(code); } catch {}
    console.log('[ws] Client disconnected: ' + client.userId + ' total=' + this.totalClients());
  }

  private onRedisMessage(channel: string, message: string): void {
    try {
      const parsed = JSON.parse(message);
      let wsMessage: Record<string, unknown> = {} as Record<string, unknown>;
      switch (channel) {
        case 'bcp:kill-switch:chaos': wsMessage = { type: 'state-change', payload: parsed }; break;
        case 'bcp:flags:updates': wsMessage = { type: 'flag-update', payload: parsed }; break;
        case 'bcp:agents:events': wsMessage = { type: 'agent-event', payload: parsed }; break;
        case 'bcp:machines:events': wsMessage = parsed.type ? parsed : { type: 'machine-event', payload: parsed }; break;
        case 'bcp:settings:updates': wsMessage = { type: 'settings-update', payload: parsed }; break;
      case 'bcp:machines:metrics':
        wsMessage = parsed.type ? parsed : { type: 'machine-metrics', payload: parsed };
        break;
      case 'bcp:verification:events':
        // Verifier verdict events (KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §b.3).
        // The published message already carries `{ type: 'verification-event', payload }`.
        wsMessage = parsed.type ? parsed : { type: 'verification-event', payload: parsed };
        break;
      }
      this.broadcast(wsMessage);
    } catch {}
  }

  private broadcast(message: Record<string, unknown>): void {
    const data = JSON.stringify(message);
    for (const [, clients] of this.clients) {
      for (const client of clients) {
        try { client.send(data); } catch {}
      }
    }
  }

  broadcastStateChange(entry: any): void {
    this.broadcast({ type: 'state-change', payload: {
      id: entry.id, state: entry.newState, previousState: entry.previousState,
      timestamp: new Date(entry.timestamp).getTime(), user: entry.initiatedBy,
      reason: entry.reason, traceId: entry.traceId, severity: 'info', machineId: null,
    }});
  }

  /**
   * Emit an `audit-entry` event to all connected clients. The frontend
   * hook (use-kill-switch-websocket) listens for this event type and
   * prepends the entry to its audit log. Payload matches the shared
   * ActivationRecord shape: { id, timestamp, user, reason, previousState,
   * newState, traceId }.
   */
  broadcastAuditEntry(entry: any): void {
    this.broadcast({ type: 'audit-entry', payload: {
      id: entry.id,
      timestamp: new Date(entry.timestamp).toISOString(),
      user: entry.initiatedBy,
      reason: entry.reason,
      previousState: entry.previousState,
      newState: entry.newState,
      traceId: entry.traceId,
    }});
  }

  broadcastFlagUpdate(payload: any): void { this.broadcast({ type: 'flag-update', payload }); }
  broadcastAgentEvent(payload: any): void { this.broadcast({ type: 'agent-event', payload }); }
  broadcastMachineEvent(type: string, payload: Record<string, unknown>): void { this.broadcast({ type, payload }); }

  totalClients(): number {
    let total = 0;
    for (const [, clients] of this.clients) total += clients.size;
    return total;
  }

  destroy(): void {
    for (const [, clients] of this.clients) {
      for (const client of clients) {
        if (client.heartbeatTimer) clearInterval(client.heartbeatTimer);
        try { client.close(1001); } catch {}
      }
    }
    this.clients.clear();
    this.ipCounts.clear();
  }
}

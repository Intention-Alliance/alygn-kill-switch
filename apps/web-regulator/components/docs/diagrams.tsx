"use client";

/**
 * Lightweight SVG diagrams for documentation.
 * No external dependencies — pure inline SVG rendered client-side
 * to support dark mode CSS variable access.
 */

interface DiagramProps {
  className?: string;
}

// ─── Kill Switch State Machine ─────────────────────────────────────

export function StateMachineDiagram({ className }: DiagramProps) {
  return (
    <svg
      viewBox="0 0 700 480"
      className={className}
      role="img"
      aria-label="Kill Switch State Machine: ARMED → RUNNING → STOPPING → STOPPED → LOCKED"
    >
      <defs>
        <marker
          id="arrow-state"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" opacity="0.6" />
        </marker>
      </defs>

      {/* States */}
      {/* ARMED */}
      <rect x="50" y="40" width="130" height="60" rx="8" fill="var(--secondary)" opacity="0.15" />
      <rect x="50" y="40" width="130" height="60" rx="8" fill="none" stroke="var(--secondary)" strokeWidth="2" />
      <text x="115" y="70" textAnchor="middle" fontSize="14" fontWeight="600" fill="currentColor">ARMED</text>
      <text x="115" y="88" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.5">(idle)</text>

      {/* RUNNING */}
      <rect x="320" y="40" width="140" height="60" rx="8" fill="var(--primary)" opacity="0.1" />
      <rect x="320" y="40" width="140" height="60" rx="8" fill="none" stroke="var(--primary)" strokeWidth="2" />
      <text x="390" y="70" textAnchor="middle" fontSize="14" fontWeight="600" fill="currentColor">RUNNING</text>
      <text x="390" y="88" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.5">(active)</text>

      {/* STOPPING */}
      <rect x="320" y="180" width="140" height="60" rx="8" fill="var(--warning)" opacity="0.1" />
      <rect x="320" y="180" width="140" height="60" rx="8" fill="none" stroke="var(--warning, #f59e0b)" strokeWidth="2" />
      <text x="390" y="210" textAnchor="middle" fontSize="14" fontWeight="600" fill="currentColor">STOPPING</text>
      <text x="390" y="228" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.5">(draining)</text>

      {/* STOPPED */}
      <rect x="320" y="340" width="140" height="60" rx="8" fill="var(--destructive)" opacity="0.1" />
      <rect x="320" y="340" width="140" height="60" rx="8" fill="none" stroke="var(--destructive)" strokeWidth="2" />
      <text x="390" y="370" textAnchor="middle" fontSize="14" fontWeight="600" fill="currentColor">STOPPED</text>
      <text x="390" y="388" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.5">(quiesced)</text>

      {/* LOCKED */}
      <rect x="550" y="340" width="130" height="60" rx="8" fill="var(--destructive)" opacity="0.15" />
      <rect x="550" y="340" width="130" height="60" rx="8" fill="none" stroke="var(--destructive)" strokeWidth="2" />
      <text x="615" y="370" textAnchor="middle" fontSize="14" fontWeight="600" fill="currentColor">LOCKED</text>
      <text x="615" y="388" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.5">(frozen)</text>

      {/* Transitions */}
      {/* ARMED → RUNNING */}
      <line x1="180" y1="70" x2="320" y2="70" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow-state)" opacity="0.6" />
      <text x="250" y="62" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.5">activate</text>

      {/* RUNNING → STOPPING */}
      <line x1="390" y1="100" x2="390" y2="180" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow-state)" opacity="0.6" />
      <text x="405" y="142" fontSize="10" fill="currentColor" opacity="0.5">stop</text>

      {/* STOPPING → STOPPED */}
      <line x1="390" y1="240" x2="390" y2="340" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow-state)" opacity="0.6" />
      <text x="405" y="295" fontSize="10" fill="currentColor" opacity="0.5">drain done</text>

      {/* STOPPED → LOCKED */}
      <line x1="460" y1="370" x2="550" y2="370" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow-state)" opacity="0.6" />
      <text x="505" y="362" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.5">lock</text>

      {/* Emergency stop (ARMED → STOPPED) — curved */}
      <path
        d="M 50 40 L 15 40 L 15 370 L 320 370"
        fill="none"
        stroke="var(--destructive)"
        strokeWidth="1.5"
        strokeDasharray="6 3"
        markerEnd="url(#arrow-state)"
        opacity="0.5"
      />
      <text x="160" y="30" textAnchor="middle" fontSize="10" fill="var(--destructive)" opacity="0.5">emergency stop</text>

      {/* RUNNING → STOPPED direct */}
      <path
        d="M 460 40 L 490 40 L 490 370 L 460 370"
        fill="none"
        stroke="var(--destructive)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        markerEnd="url(#arrow-state)"
        opacity="0.4"
      />
      <text x="520" y="200" fontSize="10" fill="var(--destructive)" opacity="0.4">emergency</text>

      {/* STOPPED → ARMED (re-arm) — curved */}
      <path
        d="M 320 370 L 15 370 L 15 70 L 50 70"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.5"
        strokeDasharray="5 4"
        markerEnd="url(#arrow-state)"
        opacity="0.4"
      />
      <text x="18" y="220" textAnchor="middle" fontSize="10" fill="var(--primary)" opacity="0.4" transform="rotate(-90 18 220)">re-arm</text>

      {/* Legend */}
      <rect x="30" y="410" width="12" height="12" rx="2" fill="none" stroke="currentColor" opacity="0.6" />
      <text x="48" y="421" fontSize="11" fill="currentColor" opacity="0.6">Normal transition</text>
      <line x1="160" y1="416" x2="200" y2="416" stroke="var(--destructive)" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.5" />
      <text x="206" y="421" fontSize="11" fill="currentColor" opacity="0.6">Emergency</text>
      <line x1="310" y1="416" x2="350" y2="416" stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.4" />
      <text x="356" y="421" fontSize="11" fill="currentColor" opacity="0.6">Recovery</text>
    </svg>
  );
}

// ─── Feature Flag Resolution Flow ──────────────────────────────────

export function FlagResolutionDiagram({ className }: DiagramProps) {
  return (
    <svg
      viewBox="0 0 700 280"
      className={className}
      role="img"
      aria-label="Feature Flag Resolution: per-machine override → global default → system default"
    >
      <defs>
        <marker
          id="arrow-flag"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" opacity="0.6" />
        </marker>
      </defs>

      {/* Start */}
      <rect x="30" y="100" width="100" height="40" rx="20" fill="var(--primary)" opacity="0.15" />
      <rect x="30" y="100" width="100" height="40" rx="20" fill="none" stroke="var(--primary)" strokeWidth="1.5" />
      <text x="80" y="125" textAnchor="middle" fontSize="13" fontWeight="600" fill="currentColor">Agent asks</text>

      {/* Arrow from start */}
      <line x1="130" y1="120" x2="180" y2="120" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow-flag)" opacity="0.6" />

      {/* Decision 1: Per-machine override */}
      <polygon
        points="280,40 380,120 280,200 180,120"
        fill="var(--secondary)"
        opacity="0.08"
      />
      <polygon
        points="280,40 380,120 280,200 180,120"
        fill="none"
        stroke="var(--secondary)"
        strokeWidth="1.5"
      />
      <text x="280" y="118" textAnchor="middle" fontSize="12" fontWeight="600" fill="currentColor">Per-machine</text>
      <text x="280" y="134" textAnchor="middle" fontSize="12" fontWeight="600" fill="currentColor">override?</text>

      {/* YES path — highest priority */}
      <line x1="280" y1="40" x2="280" y2="10" stroke="var(--primary)" strokeWidth="1.5" opacity="0.7" />
      <text x="280" y="8" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.7">YES — use machine override</text>
      <text x="280" y="22" textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.4">highest priority</text>

      {/* NO path — global default */}
      <line x1="380" y1="120" x2="430" y2="120" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow-flag)" opacity="0.6" />
      <text x="405" y="113" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.4">NO</text>

      {/* Decision 2: Global default */}
      <polygon
        points="530,40 630,120 530,200 430,120"
        fill="var(--primary)"
        opacity="0.08"
      />
      <polygon
        points="530,40 630,120 530,200 430,120"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.5"
      />
      <text x="530" y="118" textAnchor="middle" fontSize="12" fontWeight="600" fill="currentColor">Global flag</text>
      <text x="530" y="134" textAnchor="middle" fontSize="12" fontWeight="600" fill="currentColor">exists?</text>

      {/* YES path — use global */}
      <line x1="530" y1="40" x2="530" y2="10" stroke="var(--primary)" strokeWidth="1.5" opacity="0.7" />
      <text x="530" y="8" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.7">YES — use global default</text>

      {/* NO path — system default */}
      <line x1="630" y1="120" x2="680" y2="120" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow-flag)" opacity="0.6" />
      <text x="655" y="113" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.4">NO</text>

      {/* System default */}
      <rect x="670" y="100" width="25" height="40" rx="20" fill="var(--muted-foreground)" opacity="0.1" />
      <rect x="670" y="100" width="25" height="40" rx="20" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" />
      <text x="682" y="125" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.5">sys</text>

      {/* Labels below */}
      <text x="280" y="245" textAnchor="middle" fontSize="11" fontWeight="600" fill="currentColor" opacity="0.7">1 — Highest Priority</text>
      <text x="530" y="245" textAnchor="middle" fontSize="11" fontWeight="500" fill="currentColor" opacity="0.5">2 — Medium Priority</text>
      <text x="682" y="245" textAnchor="middle" fontSize="11" fontWeight="500" fill="currentColor" opacity="0.3">3 — Fallback</text>
    </svg>
  );
}

// ─── WebSocket Architecture ────────────────────────────────────────

export function WebSocketArchitectureDiagram({ className }: DiagramProps) {
  return (
    <svg
      viewBox="0 0 750 250"
      className={className}
      role="img"
      aria-label="WebSocket Architecture: Browser → Nginx → Bun.serve → Redis pubsub"
    >
      <defs>
        <marker
          id="arrow-ws"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" opacity="0.6" />
        </marker>
        <marker
          id="arrow-ws-reverse"
          viewBox="0 0 10 10"
          refX="1"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 10 0 L 0 5 L 10 10 z" fill="currentColor" opacity="0.6" />
        </marker>
      </defs>

      {/* Browser */}
      <rect x="20" y="90" width="120" height="70" rx="8" fill="var(--primary)" opacity="0.08" />
      <rect x="20" y="90" width="120" height="70" rx="8" fill="none" stroke="var(--primary)" strokeWidth="2" />
      <text x="80" y="118" textAnchor="middle" fontSize="13" fontWeight="600" fill="currentColor">Browser</text>
      <text x="80" y="140" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.5">Dashboard</text>

      {/* Nginx */}
      <rect x="200" y="90" width="120" height="70" rx="8" fill="var(--secondary)" opacity="0.08" />
      <rect x="200" y="90" width="120" height="70" rx="8" fill="none" stroke="var(--secondary)" strokeWidth="2" />
      <text x="260" y="118" textAnchor="middle" fontSize="13" fontWeight="600" fill="currentColor">Nginx</text>
      <text x="260" y="140" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.5">Reverse Proxy</text>

      {/* Bun.serve */}
      <rect x="380" y="90" width="140" height="70" rx="8" fill="var(--primary)" opacity="0.1" />
      <rect x="380" y="90" width="140" height="70" rx="8" fill="none" stroke="var(--primary)" strokeWidth="2" />
      <text x="450" y="118" textAnchor="middle" fontSize="13" fontWeight="600" fill="currentColor">Bun.serve</text>
      <text x="450" y="140" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.5">WebSocket Server</text>

      {/* Redis pubsub */}
      <rect x="580" y="90" width="130" height="70" rx="8" fill="var(--destructive)" opacity="0.08" />
      <rect x="580" y="90" width="130" height="70" rx="8" fill="none" stroke="var(--destructive)" strokeWidth="2" />
      <text x="645" y="118" textAnchor="middle" fontSize="13" fontWeight="600" fill="currentColor">Redis</text>
      <text x="645" y="140" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.5">Pub/Sub</text>

      {/* Connections */}
      {/* Browser → Nginx */}
      <line x1="140" y1="125" x2="200" y2="125" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow-ws)" opacity="0.6" />
      {/* Nginx → Bun */}
      <line x1="320" y1="125" x2="380" y2="125" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow-ws)" opacity="0.6" />
      {/* Bun → Redis */}
      <line x1="520" y1="125" x2="580" y2="125" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow-ws)" opacity="0.6" />

      {/* Bidirectional arrows */}
      {/* Browser ↔ Nginx (upgrade) */}
      <line x1="170" y1="110" x2="170" y2="90" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow-ws-reverse)" opacity="0.4" />
      <line x1="170" y1="118" x2="170" y2="125" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arrow-ws)" opacity="0.4" />
      <text x="170" y="83" textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.4">wss://</text>

      {/* Labels below */}
      <text x="80" y="195" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.5">Client</text>
      <text x="260" y="195" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.5">TLS Term.</text>
      <text x="450" y="195" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.5">ws.ping() 30s</text>
      <text x="645" y="195" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.5">bcp:* channels</text>

      {/* Protocol notes */}
      <text x="80" y="230" textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.3">WebSocket API</text>
      <text x="260" y="230" textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.3">Upgrade: websocket</text>
      <text x="450" y="230" textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.3">JSON state-changes</text>
      <text x="645" y="230" textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.3">state/events</text>
    </svg>
  );
}

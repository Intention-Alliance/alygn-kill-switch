"use client";

import { useState, useMemo } from "react";
import {
  BookOpen,
  Search,
  Shield,
  Flag,
  Server,
  Activity,
  AlertTriangle,
  Wrench,
  Code2,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  StateMachineDiagram,
  FlagResolutionDiagram,
  WebSocketArchitectureDiagram,
} from "@/components/docs/diagrams";

// ─── Types ───────────────────────────────────────────────────────────

type DocSection = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  content: React.ReactNode;
};

type StateInfo = {
  state: string;
  badge: "default" | "secondary" | "destructive" | "outline";
  description: string;
};

// ─── Constants ────────────────────────────────────────────────────────

const STATES: StateInfo[] = [
  {
    state: "ARMED",
    badge: "secondary",
    description: "System is initialized and monitoring. Agents are registering, flags are being configured. No requests are being intercepted yet — the kill switch is loaded but not active.",
  },
  {
    state: "RUNNING",
    badge: "default",
    description: "Agents are actively intercepting and scoring LLM requests. Feature flags are in effect. This is the normal operational state. The system is protecting traffic in real-time.",
  },
  {
    state: "STOPPING",
    badge: "outline",
    description: "Graceful shutdown in progress. Agents stop accepting new requests. In-flight requests complete or time out. The system transitions to STOPPED once all agents have drained.",
  },
  {
    state: "STOPPED",
    badge: "destructive",
    description: "All agents have ceased interception. No LLM requests are being scored or blocked. The system is quiesced — safe for maintenance, but offering zero protection.",
  },
  {
    state: "LOCKED",
    badge: "destructive",
    description: "Emergency lockdown. All operations frozen. No state transitions allowed except unlock by admin. This state is reserved for security incidents, detected attacks, or manual panic-button activation.",
  },
];

const PREDEFINED_FLAGS = [
  {
    key: "llm_interception_enabled",
    type: "boolean",
    default: "false",
    description: "Whether per-machine agents intercept and score LLM requests before they reach the model. When false, all requests pass through unscored. Toggle per-machine for granular control.",
  },
  {
    key: "auto_stop_threshold",
    type: "number",
    default: "0.7",
    description: "Combined score threshold (0.0–1.0) above which requests are automatically blocked. Lower values = stricter blocking. Set to 1.0 to disable auto-blocking entirely while still logging scores.",
  },
  {
    key: "damage_logging_level",
    type: "string",
    default: "standard",
    description: "Verbosity of damage/block event logging. minimal: blocked requests only. standard: blocked + near-threshold. verbose: all scored requests including passed. Higher levels increase storage usage.",
  },
  {
    key: "alert_on_critical_score",
    type: "boolean",
    default: "true",
    description: "Whether to publish a real-time alert to the dashboard and configured notification channels when a request score exceeds 0.9. Useful for early warning before auto-stop triggers.",
  },
  {
    key: "request_sampling_rate",
    type: "number",
    default: "1.0",
    description: "Fraction of LLM requests to analyze (0.0–1.0). At 1.0, every request is scored. Lower values reduce agent CPU load but create blind spots. Per-machine overrides allow sampling on resource-constrained nodes.",
  },
];

const API_ENDPOINTS = [
  { method: "GET", path: "/v1/kill-switch/status", auth: "Session", description: "Current system state and metadata" },
  { method: "GET", path: "/v1/kill-switch/activations", auth: "Session", description: "Activation history (paginated)" },
  { method: "POST", path: "/v1/kill-switch/chaos", auth: "Admin", description: "Trigger state transition" },
  { method: "GET", path: "/v1/kill-switch/health", auth: "None", description: "Health check endpoint" },
  { method: "GET", path: "/v1/flags", auth: "Session", description: "List all feature flags" },
  { method: "POST", path: "/v1/flags", auth: "Admin", description: "Create a new feature flag" },
  { method: "PUT", path: "/v1/flags/:id", auth: "Admin", description: "Update an existing flag" },
  { method: "DELETE", path: "/v1/flags/:id", auth: "Admin", description: "Delete a flag" },
  { method: "GET", path: "/v1/flags/:id/audit", auth: "Session", description: "Audit log for a specific flag" },
  { method: "GET", path: "/v1/machines", auth: "Session", description: "List all registered machines" },
  { method: "POST", path: "/v1/machines/register", auth: "Admin", description: "Register a new machine" },
  { method: "GET", path: "/v1/machines/:id", auth: "Session", description: "Get machine by ID" },
  { method: "PATCH", path: "/v1/machines/:id", auth: "Admin", description: "Update machine metadata" },
  { method: "DELETE", path: "/v1/machines/:id", auth: "Admin", description: "Remove a machine" },
  { method: "POST", path: "/v1/machines/:id/heartbeat", auth: "Agent", description: "Machine health heartbeat" },
  { method: "GET", path: "/v1/machines/:id/status", auth: "Session", description: "Machine status + DPU info + active flags" },
  { method: "GET", path: "/v1/machines/:id/flags", auth: "Admin", description: "Per-machine merged flag view (overrides + globals) — ADR-133" },
  { method: "PUT", path: "/v1/machines/:id/flags/:key", auth: "Admin", description: "Set or update a per-machine flag override" },
  { method: "DELETE", path: "/v1/machines/:id/flags/:key", auth: "Admin", description: "Clear a per-machine flag override (revert to global, 204)" },
  { method: "GET", path: "/v1/settings", auth: "Session", description: "Get all system settings" },
  { method: "POST", path: "/v1/settings", auth: "Admin", description: "Batch update settings" },
  { method: "GET", path: "/v1/settings/:key", auth: "Session", description: "Get single setting value" },
  { method: "PUT", path: "/v1/settings/:key", auth: "Admin", description: "Update single setting" },
  { method: "WS", path: "/ws?token=...", auth: "Token", description: "WebSocket real-time event stream" },
];

// ─── Collapsible Section Component ───────────────────────────────────

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-5 text-left hover:bg-muted/30 transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-primary shrink-0" />
          <span className="text-base font-semibold">{title}</span>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-muted-foreground shrink-0 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <>
          <Separator />
          <div className="p-5 space-y-4 text-sm text-foreground/90">
            {children}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────

export default function DocsPage() {
  const [search, setSearch] = useState("");

  const normSearch = search.toLowerCase().trim();

  const sections: DocSection[] = [
    {
      id: "protocol-overview",
      title: "Protocol Overview",
      icon: Shield,
      content: (
        <div className="space-y-5">
          <div>
            <h3 className="font-semibold text-base mb-2">What Is the Kill Switch?</h3>
            <p className="text-muted-foreground leading-relaxed">
              The Kill Switch is the safety-critical control plane of the ALYGN compliance
              infrastructure. It enables human operators to stop harmful LLM-generated content
              at the request level — either manually via the dashboard, or automatically when
              per-machine scoring agents detect content that exceeds configured safety thresholds.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Every machine in the ALYGN network runs a scoring agent that intercepts LLM
              requests before they reach the model. The agent scores each request against a
              combined rubric (semantic analysis + keyword detection + pattern matching) and
              either forwards or blocks based on the configured auto-stop threshold.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-3">The 5 States</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {STATES.map((s) => (
                <div key={s.state} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={s.badge}>{s.state}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">State Transitions</h3>
            <div className="overflow-x-auto rounded-lg border bg-muted/50 p-4">
              <StateMachineDiagram className="w-full max-w-[700px] mx-auto text-foreground" />
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">When to Use Each State</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3 bg-primary/5">
                <p className="font-semibold text-sm mb-1">ARM</p>
                <p className="text-xs text-muted-foreground">
                  Use ARM during deployment and configuration. Agents register, flags are set,
                  but no traffic is being intercepted. Safe to toggle flags and register
                  machines without affecting production traffic.
                </p>
              </div>
              <div className="rounded-lg border p-3 bg-emerald-500/5">
                <p className="font-semibold text-sm mb-1">RUN</p>
                <p className="text-xs text-muted-foreground">
                  Normal operational state. Agents intercept and score every request. Use RUN
                  when the system is configured and ready to protect traffic. All feature
                  flags are in full effect.
                </p>
              </div>
              <div className="rounded-lg border p-3 bg-red-500/5">
                <p className="font-semibold text-sm mb-1">Emergency Stop</p>
                <p className="text-xs text-muted-foreground">
                  Immediate stop from any non-LOCKED state directly to STOPPED. Use when you
                  observe harmful content passing through, or when the scoring system itself
                  is behaving unexpectedly. Requires typing the confirmation phrase.
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "feature-flags",
      title: "Feature Flags System",
      icon: Flag,
      content: (
        <div className="space-y-5">
          <div>
            <h3 className="font-semibold text-base mb-2">Predefined Flags</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              The system ships with five predefined feature flags. All flags can be overridden
              per-machine, allowing different safety profiles for different nodes in the network.
            </p>
            <div className="grid gap-3">
              {PREDEFINED_FLAGS.map((flag) => (
                <div key={flag.key} className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono font-semibold">
                      {flag.key}
                    </code>
                    <Badge variant="secondary" className="text-[10px]">{flag.type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      default: <code className="text-xs">{flag.default}</code>
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{flag.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">Flag Resolution Order</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              When a machine requests its effective flag values, the system resolves them
              in a strict priority order. Machine-level overrides always take precedence
              over global defaults, ensuring operators can apply stricter policies to
              high-risk nodes without affecting the entire fleet.
            </p>
            <div className="overflow-x-auto rounded-lg border bg-muted/50 p-4 mb-4">
              <FlagResolutionDiagram className="w-full max-w-[700px] mx-auto text-foreground" />
            </div>
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-3">
                <Badge variant="destructive" className="text-[10px]">1</Badge>
                <span className="text-sm font-medium">Per-machine override</span>
                <span className="text-xs text-muted-foreground">— Highest priority. Set via machine detail page.</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-[10px]">2</Badge>
                <span className="text-sm font-medium">Global default</span>
                <span className="text-xs text-muted-foreground">— Set via Flag Management page. Falls back to system default.</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-[10px]">3</Badge>
                <span className="text-sm font-medium">System default</span>
                <span className="text-xs text-muted-foreground">— Hardcoded fallback. Used when no global flag exists.</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">Per-Machine Flag Overrides (ADR-133)</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Machine-level overrides let you apply stricter or looser flag values to
              individual nodes without changing the global default. The resolution
              order is strict:
            </p>
            <div className="rounded-lg border p-4 space-y-1 font-mono text-xs mb-3">
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">RESOLVE</span>
                <code className="text-muted-foreground">machine override → global → default</code>
              </div>
            </div>
            <p className="text-muted-foreground leading-relaxed mb-3">
              The per-machine override surface is exposed by three new endpoints (binding
              contract:{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                docs/api-contracts/per-machine-flags-v1.md
              </code>
              ):
            </p>
            <div className="rounded-lg border overflow-hidden mb-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Method</TableHead>
                    <TableHead>Path</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>
                      <Badge variant="default" className="text-[10px]">GET</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      /api/machines/:id/flags
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      Returns the merged view: per-flag resolved value, type, and an
                      <code className="text-[10px] bg-muted px-1 py-0.5 rounded mx-1">overridden</code>
                      marker. Admin auth.
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <Badge variant="destructive" className="text-[10px]">PUT</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      /api/machines/:id/flags/:key
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      Body: <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{"{ value: ... }"}</code>.
                      Idempotent set/update; value is coerced and validated per flag
                      type. Admin auth.
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <Badge variant="destructive" className="text-[10px]">DELETE</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      /api/machines/:id/flags/:key
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      Clears the override; the machine falls back to the global value.
                      204 on success (idempotent). Admin auth.
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Per-machine overrides persist in the{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">machine_flag</code>{" "}
              table. The table is keyed by{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">(machine_id, flag_key)</code>{" "}
              with{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                ON DELETE CASCADE
              </code>{" "}
              from <code className="text-xs bg-muted px-1 py-0.5 rounded">machine.id</code>{" "}
              — deleting a machine also removes all of its overrides. When a global
              flag is deleted via the existing{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                DELETE /v1/flags/:id
              </code>{" "}
              handler, all <code className="text-xs bg-muted px-1 py-0.5 rounded">machine_flag</code>{" "}
              rows referencing the key are removed in the same change set (see
              contract § 6.3).
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">Creating Custom Flags</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Custom flags can be created through the Flag Management page or via API.
              They are stored in the <code className="text-xs bg-muted px-1 py-0.5 rounded">feature_flags</code>{" "}
              table in SQLite. To add machine-specific overrides for custom flags, navigate
              to Machines → select a machine → Active Flags tab, then toggle or set values.
            </p>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs font-mono text-muted-foreground mb-2">Create a custom flag via API:</p>
              <pre className="text-xs font-mono leading-relaxed overflow-x-auto">{`curl -X POST http://localhost:3000/v1/flags \\
  -H "Content-Type: application/json" \\
  -H "Cookie: better-auth.session_token=..." \\
  -d '{
    "key": "custom_safety_profile",
    "value": true,
    "description": "Enables enhanced safety checks for PCI-compliant nodes",
    "enabled": true
  }'`}</pre>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "admin-procedures",
      title: "Admin Procedures",
      icon: Activity,
      content: (
        <div className="space-y-5">
          {/* Emergency Stop */}
          <div>
            <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Emergency Stop
            </h3>
            <div className="space-y-2">
              <p className="text-muted-foreground leading-relaxed">
                The Emergency Stop transitions the system immediately from any non-LOCKED state
                directly to STOPPED. All agents cease interception immediately. This is the
                fastest way to halt all scoring and blocking.
              </p>
              <ol className="list-decimal ml-5 space-y-2 text-sm">
                <li className="text-muted-foreground">
                  Navigate to <strong>Kill Switch → Controls</strong>
                </li>
                <li className="text-muted-foreground">
                  Click the <Badge variant="destructive">Emergency Stop</Badge> button
                </li>
                <li className="text-muted-foreground">
                  A confirmation dialog appears. Type the confirmation phrase exactly:{" "}
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-bold">STOP ALL CHAOS</code>
                </li>
                <li className="text-muted-foreground">
                  Click <strong>Confirm Emergency Stop</strong>
                </li>
                <li className="text-muted-foreground">
                  The system transitions to STOPPED. All WebSocket-connected dashboards update
                  in real-time. The activation is recorded in the audit log with your user ID,
                  a trace ID, and a timestamp.
                </li>
              </ol>
            </div>
          </div>

          {/* Unlocking */}
          <div>
            <h3 className="font-semibold text-base mb-2">Unlocking a LOCKED System</h3>
            <div className="space-y-2">
              <p className="text-muted-foreground leading-relaxed">
                When the system is LOCKED, all operations are frozen. Only an admin can unlock.
                Unlocking transitions the system to ARMED (idle), not RUNNING — you must
                explicitly ARM then RUN to resume interception.
              </p>
              <ol className="list-decimal ml-5 space-y-2 text-sm">
                <li className="text-muted-foreground">Authenticate as an admin (role: admin)</li>
                <li className="text-muted-foreground">Navigate to Kill Switch → Controls</li>
                <li className="text-muted-foreground">Click the <strong>Unlock</strong> button</li>
                <li className="text-muted-foreground">System transitions to ARMED. Review flags, then ARM → RUN.</li>
              </ol>
            </div>
          </div>

          {/* Registering a Machine */}
          <div>
            <h3 className="font-semibold text-base mb-2">Registering a New Machine</h3>
            <div className="space-y-2">
              <p className="text-muted-foreground leading-relaxed">
                Machines must be registered before their agents can connect. Registration
                creates a record in the <code className="text-xs bg-muted px-1 py-0.5 rounded">machine</code> table
                and assigns a unique machine ID.
              </p>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs font-mono text-muted-foreground mb-2">Via API:</p>
                <pre className="text-xs font-mono leading-relaxed overflow-x-auto">{`curl -X POST http://localhost:3000/v1/machines/register \\
  -H "Content-Type: application/json" \\
  -H "Cookie: better-auth.session_token=..." \\
  -d '{
    "name": "api-gateway-01",
    "hostname": "gw01.internal.alygn.net",
    "role": "gateway",
    "hasDpu": false,
    "specs": {"cpu": "4-core", "ram": "16GB", "gpu": "none", "dpu": null}
  }'`}</pre>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Machine names must be alphanumeric + hyphens (1–64 chars). Hostnames must be
                valid DNS names (1–255 chars). The API returns a 409 Conflict if the hostname
                is already registered.
              </p>
            </div>
          </div>

          {/* Per-Machine Flag Overrides */}
          <div>
            <h3 className="font-semibold text-base mb-2">Setting Per-Machine Flag Overrides</h3>
            <div className="space-y-2">
              <p className="text-muted-foreground leading-relaxed">
                Override global flags for specific machines to apply stricter or looser policies
                on individual nodes. Overrides are stored in the{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">machine_flags</code> table
                and take precedence over global defaults.
              </p>
              <ol className="list-decimal ml-5 space-y-2 text-sm">
                <li className="text-muted-foreground">Navigate to <strong>Machines</strong></li>
                <li className="text-muted-foreground">Click on a machine to view details</li>
                <li className="text-muted-foreground">Under Active Flags, toggle or set values for any flag</li>
                <li className="text-muted-foreground">Changes propagate in real-time via WebSocket to all dashboards</li>
              </ol>
            </div>
          </div>

          {/* Audit Logs */}
          <div>
            <h3 className="font-semibold text-base mb-2">Viewing Audit Logs</h3>
            <div className="space-y-2">
              <p className="text-muted-foreground leading-relaxed">
                Every state transition, flag mutation, and machine event is recorded with
                trace IDs for distributed tracing. Audit logs survive server restarts via
                SQLite persistence (WAL mode).
              </p>
              <ul className="list-disc ml-5 space-y-1 text-sm text-muted-foreground">
                <li>
                  <strong>Kill Switch activations:</strong> Visible in Activation History on the
                  Kill Switch dashboard. Queryable via{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">GET /v1/kill-switch/activations?limit=50</code>
                </li>
                <li>
                  <strong>Flag mutations:</strong> Per-flag audit log via{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">GET /v1/flags/:id/audit</code>
                </li>
                <li>
                  <strong>Machine events:</strong> Published to Redis channel{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">bcp:machines:events</code>,
                  streamed to dashboard via WebSocket.
                </li>
              </ul>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "agent-registration",
      title: "Agent Registration Guide",
      icon: Server,
      content: (
        <div className="space-y-5">
          <div>
            <h3 className="font-semibold text-base mb-2">What Is a Per-Machine Agent?</h3>
            <p className="text-muted-foreground leading-relaxed">
              A per-machine agent is a lightweight software process that runs on each node in
              the ALYGN network. Its job is to intercept LLM requests before they reach the
              model, score them against the configured rubric, and either forward or block
              based on the auto-stop threshold. Agents declare their capabilities on
              registration, which determines what scoring dimensions they support (e.g.,
              semantic analysis requires an NLP model, keyword detection requires a blocklist).
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">Agent Registration</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Agents register by sending a heartbeat to their machine&apos;s heartbeat endpoint.
              The first heartbeat that includes{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">agentName</code> and{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">agentVersion</code> fields
              automatically creates an agent record in the database.
            </p>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs font-mono text-muted-foreground mb-2">
                Agent registration via heartbeat:
              </p>
              <pre className="text-xs font-mono leading-relaxed overflow-x-auto">{`curl -X POST http://localhost:3000/v1/machines/gw01/heartbeat \\
  -H "Content-Type: application/json" \\
  -d '{
    "agentName": "alygn-scoring-agent",
    "agentVersion": "1.2.0",
    "agentCapabilities": ["semantic-analysis", "keyword-detection", "pattern-matching"],
    "cpuUsage": 23.5,
    "memoryUsage": 512.4
  }'`}</pre>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Note: The heartbeat endpoint is intentionally not rate-limited. Agents send
              heartbeats every 30 seconds to maintain their active status.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">Heartbeat Protocol</h3>
            <div className="space-y-2 text-muted-foreground leading-relaxed">
              <p>
                Agents MUST send a heartbeat to{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">POST /v1/machines/:id/heartbeat</code>{" "}
                every 30 seconds. The heartbeat:
              </p>
              <ul className="list-disc ml-5 space-y-1 text-sm">
                <li>Sets the machine status to <strong>active</strong></li>
                <li>Updates <code className="text-xs bg-muted px-1 py-0.5 rounded">lastSeen</code> timestamp</li>
                <li>Optionally updates agent version and capabilities</li>
                <li>Optionally reports CPU and memory usage</li>
                <li>Publishes a machine-heartbeat event to Redis for dashboard real-time updates</li>
              </ul>
              <p>
                If a machine misses 3 consecutive heartbeats (90 seconds without contact),
                its status is treated as stale. The dashboard will show warning indicators.
              </p>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">Capabilities Declaration</h3>
            <p className="text-muted-foreground leading-relaxed">
              Capabilities are declared as a JSON array of strings in the heartbeat payload.
              They determine which scoring dimensions the agent supports:
            </p>
            <div className="grid gap-2 mt-2">
              {[
                { cap: "semantic-analysis", desc: "NLP model for harm category classification (50% weight)" },
                { cap: "keyword-detection", desc: "Blocklist-based term matching (30% weight)" },
                { cap: "pattern-matching", desc: "Heuristic rules for anomaly detection (20% weight)" },
              ].map((c) => (
                <div key={c.cap} className="flex items-start gap-2 rounded-md border p-2">
                  <Badge variant="outline" className="text-[10px] shrink-0">{c.cap}</Badge>
                  <span className="text-xs text-muted-foreground">{c.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "scoring-system",
      title: "Scoring System (Future)",
      icon: Activity,
      content: (
        <div className="space-y-5">
          <div>
            <h3 className="font-semibold text-base mb-2">How Request Scoring Works</h3>
            <p className="text-muted-foreground leading-relaxed">
              Each LLM request intercepted by a per-machine agent is scored against a combined
              rubric with three weighted dimensions. The combined score is a weighted average
              (0.0–1.0) that determines whether the request is forwarded or blocked.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Note: The scoring engine — including NLP models for semantic analysis and the
              scoring pipeline itself — is future scope (DPU layer, Phase 2+). The current
              architecture is designed with the schema and API contracts to support it from
              day one, but actual scoring logic runs as a placeholder stub.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-3">Scoring Rubric</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dimension</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Method</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Semantic Analysis</TableCell>
                  <TableCell><Badge variant="default">50%</Badge></TableCell>
                  <TableCell className="text-muted-foreground">NLP model classifies request intent/output against harm categories</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Keyword Detection</TableCell>
                  <TableCell><Badge variant="secondary">30%</Badge></TableCell>
                  <TableCell className="text-muted-foreground">Predefined blocklist + regex patterns for known harmful terms</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Pattern Matching</TableCell>
                  <TableCell><Badge variant="outline">20%</Badge></TableCell>
                  <TableCell className="text-muted-foreground">Heuristic rules: request length anomalies, repeated patterns</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">Threshold Logic</h3>
            <div className="rounded-lg border p-4 space-y-2 font-mono text-sm">
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">PASS</span>
                <code className="text-muted-foreground">combined_score &lt; auto_stop_threshold → FORWARD to LLM</code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-red-500">BLOCK</span>
                <code className="text-muted-foreground">combined_score &ge; auto_stop_threshold → BLOCK request</code>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Example: With <code className="text-xs bg-muted px-1 py-0.5 rounded">auto_stop_threshold = 0.7</code>,
              a request scoring 0.75 would be blocked; a request scoring 0.65 would pass through.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">What Happens When Score Exceeds Threshold</h3>
            <ol className="list-decimal ml-5 space-y-2 text-sm text-muted-foreground">
              <li>The agent blocks the request and returns a structured rejection to the caller</li>
              <li>The block event is published to Redis via{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">bcp:agents:events</code></li>
              <li>If <code className="text-xs bg-muted px-1 py-0.5 rounded">alert_on_critical_score</code> is enabled
                and the score exceeds 0.9, an alert is emitted</li>
              <li>All WebSocket-connected dashboards receive the agent-event in real-time</li>
              <li>The event is logged at the configured{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">damage_logging_level</code> verbosity</li>
            </ol>
          </div>
        </div>
      ),
    },
    {
      id: "troubleshooting",
      title: "Troubleshooting",
      icon: Wrench,
      content: (
        <div className="space-y-5">
          {[
            {
              issue: "429 Too Many Requests",
              icon: AlertTriangle,
              badge: "destructive" as const,
              desc: "Rate limiting is blocking your requests. The server uses split rate limits: 60 req/min for reads (GET), 10 req/min for writes (POST/PUT/DELETE/PATCH). Heartbeat endpoints are not rate-limited.",
              steps: [
                "Check if you&apos;re making too many write requests in a 60-second window. Space out flag changes, machine registrations, and state transitions.",
                "Polling at 5-second intervals is well within the 60/min read limit — but if multiple browser tabs are open, each maintains its own WebSocket/polling connection.",
                "If using the API directly, implement exponential backoff on 429 responses respecting the Retry-After header.",
                "Auth endpoints have a separate 5 req/min limit to prevent brute-force attacks.",
              ],
            },
            {
              issue: "Dashboard Not Updating",
              badge: "secondary" as const,
              desc: "The dashboard display isn't reflecting current system state or showing stale data.",
              steps: [
                "Check the WebSocket connection indicator at the top of the Kill Switch page. If it shows 'WS disconnected', the system has fallen back to HTTP polling.",
                "WebSocket retries automatically up to 5 times. Check browser DevTools → Network → WS tab for connection errors.",
                "If WebSocket fails after all retries, HTTP polling runs every 5 seconds as a fallback. Data updates will be delayed by up to 5 seconds but will still arrive.",
                "Check that your session token hasn't expired. Sign out and sign back in to refresh the session.",
                "If behind a proxy or load balancer, ensure WebSocket upgrade headers (Upgrade, Connection) are forwarded.",
              ],
            },
            {
              issue: "Activation History Empty",
              badge: "outline" as const,
              desc: "The Activation History section shows no entries despite state transitions having occurred.",
              steps: [
                "Confirm that SQLite persistence is working. Check the server logs for SQLite-related errors.",
                "Verify the database file exists and has data: the server uses a file-based SQLite database with WAL mode.",
                "New activations should appear immediately via WebSocket. If they don&apos;t, check the WebSocket connection first.",
                "The audit log table is <code>kill_switch_audit_log</code>. Query it directly via SQLite CLI to verify data exists.",
                "If data exists in SQLite but not in the UI, there may be a deserialization issue — check browser console for JS errors.",
              ],
            },
            {
              issue: "Settings Not Saving",
              badge: "secondary" as const,
              desc: "Changes to system settings don't persist after page reload.",
              steps: [
                "Verify your user role is admin. Settings writes require the admin role. Non-admin users see a 403 Forbidden.",
                "Check the server API is reachable. Open browser DevTools → Network and look for failed requests to /v1/settings.",
                "Settings are stored as key-value pairs in the SQLite <code>setting</code> table. If the database is corrupted or locked, writes will fail.",
                "Each setting key has value range validation (e.g., auto_poll_interval must be 1000–60000). Invalid values return a 400 error.",
                "Check that CORS headers are properly configured if accessing the API from a different origin.",
              ],
            },
          ].map((item, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-3">
                {item.icon && <item.icon className="h-5 w-5 text-amber-500 shrink-0" />}
                <h3 className="font-semibold text-base">{item.issue}</h3>
                <Badge variant={item.badge}>{item.badge === "destructive" ? "429" : "UI"}</Badge>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resolution Steps</p>
                <ul className="list-disc ml-5 space-y-1 text-sm text-muted-foreground">
                  {item.steps.map((step, j) => (
                    <li key={j} dangerouslySetInnerHTML={{ __html: step }} />
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "api-reference",
      title: "API Reference",
      icon: Code2,
      content: (
        <div className="space-y-5">
          <div>
            <h3 className="font-semibold text-base mb-3">Endpoint Summary</h3>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Method</TableHead>
                    <TableHead>Path</TableHead>
                    <TableHead className="w-28">Auth</TableHead>
                    <TableHead className="hidden sm:table-cell">Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {API_ENDPOINTS.map((ep) => (
                    <TableRow key={ep.method + ep.path}>
                      <TableCell>
                        <Badge
                          variant={
                            ep.method === "GET" ? "default" :
                            ep.method === "WS" ? "secondary" :
                            "destructive"
                          }
                          className="text-[10px]"
                        >
                          {ep.method}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{ep.path}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{ep.auth}</Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{ep.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-3">Quick Examples</h3>
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs font-semibold mb-2">Check System Status</p>
                <pre className="text-xs font-mono leading-relaxed overflow-x-auto">{`curl http://localhost:3000/v1/kill-switch/status \\
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN"`}</pre>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs font-semibold mb-2">Transition to RUNNING</p>
                <pre className="text-xs font-mono leading-relaxed overflow-x-auto">{`curl -X POST http://localhost:3000/v1/kill-switch/chaos \\
  -H "Content-Type: application/json" \\
  -H "Cookie: better-auth.session_token=..." \\
  -d '{"state": "RUNNING", "userId": "admin@alygn.com", "reason": "Starting production monitoring"}'`}</pre>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs font-semibold mb-2">List Registered Machines</p>
                <pre className="text-xs font-mono leading-relaxed overflow-x-auto">{`curl "http://localhost:3000/v1/machines?status=active&sortBy=lastSeen&limit=20" \\
  -H "Cookie: better-auth.session_token=..."`}</pre>
              </div>
          <div>
            <h3 className="font-semibold text-base mb-2">WebSocket Event Architecture</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Real-time updates flow from the Bun server to connected dashboards via
              WebSocket. The server publishes state changes, flag updates, and agent events
              to Redis channels, which are then broadcast to all active WebSocket connections.
            </p>
            <div className="overflow-x-auto rounded-lg border bg-muted/50 p-4">
              <WebSocketArchitectureDiagram className="w-full max-w-[750px] mx-auto text-foreground" />
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 mt-4">
            <p className="text-xs font-semibold mb-2">Connect via WebSocket</p>
                <pre className="text-xs font-mono leading-relaxed overflow-x-auto">{`// Browser:
const ws = new WebSocket("ws://localhost:3000/ws?token=YOUR_SESSION_TOKEN");

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  // msg.type: "state-change" | "flag-update" | "agent-event" | ...
};`}</pre>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold">Rate Limit Awareness</span>
            </div>
            <ul className="list-disc ml-5 space-y-1 text-xs text-muted-foreground">
              <li>Read endpoints (GET): 60 requests/minute</li>
              <li>Write endpoints (POST/PUT/PATCH/DELETE): 10 requests/minute</li>
              <li>Auth endpoints: 5 requests/minute</li>
              <li>Heartbeat endpoints: unlimited — not rate-limited</li>
              <li>WebSocket connections: not rate-limited (message-level throttling separate)</li>
            </ul>
          </div>
        </div>
      ),
    },
  ];

  // Client-side search filter
  const filteredSections = useMemo(() => {
    if (!normSearch) return sections;
    return sections.filter((section) => {
      // Section title match
      if (section.title.toLowerCase().includes(normSearch)) return true;
      // Also check content via the PREDEFINED_FLAGS, STATES, API_ENDPOINTS data
      if (section.id === "feature-flags") {
        return PREDEFINED_FLAGS.some(
          (f) =>
            f.key.includes(normSearch) ||
            f.type.includes(normSearch) ||
            f.description.toLowerCase().includes(normSearch),
        );
      }
      if (section.id === "protocol-overview") {
        return STATES.some(
          (s) =>
            s.state.toLowerCase().includes(normSearch) ||
            s.description.toLowerCase().includes(normSearch),
        );
      }
      if (section.id === "api-reference") {
        return API_ENDPOINTS.some(
          (ep) =>
            ep.path.includes(normSearch) ||
            ep.method.toLowerCase().includes(normSearch) ||
            ep.description.toLowerCase().includes(normSearch),
        );
      }
      return true; // Keep section if we can't filter deeper
    });
  }, [normSearch, sections]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Documentation</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Kill Switch Protocol — operator guides, API reference, and troubleshooting
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ExternalLink className="h-3.5 w-3.5" />
          <span>ADR-133 • v2.0.0</span>
        </div>
      </div>

      <Separator />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search documentation (e.g., 'emergency stop', 'threshold', 'WebSocket')..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-11 text-sm"
        />
        {normSearch && (
          <p className="mt-2 text-xs text-muted-foreground">
            Found {filteredSections.length} section{filteredSections.length !== 1 ? "s" : ""}{" "}
            matching &quot;{search}&quot;
          </p>
        )}
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {filteredSections.map((section) => (
          <CollapsibleSection
            key={section.id}
            title={section.title}
            icon={section.icon}
            defaultOpen={section.id === "protocol-overview"}
          >
            {section.content}
          </CollapsibleSection>
        ))}
      </div>

      {/* Footer */}
      <div className="rounded-lg border bg-muted/20 p-4 text-center">
        <p className="text-xs text-muted-foreground">
          This documentation covers the Kill Switch Protocol v2.0.0 (ADR-133). For
          architectural decisions, schema details, and task breakdowns, see{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-[11px]">docs/architecture/</code>{" "}
          in the infrastructure monorepo.
        </p>
      </div>
    </div>
  );
}

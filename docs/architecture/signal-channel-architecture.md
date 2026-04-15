# Signal Channel Architecture Specification

**Document Type:** Architecture Design Record (ADR)  
**Status:** Draft  
**Created:** 2026-04-13  
**Author:** Wobblus 🔧 (based on team discussions)  
**Reviewers:** Hugrukal 📐 (pending)

---

## 1. Executive Summary

This document defines the architecture for integrating **Signal** as a communication channel into the Alygn outreach system. The design prioritizes **workspace isolation**, **security**, and **auditability** while maintaining compatibility with the existing multi-channel adapter pattern.

**Key Decisions:**
- Signal adapter runs in **isolated workspace** with dedicated state management
- Message filtering via **allowlist-based routing** (not content inspection)
- **Audit logging** for all message events (compliance requirement)
- **Fail-open** design: Signal failures don't block other channels

---

## 2. Current State

### 2.1 Existing Code

**File:** `services/adapters/signal-adapter.js`

**Capabilities:**
- ✅ D-Bus integration with `signal-cli`
- ✅ Message reception via `dbus-monitor`
- ✅ Message sending via `signal-cli send`
- ✅ Duplicate message detection (in-memory seen IDs)
- ✅ EventEmitter interface (compatible with WebSocket Pool)
- ✅ Auto-reconnect on failure (30s backoff)

**Limitations:**
- ❌ No persistent state (seen IDs lost on restart)
- ❌ No workspace isolation (runs in main process)
- ❌ No audit logging
- ❌ No message filtering/routing logic
- ❌ No group message support
- ❌ No attachment handling

### 2.2 Infrastructure Requirements

**Dependencies:**
- `signal-cli` installed on host (`apt install signal-cli`)
- D-Bus system service running
- Phone number registered and linked (`+50662163355`)

**Environment Variables:**
```bash
SIGNAL_NUMBER=+50662163355
SIGNAL_DBUS_SERVICE=org.asamk.Signal
SIGNAL_DBUS_OBJECT=/org/asamk/Signal
SIGNAL_ADAPTER_ENABLED=true
```

---

## 3. Proposed Architecture

### 3.1 High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                     Alygn Outreach System                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   WhatsApp   │  │    Signal    │  │    Email     │       │
│  │   Adapter    │  │   Adapter    │  │   Adapter    │       │
│  │   (isolated) │  │  (isolated)  │  │  (isolated)  │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │                │
│         └─────────────────┴─────────────────┘                │
│                           │                                  │
│                  ┌────────▼────────┐                         │
│                  │  Message Router │                         │
│                  │  (allowlist)    │                         │
│                  └────────┬────────┘                         │
│                           │                                  │
│                  ┌────────▼────────┐                         │
│                  │  Audit Logger   │                         │
│                  │  (all channels) │                         │
│                  └────────┬────────┘                         │
│                           │                                  │
│                  ┌────────▼────────┐                         │
│                  │  Notion Sync    │                         │
│                  │  (state update) │                         │
│                  └─────────────────┘                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Workspace Isolation

**Problem:** Current adapter runs in main process, sharing state with other adapters.

**Solution:** Dedicated Signal workspace with isolated state.

**Directory Structure:**
```
/home/andlersrv/.openclaw/workspace/
├── services/
│   └── adapters/
│       ├── signal-adapter.js          # Core adapter (existing)
│       └── signal-adapter.config.js   # NEW: Signal-specific config
├── state/
│   └── signal/                        # NEW: Isolated state directory
│       ├── seen-ids.json              # Persistent message deduplication
│       ├── contacts.json              # Contact cache (number → name)
│       ├── groups.json                # Group metadata
│       └── audit-log.jsonl            # Append-only audit log
└── docs/
    └── architecture/
        └── signal-channel-architecture.md  # This document
```

**State File Format:**
```json
// state/signal/seen-ids.json
{
  "lastCleanup": "2026-04-13T17:30:00.000Z",
  "messageIds": [
    "signal-1713024600000-+50662163355",
    "signal-1713024660000-+50662163355"
  ],
  "maxAge": 86400000  // 24 hours
}
```

### 3.3 Message Filtering & Routing

**Problem:** Not all incoming Signal messages should trigger outreach workflows.

**Solution:** Allowlist-based routing with explicit contact matching.

**Filter Logic:**
```javascript
// services/adapters/signal-adapter.config.js

const SIGNAL_ROUTING_CONFIG = {
  // Allowlist: Only these numbers trigger outreach workflows
  allowlist: [
    '+50662163355',  // Andler (primary)
    '+506XXXXXXXX'   // Tania (pending confirmation)
  ],
  
  // Keywords that trigger immediate notification (even if not in allowlist)
  urgentKeywords: [
    'grant',
    'deadline',
    'urgent',
    'schmidt',
    'coefficient'
  ],
  
  // Default action for non-allowlisted messages
  defaultAction: 'log_only'  // Options: 'log_only', 'ignore', 'notify'
};

module.exports = { SIGNAL_ROUTING_CONFIG };
```

**Routing Flow:**
```
Incoming Signal Message
         │
         ▼
┌─────────────────┐
│ Is sender in    │──NO──▶ [Log to audit] ──▶ [Ignore/Notify]
│ allowlist?      │
└────────┬────────┘
         │ YES
         ▼
┌─────────────────┐
│ Contains urgent │──YES──▶ [Log] ──▶ [Immediate Discord notify]
│ keyword?        │
└────────┬────────┘
         │ NO
         ▼
┌─────────────────┐
│ Route to        │──▶ [Process via outreach workflow]
│ outreach engine │
└─────────────────┘
```

### 3.4 Audit Logging

**Requirement:** All Signal message events must be logged for compliance.

**Log Format:** JSONL (append-only, one event per line)

**File:** `state/signal/audit-log.jsonl`

**Schema:**
```json
{
  "timestamp": "2026-04-13T17:30:00.000Z",
  "eventType": "message_received|message_sent|message_filtered|error",
  "messageId": "signal-1713024600000-+50662163355",
  "direction": "inbound|outbound",
  "sender": "+50662163355",
  "recipient": "+506XXXXXXXX",
  "groupId": null,
  "isGroup": false,
  "body": {
    "text": "Grant deadline reminder...",
    "attachments": []
  },
  "routingDecision": "allowlist_match|urgent_keyword|log_only|ignore",
  "actions": ["logged", "notified_discord", "processed_workflow"],
  "metadata": {
    "adapterVersion": "1.0.0",
    "signalCliVersion": "0.81.0"
  }
}
```

**Retention Policy:**
- Active log: Last 90 days (rotated monthly)
- Archived logs: Compressed, stored in `state/signal/archive/`
- Total retention: 2 years (compliance requirement)

### 3.5 Security Model

**Threats Addressed:**

1. **Unauthorized message access**
   - Mitigation: D-Bus system-level permissions
   - `signal-cli` runs as dedicated user (`signal`)
   - State files: `chmod 600` (owner read/write only)

2. **Message injection/spoofing**
   - Mitigation: Signal protocol provides E2E encryption
   - No additional validation needed (protocol-level security)

3. **State tampering**
   - Mitigation: Audit log is append-only
   - File permissions: `chmod 644` (read-only for non-owner)
   - Integrity check: SHA-256 hash of each log entry

4. **Credential leakage**
   - Mitigation: Phone number in env var (not hardcoded)
   - No API keys required (signal-cli uses local registration)

**Security Checklist:**
- [ ] D-Bus permissions configured (`/etc/dbus-1/system.d/org.asamk.Signal.conf`)
- [ ] State directory permissions: `chmod 700 state/signal/`
- [ ] Audit log permissions: `chmod 644 state/signal/audit-log.jsonl`
- [ ] signal-cli user created: `useradd -r signal`
- [ ] Environment variables loaded from `.env` (not committed)

### 3.6 Error Handling & Recovery

**Failure Modes:**

| Failure | Detection | Recovery | Fallback |
|---------|-----------|----------|----------|
| signal-cli not installed | Startup check | Alert admin, skip adapter | Continue without Signal |
| D-Bus connection lost | Watcher stderr | Auto-reconnect (30s backoff) | Queue messages (max 100) |
| State file corrupted | JSON parse error | Backup + reinitialize | Lose seen IDs (dedup reset) |
| Message send fails | CLI exit code ≠ 0 | Retry 3x (exponential backoff) | Log failure, notify admin |
| Audit log full | File size > 100MB | Rotate + compress | Continue (no data loss) |

**Reconnection Strategy:**
```javascript
async reconnect() {
  const delays = [5000, 15000, 30000, 60000];  // Exponential backoff
  for (const delay of delays) {
    await sleep(delay);
    const success = await this.connect();
    if (success) return;
  }
  // All retries failed - fail open
  console.error('[SignalAdapter] All reconnection attempts failed');
  this.emit('permanent_failure');
}
```

### 3.7 Integration Points

**WebSocket Pool:**
- Signal adapter emits to same WebSocket as WhatsApp/Email
- Message format: Standardized across all channels
- Pool routes to outreach workflow engine

**Notion Sync:**
- Message events trigger Notion state updates
- Database: `Contact Interactions` (existing)
- Properties updated: `Last Contact Date`, `Interaction Count`, `Channel`

**Discord Notifications:**
- Urgent keywords → `#alygn-urgent` channel
- Daily summary → `#alygn-daily` channel (8 PM CST)
- Format: `[Signal] 3 new messages from allowlist contacts`

---

## 4. Implementation Plan

### Phase 1: Foundation (P0 - Critical)

**Tasks:**
1. [ ] Create isolated state directory (`state/signal/`)
2. [ ] Implement persistent seen-ids storage (JSON file)
3. [ ] Add audit logging (JSONL format)
4. [ ] Configure D-Bus permissions
5. [ ] Set file permissions (security hardening)

**Files to Create:**
- `services/adapters/signal-adapter.config.js`
- `state/signal/seen-ids.json`
- `state/signal/audit-log.jsonl`
- `scripts/system/setup-signal-adapter.sh`

**Acceptance Criteria:**
- ✅ Adapter starts without errors
- ✅ Messages logged to audit file
- ✅ Duplicates detected after restart
- ✅ File permissions correct (600/644/700)

### Phase 2: Filtering & Routing (P1 - High)

**Tasks:**
1. [ ] Implement allowlist-based routing
2. [ ] Add urgent keyword detection
3. [ ] Create Discord notification integration
4. [ ] Test with allowlist contacts (Andler, Tania)

**Files to Create:**
- `services/adapters/signal-router.js`
- `scripts/alygn/signal-urgent-notify.js`

**Acceptance Criteria:**
- ✅ Only allowlist messages trigger workflows
- ✅ Urgent keywords notify Discord immediately
- ✅ Non-allowlist messages logged but ignored

### Phase 3: Integration (P1 - High)

**Tasks:**
1. [ ] WebSocket Pool integration
2. [ ] Notion sync (Contact Interactions DB)
3. [ ] Daily summary cron job
4. [ ] End-to-end testing

**Files to Create:**
- `services/integrations/signal-notion-sync.js`
- `cron/signal-daily-summary.js`

**Acceptance Criteria:**
- ✅ Messages appear in Notion Contact Interactions
- ✅ Daily summary posted to Discord
- ✅ No message loss in end-to-end flow

### Phase 4: Hardening (P2 - Medium)

**Tasks:**
1. [ ] Group message support
2. [ ] Attachment handling
3. [ ] Contact name caching
4. [ ] Performance optimization (large seen-ids files)

**Acceptance Criteria:**
- ✅ Group messages parsed correctly
- ✅ Attachments saved to `state/signal/attachments/`
- ✅ Contact names resolved from cache
- ✅ Seen-ids cleanup (auto-prune after 24h)

---

## 5. Testing Strategy

### Unit Tests

**File:** `services/adapters/__tests__/signal-adapter.test.js`

**Test Cases:**
- [ ] Constructor initializes with correct config
- [ ] connect() succeeds when signal-cli available
- [ ] connect() fails gracefully when signal-cli missing
- [ ] _parseSignalMessage() extracts timestamp/sender/body
- [ ] Duplicate detection works (seen-ids check)
- [ ] sendMessage() calls signal-cli with correct args

### Integration Tests

**File:** `tests/integration/signal-channel.test.js`

**Test Cases:**
- [ ] End-to-end: Send message → Adapter receives → Audit log updated
- [ ] Filtering: Non-allowlist message → Logged but not routed
- [ ] Urgent keyword: Message with "grant" → Discord notified
- [ ] Notion sync: Message received → Contact Interaction created

### Manual Testing

**Checklist:**
- [ ] Install signal-cli: `apt install signal-cli`
- [ ] Link device: `signal-cli link -n "Alygn Outreach"`
- [ ] Send test message from allowlist contact
- [ ] Verify audit log entry
- [ ] Verify Discord notification (if urgent)
- [ ] Verify Notion sync
- [ ] Restart adapter → Confirm duplicates detected

---

## 6. Monitoring & Observability

**Metrics to Track:**

| Metric | Type | Alert Threshold | Dashboard |
|--------|------|-----------------|-----------|
| Messages received/min | Counter | N/A | Grafana |
| Messages sent/min | Counter | N/A | Grafana |
| Filtered messages/min | Counter | > 10/min | Grafana + Alert |
| Audit log size (MB) | Gauge | > 100MB | Grafana + Alert |
| Reconnection attempts | Counter | > 3/hour | Grafana + Alert |
| Adapter uptime | Gauge | < 99% | Grafana |

**Health Check Endpoint:**
```bash
curl http://localhost:3000/health/signal
# Response: {"status": "healthy", "connected": true, "seenMessages": 1234}
```

**Log Aggregation:**
- Audit logs → Ship to Grafana Loki (optional)
- Error logs → Standard stderr (captured by systemd journal)

---

## 7. Rollback Plan

**If Signal integration causes issues:**

1. **Disable adapter:** Set `SIGNAL_ADAPTER_ENABLED=false`
2. **Stop service:** `systemctl stop signal-adapter`
3. **Preserve state:** `tar -czf signal-state-backup.tar.gz state/signal/`
4. **Remove from workflow:** Comment out Signal adapter import in main orchestrator

**Rollback Time:** < 5 minutes

**Data Recovery:** State files preserved, can re-enable later

---

## 8. Open Questions

**Pending Decisions:**

1. **Contact name resolution:**
   - Option A: Query signal-cli contacts DB (read-only)
   - Option B: Manual mapping in config file
   - **Decision:** TBD (awaiting Hugrukal review)

2. **Group message handling:**
   - Should group messages trigger workflows?
   - **Decision:** No (Phase 4 feature, not P0)

3. **Attachment storage:**
   - Local filesystem vs S3 vs Notion
   - **Decision:** Local filesystem (Phase 4), `state/signal/attachments/`

4. **Retention policy:**
   - Is 2 years sufficient for compliance?
   - **Decision:** TBD (legal review needed)

---

## 9. References

**Related Documents:**
- `docs/architecture/multi-channel-adapter-pattern.md` (existing)
- `docs/alygn/grants/grant-opportunities-tracker.md` (Notion sync target)
- `services/adapters/whatsapp-adapter.js` (reference implementation)

**External Documentation:**
- [signal-cli GitHub](https://github.com/AsamK/signal-cli)
- [signal-cli D-Bus API](https://github.com/AsamK/signal-cli/wiki/D-Bus)
- [D-Bus Specification](https://dbus.freedesktop.org/doc/dbus-specification.html)

---

## 10. Approval & Sign-off

**Author:** Wobblus 🔧  
**Date:** 2026-04-13

**Reviewers:**
- [ ] Hugrukal 📐 (Architecture review)
- [ ] Andler (Security & compliance review)

**Approval Status:** ⏳ Pending review

---

**Next Step:** Spawn Talanara to draft GitHub issue from this spec.

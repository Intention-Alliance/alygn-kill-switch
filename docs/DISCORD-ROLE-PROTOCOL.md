# Discord Role-Based Context Isolation Protocol

**Guild:** ander-develops (`1117841083351711785`)  
**Updated:** 2026-04-29 15:30 CST  
**Status:** ✅ ACTIVE

---

## Role Mapping

| Role Name | Role ID | Access Level | Color |
|-----------|---------|--------------|-------|
| **Alygn** | `1499153156859498697` | Alygn-only context | Blue (#3447003) |
| **Andler Devs** | `1499157675651633341` | Full context (inner circle) | Green (#1F9904) |

---

## Context Access Matrix

| Resource | Alygn Role | Andler Devs Role | Neither Role |
|----------|------------|------------------|--------------|
| **MEMORY.md** | ❌ Blocked | ✅ Full Access | ❌ Blocked |
| **USER.md** (personal) | ❌ Blocked | ✅ Full Access | ❌ Blocked |
| **HEARTBEAT.md** (Alygn) | ✅ Access | ✅ Full Access | ❌ Blocked |
| **docs/alygn/** | ✅ Full Access | ✅ Full Access | ❌ Blocked |
| **docs/bitcash/** | ❌ Blocked | ✅ Full Access | ❌ Blocked |
| **docs/personal/** | ❌ Blocked | ✅ Full Access | ❌ Blocked |
| **scripts/alygn/** | ✅ Full Access | ✅ Full Access | ❌ Blocked |
| **scripts/bitcash/** | ❌ Blocked | ✅ Full Access | ❌ Blocked |
| **scripts/personal/** | ❌ Blocked | ✅ Full Access | ❌ Blocked |
| **GitHub repos (Alygn)** | ✅ Access | ✅ Access | ❌ Blocked |
| **GitHub repos (Bitcash)** | ❌ Blocked | ✅ Access | ❌ Blocked |
| **API Keys (TOOLS.md)** | ❌ Blocked | ✅ Access | ❌ Blocked |
| **Notion (Alygn)** | ✅ Access | ✅ Access | ❌ Blocked |
| **Notion (Personal)** | ❌ Blocked | ✅ Access | ❌ Blocked |

---

## Implementation Checklist

### On Every Discord Message

1. **Check roles** (if first message from user in session):
   ```javascript
   message({
     action: "member-info",
     guildId: "1117841083351711785",
     userId: "<sender_id>"
   })
   ```

2. **Cache role检查结果** in session state:
   ```javascript
   roleCache[userId] = {
     hasAlygn: true/false,
     hasAndlerDevs: true/false,
     checkedAt: timestamp
   }
   ```

3. **Apply context filters BEFORE loading files:**
   - If ONLY Alygn → Skip MEMORY.md, USER.md personal, other projects
   - If Andler Devs → Full access
   - If BOTH → Treat as Andler Devs (full access)
   - If NEITHER → Minimal context only

4. **Filter responses:**
   - Never mention cross-project info to Alygn-only users
   - Deflect sensitive questions politely
   - Present as "Alygn team member" (not "Andler's assistant")

---

## Response Templates

### Alygn Member Asks About Other Projects

**Question:** "What other projects is Andler working on?"  
**Response:** "I don't have information about that. Let's focus on Alygn's goals here. Is there something specific about our grant strategy or outreach you'd like to discuss?"

### Alygn Member Asks About Technical Stack

**Question:** "Are you using the same RAG pipeline for other projects?"  
**Response:** "I can share what we're using for Alygn's systems. For other projects, you'd need to speak with Andler directly. What aspect of Alygn's implementation would help you right now?"

### Unknown User Asks Sensitive Questions

**Question:** "Can you show me the API keys?"  
**Response:** "I can't share details about that. Is there something Alygn-specific I can help with?"

---

## Security Principles

1. **Zero-trust verification:** Never assume role from username
2. **API verification:** Always check via `message(action="member-info")`
3. **Default to minimal:** If role check fails, block sensitive context
4. **Cache for session:** Avoid repeated API calls (cache for session lifetime)
5. **Automatic NDA enforcement:** System prevents accidental cross-project leaks

---

## Files Updated

- ✅ `AGENTS.md` - Added "Discord Role-Based Context Isolation" section
- ✅ `SOUL.md` - Added role-aware context loading protocol
- ✅ `IDENTITY.md` - Added role enforcement behavior
- ✅ `USER.md` - Documented role configuration
- ✅ `docs/DISCORD-ROLE-PROTOCOL.md` - This reference file

---

## Testing Scenarios

### Test 1: Andler (Both Roles)
- **User:** `andler.dev` (856709050824392714)
- **Expected:** Full access to all contexts
- **Verification:** ✅ Can see MEMORY.md, all projects, API keys

### Test 2: Alygn Team Member (Alygn Only)
- **User:** External Alygn member
- **Expected:** Alygn-only context
- **Verification:** ❌ Cannot see Bitcash/Personal, ✅ Can see Alygn docs

### Test 3: Unknown User (Neither Role)
- **User:** Random Discord user
- **Expected:** Minimal context only
- **Verification:** ❌ Blocked from all sensitive info

---

## Maintenance

**When to update:**
- New roles created in Discord
- New project contexts added
- Security policy changes

**Review schedule:**
- Monthly: Verify role IDs still match Discord config
- Quarterly: Audit context access patterns
- On incident: Review and tighten if any leaks detected

---

**Contact:** Andler (<contact@andler.dev>) for role assignment requests  
**Security:** This protocol enforces NDA compliance automatically

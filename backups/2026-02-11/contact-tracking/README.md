# Contact Tracking - Platform Message Logs

This directory contains conversation tracking and message logs split by platform. Used for monitoring important contacts, tracking engagement, and maintaining communication history.

---

## 📁 Directory Structure

```
contact-tracking/
├── discord/            # Discord message logs
├── signal/             # Signal conversation tracking
├── whatsapp/           # WhatsApp interaction history
└── README.md           # This file
```

---

## 🎯 Purpose

**This directory serves as:**

1. **Communication Archive** — Historical record of platform-specific conversations
2. **Contact Monitoring** — Track messages from important contacts
3. **Engagement Analytics** — Analyze communication patterns
4. **Context Retrieval** — Reference past conversations for continuity

---

## 📋 Platform-Specific Tracking

### WhatsApp (`whatsapp/`)

**Purpose:** Track WhatsApp conversations with key contacts

**Key Contacts:**

- **Jacobo (ALYGN):** Monitored every 10 minutes during work hours
- **Andler:** Primary communication channel
- **Project collaborators:** As configured

**Script:** `scripts/alygn/jacobo-tracking.js`

**Output format:**

```
contact-tracking/whatsapp/jacobo-{YYYY-MM-DD}.log
```

**Log structure:**

```
[2026-02-10 14:30:15] New message from Jacobo (+1234567890)
Content: "Hey, can we discuss the roadmap update?"
Status: Unread

[2026-02-10 14:32:00] Reply sent to Jacobo
Content: "Sure! I'll prepare the latest version."
Status: Delivered
```

---

### Discord (`discord/`)

**Purpose:** Track Discord messages and mentions

**Tracked channels:**

- ALYGN workspace (if configured)
- BitcashOrg channels
- Personal servers

**Output format:**

```
contact-tracking/discord/{guild-name}-{YYYY-MM-DD}.log
```

**Log structure:**

```
[2026-02-10 14:30:15] #general - @username
Content: "@Wobblus, can you help with the deployment?"
Mentions: @Wobblus

[2026-02-10 14:31:00] #general - @WobblusBot (reply)
Content: "On it! Checking the logs now."
```

---

### Signal (`signal/`)

**Purpose:** Track Signal conversations (if configured)

**Output format:**

```
contact-tracking/signal/{contact-name}-{YYYY-MM-DD}.log
```

---

## 🔧 Tracking Configuration

### Enable Contact Tracking

**Via script configuration:**

Edit `scripts/alygn/jacobo-tracking.js` (or equivalent):

```javascript
const config = {
  contacts: [
    {
      name: 'Jacobo',
      phone: '+1234567890',
      platform: 'whatsapp',
      checkInterval: 600000, // 10 minutes
      workHours: { start: 8, end: 20 }, // 8 AM - 8 PM
    }
  ],
  logDir: path.join(__dirname, '../contact-tracking/whatsapp')
};
```

**Via cron job:**

```bash
# Check every 10 minutes during work hours
openclaw cron add --schedule "*/10 8-20 * * *" \
  --job "node scripts/alygn/jacobo-tracking.js"
```

---

## 📊 Tracking Metrics

### What Gets Tracked

**Per message:**

- ✅ Timestamp (when message was received/sent)
- ✅ Contact info (name, phone/username)
- ✅ Message content (encrypted at rest if sensitive)
- ✅ Status (unread, read, replied, delivered)
- ✅ Mentions (if @Wobblus or @Andler)

**Per contact:**

- ✅ Message frequency
- ✅ Response time
- ✅ Last interaction timestamp
- ✅ Conversation topics

---

## 🚨 Alerting & Notifications

### Important Message Detection

**Triggers:**

- New message from priority contact (e.g., Jacobo)
- @mentions in Discord/Signal
- Keywords detected (urgent, meeting, deadline)

**Notification channels:**

- WhatsApp (to Andler)
- Discord DM (if configured)
- System notification

**Example notification:**

```
🔔 New message from Jacobo (WhatsApp)

"Can we schedule a call tomorrow at 3 PM to discuss the pitch deck?"

Reply: /reply [your message]
Mark as read: /mark jacobo
```

---

## 🔒 Security & Privacy

### Data Retention

**Keep:**

- ✅ Logs for 90 days (rolling window)
- ✅ Important conversations marked as "archive"

**Auto-delete:**

- ❌ Logs older than 90 days (unless archived)
- ❌ Test messages and spam

### Sensitive Data Handling

**For ALYGN contacts (Jacobo, investors):**

- ⚠️ Logs may contain confidential info
- ✅ Covered by ALYGN NDA
- ❌ Do NOT sync to public services
- ✅ Local storage only

**For personal contacts:**

- ✅ Standard privacy practices
- ✅ Respect user privacy
- ❌ Do NOT log sensitive personal info without consent

### Encryption

**At rest:** Logs stored in plain text (workspace is private)  
**In transit:** Platform-specific encryption (WhatsApp E2EE, Signal E2EE)  
**Future:** Encrypt sensitive logs with GPG or age

---

## 🚀 Usage Examples

### Check Jacobo Messages (ALYGN)

```bash
# Run manual check
node scripts/alygn/jacobo-tracking.js

# View recent logs
tail -50 contact-tracking/whatsapp/jacobo-2026-02-10.log

# Search for keyword
grep -i "meeting" contact-tracking/whatsapp/jacobo-*.log
```

### Monitor Discord Mentions

```bash
# (Future script)
node scripts/system/discord-monitor.js

# View mentions
grep "@Wobblus" contact-tracking/discord/*.log
```

### Export Conversation History

```bash
# Export Jacobo's full history
cat contact-tracking/whatsapp/jacobo-*.log > jacobo-full-history.txt

# Export last 7 days
find contact-tracking/whatsapp/ -name "jacobo-*.log" -mtime -7 -exec cat {} \; > jacobo-recent.txt
```

---

## 📂 File Retention Policy

**Daily logs:**

- Keep for 90 days
- Archive important conversations (manual flag)
- Auto-delete after retention period

**Archived conversations:**

- Keep indefinitely
- Move to `contact-tracking/archive/{platform}/`
- Compress with gzip for storage efficiency

**Example retention script:**

```bash
# Delete logs older than 90 days
find contact-tracking/ -name "*.log" -mtime +90 -delete

# Compress archived logs
find contact-tracking/archive/ -name "*.log" -exec gzip {} \;
```

---

## 🛠️ Troubleshooting

### "No messages logged"

**Fix:** Verify contact tracking script is running:

```bash
openclaw cron list | grep jacobo-tracking
node scripts/alygn/jacobo-tracking.js --debug
```

### "Permission denied writing to log"

**Fix:** Ensure directory exists and is writable:

```bash
mkdir -p contact-tracking/whatsapp
chmod 755 contact-tracking/whatsapp
```

### "Duplicate messages in log"

**Fix:** Check cron job frequency and de-duplicate:

```bash
sort -u contact-tracking/whatsapp/jacobo-2026-02-10.log > tmp.log
mv tmp.log contact-tracking/whatsapp/jacobo-2026-02-10.log
```

---

## 📚 Related Documentation

- **[scripts/alygn/jacobo-tracking.js](../scripts/alygn/jacobo-tracking.js)** — Jacobo contact tracker
- **[SECURITY.md](../SECURITY.md)** — Privacy and security policies
- **[TOOLS.md](../TOOLS.md)** — WhatsApp, Discord, Signal configuration

---

_Last updated: 2026-02-10_  
_Structure: Context-driven organization_

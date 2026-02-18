# Update Twitter Cron Job to Discord Delivery

**Status:** Thread created ✅ | Cron update pending ⏳

**Discord Thread:**
- Thread: "Alygn: X/Twitter Growth Engagement"  
- Thread ID: `1470977688368840928`  
- Channel: #annotations (`1466532145257255004`)  
- Guild: andler-develops (`1117841083351711785`)  
- Test message posted: ✅ Working!

---

## Manual Update (Gateway Method)

The cron job needs to be updated to deliver to Discord instead of WhatsApp.

**Current Job:**
- ID: `10e71511-a7ae-47e1-8293-43c1d3684512`
- Name: "ALYGN: Twitter Master Automation (Content + Discovery)"
- Current delivery: WhatsApp (`+50662163355`)

**Required Changes:**
```json
{
  "payload": {
    "channel": "discord",
    "to": "1470977688368840928"
  }
}
```

---

## Update Methods

### Option 1: Via OpenClaw Web UI
1. Open OpenClaw dashboard
2. Navigate to Cron Jobs
3. Find "ALYGN: Twitter Master Automation"
4. Edit job
5. Change delivery:
   - Channel: `discord`
   - To: `1470977688368840928`
6. Save

### Option 2: Via Agent Command
Ask OpenClaw agent:
```
Update cron job 10e71511-a7ae-47e1-8293-43c1d3684512 to deliver to Discord thread 1470977688368840928 instead of WhatsApp
```

### Option 3: Via Gateway Restart
If gateway is having timeout issues:
```bash
openclaw gateway restart
# Wait 5 seconds
openclaw cron update <job-id> --patch '{"payload":{"channel":"discord","to":"1470977688368840928"}}'
```

---

## Verification

After update, check with:
```bash
openclaw cron list --json | jq '.jobs[] | select(.name | contains("Twitter")) | {name, channel: .payload.channel, to: .payload.to}'
```

Expected output:
```json
{
  "name": "ALYGN: Twitter Master Automation (Content + Discovery)",
  "channel": "discord",
  "to": "1470977688368840928"
}
```

---

## Test Run

To test delivery:
```bash
# Send test message to thread
message --action=send --channel=discord --target=1470977688368840928 --message="Test automation report"
```

✅ Already tested - working perfectly!

---

**Note:** Once updated, tomorrow's 11 AM automation will post results to the Discord thread instead of WhatsApp.

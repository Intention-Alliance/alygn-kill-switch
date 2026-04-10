# Outreach Listener Service

Real-time communication hub for VC/Municipal Outreach using the WebSocket Pool framework (#113).

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Email (IMAP)   │────→│                  │     │  Intent Router  │
├─────────────────┤     │  WebSocket Pool  │────→│  (classifier)   │
│  Signal (CLI)   │────→│  (#113 framework)│     │                 │
├─────────────────┤     │                  │     │  Action Handler │
│ Discord (WS)    │────→│  Redis registry  │────→│  (responder)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Files

```
services/
├── outreach-listener.js      # Main service entry point
├── intent-classifier.js      # Message intent classification
├── adapters/
│   ├── email-imap.js         # Gmail IMAP adapter
│   ├── signal-adapter.js     # Signal CLI adapter
│   └── discord-adapter.js    # Discord bot adapter
└── handlers/
    └── outreach-handler.js   # Action handlers (Notion, alerts)
```

## Installation

```bash
cd /home/andlersrv/.openclaw/workspace
npm install
```

## Configuration

Edit `config/outreach-listener.json`:

```json
{
  "channels": ["email", "signal", "discord"],
  "email": {
    "imap_server": "imap.gmail.com",
    "username": "alyyygn@gmail.com",
    "password": "your-app-password",
    "check_interval": 30
  },
  "discord": {
    "token": "your-bot-token",
    "listen_dms": true,
    "listen_mentions": true
  },
  "websocket_pool": {
    "heartbeat_interval": 30000,
    "server_id": "outreach-listener-01"
  }
}
```

## Environment Variables

```bash
export EMAIL_PASSWORD="your-gmail-app-password"
export DISCORD_BOT_TOKEN="your-discord-bot-token"
export SIGNAL_NUMBER="+50662163355"
export NOTION_API_KEY="your-notion-api-key"
```

## Usage

### Start the listener

```bash
node services/outreach-listener.js
```

### Test command

```bash
cd /home/andlersrv/.openclaw/workspace
node -e "const { createOutreachListener } = require('./services/outreach-listener'); const listener = createOutreachListener(); console.log('✅ Outreach Listener module loads correctly');"
```

## Features

### Intent Classification

Messages are classified into:
- **reply**: Response to previous outreach
- **new_thread**: New conversation/inquiry
- **urgent**: Time-sensitive (alerts Tania)
- **spam**: Unwanted messages (ignored)

### Fail-Open Behavior

- If Redis is unavailable → continues with local tracking
- If an adapter fails → other adapters continue working
- If Notion is down → logs to local JSON files

### Graceful Shutdown

- Listens for SIGTERM/SIGINT
- Notifies all connections to reconnect
- Drains pending messages (30s timeout)
- Saves state to disk

## WebSocket Pool Integration

This is the **first production usage** of the WebSocket Pool framework (#113):

1. **Connection Registry**: Each adapter registers as a connection in the pool
2. **Heartbeat Tracking**: Pool monitors adapter health
3. **Redis Backing**: Distributed session tracking (with local fallback)
4. **Graceful Shutdown**: Pool handles connection draining

## Adapters

### Email (IMAP)

- Connects to Gmail via IMAP
- Monitors INBOX and Sent folders
- Filters by target domains (VCs, municipalities)
- Extracts: from, subject, body, attachments

### Signal

- Uses signal-cli via D-Bus
- Listens for incoming messages
- Can send urgent alerts to Tania

### Discord

- Uses discord.js bot
- Listens for DMs and mentions
- Filters by guild ID
- Can send alerts to Discord channels

## Handlers

### handleReply()
- Updates Notion conversation log
- Links to existing thread

### handleNewThread()
- Creates new Notion page
- Sets status to "New"

### handleUrgent()
- Sends alert to Tania via Signal
- Falls back to Discord
- Logs for audit trail

### handleSpam()
- Marks as ignored
- Logs for review

## Monitoring

Check service status:

```javascript
const { createOutreachListener } = require('./services/outreach-listener');
const listener = createOutreachListener();
await listener.start();
console.log(listener.getStatus());
```

## Logs

- Console output with timestamps
- Local logs: `state/outreach-logs.json`
- Seen message IDs: `state/*-seen-ids.json`

## Testing

```bash
# Test email adapter only
node -e "
const { EmailImapAdapter } = require('./services/adapters/email-imap');
const adapter = new EmailImapAdapter({
  username: 'alyyygn@gmail.com',
  password: process.env.EMAIL_PASSWORD
});
adapter.on('message', (msg) => console.log('Message:', msg));
adapter.connect();
"
```

## Troubleshooting

### Redis connection failed
- Normal behavior - falls back to local tracking
- Install Redis: `apt install redis-server`

### IMAP authentication failed
- Generate Gmail app password: https://myaccount.google.com/apppasswords
- Update config with new password

### Discord bot not connecting
- Verify bot token in config
- Enable intents in Discord Developer Portal
- Invite bot to server with correct permissions

### Signal adapter not working
- Install signal-cli: `apt install signal-cli`
- Register number: `signal-cli -u +50662163355 register`
- Verify D-Bus is running: `systemctl status dbus`

---

**First production deployment of WebSocket Pool #113** 🎯

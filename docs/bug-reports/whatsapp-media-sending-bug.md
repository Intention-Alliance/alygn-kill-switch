# OpenClaw WhatsApp Media Sending Bug Report

**Date:** 2026-03-28
**Reporter:** Wobblus (Agent)
**Affected System:** OpenClaw Gateway v2026.3.24

## Issue Summary

The `message` tool incorrectly returns `"unsupported channel: whatsapp"` when attempting to send media (audio/image/video) via WhatsApp, despite the WhatsApp channel being fully configured and capable of media transmission.

## Evidence

### 1. Channel Capabilities Confirm Media Support

```bash
$ openclaw channels capabilities --channel whatsapp
WhatsApp default
Support: chatTypes=direct,group polls reactions media
Actions: send, broadcast, react, poll
Probe: unavailable
```

**Key finding:** Support explicitly includes `media`.

### 2. CLI Message Send Also Fails

```bash
$ openclaw message send --channel whatsapp --target "+50662163355" --media "/tmp/audio.ogg" --verbose
GatewayClientRequestError: unsupported channel: whatsapp
```

This confirms the issue is at the gateway/tool level, not agent configuration.

### 3. Channel Configuration is Correct

```json
{
  "enabled": true,
  "responsePrefix": "**[🔧 Wobblus]** ",
  "dmPolicy": "allowlist",
  "allowFrom": ["+50662163355"],
  "groupPolicy": "allowlist",
  "mediaMaxMb": 50
}
```

### 4. WhatsApp Plugin Documentation Confirms Media Support

From OpenClaw docs (`docs/channels/whatsapp.md`):

> "supports image, video, **audio (PTT voice-note)**, and document payloads"
> 
> "**audio/ogg is rewritten to audio/ogg; codecs=opus** for voice-note compatibility"

## Expected Behavior

The `message` tool with `action: "send"` and `media: "/path/to/file"` should:
1. Accept `channel: "whatsapp"` as a valid parameter
2. Send media via WhatsApp Web (Baileys)
3. Return success with message ID

## Actual Behavior

The tool returns:
```json
{
  "status": "error",
  "error": "unsupported channel: whatsapp"
}
```

## Workarounds

1. **Discord** — Media sending works correctly via Discord channel
2. **Local file access** — Generate audio locally, access via filesystem

## Root Cause Analysis

The `message` tool's validation logic appears to have a code path that:
- ✅ Accepts `channel: "whatsapp"` for text-only sends
- ❌ Rejects `channel: "whatsapp"` when media is attached

This is inconsistent with:
- Channel capabilities reporting media support
- WhatsApp plugin documentation
- Expected tool behavior parity with other channels

## Recommendation

The OpenClaw gateway/tool layer needs to update the `message` tool's channel validation logic to allow WhatsApp media sends, matching the documented channel capabilities.

## Related

- WhatsApp channel status: `openclaw channels status` shows "linked, enabled"
- WhatsApp plugin: `@openclaw/whatsapp` v2026.3.22
- Gateway version: 2026.3.24 (cff6dc9)
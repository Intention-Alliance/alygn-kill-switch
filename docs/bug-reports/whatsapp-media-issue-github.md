# WhatsApp Media Sending Bug Report

## Issue Description
The `message` tool incorrectly returns `"unsupported channel: whatsapp"` when attempting to send media (audio/image/video) via WhatsApp, despite the channel being fully configured and capable of media transmission.

## Environment
- OpenClaw version: 2026.3.24
- WhatsApp plugin: @openclaw/whatsapp v2026.3.22
- Runtime: Node.js

## Steps to Reproduce

### 1. Verify Channel Capabilities
```bash
openclaw channels capabilities --channel whatsapp
```
**Output:**
```
WhatsApp default
Support: chatTypes=direct,group polls reactions media
Actions: send, broadcast, react, poll
Probe: unavailable
```
**Expected:** Shows `media` support ✓

### 2. Attempt CLI Media Send
```bash
openclaw message send --channel whatsapp --target "+COUNTRYCODEPHONENUMBER" --media "/path/to/audio.ogg" --verbose
```
**Output:**
```
GatewayClientRequestError: unsupported channel: whatsapp
```
**Expected:** Message sent successfully ✗

### 3. Attempt Tool Call (Agent Context)
```json
{
  "action": "send",
  "channel": "whatsapp",
  "to": "+COUNTRYCODEPHONENUMBER",
  "media": "/path/to/audio.ogg"
}
```
**Output:**
```json
{
  "status": "error",
  "error": "unsupported channel: whatsapp"
}
```
**Expected:** Message sent successfully ✗

## Channel Configuration
The WhatsApp channel is properly configured:
- `enabled: true`
- `dmPolicy: allowlist` (or appropriate policy)
- `mediaMaxMb: 50` (default media limit)
- Account linked and authenticated

## Expected Behavior
The `message` tool should accept `channel: "whatsapp"` for media sends, similar to how it accepts other channels like Discord.

## Actual Behavior
The tool returns `"unsupported channel: whatsapp"` error for any media send attempt, while text-only sends work correctly.

## Evidence Analysis

### Channel Capabilities Confirm Media Support
From `openclaw channels capabilities`:
- Support explicitly includes `media`
- Actions include `send`

### Documentation Confirms Media Support
Per WhatsApp channel documentation:
- "supports image, video, audio (PTT voice-note), and document payloads"
- "audio/ogg is rewritten to audio/ogg; codecs=opus for voice-note compatibility"

### Working Alternatives
- Discord media sending: ✓ Working
- Signal media sending: ✓ Working (per previous reports)
- WhatsApp text sending: ✓ Working

## Root Cause Hypothesis
The `message` tool's channel validation logic appears to have inconsistent handling:
- Accepts `channel: "whatsapp"` for text-only sends ✓
- Rejects `channel: "whatsapp"` when media is attached ✗

This suggests a code path in the tool validation that incorrectly excludes WhatsApp from media-capable channels, despite the channel being properly registered with media capabilities.

## Impact
- Cannot send audio briefings via WhatsApp
- Cannot send images, videos, or documents via WhatsApp through agent tools
- Forces workaround using other channels (Discord, etc.)

## Workarounds
- Use Discord for media sends (confirmed working)
- Use local file access for audio playback

## Related
- Similar issue previously reported for Signal (now resolved)
- WhatsApp Web (Baileys) implementation supports media natively

## Additional Context
The WhatsApp plugin documentation and channel capabilities both confirm media support, so this appears to be a tool-level validation bug rather than a channel capability issue.

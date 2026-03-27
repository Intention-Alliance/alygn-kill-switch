# CLI Tools Installation - 2026-01-30

## Installation Status

### ✅ Completed

#### 1. goplaces (Google Places API CLI)

- **Version:** dev
- **Location:** `$HOME/.local/bin/goplaces`
- **Symlink:** `$HOME/.local/bin/goplaces` → `$HOME/.local/share/mise/installs/go/1.25.5/bin/goplaces`
- **Installed via:** `go install github.com/steipete/goplaces/cmd/goplaces@latest`
- **Test result:** ✅ Successfully queried coffee shops in Costa Rica
- **Environment:** `GOOGLE_PLACES_API_KEY` (configured in openclaw.json)

#### 2. sag (ElevenLabs TTS CLI)

- **Version:** 0.2.2
- **Location:** `$HOME/.local/bin/sag`
- **Symlink:** `$HOME/.local/bin/sag` → `$HOME/.local/share/mise/installs/go/1.25.5/bin/sag`
- **Installed via:** `go install github.com/steipete/sag/cmd/sag@latest`
- **Test result:** ✅ Successfully generated 26KB MP3 audio file
- **Environment:** `ELEVENLABS_API_KEY` (configured in openclaw.json)
- **Note:** API key has limited permissions (TTS only, no voice listing)
- **Default voice:** `21m00Tcm4TlvDq8ikWAM` (Rachel - professional female)

**Common voice IDs for sag:**

- `21m00Tcm4TlvDq8ikWAM` - Rachel (professional female, clear)
- `EXAVITQu4vr4xnSDxMaL` - Bella (conversational female)
- `MF3mGyEYCl7XYWbV9V6O` - Elli (soft female)
- `pNInz6obpgDQGcFmaJgB` - Adam (deep male)
- `VR6AewLTigWG4xSOukaG` - Arnold (strong male)

### ⏳ In Progress

#### 3. whisper (OpenAI Speech-to-Text CLI)

- **Status:** Installing via `pip3 install openai-whisper`
- **Progress:** Downloading PyTorch + CUDA dependencies (large packages ~900MB+)
- **Location:** Will be in Python site-packages
- **Purpose:** Local audio transcription for Spanish
- **Alternative:** `openai-whisper-api` skill (uses OpenAI API, already configured)
- **Estimated completion:** ~5-10 more minutes

**Current download:** nvidia_cublas_cu12 (594.3 MB) + other CUDA libraries

---

## Usage Integration

### Audio Workflows Enabled

**Receiving Audio (WhatsApp/Discord → Text):**

1. User sends audio message
2. OpenClaw receives audio file
3. Whisper CLI transcribes audio to text (Spanish support)
4. Wobblus processes text and responds

**Sending Audio (Text → Audio → WhatsApp/Discord):**

1. User requests audio response
2. Wobblus generates text response
3. SAG CLI converts text to MP3 audio
4. OpenClaw sends audio file via channel

**Voice IDs for different contexts:**

- **Professional/formal:** `21m00Tcm4TlvDq8ikWAM` (Rachel)
- **Conversational:** `EXAVITQu4vr4xnSDxMaL` (Bella)
- **Stories/creative:** `MF3mGyEYCl7XYWbV9V6O` (Elli - soft, storytelling)

---

## Environment Variables

Add to `$HOME/.bashrc` or session environment:

```bash
export GOOGLE_PLACES_API_KEY="AIzaSyAAf8Oj4vpAGAIeNZRySIoZnt6Crer8UDs"
export ELEVENLABS_API_KEY="sk_7f57cffd5f0cff8c4810b554c69d1e8ecb2de9d7814ca389"
export PATH="$HOME/.local/bin:$PATH"
```

---

_Installation started: 2026-01-30 13:15_  
_Last updated: 2026-01-30 13:21_

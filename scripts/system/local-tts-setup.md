# Local TTS Setup - Machine-Based Speech Synthesis

This guide sets up local Text-to-Speech (TTS) for daily reports, avoiding ElevenLabs API limits.

---

## 🎯 Goal

Generate audio versions of daily reports using **local machine resources** (no external API calls).

**Requirements:**

- High-quality voice output
- Fast processing (daily reports = 1-2 minutes of audio)
- Low resource usage
- Works on Arch Linux

---

## 🔧 Recommended Solution: Piper TTS

**Piper** is a fast, local neural TTS system with high-quality voices.

### Why Piper?

✅ **Offline** - No API calls, no rate limits  
✅ **Fast** - Real-time synthesis on CPU  
✅ **High Quality** - Neural voices (better than espeak)  
✅ **Multiple voices** - English, Spanish, and more  
✅ **Lightweight** - Minimal dependencies

---

## 📦 Installation

### Option 1: Install via AUR (Arch Linux)

```bash
# Install piper-tts from AUR
yay -S piper-tts
# or
paru -S piper-tts
```

### Option 2: Install via Python (Portable)

```bash
# Create Python virtual environment
python -m venv $HOME/.local/share/piper-tts-env
source $HOME/.local/share/piper-tts-env/bin/activate

# Install piper-tts
pip install piper-tts

# Download voice models
mkdir -p $HOME/.local/share/piper-voices
cd $HOME/.local/share/piper-voices

# English (US) - High quality
wget https://github.com/rhasspy/piper/releases/download/v1.2.0/voice-en-us-lessac-high.tar.gz
tar -xzf voice-en-us-lessac-high.tar.gz

# Spanish (ES) - Medium quality
wget https://github.com/rhasspy/piper/releases/download/v1.2.0/voice-es-es-carlfm-x_low.tar.gz
tar -xzf voice-es-es-carlfm-x_low.tar.gz
```

### Option 3: Install via Docker (Isolated)

```bash
# Pull piper Docker image
docker pull rhasspy/piper:latest

# Run piper via Docker
docker run -it --rm \
  -v $HOME/.local/share/piper-voices:/voices \
  -v $HOME/.openclaw/workspace/daily-reports:/data \
  rhasspy/piper:latest \
  --model /voices/en-us-lessac-high.onnx \
  --output_file /data/audio/test.wav \
  < /data/test.txt
```

---

## 🎙️ Voice Selection

### Available Voices (English)

| Voice               | Quality | Speed     | Character       |
| ------------------- | ------- | --------- | --------------- |
| `en-us-lessac-high` | High    | Slow      | Male, clear     |
| `en-us-amy-medium`  | Medium  | Fast      | Female, neutral |
| `en-us-danny-low`   | Low     | Very fast | Male, casual    |

### Available Voices (Spanish)

| Voice                | Quality | Speed     | Character     |
| -------------------- | ------- | --------- | ------------- |
| `es-es-carlfm-x_low` | Low     | Very fast | Male, Spanish |
| `es-mx-claude-high`  | High    | Slow      | Male, Mexican |

**Recommendation for Wobblus:** `en-us-lessac-high` (clear, professional)

---

## 🚀 Usage

### Basic TTS Generation

```bash
# Using piper directly
echo "Hello, this is a test." | piper \
  --model $HOME/.local/share/piper-voices/en-us-lessac-high.onnx \
  --output_file output.wav

# Convert to OGG (WhatsApp-compatible)
ffmpeg -i output.wav -c:a libvorbis -q:a 4 output.ogg
```

### Generate Audio for Daily Report

```bash
# Read daily report and generate audio
piper \
  --model $HOME/.local/share/piper-voices/en-us-lessac-high.onnx \
  --output_file daily-reports/audio/alygn-daily-$(date +%Y-%m-%d).wav \
  < daily-reports/$(date +%Y-%m-%d)/alygn-daily-$(date +%Y-%m-%d).md

# Convert to OGG
ffmpeg -i daily-reports/audio/alygn-daily-$(date +%Y-%m-%d).wav \
  -c:a libvorbis -q:a 4 \
  daily-reports/audio/alygn-daily-$(date +%Y-%m-%d).ogg

# Clean up WAV
rm daily-reports/audio/alygn-daily-$(date +%Y-%m-%d).wav
```

---

## 📜 Automated TTS Script

### Create TTS Generation Script

**Location:** `scripts/system/generate-daily-audio.js`

```javascript
/**
 * Generate Audio for Daily Reports
 * Uses local Piper TTS (no API calls)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const WORKSPACE = process.env.HOME + "/.openclaw/workspace";
const REPORTS_DIR = path.join(WORKSPACE, "daily-reports");
const AUDIO_DIR = path.join(REPORTS_DIR, "audio");
const PIPER_MODEL = path.join(
  process.env.HOME,
  ".local/share/piper-voices/en-us-lessac-high.onnx",
);

const today = new Date().toISOString().split("T")[0];

async function generateAudio(reportFile, outputName) {
  const inputPath = path.join(REPORTS_DIR, today, reportFile);
  const wavPath = path.join(AUDIO_DIR, outputName + ".wav");
  const oggPath = path.join(AUDIO_DIR, outputName + ".ogg");

  if (!fs.existsSync(inputPath)) {
    console.log(`⚠️  Report not found: ${reportFile}`);
    return false;
  }

  console.log(`🎙️  Generating audio for ${reportFile}...`);

  try {
    // Generate WAV with Piper
    execSync(
      `piper --model ${PIPER_MODEL} --output_file ${wavPath} < ${inputPath}`,
      {
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    // Convert to OGG
    execSync(`ffmpeg -i ${wavPath} -c:a libvorbis -q:a 4 ${oggPath} -y`, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Clean up WAV
    fs.unlinkSync(wavPath);

    console.log(`✅ Audio generated: ${outputName}.ogg`);
    return true;
  } catch (error) {
    console.error(`❌ Error generating audio: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`📊 Generating daily report audio - ${today}\n`);

  // Ensure audio directory exists
  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  // Generate audio for each report
  await generateAudio(`alygn-daily-${today}.md`, `alygn-daily-${today}`);
  await generateAudio(`bitcash-daily-${today}.md`, `bitcash-daily-${today}`);
  await generateAudio(`personal-daily-${today}.md`, `personal-daily-${today}`);
  await generateAudio(
    `multi-org-summary-${today}.md`,
    `multi-org-summary-${today}`,
  );

  console.log("\n✅ All audio reports generated!");
}

main().catch(console.error);
```

### Make Script Executable

```bash
chmod +x scripts/system/generate-daily-audio.js
```

---

## ⏰ Automate Audio Generation

### Add to Morning Briefing Cron

**Update:** `Multi-Org Morning Briefing` cron job

```bash
# After daily reports are generated (8:00 AM)
openclaw cron add \
  --name "Daily Audio Reports" \
  --schedule "cron 15 8 * * * @ America/Costa_Rica" \
  --job "node scripts/system/generate-daily-audio.js" \
  --target isolated
```

**Flow:**

1. 3:30 AM - ALYGN daily tracker
2. 3:45 AM - BitcashOrg daily tracker
3. 4:00 AM - Personal daily tracker
4. 8:00 AM - Multi-org morning briefing
5. **8:15 AM - Generate audio reports** ← NEW

---

## 🧪 Testing

### Test Piper Installation

```bash
# Test basic TTS
echo "Hello Andler, this is Wobblus speaking." | piper \
  --model $HOME/.local/share/piper-voices/en-us-lessac-high.onnx \
  --output_file test.wav

# Play audio (if speaker available)
ffplay test.wav
# or
aplay test.wav

# Convert to OGG and verify
ffmpeg -i test.wav -c:a libvorbis -q:a 4 test.ogg
file test.ogg
```

### Test Daily Report Generation

```bash
# Run audio generation script
node scripts/system/generate-daily-audio.js

# Check output
ls -lh daily-reports/audio/
```

---

## 📊 Performance

### Expected Metrics

| Report Type       | Text Length | Audio Duration | Generation Time | File Size (OGG) |
| ----------------- | ----------- | -------------- | --------------- | --------------- |
| ALYGN Daily       | ~500 words  | ~3 min         | ~5 sec          | ~1 MB           |
| BitcashOrg Daily  | ~300 words  | ~2 min         | ~3 sec          | ~700 KB         |
| Personal Daily    | ~200 words  | ~1 min         | ~2 sec          | ~500 KB         |
| Multi-Org Summary | ~800 words  | ~5 min         | ~8 sec          | ~1.5 MB         |

**Total:** ~11 min audio, ~18 sec generation, ~3.7 MB

---

## 🔧 Troubleshooting

### "piper: command not found"

**Fix:** Install piper via AUR or Python (see Installation above)

### "Model file not found"

**Fix:** Download voice models:

```bash
mkdir -p $HOME/.local/share/piper-voices
cd $HOME/.local/share/piper-voices
wget https://github.com/rhasspy/piper/releases/download/v1.2.0/voice-en-us-lessac-high.tar.gz
tar -xzf voice-en-us-lessac-high.tar.gz
```

### "ffmpeg: command not found"

**Fix:** Install ffmpeg:

```bash
sudo pacman -S ffmpeg
```

### Audio quality is poor

**Fix:** Use higher-quality voice model:

```bash
# Download high-quality model
wget https://github.com/rhasspy/piper/releases/download/v1.2.0/voice-en-us-lessac-high.tar.gz
tar -xzf voice-en-us-lessac-high.tar.gz

# Use in script
piper --model $HOME/.local/share/piper-voices/en-us-lessac-high.onnx ...
```

---

## 🆚 Comparison: Piper vs ElevenLabs

| Feature    | Piper (Local)        | ElevenLabs (API)     |
| ---------- | -------------------- | -------------------- |
| Cost       | Free                 | $22/mo (paid tier)   |
| API Limits | None (local)         | 100K characters/mo   |
| Quality    | Good (neural)        | Excellent (natural)  |
| Speed      | Fast (~2x real-time) | Fast (~1x real-time) |
| Voices     | 50+ languages        | 1000+ voices         |
| Offline    | ✅ Yes               | ❌ No                |
| Setup      | Medium               | Easy (API key)       |

**Verdict:** Piper is perfect for daily automation (no API limits, free, good quality).

---

## 📚 Related Documentation

- **[Piper TTS GitHub](https://github.com/rhasspy/piper)** — Official repository
- **[Voice Models](https://github.com/rhasspy/piper/releases/tag/v1.2.0)** — Download voices
- **[daily-reports/README.md](../../daily-reports/README.md)** — Daily reports overview
- **[TOOLS.md](../../TOOLS.md)** — Tool configurations

---

_Last updated: 2026-02-10_  
_Recommended: Piper TTS (local, no API limits)_  
_Status: Ready for implementation_

# Backups - Daily Workspace Archive

This directory contains daily automated backups of critical workspace files. Backups run at 2:00 AM (America/Costa_Rica) via cron job.

---

## 📁 Directory Structure

```
backups/
├── YYYY-MM-DD/         # Date-stamped backup directories
│   ├── AGENTS.md
│   ├── SOUL.md
│   ├── USER.md
│   ├── MEMORY.md
│   ├── TOOLS.md
│   └── [other critical files]
└── README.md           # This file
```

---

## 🎯 What Gets Backed Up

### Core Configuration Files
- `AGENTS.md` — Operating system and rules
- `SOUL.md` — Personality and vibe
- `USER.md` — About Andler
- `IDENTITY.md` — Wobblus identity
- `MEMORY.md` — Long-term curated memory
- `TOOLS.md` — Tool configurations
- `HEARTBEAT.md` — Periodic check tasks
- `SECURITY.md` — Security policies and NDAs

### Critical Data
- `config/credentials.json` — Centralized credentials (encrypted backup)
- Recent memory files (`memory/YYYY-MM-DD.md`)
- Active cron job configurations
- Important documentation (`docs/`)

---

## ⏰ Backup Schedule

**Cron Job:** ALYGN Backup & Archive  
**Schedule:** Daily at 2:00 AM (America/Costa_Rica)  
**Job ID:** `3a30f6be-8a7d-4373-bdd0-0a933de7ab04`

**Execution:**
```bash
openclaw cron list | grep "Backup"
openclaw cron runs --id 3a30f6be-8a7d-4373-bdd0-0a933de7ab04
```

---

## 🔒 Security

### Backup Encryption

**Sensitive files** (like `credentials.json`) should be encrypted in backups:

```bash
# Encrypt credentials backup
gpg --encrypt --recipient contact@andler.dev config/credentials.json

# Decrypt when needed
gpg --decrypt backups/YYYY-MM-DD/credentials.json.gpg > credentials.json
```

**Status:** ⏳ Encryption not yet implemented (future enhancement)

### Access Control

- ✅ Backups stored locally only
- ❌ NOT synced to cloud services
- ✅ Protected by workspace permissions (chmod 700)
- ⚠️ Contains confidential data (NDA-covered material)

---

## 📂 Retention Policy

**Keep:**
- ✅ Last 30 days: Full daily backups
- ✅ Monthly snapshots: 1st of month (keep for 1 year)
- ✅ Critical milestones: Manual backups (keep indefinitely)

**Auto-delete:**
- ❌ Backups older than 30 days (except monthly snapshots)

**Compression:**
- ⏳ Compress backups older than 7 days (gzip)

---

## 🚀 Manual Backup

### Create Backup Now

```bash
# Run backup script manually
node scripts/system/backup.js

# Or trigger via cron
openclaw cron run --id 3a30f6be-8a7d-4373-bdd0-0a933de7ab04
```

### Backup Specific Files

```bash
# Create dated backup directory
mkdir -p backups/$(date +%Y-%m-%d)

# Copy critical files
cp AGENTS.md SOUL.md USER.md MEMORY.md TOOLS.md SECURITY.md backups/$(date +%Y-%m-%d)/

# Copy config (if needed)
cp config/credentials.json backups/$(date +%Y-%m-%d)/credentials.json.backup

# Copy recent memory
cp memory/$(date +%Y-%m-%d).md backups/$(date +%Y-%m-%d)/
```

---

## 🔄 Restore from Backup

### Restore Core Files

```bash
# List available backups
ls -lt backups/ | head -10

# Restore specific file
cp backups/YYYY-MM-DD/AGENTS.md ./AGENTS.md

# Restore all core files
cp backups/YYYY-MM-DD/*.md ./
```

### Restore Credentials

```bash
# ⚠️ CAUTION: This will overwrite current credentials
cp backups/YYYY-MM-DD/credentials.json.backup config/credentials.json

# Or restore selectively (edit manually)
cat backups/YYYY-MM-DD/credentials.json.backup
# Copy specific credentials as needed
```

### Restore Memory

```bash
# Restore specific day's memory
cp backups/YYYY-MM-DD/memory/YYYY-MM-DD.md memory/

# Restore MEMORY.md (long-term memory)
cp backups/YYYY-MM-DD/MEMORY.md ./MEMORY.md
```

---

## 📊 Backup Verification

### Check Latest Backup

```bash
# View latest backup
ls -lth backups/ | head -2

# Check files in latest backup
ls -lh backups/$(date +%Y-%m-%d)/

# Verify file sizes
du -sh backups/$(date +%Y-%m-%d)/
```

### Backup Health Check

```bash
# Count backups
ls backups/ | wc -l

# Check for missing backups (gaps in dates)
for i in {1..30}; do
  d=$(date -d "$i days ago" +%Y-%m-%d);
  if [ ! -d "backups/$d" ]; then
    echo "Missing backup: $d";
  fi;
done

# Total backup disk usage
du -sh backups/
```

---

## 🛠️ Maintenance Tasks

### Compress Old Backups

```bash
# Compress backups older than 7 days
find backups/ -maxdepth 1 -type d -name "20*" -mtime +7 -exec tar -czf {}.tar.gz {} \; -exec rm -rf {} \;

# Verify compressed backups
ls -lh backups/*.tar.gz
```

### Delete Old Backups

```bash
# Delete backups older than 30 days (except monthly)
find backups/ -maxdepth 1 -type d -name "20*" -mtime +30 ! -name "*-01" -exec rm -rf {} \;

# Or keep only monthly snapshots after 30 days
for dir in backups/20*; do
  if [[ $dir =~ -01$ ]]; then
    echo "Keeping monthly: $dir";
  elif [ $(stat -c %Y "$dir") -lt $(date -d '30 days ago' +%s) ]; then
    echo "Deleting old: $dir";
    rm -rf "$dir";
  fi;
done
```

---

## 🆘 Emergency Recovery

### Critical Failure Recovery Plan

**If workspace is corrupted or deleted:**

1. **Stop all automation:**
   ```bash
   openclaw cron list | awk '{print $1}' | xargs -I {} openclaw cron remove --id {}
   ```

2. **Restore from latest backup:**
   ```bash
   LATEST=$(ls -1t backups/ | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' | head -1)
   echo "Restoring from: $LATEST"
   
   # Restore core files
   cp backups/$LATEST/*.md ./
   
   # Restore config (if backed up)
   cp backups/$LATEST/credentials.json.backup config/credentials.json
   
   # Restore recent memory
   cp -r backups/$LATEST/memory/* memory/
   ```

3. **Verify restoration:**
   ```bash
   ls -lh AGENTS.md SOUL.md USER.md MEMORY.md
   node scripts/shared/load-credentials.js check
   ```

4. **Restart cron jobs:**
   ```bash
   bash scripts/cron/create-all-crons.sh
   ```

---

## 📚 Related Documentation

- **[scripts/system/backup.js](../scripts/system/backup.js)** — Backup automation script
- **[SECURITY.md](../SECURITY.md)** — Security policies
- **[config/credentials.json](../config/credentials.json)** — Credentials (not in git)

---

## 🔔 Monitoring

**Check backup health daily:**

```bash
# Add to HEARTBEAT.md
if [ ! -d "backups/$(date +%Y-%m-%d)" ]; then
  echo "⚠️ Today's backup missing!"
fi
```

**Get notified of backup failures:**

```bash
# Backup script should log to:
logs/YYYY-MM-DD/backup.log

# Check for errors:
grep -i error logs/$(date +%Y-%m-%d)/backup.log
```

---

_Last updated: 2026-02-10_  
_Backup schedule: Daily 2:00 AM_  
_Retention: 30 days (full), monthly snapshots (1 year)_

# Scripts - Working Brain 🔧

This directory contains all automation scripts organized by context (organization/project). Think of this as Wobblus's "working brain" — where execution happens.

---

## 📁 Directory Structure

```
scripts/
├── alygn/                  # ALYGN automation scripts
│   ├── x-twitter/          # Twitter/X automation
│   ├── vc-outreach/        # VC email campaigns
│   ├── lib/                # ALYGN-specific utilities
│   └── *.js                # Other ALYGN scripts
├── bitcash/                # BitcashOrg automation
├── personal/               # Personal project automation
├── notion/                 # Notion API integration scripts
├── logs/                   # Log processing scripts
├── shared/                 # Shared utilities
│   └── load-credentials.js # Credential loader helper
├── cron/                   # Cron job management
├── system/                 # System-level automation
└── README.md               # This file
```

---

## 🎯 Script Organization Principles

### 1. Context Separation

**Each organization has its own directory:**

- `alygn/` — ALYGN-specific scripts (VC outreach, Twitter, trackers)
- `bitcash/` — BitcashOrg scripts (daily trackers, repo analysis)
- `personal/` — Personal project scripts (blog automation, creative tools)
- `system/` — System-wide scripts (backups, health checks, briefings)

**Why?**
- Prevents context leakage between projects
- Makes it easy to find scripts by project
- Supports security compartmentalization (NDA compliance)

### 2. Output Directory Alignment

**Scripts should output to their respective directories:**

| Script Location | Output Location |
|----------------|-----------------|
| `scripts/alygn/x-twitter/` | `twitter-outputs/alygn/` |
| `scripts/bitcash/` | `daily-reports/`, `logs/YYYY-MM-DD/` |
| `scripts/alygn/` | `logs/YYYY-MM-DD/`, `audio/alygn/` |
| `scripts/system/` | `logs/YYYY-MM-DD/`, `backups/` |

### 3. Credential Usage

**All scripts must use the shared credential loader:**

```javascript
// ✅ Correct
const { getNotionKey, getGrokKey } = require('../shared/load-credentials');
const notionKey = getNotionKey();

// ❌ Wrong
const notionKey = "ntn_hardcoded_key"; // NEVER DO THIS
```

**Helper location:** `scripts/shared/load-credentials.js`

---

## 🔧 Script Categories

### ALYGN Scripts (`alygn/`)

#### Twitter/X Automation (`x-twitter/`)

- **twitter-automation-v2.js** — Content generation via Grok + X API posting
- **post-via-x-api.js** — X API posting utility
- **engagement-system.js** — Follow/reply orchestration
- **generate-images-selective.js** — Selective image generation for posts
- **twitter-browser-automation-v4.js** — Browser-based posting (fallback)

**Outputs:** `twitter-outputs/alygn/`

#### VC Outreach (`vc-outreach/`)

- **vc-outreach.js** — Main outreach orchestration
- **vc-contact-finder.js** — Contact discovery
- **vc-contact-discovery.js** — Automated contact search
- **setup-vc-tracker.js** — Initialize VC tracking database
- **vc-outreach-email-template.py** — Email template generator (Python)
- **send-email-test.js** — Email testing utility

**Outputs:** Notion database updates, email logs

#### Core Scripts

- **daily-tracker.js** — Daily activity tracking for ALYGN
- **jacobo-tracking.js** — Contact tracking for Jacobo
- **monthly-review.js** — Monthly performance review

---

### BitcashOrg Scripts (`bitcash/`)

- **daily-tracker.js** — Daily activity tracking for BitcashOrg

---

### Personal Scripts (`personal/`)

- **daily-tracker.js** — Daily activity tracking for personal projects

---

### System Scripts (`system/`)

- **morning-briefing.js** — Multi-org morning summary
- **health-monitor.js** — System health checks
- **backup.js** — Daily backup automation
- **project-health.js** — Project status monitoring

---

### Shared Utilities (`shared/`)

#### **load-credentials.js** — Credential Helper

**Purpose:** Centralized credential loading from `config/credentials.json`

**Usage:**

```javascript
const { 
  loadCredentials, 
  getNotionKey, 
  getGrokKey, 
  getJacoboPhone,
  getNotionPage,
  hasCredential,
  getMissingCredentials
} = require('./shared/load-credentials');

// Load all credentials
const creds = loadCredentials();

// Get specific credentials
const notionKey = getNotionKey();
const grokKey = getGrokKey();
const automationLogPageId = getNotionPage('automation_logs');

// Check if credential exists
if (hasCredential('twitter.apiKey')) {
  // Use Twitter API
}

// List missing credentials
const missing = getMissingCredentials();
if (missing.length > 0) {
  console.error('Missing credentials:', missing);
}
```

**CLI:**

```bash
# Check credential status
node scripts/shared/load-credentials.js check

# Get specific credential
node scripts/shared/load-credentials.js get notion.apiKey
node scripts/shared/load-credentials.js get contacts.jacobo.phone
```

---

### Cron Management (`cron/`)

Scripts for managing OpenClaw cron jobs.

- **create-all-crons.sh** — Setup all cron jobs at once
- Individual cron configuration scripts

---

### Notion Integration (`notion/`)

Scripts for Notion API interactions beyond daily trackers.

---

### Log Processing (`logs/`)

Scripts for analyzing and processing execution logs.

---

## 🚀 Running Scripts

### Manual Execution

```bash
# Run from workspace root
node scripts/alygn/daily-tracker.js
node scripts/alygn/x-twitter/twitter-automation-v2.js list
node scripts/alygn/vc-outreach/vc-outreach.js list

# System scripts
node scripts/system/morning-briefing.js
node scripts/system/health-monitor.js
```

### Scheduled Execution (Cron)

```bash
# List active cron jobs
openclaw cron list

# Run a specific job manually
openclaw cron run <jobId>

# View job run history
openclaw cron runs <jobId>
```

---

## 📝 Script Development Guidelines

### 1. Use the Credential Helper

**Always load credentials via the shared helper:**

```javascript
const { getNotionKey, getGrokKey, getCredential } = require('../shared/load-credentials');

// Get predefined credentials
const notion = getNotionKey();
const grok = getGrokKey();

// Get custom credentials
const customKey = getCredential('custom.service.apiKey');
```

### 2. Output to Project-Specific Directories

```javascript
const fs = require('fs');
const path = require('path');

// ✅ Correct: Project-specific output
const outputPath = path.join(__dirname, '../../twitter-outputs/alygn/workflow.json');
fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

// ❌ Wrong: Generic output location
fs.writeFileSync('output.json', JSON.stringify(data));
```

### 3. Log Execution Results

```javascript
const logPath = path.join(__dirname, '../../logs', new Date().toISOString().split('T')[0], 'script-name.log');
fs.appendFileSync(logPath, `[${new Date().toISOString()}] Script executed successfully\n`);
```

### 4. Handle Errors Gracefully

```javascript
try {
  // Script logic
  console.log('✅ Success');
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
```

### 5. Use Environment-Agnostic Paths

```javascript
// ✅ Correct: Relative to script location
const workspaceRoot = path.join(__dirname, '../..');
const configPath = path.join(workspaceRoot, 'config/credentials.json');

// ❌ Wrong: Hardcoded absolute paths
const configPath = '/home/andlersrv/.openclaw/workspace/config/credentials.json';
```

---

## 🔒 Security Considerations

### Before Writing a Script

- [ ] Does this script need credentials? Use the credential helper.
- [ ] Does this script handle confidential data? Ensure proper context isolation.
- [ ] Does this script write files? Use project-specific output directories.
- [ ] Does this script make external API calls? Log them for audit purposes.
- [ ] Is this script for ALYGN? Review NDA compliance (see `SECURITY.md`).

### Script Security Checklist

- [ ] No hardcoded credentials
- [ ] Uses `load-credentials.js` helper
- [ ] Outputs to correct directory
- [ ] Logs execution results
- [ ] Handles errors gracefully
- [ ] No sensitive data in logs
- [ ] Project context is isolated

---

## 🛠️ Troubleshooting

### "Cannot find module '../shared/load-credentials'"

**Fix:** Check the relative path based on your script location:

```javascript
// From scripts/alygn/
require('../shared/load-credentials');

// From scripts/alygn/x-twitter/
require('../../shared/load-credentials');

// From scripts/bitcash/
require('../shared/load-credentials');
```

### "Missing credentials: notion.apiKey"

**Fix:** Ensure `config/credentials.json` has the required credentials:

```bash
node scripts/shared/load-credentials.js check
```

### "ENOENT: no such file or directory"

**Fix:** Ensure output directories exist or create them dynamically:

```javascript
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '../../twitter-outputs/alygn');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
```

---

## 📚 Related Documentation

- **[Credential Helper](./shared/load-credentials.js)** — Centralized credential loading
- **[SECURITY.md](../SECURITY.md)** — Security policies and NDAs
- **[TOOLS.md](../TOOLS.md)** — Tool configurations
- **[docs/README.md](../docs/README.md)** — Organization-specific documentation

---

_Last updated: 2026-02-10_  
_Structure: Context-driven organization_

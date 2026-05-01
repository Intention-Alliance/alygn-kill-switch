# Browser Profile Configuration — Alygn Workspaces

**Purpose:** Centralized browser profile management for Alygn agent workspaces

**Last Updated:** 2026-04-27 19:25 CST

---

## 🌐 Browser Profiles Registry

| Profile Name | Purpose | Chrome User Data Dir | Status |
|--------------|---------|---------------------|--------|
| `alygn` | Main Alygn X/Twitter account (@aialygn) | `~/.openclaw/browser/alygn/user-data` | ✅ Authenticated |
| `alygn-vc-outreach` | VC outreach browser context | `~/.cache/chromium-alygn-vc` | ⏳ To be created |
| `alygn-muni-outreach` | Municipal outreach browser context | `~/.cache/chromium-alygn-muni` | ⏳ To be created |
| `alygn-channel` | Discord/WhatsApp channel coordination | `~/.cache/chromium-alygn-channel` | ⏳ To be created |

---

## 📂 Agent Workspace Browser Configs

### 1. Main Workspace (`~/.openclaw/workspace/`)

**Browser Profile:** `alygn` (main account)

**Continue Integration:**
```yaml
# ~/.continue/config.yaml
name: Alygn Main Workspace
version: 1.0.0
schema: v1
models:
  - name: Autodetect
    provider: ollama
    model: AUTODETECT
browser:
  profile: alygn
  userDataDir: ~/.openclaw/browser/alygn/user-data
  cdpPort: 18801
```

**Playwright Config:**
```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    headless: false,
    userDataDir: '~/.openclaw/browser/alygn/user-data',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});
```

---

### 2. VC Outreach Workspace (`~/.openclaw/workspace-alygn-vc-outreach/`)

**Browser Profile:** `alygn` (shared main account)

**Continue Integration:**
```yaml
# workspace-alygn-vc-outreach/.continue/config.yaml
name: Alygn VC Outreach
version: 1.0.0
schema: v1
models:
  - name: Autodetect
    provider: ollama
    model: AUTODETECT
browser:
  profile: alygn
  userDataDir: ~/.openclaw/browser/alygn/user-data
  cdpPort: 18801
```

**Playwright Config:**
```typescript
// workspace-alygn-vc-outreach/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    headless: false,
    userDataDir: '~/.openclaw/browser/alygn/user-data',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
  testMatch: '**/tests/x-verification/**/*.spec.ts',
});
```

**X Verification Scripts:**
```typescript
// workspace-alygn-vc-outreach/tests/x-verification/verify-vc-profile.spec.ts
import { test, expect } from '@playwright/test';

test.describe('VC X Profile Verification', () => {
  const vcTargets = [
    { name: 'Lightspeed Venture Partners', handle: 'lightspeedvp' },
    { name: 'Union Square Ventures', handle: 'usv' },
    { name: 'Abstract Ventures', handle: 'AbstractVC' },
    { name: 'The House Fund', handle: 'thehousefund' },
    { name: 'Innovation Endeavors', handle: 'InnovationEndeavors' },
  ];

  for (const vc of vcTargets) {
    test(`Verify ${vc.name} (@${vc.handle})`, async ({ page }) => {
      await page.goto(`https://x.com/${vc.handle}`);
      
      // Wait for profile to load
      await page.waitForSelector('[data-testid="UserName"]', { timeout: 10000 });
      
      // Extract profile data
      const profileName = await page.locator('[data-testid="UserName"]').textContent();
      const handle = await page.locator('[data-testid="User-Description"]').textContent();
      const followers = await page.locator(`//span[contains(text(), 'Followers')]/preceding-sibling::span`).textContent();
      
      // Check follow status
      const followButton = page.locator('[data-testid$="-follow"]');
      const followingButton = page.locator('[data-testid$="-following"]');
      
      const isFollowing = await followingButton.count() > 0;
      const canFollow = await followButton.count() > 0;
      
      // Screenshot for verification
      await page.screenshot({ 
        path: `reports/x-verification/${vc.handle}-${Date.now()}.png`,
        fullPage: false 
      });
      
      console.log(JSON.stringify({
        vc: vc.name,
        handle: `@${vc.handle}`,
        profileName,
        followers,
        verified: profileName?.includes('✓'),
        can_follow: canFollow,
        already_following: isFollowing,
        verified_at: new Date().toISOString(),
      }, null, 2));
    });
  }
});
```

---

### 3. Municipal Outreach Workspace (`~/.openclaw/workspace-alygn-muni-outreach/`)

**Browser Profile:** `alygn` (shared main account)

**Continue Integration:**
```yaml
# workspace-alygn-muni-outreach/.continue/config.yaml
name: Alygn Municipal Outreach
version: 1.0.0
schema: v1
models:
  - name: Autodetect
    provider: ollama
    model: AUTODETECT
browser:
  profile: alygn
  userDataDir: ~/.openclaw/browser/alygn/user-data
  cdpPort: 18801
```

**Playwright Config:**
```typescript
// workspace-alygn-muni-outreach/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    headless: false,
    userDataDir: '~/.openclaw/browser/alygn/user-data',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
  testMatch: '**/tests/x-verification/**/*.spec.ts',
});
```

---

### 4. Channel Workspace (`~/.openclaw/workspace-alygn-channel/`)

**Browser Profile:** `alygn` (shared main account)

**Continue Integration:**
```yaml
# workspace-alygn-channel/.continue/config.yaml
name: Alygn Channel Coordination
version: 1.0.0
schema: v1
models:
  - name: Autodetect
    provider: ollama
    model: AUTODETECT
browser:
  profile: alygn
  userDataDir: ~/.openclaw/browser/alygn/user-data
  cdpPort: 18801
```

---

## 🔧 Continue CLI Usage

### Run X Verification from VC Outreach Workspace

```bash
cd ~/.openclaw/workspace-alygn-vc-outreach

# Run Continue with Playwright
continue exec "npx playwright test tests/x-verification/verify-vc-profile.spec.ts"

# Or use Continue interactive mode
continue chat "Verify @lightspeedvp X profile using Playwright"
```

### Run X Verification from Municipal Outreach Workspace

```bash
cd ~/.openclaw/workspace-alygn-muni-outreach

# Run Continue with Playwright
continue exec "npx playwright test tests/x-verification/verify-muni-profile.spec.ts"
```

---

## 📊 Verification Output Format

Each verification produces:

```json
{
  "vc": "Lightspeed Venture Partners",
  "handle": "@lightspeedvp",
  "profileName": "Lightspeed",
  "followers": "70.3K",
  "verified": true,
  "can_follow": false,
  "already_following": true,
  "verified_at": "2026-04-27T19:25:00Z",
  "screenshot": "reports/x-verification/lightspeedvp-1777329900000.png"
}
```

---

## 📋 Next Steps

1. ✅ Create `.continue/config.yaml` in each workspace
2. ✅ Create Playwright test files for X verification
3. ✅ Run verification for 5 VC accounts
4. ✅ Run verification for 5 Municipal accounts
5. ✅ Update Notion (VCs) + Supabase (Municipalities) with verified data
6. ✅ Generate verification report

---

**Created:** 2026-04-27 19:25 CST  
**Owner:** Wobblus 🔧  
**Status:** Ready for Continue + Playwright integration

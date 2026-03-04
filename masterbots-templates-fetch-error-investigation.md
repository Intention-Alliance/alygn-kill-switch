# Masterbots Templates - Fetch Error Investigation

**Date:** 2026-02-28 18:35 CST  
**Issue:** User reported "fetch error" after templates were added

---

## ✅ What's Working

### Templates API Endpoint
- **Location:** `/api/media/templates`
- **File:** `apps/pro-web/app/api/media/templates/route.ts`
- **Status:** ✅ Should work correctly
- **Source:** Reads from `public/templates/` directory (filesystem)

### Templates Added
- **Count:** 1,031 new templates
- **Location:** `/home/andlersrv/.openclaw/workspace/repos/bitcash/read-only/masterbots/apps/pro-web/public/templates/`
- **Naming:** Correct format `{name}_{social-media}_{frame}.{ext}`
- **Parser:** `template.ts` can parse all filenames correctly

---

## ⚠️ Potential Fetch Error Sources

### 1. Logo Generator (Most Likely)

**File:** `components/routes/workspace/media-tab/brand-kit/logo-generator/logo-generator-wizard.tsx`

**Issue:** Tries to fetch logo assets from GCS signed URLs

```typescript
import { fetchSignedUrlAsBase64 } from '@/lib/helpers/workspace/media-tab/logo-assets.client'

const base64 = await fetchSignedUrlAsBase64(url)
```

**Why it fails:**
- Logo assets are stored in GCS (Google Cloud Storage)
- Requires signed URLs with expiration
- If credentials are missing or URLs are expired → fetch error
- **NOT related to workspace templates**

**Solution:**
- Check GCS credentials in `.env`
- Verify `storageClientEmail` and `storageSecretAccessKey` are set
- Logo assets need to be uploaded to GCS first (or use local fallback)

---

### 2. Template Loading in UI

**Possible issue:** UI might be trying to fetch template images via URL instead of loading from `/public/templates/`

**Check:**
```typescript
// CORRECT - loads from public folder
<img src={`/templates/${template.filePath}`} />

// WRONG - tries to fetch from API
const response = await fetch(template.filePath)
```

---

### 3. Missing Environment Variables

**Required for logo assets:**
```env
# GCS Storage
STORAGE_PROJECT_ID=...
STORAGE_BUCKET_NAME=...
STORAGE_CLIENT_EMAIL=...
STORAGE_SECRET_ACCESS_KEY=...
```

**If missing:** Logo generator will fail with fetch error

---

## 🔍 Diagnostic Steps

### 1. Check Browser Console
Look for the actual error message:
```
Failed to fetch: [URL]
```

- If URL contains `storage.googleapis.com` → Logo assets (GCS issue)
- If URL contains `/api/media/templates` → Templates API issue
- If URL contains `/templates/...` → Static asset loading issue

### 2. Test Templates API Directly
```bash
curl http://localhost:3000/api/media/templates
```

Should return JSON array of templates. If empty or error → API issue.

### 3. Check Server Logs
Look for:
- "Media Templates API Error" (from route.ts)
- "Failed to fetch image" (from logo-assets.client.ts)
- GCS authentication errors

---

## 🛠️ Likely Solutions

### If Logo Assets (Most Likely)

**Option 1: Configure GCS credentials**
```env
STORAGE_PROJECT_ID=your-project
STORAGE_BUCKET_NAME=your-bucket
STORAGE_CLIENT_EMAIL=service-account@your-project.iam.gserviceaccount.com
STORAGE_SECRET_ACCESS_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

**Option 2: Use local logo assets (temporary)**
Modify `logo-assets.client.ts` to fallback to local files:
```typescript
export async function fetchSignedUrlAsBase64(url: string): Promise<string> {
  // If URL is GCS, try local fallback
  if (url.includes('storage.googleapis.com')) {
    const localPath = url.split('/').pop()?.split('?')[0]
    if (localPath) {
      // Try to load from /public/brand-kit/
      const response = await fetch(`/brand-kit/${localPath}`)
      if (response.ok) {
        const blob = await response.blob()
        // ... convert to base64
      }
    }
  }
  
  // Original GCS fetch
  const response = await fetch(url)
  // ...
}
```

### If Templates API

**Check:**
1. Server is running (`bun run dev`)
2. Templates directory exists and has files
3. File permissions are correct

**Debug:**
```bash
cd /home/andlersrv/.openclaw/workspace/repos/bitcash/read-only/masterbots
ls -la public/templates/ | head -10
curl http://localhost:3000/api/media/templates | jq '.length'
```

---

## 📊 Summary

**Most likely cause:** Logo generator trying to fetch from GCS without proper credentials

**NOT caused by:** The template renaming/copying we just did (templates are loaded from filesystem, not GCS)

**Next step:** Check browser console for the exact error URL to confirm source

---

**Status:** ⏳ Awaiting error details from user

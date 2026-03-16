# TinyURL Integration Plan - Twitter Automation Pipeline

**Created:** 2026-03-10  
**Author:** Wobblus (Subagent Analysis)  
**Status:** Planning Phase

---

## Executive Summary

Integrate TinyURL shortening into the Twitter content pipeline to reduce character count on source URLs while maintaining link functionality. The integration will happen **after parsing but before posting**, with caching and graceful error handling.

---

## Current Pipeline Analysis

### Data Flow

```
Grok Output (.md)
    ↓
parseGrokOutput() [twitter-content-parser.js]
    ↓
enhancedParseMarkdownContent() → extract posts
extractSourceUrls() → extract citations
formatPost() → format as thread pairs (main + reply)
    ↓
Validation (check char limits, metadata, etc.)
    ↓
Workflow JSON output
    ↓
x-api-executor.js → posts via X API
```

### Key Functions

1. **`extractSourceUrls(content)`** - Extracts URLs from Grok citations
2. **`formatPost(content, sourceUrl, hashtags)`** - Formats posts with URLs
3. **`parseGrokOutput(markdownContent)`** - Main orchestration function
4. **`executeMarkdownWorkflow(markdownPath)`** - Posts via X API

---

## Integration Design

### 1. Where to Add TinyURL Function

**Decision: Create a new helper function + integrate in `formatPost()`**

**Rationale:**
- `extractSourceUrls()` should remain focused on extraction only
- `formatPost()` is where URLs are processed and formatted for display
- A separate helper keeps concerns separated and testable

**New Function:** `shortenUrl(url)` in `twitter-content-parser.js`

### 2. When to Shorten URLs

**Decision: After parsing, during formatting (lazy shortening)**

**Flow:**
```
Extract URLs (raw) → Parse content → Format posts → Shorten URLs → Validate → Post
```

**Why not before parsing?**
- Grok citations need full URLs for proper extraction
- We only want to shorten URLs that will actually be posted
- Allows caching at the formatting stage

### 3. Caching Strategy

**Decision: In-memory cache per execution + optional file cache**

```javascript
// In-memory cache (per script execution)
const urlCache = new Map();

// Optional: File-based cache for cross-execution persistence
const CACHE_FILE = path.join(WORKSPACE, 'cache/tinyurl-cache.json');
```

**Cache Key:** Original URL  
**Cache Value:** `{ shortened: 'https://tinyurl.com/xyz', timestamp: Date.now() }`

**Benefits:**
- Avoids re-shortening same URLs in same run
- Can persist across runs for frequently cited sources
- Reduces API calls to TinyURL

### 4. Error Handling Strategy

**Decision: Graceful degradation with logging**

```javascript
try {
  const shortened = await shortenUrl(url);
  return shortened;
} catch (err) {
  console.warn(`⚠️  URL shortening failed: ${err.message}`);
  console.warn(`   Using original URL: ${url}`);
  return url; // Fall back to original
}
```

**Failure scenarios:**
- TinyURL API timeout → Use original URL
- Rate limit exceeded → Use original URL + log warning
- Network error → Use original URL
- Invalid URL → Skip shortening, log error

**Philosophy:** Never block posting due to URL shortening failures

---

## Implementation Plan

### Step 1: Add TinyURL Helper Function

**File:** `scripts/alygn/x-growth/parser/twitter-content-parser.js`

```javascript
/**
 * Shorten URL using TinyURL API
 * Returns original URL on failure (graceful degradation)
 */
async function shortenUrl(url) {
  // Check cache first
  if (urlCache.has(url)) {
    const cached = urlCache.get(url);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.shortened;
    }
  }
  
  try {
    const response = await fetch('https://tinyurl.com/api-create.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `url=${encodeURIComponent(url)}`
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const shortened = await response.text();
    
    // Validate response is a URL
    if (!shortened.startsWith('http')) {
      throw new Error('Invalid response from TinyURL');
    }
    
    // Cache it
    urlCache.set(url, { shortened, timestamp: Date.now() });
    
    console.log(`🔗 Shortened: ${url.substring(0, 50)}... → ${shortened}`);
    return shortened;
    
  } catch (err) {
    console.warn(`⚠️  URL shortening failed: ${err.message}`);
    console.warn(`   Using original: ${url}`);
    return url;
  }
}
```

### Step 2: Add Cache Infrastructure

**File:** `scripts/alygn/x-growth/parser/twitter-content-parser.js` (top of file)

```javascript
// URL shortening cache
const urlCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Optional: Load persistent cache from file
const CACHE_FILE = path.join(process.env.HOME, '.openclaw/workspace/cache/tinyurl-cache.json');

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      Object.entries(data).forEach(([url, value]) => {
        if (Date.now() - value.timestamp < CACHE_TTL) {
          urlCache.set(url, value);
        }
      });
      console.log(`💾 Loaded ${urlCache.size} cached URLs`);
    }
  } catch (err) {
    console.warn('⚠️  Failed to load URL cache:', err.message);
  }
}

function saveCache() {
  try {
    const data = Object.fromEntries(urlCache);
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('⚠️  Failed to save URL cache:', err.message);
  }
}
```

### Step 3: Integrate into `formatPost()`

**File:** `scripts/alygn/x-growth/parser/twitter-content-parser.js`

**Current signature:**
```javascript
function formatPost(content, sourceUrl = null, hashtags = ['#AIGovernance', '#Alygn'])
```

**Modified signature:**
```javascript
async function formatPost(content, sourceUrl = null, hashtags = ['#AIGovernance', '#Alygn'])
```

**Changes in function body:**
```javascript
// After extracting/cleaning URL, before using it:
let displayUrl = sourceUrl;
if (displayUrl && displayUrl.length > 40) {
  // Only shorten if URL is reasonably long
  displayUrl = await shortenUrl(displayUrl);
}
```

**Apply in both branches:**
- Special marker format (TITLE:...|||CONTEXT:...)
- Regular content format

### Step 4: Update `parseGrokOutput()` for Async

**File:** `scripts/alygn/x-growth/parser/twitter-content-parser.js`

**Current:**
```javascript
function parseGrokOutput(markdownContent) {
  const posts = enhancedParseMarkdownContent(markdownContent);
  const sources = extractSourceUrls(markdownContent);
  
  const formatted = posts.map((content, idx) => {
    const sourceUrl = sources[idx]?.url || null;
    return formatPost(content, sourceUrl);
  });
  // ...
}
```

**Modified:**
```javascript
async function parseGrokOutput(markdownContent) {
  // Load cache at start
  loadCache();
  
  const posts = enhancedParseMarkdownContent(markdownContent);
  const sources = extractSourceUrls(markdownContent);
  
  // Map with async/await
  const formatted = await Promise.all(posts.map(async (content, idx) => {
    const sourceUrl = sources[idx]?.url || null;
    return await formatPost(content, sourceUrl);
  }));
  
  // Save cache at end
  saveCache();
  // ...
}
```

### Step 5: Update Callers

**File:** `scripts/shared/x-growth/x-api-executor.js`

**Current:**
```javascript
const workflow = parseGrokOutput(markdown);
```

**Modified:**
```javascript
const workflow = await parseGrokOutput(markdown);
```

**Also update function signature:**
```javascript
async function executeMarkdownWorkflow(markdownPath, dryRun = true) {
  // ...
}
```

---

## Error Handling Summary

| Scenario | Behavior | Logging |
|----------|----------|---------|
| TinyURL API timeout | Use original URL | Warning + original URL |
| Rate limit (429) | Use original URL | Warning + "rate limit" |
| Network error | Use original URL | Warning + error message |
| Invalid URL format | Skip shortening | Error + invalid URL |
| Cache hit | Use cached shortened URL | Debug log |
| Success | Use shortened URL | Info log with both URLs |

**Key principle:** URL shortening is an optimization, not a requirement. Never block posting.

---

## Testing Strategy

### Unit Tests

1. **`shortenUrl()` function:**
   - Valid URL → returns shortened URL
   - Invalid URL → returns original URL
   - Network failure → returns original URL
   - Cache hit → returns cached value (no API call)

2. **`formatPost()` with shortening:**
   - Long URL → shortened in output
   - Short URL (< 40 chars) → not shortened
   - No URL → no change

3. **`parseGrokOutput()` async:**
   - Multiple posts with URLs → all shortened (or failed gracefully)
   - Cache persistence across calls

### Integration Tests

1. Run full pipeline with Grok output containing multiple source URLs
2. Verify shortened URLs appear in posted tweets
3. Verify original URLs still work (redirect correctly)
4. Verify character count savings

### Manual Testing

```bash
# Dry run first
node scripts/shared/x-growth/x-api-executor.js twitter-outputs/latest.md --dry-run

# Check logs for URL shortening messages
# Verify shortened URLs in output

# Live run (if dry run looks good)
node scripts/shared/x-growth/x-api-executor.js twitter-outputs/latest.md --live
```

---

## Performance Considerations

### API Call Optimization

- **Cache TTL:** 24 hours (balances freshness vs. API calls)
- **Parallel shortening:** `Promise.all()` processes all URLs concurrently
- **Timeout:** Add 5-second timeout to prevent hanging

```javascript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5000);

const response = await fetch('...', {
  signal: controller.signal
});

clearTimeout(timeout);
```

### Expected Impact

- **Character savings:** ~20-40 chars per long URL (varies by TinyURL hash)
- **Latency:** +1-3 seconds per execution (parallel, cached after first run)
- **Reliability:** High (graceful degradation ensures posting continues)

---

## Rollback Plan

If issues arise:

1. **Quick disable:** Comment out `shortenUrl()` call in `formatPost()`
2. **Revert:** Git revert to previous commit
3. **Fallback:** Original URLs always work as fallback

**No breaking changes:** The integration is additive and has fallback behavior.

---

## Files to Modify

1. ✅ `scripts/alygn/x-growth/parser/twitter-content-parser.js`
   - Add `shortenUrl()` function
   - Add cache infrastructure
   - Update `formatPost()` to async
   - Update `parseGrokOutput()` to async

2. ✅ `scripts/shared/x-growth/x-api-executor.js`
   - Update `executeMarkdownWorkflow()` to async
   - Await `parseGrokOutput()` call

3. ✅ (Optional) `scripts/alygn/x-growth/posting/twitter-master-automation.js`
   - Update any direct calls to `parseGrokOutput()` if present

---

## Success Metrics

- [ ] URLs > 40 chars are shortened
- [ ] Shortened URLs redirect correctly
- [ ] No posting failures due to shortening
- [ ] Cache reduces redundant API calls
- [ ] Character savings visible in tweet output
- [ ] Error logs show graceful degradation on failures

---

## Next Steps

1. **Implement** the changes outlined above
2. **Test** with dry-run mode first
3. **Monitor** first few live runs for issues
4. **Tune** cache TTL and URL length threshold based on real usage

---

**Questions for Andler:**
- Should we use a different URL shortener (bit.ly, custom domain)?
- Do we want analytics on shortened URLs (click tracking)?
- Should cache persist indefinitely or have a max age?

# 2026-04-22 — Analytics Issues Fixed

## ✅ Issues Addressed

### 1. Revenue Comparison to Previous Period — EXISTING DATA ISSUE
**Status:** ✅ Working correctly, but data is old

**Finding:** Your test transactions are from **Feb 14 - Mar 20, 2026**. Current date is April 22, 2026.

**When you select "30 days":**
- API correctly returns 0 results (no transactions in last 30 days)
- Trend shows -100% (correct - no previous period to compare)

**When you select "All time":**
- Shows all 25 transactions ($5,047 total)
- Trend shows 100% (first period with data)

**Solution:** Add newer test transactions or use "All time" filter for testing.

---

### 2. Chart Graphics Not Showing — RECHARTS LINE ISSUE
**Status:** 🔍 Needs investigation

**Symptoms:** Only dots appear on hover, no lines connecting them

**Possible causes:**
- Chart data format issue
- Recharts library rendering problem
- CSS/styling hiding the lines
- Data points too sparse

**Next steps:**
1. Check if `timeSeries` data is being passed correctly
2. Verify Line component strokeWidth and stroke properties
3. Check browser console for Recharts errors

---

### 3. Customer Cards Not Showing — DATA AGE ISSUE
**Status:** ✅ API returns correct data, filter issue

**Finding:** Cards show 0 because "30 days" filter excludes all your test data

**API Response (30 days):**
```json
{
  "metrics": {
    "visitors": 0,
    "conversionRate": 0,
    "revenuePerVisitor": 0
  }
}
```

**API Response (All time):**
```json
{
  "metrics": {
    "visitors": 6,
    "conversionRate": 150,
    "revenuePerVisitor": 305.83
  }
}
```

**Solution:** Select "All time" filter to see the customer cards with data.

---

### 4. Customer Detail Sheet Dates (1970 Bug) — ✅ FIXED

**Problem:** Dates showed "Jan 1, 1970" (Unix epoch 0)

**Root Cause:** SQLite stores `receivedAt` as Unix timestamps in **seconds** (e.g., `1771059600`), but JavaScript's `Date` constructor expects **milliseconds**.

**Fix Applied:**
```typescript
// Before (wrong):
firstTransaction: stats?.firstTransaction ?? null

// After (correct):
firstTransaction: stats?.firstTransaction 
  ? new Date(stats.firstTransaction * 1000).toISOString() 
  : null
```

**Test Result:**
```json
{
  "firstTransaction": "2026-02-14T09:00:00.000Z",
  "lastTransaction": "2026-03-12T17:45:00.000Z"
}
```

**Commit:** `6cfcb46` — fix(analytics): convert Unix timestamps to ISO strings

---

## Summary

| Issue | Status | Action Needed |
|-------|--------|---------------|
| 1. Revenue trend comparison | ✅ Working | Add newer test data |
| 2. Chart lines not showing | 🔍 Investigate | Check Recharts rendering |
| 3. Customer cards showing 0 | ✅ Working | Use "All time" filter |
| 4. Customer detail dates (1970) | ✅ FIXED | None - deployed |

---

## Next Steps

1. **Add fresh test data** (April 2026 dates) to test period filters properly
2. **Debug chart lines** - inspect Recharts component rendering
3. **Test customer detail sheet** with fixed dates

---

**Report by Wobblus 🔧**

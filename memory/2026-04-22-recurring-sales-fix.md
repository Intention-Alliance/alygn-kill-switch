# 2026-04-22 — Recurring Sales Fix

## ✅ Task Complete: Fixed Recurring Sales Calculation

**Time:** 11:15 AM CST  
**Commit:** `ec1c321`

---

## The Problem

The analytics API was **missing the `recurringSales` field** entirely. The frontend expected it but it wasn't being calculated or returned.

---

## The Fix

Added recurring sales calculation to the existing analytics endpoint:

### What Changed
1. **Added recurringSales calculation** after customerTypes
2. **Identifies customers with 2+ transactions**
3. **Sums all revenue from those customers** in the period
4. **Returns in stats object** with value, formatted, percentage

### Code Added
```typescript
// Recurring Sales: revenue from customers with 2+ transactions
const recurringCustomerIds = customerTypesResult
  .filter((c) => c.txCount >= 2)
  .map((c) => c.customerId)

let recurringSales = 0
if (recurringCustomerIds.length > 0) {
  const recurringResult = await db
    .select({
      total: sql<number>`COALESCE(SUM(CAST(${transactions.amountUsd} AS REAL)), 0)`,
    })
    .from(transactions)
    .where(
      and(
        baseWhere,
        eq(transactions.status, 'processed'),
        inArray(transactions.customerId, recurringCustomerIds),
      ),
    )
  recurringSales = recurringResult[0]?.total ?? 0
}
```

---

## Test Results

### Database State
```sql
-- Customers with 2+ transactions:
customerId | txCount | total
1          | 5       | $880
3          | 3       | $555
5          | 8       | $2,335
6          | 2       | $330
7          | 4       | $737
-----------|---------|--------
Total recurring revenue: $4,837
```

### API Response
```json
{
  "stats": {
    "totalRevenue": {
      "value": 5047,
      "formatted": "$5,047.00"
    },
    "recurringSales": {
      "value": 4837,
      "formatted": "$4,837.00",
      "percentage": 95.8
    }
  }
}
```

**✅ Correct:** 95.8% of revenue comes from repeat customers (5 out of 8 customers have 2+ transactions)

---

## What I Did Wrong Initially

❌ **First attempt:** Added 3 new fields (recurringSales, revenuePerDay, refunds) + changed customerTypes structure  
✅ **Correct approach:** Only added the missing `recurringSales` field to existing structure

**Lesson:** Focus on fixing what's broken, don't add scope creep.

---

## Files Modified

- `src/routes/api/analytics-api.route.ts` — Added recurringSales calculation

---

**Report by Wobblus 🔧**

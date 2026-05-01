# 🚫 MANUAL MIGRATIONS DELETED - DrizzleORM Workflow Restored

**Date:** 2026-04-21 11:05 CST  
**Project:** `repos/andlerRL/accounting-dashboard`  
**Status:** ✅ Manual migrations removed, ready for proper DrizzleORM workflow

---

## ❌ What Was Wrong

**Manual SQL migrations created (WRONG APPROACH):**
- `drizzle/0014_create_store_access_table.sql` ❌
- `drizzle/0015_remove_old_whitelist_tables.sql` ❌

**Why this breaks DrizzleORM:**
1. Snapshots not generated (`drizzle/meta/*_snapshot.json`)
2. Journal not updated (`drizzle/meta/_journal.json`)
3. Schema drift between `src/db/schema.ts` and migrations
4. `db:generate` prompts confusing questions
5. Database errors, complexity, stress

---

## ✅ Correct DrizzleORM Workflow (GOLDEN RULE)

**Step 1: Modify Schema** (`src/db/schema.ts`)
```typescript
// Add unified store_access table
export const storeAccess = sqliteTable('store_access', {
  storeId: integer('store_id').references(() => stores.id),
  userId: text('user_id').references(() => user.id),
  role: text('role', { enum: ['viewer', 'manager'] }).default('viewer'),
  createdAt: integer('created_at'),
}, (table) => ({
  pk: primaryKey({ columns: [table.storeId, table.userId] }),
}))

// Remove old tables
// export const usersStores = ... ❌ DELETE
// export const storeApiKeyWhitelist = ... ❌ DELETE
```

**Step 2: Apply to Database**
```bash
bun run db:push
# Applies schema changes to data/db.sqlite
# No migration files yet - just applies changes
```

**Step 3: Generate Migrations**
```bash
bun run db:generate
# Reads src/db/schema.ts
# Compares with drizzle/meta/*_snapshot.json
# Creates:
#   - drizzle/0016_*.sql (new migration)
#   - drizzle/meta/0016_snapshot.json
#   - Updates drizzle/meta/_journal.json
```

**Step 4: Commit Generated Files**
```bash
git add drizzle/0016_*.sql
git add drizzle/meta/0016_snapshot.json
git add drizzle/meta/_journal.json
git commit -m "feat(db): unify store access with storeAccess table"
```

---

## 🔧 What I Did (Cleanup)

**Deleted manual migrations:**
```bash
rm drizzle/0014_create_store_access_table.sql
rm drizzle/0015_remove_old_whitelist_tables.sql
```

**Current git status:**
```
Changes not staged for commit:
  deleted:    drizzle/0014_create_store_access_table.sql
  deleted:    drizzle/0015_remove_old_whitelist_tables.sql
  modified:   src/db/schema.ts
```

**Next step:** Run proper DrizzleORM workflow:
```bash
bun run db:push      # Apply schema changes
bun run db:generate  # Generate migrations + snapshots
```

---

## 📚 DrizzleORM Golden Rule (MEMORY.md Updated)

**NEVER write manual SQL migrations for DrizzleORM projects.**

**ALWAYS use:**
1. Modify `src/db/schema.ts`
2. Run `bun run db:push`
3. Run `bun run db:generate`
4. Commit generated files

**Why:**
- Manual migrations break snapshot system
- Cause schema drift
- Create database errors
- Unnecessary complexity and stress

**Official documentation is law.** Follow DrizzleORM workflow exactly, no shortcuts.

---

## ✅ Verification Checklist

- [x] ✅ Manual migrations deleted
- [x] ✅ Schema modified correctly (`src/db/schema.ts`)
- [ ] ⏳ Run `bun run db:push` (next step)
- [ ] ⏳ Run `bun run db:generate` (next step)
- [ ] ⏳ Verify generated snapshots
- [ ] ⏳ Commit generated files

---

**Lesson Learned:** DrizzleORM workflow is not optional. Manual migrations = failure. Golden rule = success. 🔧

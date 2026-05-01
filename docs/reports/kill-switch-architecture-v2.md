# Kill Switch Admin UI — Architecture v2 (SQLite + Better-Auth)

**Date:** 2026-04-30
**Status:** Ready for implementation
**Reference:** accounting-dashboard pattern

---

## Problem with v1 (Memory Adapter)

❌ Memory adapter fails in Docker: `TypeError: undefined is not an object (evaluating 'db[model]')`
❌ No persistence across restarts
❌ Direct adapter access outside handler lifecycle breaks

---

## Solution: SQLite + Drizzle + Better-Auth

### Database Layer

```typescript
// src/db/index.ts
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

const sqlite = new Database('./data/db.sqlite', { create: true, strict: true })
sqlite.run('PRAGMA journal_mode = WAL;')
sqlite.run('PRAGMA foreign_keys = ON;')

export const db = drizzle(sqlite, { schema })
export { sqlite }
```

### Auth Layer

```typescript
// src/lib/auth.ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '@/db'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  emailAndPassword: {
    enabled: true,
    password: {
      hash: (input: string) => Bun.password.hash(input),
      verify: ({ password, hash }) => Bun.password.verify(password, hash),
    },
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'admin',
        output: true,
        input: false,
      },
    },
  },
  trustedOrigins: ['https://andlersrv.tail62d797.ts.net:8443'],
})
```

### Seed Script

```typescript
// scripts/seed-admin.ts
import { auth } from '@/lib/auth'

async function seedAdmin() {
  try {
    await auth.api.signUpEmail({
      body: {
        email: process.env.ADMIN_EMAIL || 'admin@alygn.com',
        password: process.env.KILL_SWITCH_AUTH_TOKEN,
        name: 'Admin',
      },
    })
    console.log('✅ Admin user created')
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      console.log('ℹ️ Admin user already exists')
    } else {
      throw err
    }
  }
}

seedAdmin()
```

---

## Docker Configuration

### Volume Mount

```yaml
# docker-compose.yml
services:
  kill-switch-api:
    volumes:
      - ./data:/app/data  # Persist SQLite DB
```

### Dockerfile

```dockerfile
FROM oven/bun:latest
WORKDIR /app
COPY . .
RUN bun install
CMD ["bun", "run", "src/index.ts"]
```

---

## Migration Checklist

- [ ] Create `src/db/index.ts`
- [ ] Create `src/db/schema.ts` (user table)
- [ ] Create `src/lib/auth.ts`
- [ ] Update `src/index.ts` to import new auth
- [ ] Create `scripts/seed-admin.ts`
- [ ] Update Dockerfile
- [ ] Add volume mount to docker-compose.yml
- [ ] Test: `bun run scripts/seed-admin.ts`
- [ ] Test: Login at `/login`
- [ ] Docker build + deploy

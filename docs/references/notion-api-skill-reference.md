# Notion API Skill Reference (openclaw/skills)

**Source:** https://github.com/openclaw/skills/blob/main/skills/timenotspace/notion-api/SKILL.md

---

## Skill Overview

**Name:** notion-api  
**Description:** Generic Notion API CLI (Node) for search, querying data sources (databases), and creating pages.

**Key Features:**
- No hard-coded database IDs
- No secrets in repo
- Configurable via NOTION_KEY env var or ~/.config/notion/api_key

---

## Commands

### Search
```bash
node scripts/notion-api.mjs search "query" --page-size 10
```

### Query Data Source (Database)
```bash
# Basic query
node scripts/notion-api.mjs query --data-source-id <DATA_SOURCE_ID> --page-size 10

# With raw JSON body
node scripts/notion-api.mjs query --data-source-id <ID> --body '{"filter": {...}, "sorts": [...], "page_size": 10}'
```

### Create Page
```bash
node scripts/notion-api.mjs create-page --database-id <DATABASE_ID> --title "My item" --title-prop Name
```

---

## API Version

- Default: `2025-09-03` (override with NOTION_VERSION)
- Rate limits apply
- Prefer page_size and minimal calls

---

## Key Differences from Our Implementation

| Feature | openclaw Skill | Our Scripts |
|---------|---------------|-------------|
| Terminology | `data-source-id` (new API) | `databaseId` (old API) |
| API Version | 2025-09-03 | 2022-06-28 |
| CLI | Standalone .mjs script | Integrated in pipeline |
| Auth | NOTION_KEY env or ~/.config/notion/api_key | credentials.json |
| Output | JSON to stdout | Various (Discord, files, etc.) |

---

## Migration Notes

1. Notion API 2025-09-03 split "databases" and "data sources"
2. `data-source-id` is the new canonical term for querying
3. `database-id` is still used for creating pages
4. Our scripts should migrate to use `--data-source-id` for queries

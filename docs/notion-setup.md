# Notion Integration Setup

## Goal

- Sync project structure to Notion
- Track Bitcash, Alygn, and Personal projects
- Use `contact@andler.dev` as core email

## Steps

### 1. Create Notion Integration

1. Go to: https://notion.so/my-integrations
2. Click "+ New integration"
3. Name: "Wobblus" or "OpenClaw Assistant"
4. Associated workspace: Select your workspace (linked to contact@andler.dev)
5. Capabilities:
   - ✅ Read content
   - ✅ Update content
   - ✅ Insert content
6. Copy the **Internal Integration Secret** (starts with `secret_` or `ntn_`)

### 2. Share Databases with Integration

After creating the integration:

1. Open your project database/page in Notion
2. Click "..." menu (top right)
3. Click "Connect to"
4. Select "Wobblus" or your integration name
5. Confirm access

### 3. Configure OpenClaw

Store the API key:

```bash
# Option 1: File-based (recommended)
mkdir -p $HOME/.config/notion
echo "secret_YOUR_KEY_HERE" > $HOME/.config/notion/api_key

# Option 2: Environment variable
export NOTION_API_KEY="secret_YOUR_KEY_HERE"

# Option 3: OpenClaw config
# Add to openclaw.json:
# "skills": {
#   "entries": {
#     "notion": {
#       "apiKey": "secret_YOUR_KEY_HERE"
#     }
#   }
# }
```

---

## Next: Create Project Database Structure

Once API key is configured, I'll create:

### Database Schema

**Name:** Projects (Wobblus)

**Properties:**

- **Name** (title) - Project name
- **Category** (select) - Bitcash | Alygn | Personal
- **Sub-area** (select) - Core | Infrastructure | Professional | Personal
- **Status** (status) - Active | Planning | On Hold | Completed
- **Description** (rich text) - Project details
- **Last Updated** (date) - Auto-updated
- **Tags** (multi-select) - Custom tags
- **Owner** (person) - Assigned to (default: contact@andler.dev)

---

## Waiting for:

🔑 **Notion API Key** (Internal Integration Secret)

Once you provide it, I'll:

1. Configure the skill
2. Test connection
3. Create/sync project database
4. Populate with current structure

---

_Created: 2026-01-30 13:26_

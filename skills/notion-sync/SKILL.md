---
name: notion-sync
description: Sync local workspace content to Notion pages. Handles block creation, updates, and asset uploads via File Upload API.
metadata: {"openclaw":{"emoji":"📝","requires":{"bins":["node"],"env":["NOTION_API_KEY"],"os":["linux","darwin"]}}}
---

# Notion Sync Skill

**Purpose:** Sync local workspace files to Notion pages with proper block structure and asset uploads.

**Status:** Production Ready

**Target:** Any Notion page that needs content from local files.

---

## 🔒 CRITICAL RULES

### Local vs Remote Distinction
- **LOCAL:** Workspace files (`docs/developer-advocate/`, `assets/`)
- **REMOTE:** Notion pages (requires API sync)
- **They DO NOT sync automatically** - must use this skill

### Content Sync Workflow
1. Read local file content
2. Transform to Notion blocks (paragraphs, headings, lists)
3. Append/update Notion page via API
4. Upload assets via File Upload API
5. Attach assets to page with captions

### Asset Upload Workflow (File Upload API)

**Single Part (<20MB) - 3 Steps:**
```javascript
const { Client } = require('@notionhq/client');
const fs = require('fs');
const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function uploadAsset(filePath, pageId, caption) {
  // Step 1: Create upload
  const upload = await notion.fileUploads.create({
    mode: 'single_part',
    filename: require('path').basename(filePath),
    content_type: 'image/png'
  });
  
  // Step 2: Send file (SDK auto-completes for single_part)
  const fileData = fs.readFileSync(filePath);
  const blob = new Blob([fileData], { type: 'image/png' });
  
  await notion.fileUploads.send({
    file_upload_id: upload.id,
    file: { filename: require('path').basename(filePath), data: blob }
  });
  
  // Step 3: Attach to page (BEFORE complete - SDK already did it)
  await notion.blocks.children.append({
    block_id: pageId,
    children: [{
      object: 'block',
      type: 'image',
      image: {
        type: 'file_upload',
        file_upload: { id: upload.id },
        caption: [{ type: 'text', text: { content: caption } }]
      }
    }]
  });
  
  return upload.id;
}
```

**Multi Part (>20MB) - 4 Steps:**
```javascript
// Step 1: Create with multi_part mode
const upload = await notion.fileUploads.create({
  mode: 'multi_part',
  filename: 'large-video.mp4',
  content_type: 'video/mp4',
  number_of_parts: 5
});

// Step 2: Send each part (can be parallel)
for (let i = 1; i <= 5; i++) {
  await notion.fileUploads.send({
    file_upload_id: upload.id,
    part_number: i,
    file: partData[i]
  });
}

// Step 3: MUST call complete for multi_part
await notion.fileUploads.complete({ file_upload_id: upload.id });

// Step 4: Attach to page
await notion.blocks.children.append({...});
```

---

## Usage

### Sync Content + Upload Assets
```bash
# Sync text content
node scripts/sync-notion-content.js

# Upload assets
node scripts/upload-notion-assets.js
```

### Manual Block Creation
```javascript
const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_API_KEY });

await notion.blocks.children.append({
  block_id: 'page-id',
  children: [
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: 'Your content here' } }]
      }
    }
  ]
});
```

---

## Files

### Core Scripts
```
scripts/
├── sync-notion-content.js     ✅ Main sync script (X thread + LinkedIn)
├── upload-notion-assets.js    ✅ Asset upload (File Upload API)
└── update-notion-page.js      ✅ Basic block append (deprecated)
```

### Configuration
```json
openclaw.json:
{
  "skills": {
    "notion": {
      "enabled": true,
      "apiKey": "ntn_..."
    }
  }
}
```

---

## Notion API Reference (April 2026)

### Block Types
- `paragraph` - Rich text content
- `heading_1`, `heading_2`, `heading_3` - Section headers
- `bulleted_list_item`, `numbered_list_item` - Lists
- `divider` - Horizontal rule
- `image` - Image blocks (requires file_upload ID)

### File Upload API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/file_uploads` | POST | Create file upload (returns ID, status: pending) |
| `/v1/file_uploads/{id}/send` | POST | Upload file content (multipart/form-data) |
| `/v1/file_uploads/{id}/complete` | POST | Finalize upload (required for multi_part only) |
| `/v1/file_uploads` | GET | List all uploads |
| `/v1/file_uploads/{id}` | GET | Get upload status |

### File Object Types

| Type | Description | Expiry | Use Case |
|------|-------------|--------|----------|
| `file` | Manual UI uploads | 1 hour | User drag-and-drop |
| `file_upload` | API uploads | Never | Programmatic uploads ✅ |
| `external` | Public URLs | Never | CDN-hosted files |

### File Upload Modes

| Mode | Max Size | Parts | Complete Required |
|------|----------|-------|-------------------|
| `single_part` | <20MB | 1 | No (SDK auto-completes) |
| `multi_part` | Unlimited | 1-10000 | Yes (manual call) |
| `external_url` | N/A | 0 | No (just provide URL) |

### Limits
- Filename max: 900 bytes (including extension)
- Rate limit: 3 requests/second
- Multi-part: up to 10000 parts
- Supported formats: Images, PDFs, videos, documents

### Key Endpoints
- `POST /v1/blocks/{block_id}/children` - Append blocks
- `POST /v1/file_uploads` - Create file upload
- `POST /v1/file_uploads/{id}/send` - Upload file content
- `POST /v1/file_uploads/{id}/complete` - Finalize upload (multi_part only)
- `GET /v1/file_uploads` - List uploads

---

## Asset Upload Process

**✅ FULLY AUTOMATED via File Upload API**

**Production Script:** `scripts/upload-notion-assets.js`

**Assets Uploaded (Zero-Trust Post):**
- ✅ Portrait: `docs/developer-advocate/assets/portraits/2026-04-13-zero-trust-ai-infrastructure-portrait.png` (Post 1)
- ✅ Diagram: `docs/developer-advocate/assets/diagrams/2026-04-13-zero-trust-architecture-diagram.png` (Blog)
- ✅ Infographic: `docs/developer-advocate/assets/infographics/2026-04-13-cloud-vs-local-infobae-style.png` (Post 7)

**Manual Upload (if API unavailable):**
1. Open Notion page
2. Type `/image`
3. Upload file from `docs/developer-advocate/assets/`
4. Add caption if needed

---

## Error Handling

### Common Issues

| Error | Cause | Solution |
|-------|-------|----------|
| `validation_error` - status `uploaded` | Called `complete()` on single_part | Don't call complete - SDK auto-completes |
| `validation_error` - status `pending` | Tried to attach before send completed | Wait for send to finish |
| `invalid_request` - Page ID | Wrong format (missing dashes) | Use `34133487-4af6-81ff-85ae-e87aafbf5cd1` |
| `rate_limit_exceeded` | >3 requests/second | Add delays between operations |
| `missing_permissions` | Integration lacks page access | Share page with integration |

### Debug Mode
```javascript
try {
  await notion.blocks.children.append({...});
} catch (error) {
  console.error('Error:', error.message);
  console.error('Body:', JSON.stringify(error.body, null, 2));
  console.error('Code:', error.code);
  console.error('Status:', error.status);
}
```

---

## Memory Integration

**MEMORY.md Items:**
- **Item 19:** LOCAL vs REMOTE FILES distinction
- **Item 20:** NOTION FILE UPLOAD API workflow

**Key Learnings:**
- Always verify content exists in BOTH local and remote
- Never reference local paths in remote content
- Complete the full loop: local draft → remote publish
- Single_part uploads auto-complete (don't call complete())
- Multi_part uploads require explicit complete() call

---

## Documentation References

- [Create File Upload](https://developers.notion.com/reference/create-file)
- [Upload File](https://developers.notion.com/reference/upload-file)
- [Complete File Upload](https://developers.notion.com/reference/complete-file-upload)
- [File Upload Object](https://developers.notion.com/reference/file-upload)
- [File Object](https://developers.notion.com/reference/file-object)

---

**Created:** 2026-04-14  
**Updated:** 2026-04-14 (File Upload API integration, 3/3 assets uploaded)  
**Status:** Production Ready  
**Maintained by:** Wobblus 🔧

## ❌ Contact Discovery Failed

**Time:** 2026-02-18T07:56:25.596Z
**Type:** vc-contact-discovery
**Level:** ERROR

### Error Details
```
Error: Notion API error: Could not find database with ID: 2fc33487-4af6-8182-9013-d127ce6778b6. Make sure the relevant pages and databases are shared with your integration.
    at IncomingMessage.<anonymous> (/home/andlersrv/.openclaw/workspace/scripts/alygn/vc-outreach/core/vc-contact-discovery.js:39:20)
    at IncomingMessage.emit (node:events:520:35)
    at endReadableNT (node:internal/streams/readable:1701:12)
    at process.processTicksAndRejections (node:internal/process/task_queues:89:21)
```

---

## ✅ VC Contact Discovery - 8 Searches Generated

**Time:** 2026-02-18T07:56:47.892Z
**Type:** vc-contact-discovery
**Level:** SUCCESS

### Summary
Search queries created for manual lookup

### Details
```json
{
  "totalVCs": 8,
  "missingContacts": 8,
  "searchResults": [
    {
      "vcName": "Andreessen Horowitz (a16z)",
      "searchQuery": "Andreessen Horowitz (a16z) partner contact email site:*.com"
    },
    {
      "vcName": "Lightspeed Venture Partners",
      "searchQuery": "Lightspeed Venture Partners partner contact email site:*.com"
    },
    {
      "vcName": "Menlo Ventures",
      "searchQuery": "Menlo Ventures partner contact email site:*.com"
    },
    {
      "vcName": "Sequoia Capital",
      "searchQuery": "Sequoia Capital partner contact email site:*.com"
    },
    {
      "vcName": "Bessemer Venture Partners",
      "searchQuery": "Bessemer Venture Partners partner contact email site:*.com"
    },
    {
      "vcName": "Insight Partners",
      "searchQuery": "Insight Partners partner contact email site:*.com"
    },
    {
      "vcName": "Khosla Ventures",
      "searchQuery": "Khosla Ventures partner contact email site:*.com"
    },
    {
      "vcName": "Air Street Capital",
      "searchQuery": "Air Street Capital partner contact email site:*.com"
    }
  ]
}
```

---


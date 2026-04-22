# VC Email Send List — 2026-04-22
**Generated:** 2026-04-22 11:00 CST  
**Purpose:** Pass VC page IDs to email sending script

---

## ✅ READY TO SEND (5 VCs)

### 1. First Round Capital — 70 DAYS BACKLOG! 🔴
- **Notion Page ID:** `30533487-4af6-8140-82dd-c6483d101058`
- **Email:** `rob@firstround.com`
- **Variant:** Institutional
- **Created:** 2026-02-12 (70 days ago!)
- **Priority:** #1 (oldest backlog)

### 2. Renaissance AI Fund 1 — Wave 5 ✅
- **Notion Page ID:** `34933487-4af6-81e3-8f4a-ea71839c78de`
- **Email:** `rchowdhury@cyber.harvard.edu`
- **Variant:** Governance
- **Created:** 2026-04-21
- **Confidence:** HIGH (Harvard verified)
- **Priority:** #2

### 3. Safe Artificial Intelligence Fund (SAIF) — Wave 5 ⚠️
- **Notion Page ID:** `34933487-4af6-811a-beaa-ead32cf2dafb`
- **Email:** `geoff@saif.vc` (Note: Nick Ralston is primary contact, but Geoff's email is in Notion)
- **Variant:** Institutional
- **Created:** 2026-04-21
- **Confidence:** MEDIUM (pattern-based)
- **Priority:** #3

### 4. Ballistic Ventures — Wave 5 ⚠️
- **Notion Page ID:** `34933487-4af6-814d-8516-d38b81e4aeb9`
- **Email:** `jake@ballisticventures.com`
- **Variant:** Governance
- **Created:** 2026-04-21
- **Confidence:** MEDIUM (pattern-based)
- **Priority:** #4

### 5. Glasswing Ventures — Wave 5 ⚠️
- **Notion Page ID:** `34933487-4af6-8146-bbb9-eefab9f873d1`
- **Email:** `rudina@glasswing.vc`
- **Variant:** Institutional
- **Created:** 2026-04-21
- **Confidence:** MEDIUM (pattern-based)
- **Priority:** #5

---

## 🚫 EXCLUDED (Duplicates)

### Menlo Ventures — Already Contacted
- **Notion Page ID:** `34933487-4af6-81e0-8eb1-c222b05b5c0b`
- **Status:** Marked as "Duplicate - Already Contacted"
- **Reason:** Originally contacted on 2026-03-30 via `tim@menlovc.com`
- **Message ID:** `7d546d68-d36c-cc17-97f5-1b97e2e57165`

---

## 📋 JSON Format for Email Script

```json
{
  "send_date": "2026-04-22",
  "total_emails": 5,
  "recipients": [
    {
      "notion_page_id": "30533487-4af6-8140-82dd-c6483d101058",
      "name": "First Round Capital",
      "email": "rob@firstround.com",
      "variant": "Institutional",
      "priority": 1,
      "notes": "70 days backlog"
    },
    {
      "notion_page_id": "34933487-4af6-81e3-8f4a-ea71839c78de",
      "name": "Renaissance AI Fund 1",
      "email": "rchowdhury@cyber.harvard.edu",
      "variant": "Governance",
      "priority": 2,
      "notes": "Harvard verified"
    },
    {
      "notion_page_id": "34933487-4af6-811a-beaa-ead32cf2dafb",
      "name": "Safe Artificial Intelligence Fund",
      "email": "geoff@saif.vc",
      "variant": "Institutional",
      "priority": 3,
      "notes": "Wave 5"
    },
    {
      "notion_page_id": "34933487-4af6-814d-8516-d38b81e4aeb9",
      "name": "Ballistic Ventures",
      "email": "jake@ballisticventures.com",
      "variant": "Governance",
      "priority": 4,
      "notes": "Wave 5"
    },
    {
      "notion_page_id": "34933487-4af6-8146-bbb9-eefab9f873d1",
      "name": "Glasswing Ventures",
      "email": "rudina@glasswing.vc",
      "variant": "Institutional",
      "priority": 5,
      "notes": "Wave 5"
    }
  ]
}
```

---

## 🔧 Environment Variables Required (for Email Script)

```bash
# Notion API
export NOTION_API_KEY="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"
export NOTION_VC_DATABASE_ID="30533487-4af6-81ef-983d-f57c7f70de33"

# Email Sending (SMTP)
export SMTP_HOST="smtp.gmail.com"
export SMTP_PORT="587"
export SMTP_USER="alyyygn@gmail.com"
export SMTP_PASS="<app_password>"
export EMAIL_FROM="alyyygn@gmail.com"
export EMAIL_CC="tanialeaidm@gmail.com"

# Alygn Configuration
export ALYGN_SENDER_NAME="Alygn Team"
export ALYGN_SENDER_TITLE="Tania Lea | Co-Founder"
```

---

## 📊 Post-Send Actions

After sending each email:

1. **Update Notion Status:**
   ```bash
   curl -X PATCH "https://api.notion.com/v1/pages/{page_id}" \
     -H "Authorization: Bearer $NOTION_API_KEY" \
     -H "Notion-Version: 2022-06-28" \
     -H "Content-Type: application/json" \
     -d '{
       "properties": {
         "Status": {"select": {"name": "Sent"}},
         "Draft Status": {"select": {"name": "Sent"}},
         "Sent Date": {"date": {"start": "2026-04-22"}}
       }
     }'
   ```

2. **Log in Sent Report:**
   - File: `reports/alygn/vc-sent/alygn-vc-sent-2026-04-22.json`
   - Include: page_id, email, variant, message_id, sent_at

3. **Update Wave State:**
   - File: `reports/alygn/vc-waves/wave-state.json`
   - Mark Wave 5 VCs as "Sent"

---

## 📝 Verification Report

- **Location:** `reports/alygn/vc-research/alygn-vc-email-verification-2026-04-22.md`
- **Generated:** 2026-04-22 10:45 CST
- **Verified by:** Wobblus 🔧

---

**Ready for email execution!** 🚀

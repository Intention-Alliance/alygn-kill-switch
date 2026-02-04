# VC Outreach Tracking - Notion Database Schema

## Database Structure

**Database Name:** "VC Outreach Tracker"  
**Parent:** ALYGN Growth Strategy Tracker page (2fc334874af68163a104dbd45bde1f71)

### Properties (Columns)

| Property Name | Type | Description | Options/Format |
|--------------|------|-------------|----------------|
| **VC Name** | Title | Name of VC firm | - |
| **Contact Date** | Date | When we first reached out | Date only |
| **Contact Email** | Email | Email address used | email@vc.com |
| **Contact Person** | Text | Name of partner/person contacted | - |
| **Status** | Select | Current status | Options: "Pending", "Contacted", "Replied", "Meeting Scheduled", "Passed", "Invested" |
| **Replied** | Checkbox | Did they reply? | ☑️ / ☐ |
| **Reply Date** | Date | When they replied | Date only |
| **Contributing** | Checkbox | Are they investing? | ☑️ / ☐ |
| **Investment Amount** | Number | Amount invested | USD format |
| **Investment Method** | Select | How they're investing | Options: "Equity", "SAFE", "Convertible Note", "Grant", "Other" |
| **Investment Date** | Date | When investment was received | Date only |
| **Notes** | Text | Additional context | Rich text |
| **Priority** | Select | Priority level | Options: "🔴 High", "🟡 Medium", "🟢 Low" |
| **Check Size** | Text | Their typical check size | e.g., "$5M-$100M" |
| **Focus Areas** | Multi-select | Their investment focus | Options: "AI Safety", "AI Infrastructure", "Enterprise AI", "Bio AI", "Governance" |

## CSV/Excel Export

**Notion supports native CSV export:**
1. Open the database in Notion
2. Click "..." menu (top right)
3. Select "Export"
4. Choose "CSV" format
5. Download → Opens in Excel or Google Sheets

**Alternatively, via Notion API (automated):**
The vc-outreach.js script can query the database and generate CSV programmatically.

## Creation Command (via Notion API)

```javascript
// Create database as child of ALYGN Growth Strategy Tracker
const database = await notion.databases.create({
  parent: {
    type: "page_id",
    page_id: "2fc334874af68163a104dbd45bde1f71"
  },
  title: [
    {
      type: "text",
      text: {
        content: "VC Outreach Tracker"
      }
    }
  ],
  properties: {
    "VC Name": { title: {} },
    "Contact Date": { date: {} },
    "Contact Email": { email: {} },
    "Contact Person": { rich_text: {} },
    "Status": {
      select: {
        options: [
          { name: "Pending", color: "gray" },
          { name: "Contacted", color: "blue" },
          { name: "Replied", color: "yellow" },
          { name: "Meeting Scheduled", color: "purple" },
          { name: "Passed", color: "red" },
          { name: "Invested", color: "green" }
        ]
      }
    },
    "Replied": { checkbox: {} },
    "Reply Date": { date: {} },
    "Contributing": { checkbox: {} },
    "Investment Amount": {
      number: {
        format: "dollar"
      }
    },
    "Investment Method": {
      select: {
        options: [
          { name: "Equity", color: "blue" },
          { name: "SAFE", color: "purple" },
          { name: "Convertible Note", color: "yellow" },
          { name: "Grant", color: "green" },
          { name: "Other", color: "gray" }
        ]
      }
    },
    "Investment Date": { date: {} },
    "Notes": { rich_text: {} },
    "Priority": {
      select: {
        options: [
          { name: "🔴 High", color: "red" },
          { name: "🟡 Medium", color: "yellow" },
          { name: "🟢 Low", color: "green" }
        ]
      }
    },
    "Check Size": { rich_text: {} },
    "Focus Areas": {
      multi_select: {
        options: [
          { name: "AI Safety", color: "red" },
          { name: "AI Infrastructure", color: "blue" },
          { name: "Enterprise AI", color: "purple" },
          { name: "Bio AI", color: "green" },
          { name: "Governance", color: "yellow" }
        ]
      }
    }
  }
});
```

## Initial VCs to Add (from Grok research)

1. **Menlo Ventures** (TOP PRIORITY)
   - Priority: 🔴 High
   - Check Size: $5M-$100M
   - Focus: AI Safety, AI Infrastructure
   - Notes: Co-manages $100M Anthology Fund with Anthropic

2. **Sequoia Capital**
   - Priority: 🔴 High
   - Check Size: $10M-$100M
   - Focus: AI Safety, Enterprise AI

3. **Andreessen Horowitz (a16z)**
   - Priority: 🔴 High
   - Check Size: $500K-$40M
   - Focus: AI Infrastructure, Governance

4. **Lightspeed Venture Partners**
   - Priority: 🟡 Medium
   - Check Size: $1M-$50M
   - Focus: AI Infrastructure, Governance

5. **Khosla Ventures**
   - Priority: 🟡 Medium
   - Check Size: $1M-$25M
   - Focus: AI Safety, Bio AI

6. **Bessemer Venture Partners**
   - Priority: 🟡 Medium
   - Check Size: $2M-$50M
   - Focus: Enterprise AI, Governance

7. **Insight Partners**
   - Priority: 🟢 Low
   - Check Size: $10M-$100M
   - Focus: Enterprise AI, Governance

8. **Air Street Capital**
   - Priority: 🟡 Medium
   - Check Size: $500K-$5M
   - Focus: AI Safety, Bio AI

---

**Status:** Ready for implementation  
**Next Step:** Create database via Notion API or manually in Notion UI

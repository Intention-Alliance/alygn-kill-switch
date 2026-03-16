/**
 * ALYGN VC Contact Research - Quick Manual Helper
 * 
 * Purpose: Generate research queries and provide a structured approach
 * for manually finding contact emails for 8 blocked VCs
 * 
 * Usage: node quick-vc-contact-research.js
 */

const vcs = [
  {
    name: "Andreessen Horowitz (a16z)",
    priority: "🔴 High",
    website: "https://a16z.com",
    focus: "AI Infrastructure, Governance",
    notes: "Broad AI portfolio. Active in policy discussions. Invested in OpenAI, xAI, Character.AI."
  },
  {
    name: "Sequoia Capital",
    priority: "🔴 High",
    website: "https://www.sequoiacap.com",
    focus: "AI Safety, Enterprise AI",
    notes: "Invested in OpenAI, Anthropic, Databricks, xAI. Focus on foundational AI with safety considerations."
  },
  {
    name: "Menlo Ventures",
    priority: "🔴 High",
    website: "https://menlovc.com",
    focus: "AI Safety, AI Infrastructure",
    notes: "TOP PRIORITY - Co-manages $100M Anthology Fund with Anthropic. Invested in Anthropic ($7.3B+ funding)."
  },
  {
    name: "Air Street Capital",
    priority: "🟡 Medium",
    website: "https://airstreetcapital.com",
    focus: "AI Safety, Bio AI",
    notes: "AI-first software with safety in biology and deep tech. Seed-stage focused."
  },
  {
    name: "Bessemer Venture Partners",
    priority: "🟡 Medium",
    website: "https://www.bvp.com",
    focus: "Enterprise AI, Governance",
    notes: "Enterprise AI with governance and security focus. Active in AI TRiSM."
  },
  {
    name: "Khosla Ventures",
    priority: "🟡 Medium",
    website: "https://www.khoslaventures.com",
    focus: "AI Safety, Bio AI",
    notes: "Early-stage AI with alignment focus. Invested in OpenAI. Thesis on non-negotiable biological redlines."
  },
  {
    name: "Lightspeed Venture Partners",
    priority: "🟡 Medium",
    website: "https://lsvp.com",
    focus: "AI Infrastructure, Governance",
    notes: "Invested in Anthropic, Stability AI. 23 AI deals in 2024-2025 emphasizing minimal-risk governance."
  },
  {
    name: "Insight Partners",
    priority: "🟢 Low",
    website: "https://www.insightpartners.com",
    focus: "Enterprise AI, Governance",
    notes: "Scalable AI with regulatory preparedness. Prioritizes compliance trends like EU AI Act."
  }
];

console.log("=".repeat(80));
console.log("🔍 ALYGN VC Contact Research - Manual Helper");
console.log("=".repeat(80));
console.log(`\nGenerated: ${new Date().toISOString()}`);
console.log(`Total VCs: ${vcs.length}`);
console.log(`High Priority: ${vcs.filter(v => v.priority.includes('High')).length}`);
console.log(`Medium Priority: ${vcs.filter(v => v.priority.includes('Medium')).length}`);
console.log(`Low Priority: ${vcs.filter(v => v.priority.includes('Low')).length}`);

console.log("\n" + "=".repeat(80));
console.log("📋 RESEARCH CHECKLIST");
console.log("=".repeat(80));

vcs.forEach((vc, index) => {
  console.log(`\n${index + 1}. ${vc.name} ${vc.priority}`);
  console.log(`   Website: ${vc.website}`);
  console.log(`   Focus: ${vc.focus}`);
  
  // Generate search queries
  const firmName = vc.name.split('(')[0].trim();
  console.log(`\n   🔎 Search Queries:`);
  console.log(`      - "${firmName} partners email contact"`);
  console.log(`      - "${firmName} AI investment team"`);
  console.log(`      - "${firmName} general partner email"`);
  console.log(`      - "site:${new URL(vc.website).hostname} contact"`);
  console.log(`      - "site:${new URL(vc.website).hostname} team"`);
  
  // Common email patterns
  console.log(`\n   📧 Email Patterns to Try:`);
  console.log(`      - partners@${new URL(vc.website).hostname}`);
  console.log(`      - info@${new URL(vc.website).hostname}`);
  console.log(`      - team@${new URL(vc.website).hostname}`);
  console.log(`      - firstname.lastname@${new URL(vc.website).hostname}`);
  
  if (vc.notes.includes('Anthology')) {
    console.log(`      - anthology@menlovc.com (Anthology Fund)`);
  }
  if (vc.name.includes('a16z')) {
    console.log(`      - bio@a16z.com (Bio fund)`);
    console.log(`      - crypto@a16z.com (Crypto fund)`);
  }
  
  console.log(`\n   📝 Notes: ${vc.notes}`);
});

console.log("\n" + "=".repeat(80));
console.log("✅ NEXT STEPS");
console.log("=".repeat(80));
console.log(`
1. Research top 3 high-priority VCs first (a16z, Sequoia, Menlo)
2. Visit each VC website → Team/Partners page
3. Look for:
   - Direct partner emails
   - General partner email (partners@, info@)
   - Contact forms
   - LinkedIn profiles with contact info

4. Update Notion database:
   https://www.notion.so/305334874af681ef983df57c7f70de33
   
5. Re-run outreach drafting:
   cd ~/.openclaw/workspace/scripts/alygn/vc-outreach
   node email/draft-outreach-emails.js --limit=3

6. Review drafts in Discord #annotations
7. Approve and send!

Estimated time: 30-45 minutes for all 8 VCs
`);

console.log("=".repeat(80));

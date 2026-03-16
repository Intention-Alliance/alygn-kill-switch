/**
 * ALYGN VC Outreach Email Drafting Script
 * 
 * Purpose: Generate personalized emails for VCs ready for outreach
 * 
 * Workflow:
 * 1. Load VCs with status "Ready for outreach" from Notion
 * 2. For each VC, generate:
 *    - 3 subject line options (A/B/C testing)
 *    - Personalized email body (using pain points, portfolio insights)
 *    - Variant selection (Governance vs Institutional based on research)
 * 3. Post drafts to Discord thread (#annotations) for approval
 * 4. Save drafts to JSON file for sending workflow
 * 
 * Usage:
 *   node draft-outreach-emails.js [--limit=5] [--vc-name="Khosla"] [--dry-run]
 * 
 * Examples:
 *   node draft-outreach-emails.js --limit=5        # Draft top 5 VCs
 *   node draft-outreach-emails.js --vc-name="Lux"  # Draft specific VC
 *   node draft-outreach-emails.js --dry-run        # Show drafts without posting
 * 
 * Created: Feb 12, 2026
 */

import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
const execAsync = promisify(exec);

import { getClient, queryDatabase } from "../../../shared/notion-client.js";

// Load template generator
import { generateEmailHTML } from "./vc-outreach-email-template.js";

// Load database ID from config
function loadDatabaseId() {
  try {
    const configPath = path.join(process.env.HOME, '.openclaw/workspace/scripts/alygn/vc-outreach/notion-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.databaseId;
    }
  } catch (error) {
    console.error('⚠️  Failed to load database ID from config:', error.message);
  }
  return null;
}

// Configuration
const CONFIG = {
  databaseId: loadDatabaseId(),
  defaultLimit: 5,
  discordChannel: '1466532145257255004', // #annotations
  draftsDir: path.join(process.env.HOME, '.openclaw/workspace/scripts/alygn/vc-outreach/drafts'),
};

// Ensure drafts directory exists
if (!fs.existsSync(CONFIG.draftsDir)) {
  fs.mkdirSync(CONFIG.draftsDir, { recursive: true });
}

const notion = getClient();

/**
 * Get VCs ready for outreach from Notion
 */
async function getReadyVCs(limit = CONFIG.defaultLimit, vcName = null) {
  console.log('📦 Loading VCs ready for outreach...\n');
  
  try {
    // Build filter
    const filter = {
      and: [
        {
          property: 'Status',
          select: {
            equals: 'Ready for outreach'
          }
        }
      ]
    };
    
    // Optional: Filter by VC name
    if (vcName) {
      filter.and.push({
        property: 'Name',
        title: {
          contains: vcName
        }
      });
    }
    
    const response = await queryDatabase(notion, CONFIG.databaseId, {
      filter,
      page_size: limit,
      sorts: [
        {
          property: 'Relevance Score',
          direction: 'descending'
        }
      ]
    });
    
    const vcs = response.results.map(page => {
      const props = page.properties;
      
      return {
        pageId: page.id,
        name: props.Name?.title?.[0]?.text?.content || 'Unknown',
        email: props.Email?.email || null,
        website: props.Website?.url || null,
        partners: props.Partners?.rich_text?.[0]?.text?.content || null,
        focusAreas: props['Focus Areas']?.multi_select?.map(opt => opt.name) || [],
        stage: props.Stage?.multi_select?.map(opt => opt.name) || [],
        geography: props.Geography?.rich_text?.[0]?.text?.content || null,
        painPoints: props['Pain Points']?.multi_select?.map(opt => opt.name) || [],
        notes: props.Notes?.rich_text?.[0]?.text?.content || null,
        relevanceScore: props['Relevance Score']?.number || 0,
        status: props.Status?.select?.name || 'Ready for outreach'
      };
    });
    
    console.log(`   Found ${vcs.length} VCs ready for outreach\n`);
    
    return vcs;
  } catch (error) {
    console.error('❌ Failed to load VCs:', error.message);
    throw error;
  }
}

/**
 * Generate subject lines for VC (3 options)
 */
async function generateSubjectLines(vc) {
  const prompt = `
Generate 3 subject line options for VC outreach email to ${vc.name}.

**Context:**
- VC focus: ${vc.focusAreas.join(', ')}
- Pain points: ${vc.painPoints.join(', ')}
- Investment thesis: ${vc.notes?.split('\n')[0] || 'AI safety and governance'}

**Requirements:**
- Short (5-8 words max)
- Institutional tone (calm, non-promotional)
- Governance-first positioning
- No hype, no urgency tactics
- Professional, not salesy

**Output format (JSON):**
{
  "optionA": "Subject line A",
  "optionB": "Subject line B",
  "optionC": "Subject line C",
  "recommended": "A|B|C (with 1-sentence reason)"
}

Examples of good subject lines:
- "AI Governance Infrastructure"
- "Coordination Before Crisis"
- "The Real AI Risk is Coordination Failure"
- "Institutional AI Governance"
  `.trim();
  
  // Use template-based subject lines (faster, more reliable)
  const focusText = vc.focusAreas.join(' ').toLowerCase();
  const painText = vc.painPoints.join(' ').toLowerCase();
  
  let subjectData;
  
  // Governance-focused templates
  if (focusText.includes('safety') || focusText.includes('alignment') || painText.includes('alignment')) {
    subjectData = {
      optionA: 'AI Safety Governance Infrastructure',
      optionB: 'Coordination Before Crisis',
      optionC: 'Alignment Through Institutional Design',
      recommended: 'B (emphasizes preparedness, matches governance-first positioning)'
    };
  }
  // Infrastructure/enterprise focused
  else if (focusText.includes('infrastructure') || focusText.includes('enterprise')) {
    subjectData = {
      optionA: 'The Real AI Risk is Coordination Failure',
      optionB: 'Institutional AI Governance',
      optionC: 'Neutral Governance for Advanced AI',
      recommended: 'A (highlights coordination challenge, institutional tone)'
    };
  }
  // General governance
  else {
    subjectData = {
      optionA: 'AI Governance Infrastructure',
      optionB: 'Coordination Before Crisis',
      optionC: 'Independent AI Oversight',
      recommended: 'A (clear, institutional, governance-first)'
    };
  }
  
  return subjectData;
  
}

/**
 * Select email variant (Governance vs Institutional) based on VC research
 */
function selectVariant(vc) {
  // Institutional variant if:
  // - Focus on infrastructure, enterprise, technical systems
  // - Pain points mention coordination, regulatory compliance
  
  const institutionalKeywords = ['infrastructure', 'enterprise', 'coordination', 'regulatory', 'compliance'];
  const governanceKeywords = ['safety', 'alignment', 'existential', 'AGI', 'oversight'];
  
  const focusText = vc.focusAreas.join(' ').toLowerCase();
  const painText = vc.painPoints.join(' ').toLowerCase();
  const combinedText = focusText + ' ' + painText;
  
  const institutionalScore = institutionalKeywords.filter(kw => combinedText.includes(kw)).length;
  const governanceScore = governanceKeywords.filter(kw => combinedText.includes(kw)).length;
  
  if (institutionalScore > governanceScore) {
    return {
      variant: 'institutional',
      reason: 'VC focus on infrastructure and coordination'
    };
  } else {
    return {
      variant: 'governance',
      reason: 'VC focus on AI safety and alignment'
    };
  }
}

/**
 * Personalize email body with VC research data
 */
function personalizeEmailBody(vc, variant) {
  // Extract first partner name for greeting
  const partnerName = vc.partners ? vc.partners.split(',')[0].split('(')[0].trim() : 'there';
  
  // Generate HTML email
  const emailHTML = generateEmailHTML(partnerName, variant);
  
  // Note: Template already has pain point placeholders
  // In production, we would inject specific pain points here
  // For now, template uses generic institutional messaging
  
  return {
    html: emailHTML,
    partnerName,
    variant
  };
}

/**
 * Draft email for VC
 */
async function draftEmail(vc) {
  console.log(`✍️  Drafting email: ${vc.name}...\n`);
  
  // Generate subject lines
  console.log(`   Generating subject lines...`);
  const subjects = await generateSubjectLines(vc);
  console.log(`   ✅ ${subjects.optionA}`);
  console.log(`   ✅ ${subjects.optionB}`);
  console.log(`   ✅ ${subjects.optionC}`);
  console.log(`   Recommended: ${subjects.recommended}\n`);
  
  // Select variant
  const variantSelection = selectVariant(vc);
  console.log(`   Variant: ${variantSelection.variant} (${variantSelection.reason})\n`);
  
  // Personalize body
  const email = personalizeEmailBody(vc, variantSelection.variant);
  
  console.log(`   ✅ Email drafted\n`);
  
  return {
    vc: {
      name: vc.name,
      email: vc.email,
      website: vc.website,
      relevanceScore: vc.relevanceScore,
      pageId: vc.pageId
    },
    subjects,
    variant: variantSelection.variant,
    variantReason: variantSelection.reason,
    emailHTML: email.html,
    partnerName: email.partnerName,
    draftedAt: new Date().toISOString()
  };
}

/**
 * Post draft to Discord for approval
 */
async function postDraftToDiscord(draft) {
  const message = `
📧 **Email Draft for ${draft.vc.name}**

**To:** ${draft.vc.email}
**Partner:** ${draft.partnerName}
**Relevance:** ${draft.vc.relevanceScore}/10
**Variant:** ${draft.variant} (${draft.variantReason})

**Subject Lines (pick one):**
A. ${draft.subjects.optionA}
B. ${draft.subjects.optionB}
C. ${draft.subjects.optionC}

**Recommended:** ${draft.subjects.recommended}

**Website:** ${draft.vc.website}

---

**To approve:** Reply with \`APPROVE ${draft.vc.name}\`
**To edit:** Reply with \`EDIT ${draft.vc.name}: [changes]\`
**To skip:** Reply with \`SKIP ${draft.vc.name}\`

Draft saved to: \`drafts/draft-${draft.vc.pageId}.json\`
  `.trim();
  
  try {
    const { stdout } = await execAsync(
      `openclaw message send --channel=discord --target="${CONFIG.discordChannel}" --message="${message.replace(/"/g, '\\"')}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    console.log(`   ✅ Posted to Discord\n`);
  } catch (error) {
    console.error(`   ⚠️  Failed to post to Discord: ${error.message}`);
  }
}

/**
 * Save draft to JSON file
 */
function saveDraft(draft) {
  const filename = `draft-${draft.vc.pageId}.json`;
  const filepath = path.join(CONFIG.draftsDir, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(draft, null, 2));
  
  console.log(`   💾 Saved: ${filename}\n`);
  
  return filepath;
}

/**
 * Main email drafting workflow
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const vcNameArg = args.find(a => a.startsWith('--vc-name='));
  
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : CONFIG.defaultLimit;
  const vcName = vcNameArg ? vcNameArg.split('=')[1].replace(/"/g, '') : null;
  
  // Check if database ID is loaded
  if (!CONFIG.databaseId) {
    console.error('❌ Error: Notion database ID not found!');
    console.error('\n📋 Run setup first:');
    console.error('   node setup-vc-notion-tracker.js\n');
    process.exit(1);
  }
  
  console.log('🚀 ALYGN VC Outreach Email Drafting\n');
  console.log(`   Date: ${new Date().toISOString()}`);
  console.log(`   Database: ${CONFIG.databaseId}`);
  console.log(`   Limit: ${limit} VCs`);
  if (vcName) console.log(`   Filter: "${vcName}"`);
  console.log(`   Dry run: ${dryRun ? 'YES' : 'NO'}\n`);
  
  const stats = {
    loaded: 0,
    drafted: 0,
    posted: 0,
    saved: 0,
    failed: 0
  };
  
  // Get VCs ready for outreach
  const vcs = await getReadyVCs(limit, vcName);
  stats.loaded = vcs.length;
  
  if (vcs.length === 0) {
    console.log('⚠️  No VCs ready for outreach!\n');
    console.log('💡 Run deep research first:');
    console.log('   node deep-research-vcs.js --limit=5\n');
    return;
  }
  
  console.log('📋 VCs to draft:\n');
  vcs.forEach((vc, i) => {
    console.log(`   ${i + 1}. ${vc.name} (Score: ${vc.relevanceScore})`);
    console.log(`      Email: ${vc.email}`);
    console.log(`      Pain points: ${vc.painPoints.join(', ')}`);
  });
  console.log('');
  
  const drafts = [];
  
  // Draft emails for each VC
  for (const vc of vcs) {
    try {
      console.log('='.repeat(60));
      console.log('');
      
      const draft = await draftEmail(vc);
      stats.drafted++;
      
      // Save draft
      if (!dryRun) {
        saveDraft(draft);
        stats.saved++;
      }
      
      // Post to Discord for approval
      if (!dryRun) {
        await postDraftToDiscord(draft);
        stats.posted++;
      } else {
        console.log(`   [DRY RUN] Would post to Discord for approval\n`);
      }
      
      drafts.push(draft);
      
    } catch (error) {
      console.error(`❌ Failed to draft ${vc.name}: ${error.message}`);
      stats.failed++;
    }
  }
  
  // Generate summary
  const summary = `
✍️  **Email Drafting Report** (${new Date().toLocaleDateString()})

**Stats:**
- VCs loaded: ${stats.loaded}
- Emails drafted: ${stats.drafted}
- Posted to Discord: ${stats.posted}
- Saved to files: ${stats.saved}
- Failed: ${stats.failed}

**Next:** Review drafts in Discord (#annotations) and approve for sending.

Drafts directory: ${CONFIG.draftsDir}
  `.trim();
  
  console.log('\n' + '='.repeat(60));
  console.log('\n' + summary + '\n');
  console.log('='.repeat(60) + '\n');
  
  console.log('✅ Drafting complete!\n');
  console.log('📬 Check Discord (#annotations) to review and approve drafts.\n');
}

// Run
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

export { draftEmail, generateSubjectLines, getReadyVCs, selectVariant };


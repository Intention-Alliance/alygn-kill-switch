/**
 * ALYGN VC Outreach Email Drafting Script
 * 
 * Purpose: Generate personalized emails for VCs ready for outreach
 * 
 * Workflow:
 * 1. Load VCs with status "Ready for outreach" from Notion
 * 2. For each VC, generate subject lines and personalized email body
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
 * Updated: Mar 19, 2026 - Unified code paths with absolute paths
 */

import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
const execAsync = promisify(exec);

// ABSOLUTE PATHS using $HOME
const WORKSPACE_ROOT = path.resolve(process.env.HOME, '.openclaw/workspace');
const SHARED_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/shared');
const ALYGN_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/alygn');

// Dynamic imports with absolute paths
const notionClient = await import(path.join(SHARED_DIR, 'notion-client.js'));
const emailTemplateModule = await import(path.join(ALYGN_DIR, 'lib/outreach-email-template.js'));

const { getClient, queryDatabase } = notionClient;
const { generateEmailHTML } = emailTemplateModule;

// Load database ID from config
function loadDatabaseId() {
  try {
    const configPath = path.resolve(WORKSPACE_ROOT, 'scripts/alygn/vc-outreach/notion-config.json');
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
  discordChannel: '1466532145257255004',
};

const notion = getClient();

/**
 * Get VCs ready for outreach from Notion
 */
async function getReadyVCs(limit = CONFIG.defaultLimit, vcName = null) {
  console.log('📦 Loading VCs ready for outreach...\n');
  
  try {
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
 * Generate subject lines for VC
 */
async function generateSubjectLines(vc) {
  const focusText = vc.focusAreas.join(' ').toLowerCase();
  const painText = vc.painPoints.join(' ').toLowerCase();
  
  let subjectData;
  
  if (focusText.includes('safety') || focusText.includes('alignment') || painText.includes('alignment')) {
    subjectData = {
      optionA: 'AI Safety Governance Infrastructure',
      optionB: 'Coordination Before Crisis',
      optionC: 'Alignment Through Institutional Design',
      recommended: 'B (emphasizes preparedness, matches governance-first positioning)'
    };
  } else if (focusText.includes('infrastructure') || focusText.includes('enterprise')) {
    subjectData = {
      optionA: 'The Real AI Risk is Coordination Failure',
      optionB: 'Institutional AI Governance',
      optionC: 'Neutral Governance for Advanced AI',
      recommended: 'A (highlights coordination challenge, institutional tone)'
    };
  } else {
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
 * Select email variant based on VC research
 */
function selectVariant(vc) {
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
 * Generate custom hook based on VC research
 */
function generateCustomHook(vc) {
  const focusText = vc.focusAreas?.join(' ')?.toLowerCase() || '';
  const notesText = vc.notes?.toLowerCase() || '';
  const painText = vc.painPoints?.join(' ')?.toLowerCase() || '';
  
  // Check for specific portfolio companies or investments mentioned in notes
  if (notesText.includes('anthropic') || notesText.includes('$1b')) {
    return `Given ${vc.name}'s $1B investment in Anthropic and your focus on enterprise AI infrastructure, you understand that governance becomes the bottleneck when frontier AI scales across organizational and national boundaries.`;
  }
  
  if (focusText.includes('decentralized') || focusText.includes('network')) {
    return `Given ${vc.name}'s thesis on network effects and your work on AI and decentralized systems, you recognize that coordination—not just capability—is what breaks down when AI systems scale beyond individual actors.`;
  }
  
  if (focusText.includes('deep tech') || focusText.includes('manufacturing') || focusText.includes('healthcare')) {
    return `Given ${vc.name}'s investments in AI across critical industries, you understand that governance infrastructure becomes critical when AI operates in high-stakes environments where failure has real consequences.`;
  }
  
  if (focusText.includes('defense') || notesText.includes('defense')) {
    return `Given ${vc.name}'s technical leadership and investments in foundational AI technologies, you understand that governance infrastructure must keep pace with capability—especially in dual-use contexts where the stakes are highest.`;
  }
  
  // Default hook
  return `Given ${vc.name}'s focus on ${vc.focusAreas?.[0] || 'AI'}, you understand that governance becomes the critical challenge as frontier AI systems scale beyond traditional oversight mechanisms.`;
}

/**
 * Generate custom PS based on VC research
 */
function generateCustomPS(vc) {
  const focusText = vc.focusAreas?.join(' ')?.toLowerCase() || '';
  
  if (focusText.includes('anthropic') || focusText.includes('safety')) {
    return `P.S.: ${vc.name}'s investments in AI safety show the kind of forward-thinking approach that recognizes governance must evolve alongside capability.`;
  }
  
  if (focusText.includes('network') || focusText.includes('decentralized')) {
    return `P.S.: ${vc.name}'s thesis on ${vc.focusAreas?.[0] || 'AI'} aligns with our view that governance infrastructure must be built before it's urgently needed.`;
  }
  
  // Default PS
  return `P.S.: ${vc.name}'s focus on ${vc.focusAreas?.[0] || 'AI infrastructure'} resonates with our institutional approach to governance.`;
}

/**
 * Generate email using new template interface (with customHook and footerNote)
 */
function generateEmailForVC(vc, variant, subjects) {
  // Extract first partner name for greeting
  const partnerName = vc.partners ? vc.partners.split(',')[0].split('(')[0].trim() : 'there';
  
  // Generate personalized hook and PS
  const customHook = generateCustomHook(vc);
  const customPS = generateCustomPS(vc);
  
  // Generate HTML email using new interface with personalization
  const emailResult = generateEmailHTML({
    recipientName: partnerName,
    companyName: vc.name,
    painPoints: vc.painPoints || [],
    variant: variant,
    language: 'en',
    subject: subjects.optionA,
    customHook,
    customPS
  });
  
  return {
    html: emailResult.html,
    text: emailResult.text,
    partnerName,
    variant,
    customHook,
    customPS
  };
}

/**
 * Draft email for VC
 */
async function draftEmail(vc) {
  console.log(`✍️  Drafting email: ${vc.name}...\n`);
  
  console.log(`   Generating subject lines...`);
  const subjects = await generateSubjectLines(vc);
  console.log(`   ✅ ${subjects.optionA}`);
  console.log(`   ✅ ${subjects.optionB}`);
  console.log(`   ✅ ${subjects.optionC}`);
  console.log(`   Recommended: ${subjects.recommended}\n`);
  
  const variantSelection = selectVariant(vc);
  console.log(`   Variant: ${variantSelection.variant} (${variantSelection.reason})\n`);
  
  const email = generateEmailForVC(vc, variantSelection.variant, subjects);
  
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
    emailText: email.text,
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
 * Save draft to JSON file using new naming convention
 */
function saveDraft(draft) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `alygn-vc-approved-${timestamp}.json`;
  const filepath = `/tmp/${filename}`;
  
  fs.writeFileSync(filepath, JSON.stringify(draft, null, 2));
  
  console.log(`   💾 Saved: ${filepath}\n`);
  
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
  
  const vcs = await getReadyVCs(limit, vcName);
  stats.loaded = vcs.length;
  
  if (vcs.length === 0) {
    console.log('⚠️  No VCs ready for outreach!\n');
    console.log('💡 Run deep research first:\n');
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
  const dryRunOperations = [];
  
  for (const vc of vcs) {
    try {
      console.log('='.repeat(60));
      console.log('');
      
      const draft = await draftEmail(vc);
      stats.drafted++;
      
      if (dryRun) {
        dryRunOperations.push({
          type: 'email_draft',
          entity: {
            name: draft.vc.name,
            email: draft.vc.email
          },
          payload: {
            to: draft.vc.email,
            subject: draft.subjects.optionA,
            html: draft.emailHTML.substring(0, 500) + '...',
            text: draft.emailText.substring(0, 200) + '...'
          },
          metadata: {
            variant: draft.variant,
            partnerName: draft.partnerName
          }
        });
        console.log(`   [DRY RUN] Would post to Discord for approval\n`);
      } else {
        saveDraft(draft);
        stats.saved++;
        await postDraftToDiscord(draft);
        stats.posted++;
      }
      
      drafts.push(draft);
      
    } catch (error) {
      console.error(`❌ Failed to draft ${vc.name}: ${error.message}`);
      stats.failed++;
    }
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  if (dryRun) {
    // Output dry-run JSON to stdout
    const dryRunReport = {
      dryRun: true,
      timestamp: new Date().toISOString(),
      script: 'draft-outreach-emails.js',
      summary: {
        total: stats.loaded,
        wouldDraft: stats.drafted,
        wouldFail: stats.failed
      },
      operations: dryRunOperations,
      files: {
        wouldCreate: stats.drafted > 0 ? [`${process.env.HOME}/.openclaw/workspace/reports/alygn/vc-approve/alygn-vc-approved-${timestamp}.json`] : []
      }
    };
    
    console.log('\n' + '='.repeat(60));
    console.log('\nDRY RUN OUTPUT:\n');
    console.log(JSON.stringify(dryRunReport, null, 2));
    console.log('='.repeat(60) + '\n');
  } else {
    const summary = `
✍️  **Email Drafting Report** (${new Date().toLocaleDateString()})

**Stats:**
- VCs loaded: ${stats.loaded}
- Emails drafted: ${stats.drafted}
- Posted to Discord: ${stats.posted}
- Saved to files: ${stats.saved}
- Failed: ${stats.failed}

**Next:** Review drafts in Discord (#annotations) and approve for sending.
    `.trim();
    
    console.log('\n' + '='.repeat(60));
    console.log('\n' + summary + '\n');
    console.log('='.repeat(60) + '\n');
    
    console.log('✅ Drafting complete!\n');
    console.log('📬 Check Discord (#annotations) to review and approve drafts.\n');
  }
}

// Run
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

export { draftEmail, generateSubjectLines, getReadyVCs, selectVariant };

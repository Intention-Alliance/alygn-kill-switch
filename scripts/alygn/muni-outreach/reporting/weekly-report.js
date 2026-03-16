/**
 * Weekly Report - Local Government Coverage + Political Alignment Analysis
 * 
 * Pure sub-agent script: Generates weekly progress report with canton/county coverage
 * and political figure alignment analysis.
 * 
 * Tools:
 * - Perplexity: Context on regional political landscape
 * - Supabase: Metrics data
 * 
 * Usage:
 *   node weekly-report.js --region=cr --wave=1 --week=2026-W10
 */

import fs from "fs";
import path from "path";
import coordinator from "../utils/sub-agent-coordinator.js";

// Load utilities
import supabase from "../../../utils/supabase-client.js".supabase;
import checkpoint from "../core/checkpoint.js";

// Current date for context
const currentDate = new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

/**
 * Main weekly report function
 */
async function generateWeeklyReport(options) {
  const {
    region,
    wave,
    week // ISO week format: 2026-W10
  } = options;
  
  console.log(`📊 Weekly Report Generator - ${region} Wave ${wave}`);
  console.log(`   Week: ${week}`);
  console.log(`   Date: ${currentDate}`);
  
  // Load all metrics from Supabase
  const metrics = await loadWeeklyMetrics(region, wave, week);
  console.log(`   Metrics loaded`);
  
  // Spawn sub-agent for report generation
  console.log('   🤖 Spawning analyst agent...');
  
  const reportResult = await coordinator.spawnAndPoll(
    `analyst:${region}:${wave}`,
    `Generate weekly progress report for ${region} Wave ${wave} (${week}). TODAY: ${currentDate}`,
    {
      metrics,
      region,
      wave,
      week,
      currentDate,
      currentYear: 2026,
      totalLocalGovernments: region === 'cr' ? 82 : null
    },
    90 // timeout seconds
  );
  
  console.log(`   ✅ Report generated`);
  
  // Save report
  const outputFile = path.join(__dirname, `../../../output/weekly-report-${region}-wave${wave}-${week}.md`);
  const reportMarkdown = reportResult.markdown || reportResult.report || JSON.stringify(reportResult, null, 2);
  fs.writeFileSync(outputFile, reportMarkdown);
  
  console.log(`💾 Report saved to: ${outputFile}`);
  
  // Post to Discord (optional)
  if (options.postToDiscord) {
    console.log('   📤 Posting to Discord...');
    // Discord posting logic here
  }
  
  return { report: report.markdown, outputFile, metrics };
}

/**
 * Load weekly metrics from Supabase
 */
async function loadWeeklyMetrics(region, wave, week) {
  const weekStart = getWeekStart(week);
  const weekEnd = getWeekEnd(week);
  
  // Local governments discovered
  const { count: lgDiscovered } = await supabase
    .from('local_governments')
    .select('*', { count: 'exact', head: true })
    .eq('country', region)
    .eq('wave_number', wave)
    .gte('discovered_at', weekStart)
    .lte('discovered_at', weekEnd);
  
  // Local governments contacted
  const { count: lgContacted } = await supabase
    .from('outreach_emails')
    .select('*', { count: 'exact', head: true })
    .in('local_government_id', 
      supabase.from('local_governments').select('id').eq('country', region).eq('wave_number', wave)
    )
    .gte('sent_at', weekStart)
    .lte('sent_at', weekEnd);
  
  // Political figures identified
  const { count: politiciansIdentified } = await supabase
    .from('political_figures')
    .select('*', { count: 'exact', head: true })
    .in('local_government_id',
      supabase.from('local_governments').select('id').eq('country', region).eq('wave_number', wave)
    )
    .gte('discovered_at', weekStart);
  
  // Political figures aligned (high alignment)
  const { count: politiciansAligned } = await supabase
    .from('political_figures')
    .select('*', { count: 'exact', head: true })
    .in('local_government_id',
      supabase.from('local_governments').select('id').eq('country', region).eq('wave_number', wave)
    )
    .eq('ideology_alignment', 'high')
    .gte('discovered_at', weekStart);
  
  // X engagements
  const { count: xEngagements } = await supabase
    .from('x_engagements')
    .select('*', { count: 'exact', head: true })
    .in('local_government_id',
      supabase.from('local_governments').select('id').eq('country', region).eq('wave_number', wave)
    )
    .gte('engaged_at', weekStart)
    .lte('engaged_at', weekEnd);
  
  // Emails sent
  const { count: emailsSent } = await supabase
    .from('outreach_emails')
    .select('*', { count: 'exact', head: true })
    .gte('sent_at', weekStart)
    .lte('sent_at', weekEnd);
  
  // Replies received
  const { count: repliesReceived } = await supabase
    .from('outreach_emails')
    .select('*', { count: 'exact', head: true })
    .not('reply_received_at', 'is', null)
    .gte('reply_received_at', weekStart)
    .lte('reply_received_at', weekEnd);
  
  // Reply breakdown by category
  const { data: replyBreakdown } = await supabase
    .from('outreach_emails')
    .select('reply_category')
    .not('reply_received_at', 'is', null)
    .gte('reply_received_at', weekStart)
    .lte('reply_received_at', weekEnd);
  
  const categoryCounts = {};
  (replyBreakdown || []).forEach(r => {
    categoryCounts[r.reply_category] = (categoryCounts[r.reply_category] || 0) + 1;
  });
  
  // Party breakdown (for politicians)
  const { data: partyData } = await supabase
    .from('political_figures')
    .select('party')
    .in('local_government_id',
      supabase.from('local_governments').select('id').eq('country', region).eq('wave_number', wave)
    )
    .gte('discovered_at', weekStart);
  
  const partyCounts = {};
  (partyData || []).forEach(p => {
    if (p.party) {
      partyCounts[p.party] = (partyCounts[p.party] || 0) + 1;
    }
  });
  
  return {
    localGovernments: {
      discovered: lgDiscovered || 0,
      contacted: lgContacted || 0,
      total: region === 'cr' ? 82 : null
    },
    politicalFigures: {
      identified: politiciansIdentified || 0,
      aligned: politiciansAligned || 0,
      partyBreakdown: partyCounts
    },
    xEngagements: xEngagements || 0,
    emails: {
      sent: emailsSent || 0,
      repliesReceived: repliesReceived || 0,
      replyBreakdown: categoryCounts
    },
    period: {
      week,
      start: weekStart,
      end: weekEnd
    }
  };
}

/**
 * Get week start date (Monday)
 */
function getWeekStart(week) {
  // Parse ISO week: 2026-W10
  const [year, weekNum] = week.split('-W');
  const jan1 = new Date(`${year}-01-01`);
  const dayOfWeek = jan1.getDay();
  const mondayOffset = dayOfWeek === 0 ? 1 : (1 - dayOfWeek);
  const weekStart = new Date(jan1);
  weekStart.setDate(jan1.getDate() + mondayOffset + ((parseInt(weekNum) - 1) * 7));
  return weekStart.toISOString();
}

/**
 * Get week end date (Sunday)
 */
function getWeekEnd(week) {
  const weekStart = getWeekStart(week);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return weekEnd.toISOString();
}

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  const parseArg = (name) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : null;
  };
  
  const region = parseArg('region') || 'cr';
  const wave = parseInt(parseArg('wave') || '1');
  const week = parseArg('week') || getISOWeek(new Date());
  const postToDiscord = args.includes('--post-to-discord');
  
  generateWeeklyReport({ region, wave, week, postToDiscord })
    .then(({ report, outputFile, metrics }) => {
      console.log('\n📊 Metrics:', JSON.stringify(metrics, null, 2));
      console.log('\n📄 Report saved to:', outputFile);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Fatal error:', error.message);
      process.exit(1);
    });
}

/**
 * Get current ISO week
 */
function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export { generateWeeklyReport, loadWeeklyMetrics, getISOWeek };

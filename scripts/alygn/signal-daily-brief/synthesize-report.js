#!/usr/bin/env node
/**
 * ALYGN Daily Signal Brief — Report Synthesis Module
 *
 * Reads collected data JSON from stdin, generates structured report
 * with executive summary, operations, outreach, suggestions, and targets.
 * Includes local work tracking, VC outreach, and email metrics.
 *
 * Usage: node collect-data.js | node synthesize-report.js
 *        node synthesize-report.js < data.json
 */

const readline = require('readline');

// ─── Input ─────────────────────────────────────────────────────────────────
function readStdin() {
  return new Promise((resolve, reject) => {
    let input = '';
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', (line) => (input += line + '\n'));
    rl.on('close', () => {
      try { resolve(JSON.parse(input)); }
      catch (e) { reject(new Error(`Invalid JSON input: ${e.message}`)); }
    });
  });
}

// ─── Status Emoji ───────────────────────────────────────────────────────────
function statusEmoji(status) {
  if (!status) return '⚪';
  const s = status.toLowerCase();
  if (s.includes('healthy') || s.includes('green') || s === 'ok') return '✅';
  if (s.includes('degrad') || s.includes('yellow') || s.includes('warn')) return '🟡';
  if (s.includes('down') || s.includes('red') || s.includes('error') || s.includes('fail')) return '🔴';
  if (s.includes('unknown') || s.includes('unreachable')) return '⚪';
  return '✅'; // default to green
}

// ─── Executive Summary ──────────────────────────────────────────────────────
function generateExecutiveSummary(data) {
  const parts = [];

  // Top win
  const github = data.operations?.github || {};
  const grants = data.operations?.grants || {};
  const vc = data.outreach?.vc || {};
  const municipal = data.outreach?.municipal || {};
  const localWork = data.operations?.localWork || {};

  if (vc.replies > 0) {
    parts.push(`VC reply received — ${vc.replies} engagement${vc.replies > 1 ? 's' : ''}`);
  } else if (github.commits > 0 || github.prsMerged > 0) {
    parts.push(`${github.commits} commit${github.commits !== 1 ? 's' : ''}, ${github.prsMerged} PR${github.prsMerged !== 1 ? 's' : ''} merged`);
  } else if (localWork.features?.length > 0) {
    parts.push(`${localWork.features.length} local feature${localWork.features.length !== 1 ? 's' : ''} in progress`);
  } else if (municipal.warmups > 0) {
    parts.push(`${municipal.warmups} municipal warmup${municipal.warmups !== 1 ? 's' : ''} in progress`);
  } else {
    parts.push('Operations steady, no new wins yesterday');
  }

  // Critical item
  const urgent = grants.urgentDeadlines || [];
  if (urgent.length > 0) {
    const top = urgent.sort((a, b) => a.deadlineDays - b.deadlineDays)[0];
    parts.push(`${top.name} deadline in ${top.deadlineDays} days (${top.priority})`);
  } else if (data.operations?.killSwitch?.status === 'degraded') {
    parts.push('Kill Switch degraded — needs attention');
  } else {
    parts.push('No critical blockers');
  }

  // Overall status
  const killSwitch = data.operations?.killSwitch || {};
  const overallStatus = killSwitch.status === 'healthy' ? 'Green' : killSwitch.status === 'degraded' ? 'Yellow' : 'Green';
  parts.push(`Status: ${overallStatus}`);

  return parts.join(' • ');
}

// ─── Operations Section ─────────────────────────────────────────────────────
function generateOperations(data) {
  const lines = [];
  const ks = data.operations?.killSwitch || {};
  const grants = data.operations?.grants || {};
  const github = data.operations?.github || {};
  const localWork = data.operations?.localWork || {};
  const vc = data.operations?.vc || {};

  // Kill Switch
  lines.push(`${statusEmoji(ks.status)} Kill Switch: ${ks.status || 'unknown'}${ks.uptime !== 'N/A' ? `, ${ks.uptime} uptime` : ''}${ks.healthChecks ? `, ${ks.healthChecks} checks` : ''}`);

  // Grants
  const urgent = grants.urgentDeadlines || [];
  if (urgent.length > 0) {
    for (const g of urgent) {
      lines.push(`📋 ${g.name}: ${g.deadlineDays} days left (${g.priority})`);
    }
  } else {
    lines.push('📋 No urgent grant deadlines (< 30 days)');
  }

  // GitHub (both repos)
  lines.push(`💻 GitHub: ${github.commits || 0} commits, ${github.prsMerged || 0} PRs merged, ${github.issuesClosed || 0} issues closed`);
  if (github.details?.length) {
    for (const d of github.details.slice(0, 5)) {
      lines.push(`   → ${d}`);
    }
  }

  // Local Work (Brain/Memory)
  if (localWork.features?.length > 0 || localWork.progress?.length > 0) {
    lines.push(`🧠 Local Work (Brain): ${localWork.features?.length || 0} features, ${localWork.progress?.length || 0} active streams`);
    if (localWork.features?.length) {
      for (const f of localWork.features.slice(0, 3)) {
        lines.push(`   → ${f.replace(/^[*-]\s*/, '')}`);
      }
    }
  }

  // VC Outreach (from Notion)
  if (vc.sent > 0 || vc.replies > 0 || vc.meetings > 0) {
    lines.push(`📧 VC Outreach: ${vc.sent} sent, ${vc.replies} replies, ${vc.meetings} meetings scheduled`);
    if (vc.details?.length) {
      for (const d of vc.details.slice(0, 3)) {
        lines.push(`   → ${d}`);
      }
    }
  }

  return lines;
}

// ─── Outreach Section ───────────────────────────────────────────────────────
function generateOutreach(data) {
  const lines = [];
  const vc = data.outreach?.vc || {};
  const muni = data.outreach?.municipal || {};
  const twitter = data.outreach?.twitter || {};
  const emails = data.outreach?.emails || {};

  // VC (already covered in operations, but include pipeline metrics here)
  lines.push(`📧 VC Pipeline: ${vc.sent || 0} sent, ${vc.replies || 0} replies, ${vc.meetings || 0} meetings`);
  if (vc.details?.length) {
    for (const d of vc.details.slice(0, 2)) {
      lines.push(`   → ${d}`);
    }
  }

  // Municipal
  lines.push(`🏛️ Municipal: ${muni.warmups || 0} warmups, ${muni.approved || 0} approved, ${muni.sent || 0} sent, ${muni.responded || 0} responses`);
  if (muni.details?.length) {
    for (const d of muni.details.slice(0, 2)) {
      lines.push(`   → ${d}`);
    }
  }

  // Email Tracking
  if (emails?.gmail || emails?.outreach) {
    const gmail = emails.gmail || {};
    const outreach = emails.outreach || {};
    lines.push(`📧 Email (alyyygn@gmail.com): ${gmail.sent || 0} sent, ${gmail.received || 0} received, ${gmail.grantRelated || 0} grant-related`);
    lines.push(`📧 Email (outreach@alyygn.com): ${outreach.sent || 0} sent, ${outreach.received || 0} received, ${outreach.grantRelated || 0} grant-related`);
  }

  // Twitter
  lines.push(`🐦 Twitter: ${twitter.followers || 0} followers`);
  if (twitter.impressions) lines[lines.length - 1] += `, ${twitter.impressions} impressions`;
  if (twitter.topPost && twitter.topPost !== 'N/A') lines.push(`   → Top post: ${twitter.topPost}`);

  return lines;
}

// ─── Suggestions ────────────────────────────────────────────────────────────
function generateSuggestions(data) {
  const suggestions = [];
  const grants = data.operations?.grants || {};
  const muni = data.outreach?.municipal || {};
  const vc = data.outreach?.vc || {};
  const twitter = data.outreach?.twitter || {};
  const localWork = data.operations?.localWork || {};
  const github = data.operations?.github || {};

  // Grant deadline suggestions
  const urgent = grants.urgentDeadlines || [];
  if (urgent.length > 0) {
    const top = urgent.sort((a, b) => a.deadlineDays - b.deadlineDays)[0];
    suggestions.push(`Prioritize ${top.name} draft — ${top.deadlineDays} days remaining → Submit before deadline`);
  }

  // Municipal pipeline suggestions
  if (muni.warmups > 0 && muni.sent === 0) {
    suggestions.push(`${muni.warmups} warmups ready but 0 sent → Batch send this morning`);
  }
  if (muni.approved > 0 && muni.sent < muni.approved) {
    suggestions.push(`${muni.approved - muni.sent} approved emails pending → Send today`);
  }

  // VC suggestions
  if (vc.sent > 0 && vc.replies === 0) {
    suggestions.push(`${vc.sent} VC emails sent, 0 replies → Consider follow-up cadence or new targets`);
  }
  if (vc.replies > 0 && vc.meetings === 0) {
    suggestions.push(`${vc.replies} VC reply/replies but no meetings → Push for call scheduling`);
  }

  // Local work continuation
  if (localWork.features?.length > 0) {
    suggestions.push(`${localWork.features.length} local features in progress → Continue implementation and document in GitHub`);
  }

  // GitHub activity
  if (github.commits > 0 && github.prsMerged === 0) {
    suggestions.push(`${github.commits} commits but no PRs merged → Review and merge pending work`);
  }

  // Twitter suggestions
  if (twitter.followers > 0 && (!twitter.impressions || twitter.impressions === 0)) {
    suggestions.push('Twitter impressions data unavailable → Check X API access level');
  }

  // Fallback
  if (suggestions.length === 0) {
    suggestions.push('Review priorities and identify blockers for today');
    suggestions.push('Check for new grant opportunities in tracker');
  }

  return suggestions;
}

// ─── Daily Targets ──────────────────────────────────────────────────────────
function generateTargets(data) {
  const targets = [];
  const grants = data.operations?.grants || {};
  const muni = data.outreach?.municipal || {};
  const vc = data.outreach?.vc || {};
  const github = data.operations?.github || {};
  const localWork = data.operations?.localWork || {};

  // P1: Most urgent grant
  const urgent = grants.urgentDeadlines || [];
  if (urgent.length > 0) {
    const top = urgent.sort((a, b) => a.deadlineDays - b.deadlineDays)[0];
    targets.push({ text: `Complete ${top.name} draft/application`, priority: 'P1', deadline: `${top.deadlineDays}d` });
  }

  // P1/P2: Municipal sends
  if (muni.approved > 0) {
    targets.push({ text: `Send ${muni.approved} approved municipal emails`, priority: muni.approved > 3 ? 'P1' : 'P2', deadline: 'today' });
  }

  // P2: VC follow-ups
  if (vc.replies > 0) {
    targets.push({ text: `Schedule ${vc.replies} VC call${vc.replies > 1 ? 's' : ''}`, priority: 'P2', deadline: 'this week' });
  }

  // P2: Local work continuation
  if (localWork.features?.length > 0) {
    targets.push({ text: 'Continue local feature development and sync to GitHub', priority: 'P2', deadline: 'today' });
  }

  // Fill remaining slots
  if (targets.length < 3) {
    if (github.commits > 0 || github.prsMerged > 0) {
      targets.push({ text: 'Review and merge pending PRs', priority: 'P2', deadline: 'today' });
    }
  }
  if (targets.length < 3) {
    targets.push({ text: 'Update grant tracker with latest status', priority: 'P3', deadline: 'EOD' });
  }

  return targets.slice(0, 5); // Allow up to 5 targets for detailed reporting
}

// ─── Audio Script ───────────────────────────────────────────────────────────
function generateAudioScript(data) {
  const date = data.date || new Date().toISOString().split('T')[0];
  const formatted = new Date(date + 'T08:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  const summary = generateExecutiveSummary(data);
  const ops = generateOperations(data);
  const outreach = generateOutreach(data);
  const suggestions = generateSuggestions(data);
  const targets = generateTargets(data);

  // Strip emojis and special chars for TTS (comprehensive Unicode coverage)
  const clean = (s) => s.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1FFFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').replace(/[\u{1FA00}-\u{1FAFF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{25AA}-\u{25FE}\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();

  // Target: ~400 words for 2:45min audio (at ~2.5 words/sec with pauses)
  // This is much more detailed than the previous 150-180 word limit
  let script = `Greding! Wobblus here with your Alygn daily brief for ${formatted}. `;

  // Executive summary (2-3 sentences)
  script += `Here's the executive summary: ${clean(summary)}. `;

  // Operations (all key points, 4-6 sentences)
  script += `On operations and systems: `;
  for (let i = 0; i < Math.min(ops.length, 6); i++) {
    script += `${clean(ops[i])}. `;
  }

  // Outreach (all key points, 3-5 sentences)
  script += `Outreach update: `;
  for (let i = 0; i < Math.min(outreach.length, 5); i++) {
    script += `${clean(outreach[i])}. `;
  }

  // Suggestions (top 2-3)
  if (suggestions.length > 0) {
    script += `My recommendations: `;
    for (let i = 0; i < Math.min(suggestions.length, 3); i++) {
      script += `${clean(suggestions[i])}. `;
    }
  }

  // Targets (all, up to 5)
  if (targets.length > 0) {
    script += `Today's priorities: `;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      script += `Priority ${t.priority}: ${clean(t.text)}, due ${t.deadline}. `;
    }
  }

  script += `That's your brief! Back to tinkering.`;

  return script;
}

// ─── Text Report ────────────────────────────────────────────────────────────
function generateTextReport(data) {
  const lines = [];
  const date = data.date || new Date().toISOString().split('T')[0];

  lines.push(`📡 ALYGN DAILY SIGNAL BRIEF — ${date}`);
  lines.push('');
  lines.push('📈 EXECUTIVE SUMMARY');
  lines.push(generateExecutiveSummary(data));
  lines.push('');
  lines.push('🔧 OPERATIONS & SYSTEMS');
  lines.push(...generateOperations(data));
  lines.push('');
  lines.push('📧 OUTREACH');
  lines.push(...generateOutreach(data));
  lines.push('');
  lines.push('💡 SUGGESTIONS');
  lines.push(...generateSuggestions(data).map(s => `• ${s}`));
  lines.push('');
  lines.push('🎯 TODAY\'S TARGETS');
  lines.push(...generateTargets(data).map((t, i) => `${i + 1}. [${t.priority}] ${t.text} (${t.deadline})`));

  return lines.join('\n');
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const data = await readStdin();

  const report = {
    date: data.date,
    textReport: generateTextReport(data),
    audioScript: generateAudioScript(data),
    executiveSummary: generateExecutiveSummary(data),
    operations: generateOperations(data),
    outreach: generateOutreach(data),
    suggestions: generateSuggestions(data),
    targets: generateTargets(data),
    dataCompleteness: {
      github: !!data.operations?.github,
      grants: !!data.operations?.grants,
      vc: !!data.operations?.vc,
      municipal: !!data.outreach?.municipal,
      localWork: !!data.operations?.localWork,
      emails: !!data.outreach?.emails,
    }
  };

  process.stdout.write(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(`❌ Synthesis error: ${e.message}`);
  process.exit(1);
});

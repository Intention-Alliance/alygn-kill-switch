// NotificationService - Send reports to email, Discord, etc.
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class NotificationService {
  constructor() {
    this.templates = this._loadTemplates();
  }

  _loadTemplates() {
    return {
      email: fs.readFileSync(path.join(__dirname, '../../templates/summary-email-tania.md'), 'utf8'),
      discord: fs.readFileSync(path.join(__dirname, '../../templates/discord-notification.md'), 'utf8'),
      analysis: fs.readFileSync(path.join(__dirname, '../../templates/grant-analysis-report.md'), 'utf8')
    };
  }

  async sendEmailReport(grants, config) {
    const body = this.generateEmailReport(grants);

    const emailConfig = {
      to: this._resolveRecipient(config.recipient || 'tania'),
      subject: `ALYGN Grant Discovery — ${grants.length} opportunities`,
      body
    };

    // In production: send via SMTP using email service
    logger.info('Email report generated', { to: emailConfig.to, grantCount: grants.length });
    return { status: 'sent', to: emailConfig.to, grantCount: grants.length };
  }

  generateEmailReport(grants) {
    const critical = grants.filter(g => this._daysUntil(g.deadline?.full) <= 7);
    const highPriority = grants.filter(g => (g.typeData?.alignmentScore || 0) >= 8);
    const newThisWeek = grants.filter(g => {
      const created = new Date(g.createdAt);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return created >= weekAgo;
    });

    let body = '# ALYGN Grant Discovery Report\n\n';

    if (critical.length > 0) {
      body += '## 🚨 Critical Deadlines (≤7 days)\n\n';
      body += '| Grant Name | Deadline | Amount | Fit Score |\n';
      body += '|------------|----------|--------|-----------|\n';
      for (const g of critical) {
        body += `| ${g.name} | ${g.deadline?.full} | $${(g.amount?.max || 0).toLocaleString()} | ${g.typeData?.alignmentScore || 'N/A'} |\n`;
      }
      body += '\n';
    }

    if (highPriority.length > 0) {
      body += '## 🎯 High-Priority Opportunities (Fit Score ≥ 8)\n\n';
      body += '| Grant Name | Agency | Amount | Deadline | Fit Summary |\n';
      body += '|------------|--------|--------|----------|-------------|\n';
      for (const g of highPriority.slice(0, 10)) {
        body += `| ${g.name} | ${g.agency} | $${(g.amount?.max || 0).toLocaleString()} | ${g.deadline?.full} | ${(g.typeData?.fitSummary || '—').substring(0, 60)}… |\n`;
      }
      body += '\n';
    }

    if (newThisWeek.length > 0) {
      body += '## 🆕 New This Week\n\n';
      for (const g of newThisWeek) {
        body += `- **${g.name}** (${g.agency}) — ${g.url || 'No URL'}\n`;
      }
      body += '\n';
    }

    body += '## Recommended Actions\n\n';
    body += '1. Review critical deadlines immediately\n';
    body += '2. Prepare applications for high-priority grants\n';
    body += '3. Validate eligibility for new opportunities\n';

    return body;
  }

  async sendDiscordDigest(grants, config) {
    const embed = this.generateDiscordReport(grants);

    // In production: send via Discord webhook or API
    logger.info('Discord digest generated', { channel: config.channel || 'alygn-grants', grantCount: grants.length });
    return { status: 'sent', channel: config.channel || 'alygn-grants', grantCount: grants.length };
  }

  generateDiscordReport(grants) {
    const critical = grants.filter(g => this._daysUntil(g.deadline?.full) <= 7);
    const top5 = [...grants].sort((a, b) => (b.typeData?.priorityScore || 0) - (a.typeData?.priorityScore || 0)).slice(0, 5);

    return {
      title: '📊 ALYGN Grant Discovery Report',
      description: `${grants.length} opportunities tracked | ${critical.length} critical deadlines`,
      fields: [
        ...(critical.length > 0 ? [{
          name: '🚨 Critical Deadlines',
          value: critical.map(g => `• **${g.name}** — ${g.deadline?.full} (${this._daysUntil(g.deadline?.full)} days)`).join('\n')
        }] : []),
        {
          name: '🎯 Top 5 Priority Grants',
          value: top5.map((g, i) => `${i + 1}. **${g.name}** (${g.agency})\n   $${(g.amount?.max || 0).toLocaleString()} | ${g.deadline?.full} | Score: ${g.typeData?.priorityScore || 'N/A'}`).join('\n')
        }
      ],
      footer: 'ALYGN Grant Discovery System'
    };
  }

  generateAnalysisReport(grant) {
    if (!grant) {
      return { error: 'Grant not found' };
    }

    return {
      grant: grant.name,
      agency: grant.agency,
      executiveSummary: grant.typeData?.fitSummary || 'No fit assessment available.',
      financials: {
        amount: `$${(grant.amount?.min || 0).toLocaleString()} - $${(grant.amount?.max || 0).toLocaleString()}`,
        duration: `${grant.duration?.minMonths || 12} - ${grant.duration?.maxMonths || 36} months`
      },
      deadlines: grant.deadline,
      eligibility: {
        confidence: grant.typeData?.eligibilityConfidence || 0,
        notes: grant.typeData?.eligibilityNotes || 'Not analyzed',
        barriers: grant.typeData?.potentialBarriers || [],
        mitigations: grant.typeData?.recommendedMitigations || []
      },
      keyRequirements: grant.typeData?.keyRequirements || [],
      applicationComplexity: grant.typeData?.applicationComplexity || 'medium',
      scores: {
        alygnFit: grant.typeData?.alignmentScore || 0,
        priority: grant.typeData?.priorityScore || 0
      },
      recommendedApproach: grant.typeData?.recommendedApproach || 'No recommendation available.'
    };
  }

  async alertCriticalDeadlines(grants) {
    // Send WhatsApp/Discord alert for critical grants
    logger.warn('Critical deadline alert triggered', { count: grants.length });
    return { status: 'alert_sent', count: grants.length };
  }

  _resolveRecipient(alias) {
    const recipients = {
      tania: process.env.TANIA_EMAIL || 'tania@alygn.com',
      andler: process.env.ANDLER_EMAIL || 'andler@alygn.com'
    };
    return recipients[alias] || alias;
  }

  _daysUntil(dateStr) {
    if (!dateStr) return Infinity;
    return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
  }
}

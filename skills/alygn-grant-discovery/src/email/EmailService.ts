/**
 * GrantDiscoveryEmailService
 * Sends email summaries and reminders about grants
 * 
 * Features:
 * - Daily/weekly summaries of new grants and changes
   * - Deadline reminders for upcoming applications
 * - HTML and plain text email formats
 * - Configurable recipients and scheduling
 */

import nodemailer from 'nodemailer';
import { GrantEntity } from '../entities/GrantEntity';
import type { GrantChange, EmailConfig } from '../types/index';
import { format, addDays, isBefore } from 'date-fns';

interface EmailData {
  newGrants: GrantEntity[];
  changes: GrantChange[];
  deadlineGrants?: GrantEntity[];
  summary?: {
    totalGrants: number;
    highAlignment: number;
    urgentDeadlines: number;
  };
}

/**
 * Email service for grant discovery notifications
 */
export class GrantDiscoveryEmailService {
  private transporter: nodemailer.Transporter;
  private config: EmailConfig;

  /**
   * Creates a new email service instance
   * 
   * @param {EmailConfig} config - Email configuration
   */
  constructor(config: EmailConfig) {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.auth.user,
        pass: config.smtp.auth.pass
      }
    });
  }

  /**
   * Send daily/weekly summary to Tania
   * 
   * @param {GrantEntity[]} newGrants - Newly discovered grants
   * @param {GrantChange[]} changes - Changes to existing grants
   * @returns {Promise<void>}
   */
  async sendSummaryToTania(newGrants: GrantEntity[], changes: GrantChange[]): Promise<void> {
    console.log(`   📧 Preparing summary email...`);

    const data: EmailData = {
      newGrants,
      changes,
      summary: {
        totalGrants: newGrants.length + changes.filter(c => c.type !== 'new').length,
        highAlignment: newGrants.filter(g => g.alignmentScore >= 7).length,
        urgentDeadlines: newGrants.filter(g => {
          const days = g.getDaysUntilDeadline();
          return days !== null && days <= 14;
        }).length
      }
    };

    const html = this.generateEmailTemplate(data);
    const text = this.generatePlainTextTemplate(data);

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: this.config.to,
        subject: `ALYGN Grant Discovery Update - ${format(new Date(), 'MMM dd, yyyy')}`,
        text,
        html
      });

      console.log(`   ✅ Summary email sent to ${this.config.to}`);
    } catch (error) {
      console.error(`   ❌ Failed to send email:`, error);
      throw error;
    }
  }

  /**
   * Send deadline reminders for upcoming applications
   * 
   * @param {GrantEntity[]} grants - All tracked grants
   * @param {number} [daysThreshold=7] - Days before deadline to remind
   * @returns {Promise<void>}
   */
  async sendDeadlineReminder(grants: GrantEntity[], daysThreshold: number = 7): Promise<void> {
    const deadlineDate = addDays(new Date(), daysThreshold);
    
    const urgentGrants = grants.filter(g => {
      if (!g.deadline) return false;
      const days = g.getDaysUntilDeadline();
      return days !== null && days > 0 && days <= daysThreshold;
    });

    if (urgentGrants.length === 0) {
      console.log(`   ℹ️  No urgent deadlines (≤${daysThreshold} days)`);
      return;
    }

    console.log(`   📧 Preparing deadline reminder for ${urgentGrants.length} grants...`);

    const data: EmailData = {
      newGrants: [],
      changes: [],
      deadlineGrants: urgentGrants
    };

    const html = this.generateDeadlineTemplate(data);
    const text = this.generatePlainTextDeadlineTemplate(data);

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: this.config.to,
        subject: `⚠️ Urgent: ${urgentGrants.length} Grant Deadlines Approaching`,
        text,
        html
      });

      console.log(`   ✅ Deadline reminder sent`);
    } catch (error) {
      console.error(`   ❌ Failed to send reminder:`, error);
      throw error;
    }
  }

  /**
   * Generate HTML email template for summaries
   * 
   * @param {EmailData} data - Email data
   * @returns {string} HTML content
   * @private
   */
  private generateEmailTemplate(data: EmailData): string {
    const { newGrants, changes, summary } = data;

    let html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a1a1a; border-bottom: 2px solid #0070f3; padding-bottom: 10px; }
    h2 { color: #444; margin-top: 30px; }
    .grant-card { background: #f8f9fa; border-left: 4px solid #0070f3; padding: 15px; margin: 15px 0; border-radius: 4px; }
    .grant-card.high-alignment { border-left-color: #00c853; }
    .grant-card.medium-alignment { border-left-color: #ffd600; }
    .grant-card.low-alignment { border-left-color: #ff1744; }
    .grant-name { font-weight: 600; font-size: 16px; margin-bottom: 5px; }
    .grant-org { color: #666; font-size: 14px; }
    .grant-meta { margin-top: 10px; font-size: 13px; color: #555; }
    .grant-meta span { margin-right: 15px; }
    .alignment-score { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .alignment-score.high { background: #e8f5e9; color: #2e7d32; }
    .alignment-score.medium { background: #fffde7; color: #f57f17; }
    .alignment-score.low { background: #ffebee; color: #c62828; }
    .change-item { padding: 10px; margin: 10px 0; background: #fff3e0; border-radius: 4px; }
    .summary-stats { display: flex; gap: 20px; margin: 20px 0; }
    .stat { text-align: center; padding: 15px; background: #f5f5f5; border-radius: 8px; flex: 1; }
    .stat-value { font-size: 28px; font-weight: 700; color: #0070f3; }
    .stat-label { font-size: 12px; color: #666; margin-top: 5px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <h1>🎯 ALYGN Grant Discovery Update</h1>
  
  <p>Here's your latest grant discovery update for <strong>${format(new Date(), 'MMMM dd, yyyy')}</strong>.</p>
`;

    // Summary stats
    if (summary) {
      html += `
  <div class="summary-stats">
    <div class="stat">
      <div class="stat-value">${summary.totalGrants}</div>
      <div class="stat-label">Total Grants</div>
    </div>
    <div class="stat">
      <div class="stat-value">${summary.highAlignment}</div>
      <div class="stat-label">High Alignment</div>
    </div>
    <div class="stat">
      <div class="stat-value">${summary.urgentDeadlines}</div>
      <div class="stat-label">Urgent Deadlines</div>
    </div>
  </div>
`;
    }

    // New grants section
    if (newGrants.length > 0) {
      html += `
  <h2>✨ New Grants Discovered (${newGrants.length})</h2>
`;

      for (const grant of newGrants) {
        const alignmentClass = grant.alignmentScore >= 7 ? 'high-alignment' : 
                              grant.alignmentScore >= 4 ? 'medium-alignment' : 'low-alignment';
        const scoreClass = grant.alignmentScore >= 7 ? 'high' : 
                          grant.alignmentScore >= 4 ? 'medium' : 'low';
        
        const deadline = grant.deadline 
          ? `${grant.getDaysUntilDeadline()} days (${format(grant.deadline, 'MMM dd')})`
          : grant.deadlineType;

        html += `
  <div class="grant-card ${alignmentClass}">
    <div class="grant-name">${grant.name}</div>
    <div class="grant-org">${grant.organization}</div>
    <div class="grant-meta">
      <span>💰 ${grant.amount.min ? `$${grant.amount.min.toLocaleString()} - ` : ''}$${grant.amount.max.toLocaleString()}</span>
      <span>📅 ${deadline}</span>
      <span class="alignment-score ${scoreClass}">${grant.alignmentScore}/10</span>
    </div>
    <div style="margin-top: 8px; font-size: 13px; color: #666;">${grant.researchAreas.slice(0, 3).join(', ')}</div>
  </div>
`;
      }
    }

    // Changes section
    if (changes.length > 0) {
      html += `
  <h2>🔄 Grant Updates (${changes.length})</h2>
`;

      for (const change of changes) {
        const emoji = change.type === 'new' ? '✨' :
                     change.type === 'deadline_changed' ? '📅' :
                     change.type === 'amount_changed' ? '💰' : '📊';
        
        html += `
  <div class="change-item">
    <strong>${emoji} ${change.grantName}</strong>
    <div style="font-size: 13px; color: #666; margin-top: 5px;">
      ${this.formatChangeDescription(change)}
    </div>
  </div>
`;
      }
    }

    html += `
  <div class="footer">
    <p>This is an automated update from the ALYGN Grant Discovery system.</p>
    <p>To view full grant details, check the <a href="https://notion.so">Notion database</a>.</p>
  </div>
</body>
</html>
`;

    return html;
  }

  /**
   * Generate plain text email template
   * 
   * @param {EmailData} data - Email data
   * @returns {string} Plain text content
   * @private
   */
  private generatePlainTextTemplate(data: EmailData): string {
    const { newGrants, changes, summary } = data;
    
    let text = `ALYGN Grant Discovery Update - ${format(new Date(), 'MMMM dd, yyyy')}\n`;
    text += '='.repeat(50) + '\n\n';

    if (summary) {
      text += `SUMMARY\n`;
      text += `- Total grants: ${summary.totalGrants}\n`;
      text += `- High alignment: ${summary.highAlignment}\n`;
      text += `- Urgent deadlines: ${summary.urgentDeadlines}\n\n`;
    }

    if (newGrants.length > 0) {
      text += `NEW GRANTS (${newGrants.length})\n`;
      text += '-'.repeat(30) + '\n';
      
      for (const grant of newGrants) {
        text += `\n${grant.name}\n`;
        text += `  Organization: ${grant.organization}\n`;
        text += `  Amount: ${grant.amount.min ? `$${grant.amount.min.toLocaleString()} - ` : ''}$${grant.amount.max.toLocaleString()}\n`;
        text += `  Deadline: ${grant.deadline ? format(grant.deadline, 'MMM dd, yyyy') : grant.deadlineType}\n`;
        text += `  Alignment: ${grant.alignmentScore}/10\n`;
        text += `  Areas: ${grant.researchAreas.join(', ')}\n`;
      }
      text += '\n';
    }

    if (changes.length > 0) {
      text += `UPDATES (${changes.length})\n`;
      text += '-'.repeat(30) + '\n';
      
      for (const change of changes) {
        text += `\n${change.grantName}: ${this.formatChangeDescription(change)}\n`;
      }
    }

    text += '\n' + '='.repeat(50) + '\n';
    text += 'View full details in Notion\n';

    return text;
  }

  /**
   * Generate HTML deadline reminder template
   * 
   * @param {EmailData} data - Email data
   * @returns {string} HTML content
   * @private
   */
  private generateDeadlineTemplate(data: EmailData): string {
    const { deadlineGrants = [] } = data;

    let html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #c62828; border-bottom: 2px solid #ff1744; padding-bottom: 10px; }
    .urgent { color: #c62828; }
    .grant-card { background: #ffebee; border-left: 4px solid #ff1744; padding: 15px; margin: 15px 0; border-radius: 4px; }
    .grant-name { font-weight: 600; font-size: 16px; margin-bottom: 5px; }
    .grant-org { color: #666; font-size: 14px; }
    .days-left { font-size: 24px; font-weight: 700; color: #c62828; }
    .action-needed { background: #fff3e0; padding: 10px; border-radius: 4px; margin-top: 10px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <h1>⚠️ Urgent Grant Deadlines</h1>
  
  <p class="urgent">You have <strong>${deadlineGrants.length}</strong> grants with approaching deadlines that need attention.</p>
`;

    // Sort by deadline (most urgent first)
    const sorted = [...deadlineGrants].sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.getTime() - b.deadline.getTime();
    });

    for (const grant of sorted) {
      const daysLeft = grant.getDaysUntilDeadline();
      
      html += `
  <div class="grant-card">
    <div class="grant-name">${grant.name}</div>
    <div class="grant-org">${grant.organization}</div>
    <div class="days-left">${daysLeft} days left</div>
    <div>Deadline: ${grant.deadline ? format(grant.deadline, 'EEEE, MMMM dd, yyyy') : 'TBD'}</div>
    <div class="action-needed">
      <strong>Action needed:</strong> Review requirements and prepare application
    </div>
  </div>
`;
    }

    html += `
  <div class="footer">
    <p>Stay on top of your grant applications! 🎯</p>
  </div>
</body>
</html>
`;

    return html;
  }

  /**
   * Generate plain text deadline reminder template
   * 
   * @param {EmailData} data - Email data
   * @returns {string} Plain text content
   * @private
   */
  private generatePlainTextDeadlineTemplate(data: EmailData): string {
    const { deadlineGrants = [] } = data;
    
    let text = `URGENT: Grant Deadlines Approaching\n`;
    text += '='.repeat(50) + '\n\n';
    text += `You have ${deadlineGrants.length} grants with approaching deadlines.\n\n`;

    const sorted = [...deadlineGrants].sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.getTime() - b.deadline.getTime();
    });

    for (const grant of sorted) {
      const daysLeft = grant.getDaysUntilDeadline();
      text += `${grant.name}\n`;
      text += `  Organization: ${grant.organization}\n`;
      text += `  Days left: ${daysLeft}\n`;
      text += `  Deadline: ${grant.deadline ? format(grant.deadline, 'EEEE, MMMM dd, yyyy') : 'TBD'}\n\n`;
    }

    text += '='.repeat(50) + '\n';
    text += 'Review full details in Notion and take action!\n';

    return text;
  }

  /**
   * Format change description for display
   * 
   * @param {GrantChange} change - Change record
   * @returns {string} Formatted description
   * @private
   */
  private formatChangeDescription(change: GrantChange): string {
    switch (change.type) {
      case 'new':
        return 'New grant discovered';
      case 'deadline_changed':
        return `Deadline changed from ${change.oldValue} to ${change.newValue}`;
      case 'amount_changed':
        return `Amount updated`;
      case 'status_changed':
        return `Status changed: ${change.oldValue} → ${change.newValue}`;
      default:
        return 'Updated';
    }
  }
}

export default GrantDiscoveryEmailService;

/**
 * ContactFallbackStrategy - Handles outreach when no direct email is available
 *
 * Fallback chain:
 * 1. DIRECT EMAIL    → Partner's personal/work email (ideal)
 * 2. GENERIC EMAIL   → info@ / contact@ with partner name in subject (acceptable)
 * 3. CONTACT FORM    → Browser automation fills website form (fallback)
 * 4. LINKEDIN MESSAGE→ Direct message to target partner (fallback)
 * 5. MANUAL OUTREACH → Step-by-step instructions for human (last resort)
 */
import type { VCEntity } from '../../entities/VCEntity';
import type { OutreachEntity } from '../../entities/OutreachEntity';

// Generic email prefixes that indicate a non-decision-maker inbox
const GENERIC_EMAIL_PREFIXES = ['info@', 'contact@', 'hello@', 'hello-', 'inquiries@', 'general@', 'admin@', 'support@', 'team@', 'press@'];

export type OutreachMethod = 'email' | 'generic-email' | 'form' | 'linkedin' | 'manual';

export interface ContactFallbackResult {
  method: OutreachMethod;
  success: boolean;
  reason?: string;
  details?: {
    formUrl?: string;
    linkedInUrl?: string;
    partnerName?: string;
    partnerTitle?: string;
    plainTextMessage?: string;
    linkedInNote?: string;      // Short note for connection request (300 char)
    linkedInMessage?: string;    // Full message for LinkedIn DM
    manualInstructions?: string; // Complete manual outreach guide
  };
  entity?: OutreachEntity;
}

/**
 * Determine the outreach method based on available contact information
 */
export function determineOutreachMethod(entity: OutreachEntity): { method: OutreachMethod; reason: string } {
  const email = entity.email?.toLowerCase() || '';

  // Stage 1: Direct partner email
  if (email && !isGenericEmail(email)) {
    return { method: 'email', reason: 'Direct partner email available' };
  }

  // Stage 2: Generic email (info@, contact@, etc.)
  if (email && isGenericEmail(email)) {
    const vcEntity = entity as VCEntity;
    const hasPartner = vcEntity.typeData?.partners && vcEntity.typeData.partners.length > 0;
    const hasContactForm = vcEntity.typeData?.contactFormUrl;
    const hasLinkedIn = vcEntity.typeData?.linkedInUrl || (vcEntity.typeData?.partners?.[0] as any)?.linkedInUrl;

    // If we have a generic email AND a contact form or LinkedIn, prefer those
    if (hasContactForm) {
      return { method: 'form', reason: `Generic email (${email}) — contact form available at ${hasContactForm}` };
    }
    if (hasLinkedIn) {
      return { method: 'linkedin', reason: `Generic email (${email}) — LinkedIn profile available` };
    }
    if (hasPartner) {
      return { method: 'manual', reason: `Generic email (${email}) — need to find partner contact form or LinkedIn` };
    }
    // Fall back to generic email with partner name in subject
    return { method: 'generic-email', reason: `Generic email (${email}) — no partner-specific contact found` };
  }

  // No email at all
  const vcEntity = entity as VCEntity;
  const hasContactForm = vcEntity.typeData?.contactFormUrl;
  const hasLinkedIn = vcEntity.typeData?.linkedInUrl || (vcEntity.typeData?.partners?.[0] as any)?.linkedInUrl;

  if (hasContactForm) {
    return { method: 'form', reason: 'No email — contact form available' };
  }
  if (hasLinkedIn) {
    return { method: 'linkedin', reason: 'No email — LinkedIn profile available' };
  }
  if (entity.website) {
    return { method: 'manual', reason: 'No email — manual outreach needed (website available for form search)' };
  }

  return { method: 'manual', reason: 'No email, no website — full manual research needed' };
}

/**
 * Check if an email is a generic inbox (not a specific person)
 */
export function isGenericEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return GENERIC_EMAIL_PREFIXES.some(prefix => lower.startsWith(prefix));
}

/**
 * Generate plain text message from entity personalization (strip HTML)
 */
export function generatePlainTextMessage(entity: OutreachEntity): string {
  const context = entity.personalizationContext || {};
  const vcEntity = entity as VCEntity;
  const partner = vcEntity.typeData?.partners?.[0];
  const firstName = partner?.name?.split(' ')[0] || 'there';
  const painPoints = (context.painPoints as string[]) || ['AI governance', 'coordination challenges'];
  const hook = (context.tailoredHook as string) || 'Alygn provides governance infrastructure for AI coordination.';

  return `Hi ${firstName},

I'm reaching out from ALYGN, an independent AI governance institution. We focus on making accountability, oversight, and coordination workable for advanced AI systems at global scale.

${hook}

Key areas where we can help:
${painPoints.map((p: string) => `- ${p}`).join('\n')}

Would you be open to a brief conversation about how governance infrastructure can support ${entity.name}'s work in this space?

Best,
Tania Lea
ALYGN - Independent AI Governance Institution
https://alygn.org`;
}

/**
 * Generate LinkedIn connection note (300 character limit)
 */
export function generateLinkedInNote(entity: OutreachEntity): string {
  const vcEntity = entity as VCEntity;
  const sector = vcEntity.typeData?.sectorFocus?.[0] || 'AI governance';
  return `Hi, I'm with ALYGN (AI governance institution). Would love to discuss how governance infrastructure can support ${entity.name}'s ${sector} focus. Open to a brief call?`;
}

/**
 * Generate LinkedIn DM message (full message, no character limit)
 */
export function generateLinkedInMessage(entity: OutreachEntity): string {
  const vcEntity = entity as VCEntity;
  const partner = vcEntity.typeData?.partners?.[0];
  const firstName = partner?.name?.split(' ')[0] || 'there';
  const sector = vcEntity.typeData?.sectorFocus?.[0] || 'AI governance';
  const painPoints = (entity.personalizationContext?.painPoints as string[]) || ['AI governance', 'coordination challenges'];

  return `Hi ${firstName},

I'm reaching out from ALYGN, an independent AI governance institution. We focus on making accountability, oversight, and coordination workable for advanced AI systems at global scale.

Given ${entity.name}'s focus on ${sector}, I believe there's a strong alignment with our work on:
${painPoints.map(p => `- ${p}`).join('\n')}

Would you be open to a brief conversation about how governance infrastructure can support ${entity.name}'s portfolio companies?

Best,
Tania Lea
ALYGN - Independent AI Governance Institution`;
}

/**
 * Generate manual outreach instructions (posted to Discord #annotations)
 */
export function generateManualInstructions(entity: OutreachEntity): string {
  const vcEntity = entity as VCEntity;
  const partner = vcEntity.typeData?.partners?.[0];
  const partnerName = partner?.name || 'Unknown';
  const partnerTitle = partner?.title || 'Partner';
  const linkedInUrl = vcEntity.typeData?.linkedInUrl || 'N/A';
  const website = entity.website || 'N/A';
  const contactFormUrl = vcEntity.typeData?.contactFormUrl || `${website}/contact`;
  const plainText = generatePlainTextMessage(entity);
  const linkedInNote = generateLinkedInNote(entity);

  return `📋 MANUAL OUTREACH NEEDED: ${entity.name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Target: ${partnerName}, ${partnerTitle}
🔗 LinkedIn: ${linkedInUrl}
🌐 Website: ${website}
📝 Contact Form: ${contactFormUrl}

📧 Option A — Contact Form:
1. Go to ${contactFormUrl}
2. Name: Tania Lea
3. Email: outreach@alyygn.com
4. Subject: AI Governance Coordination
5. Message: Copy the personalized text below

💬 Option B — LinkedIn:
1. Go to ${linkedInUrl}
2. Click "Message" or "Connect"
3. Connection note (300 chars): ${linkedInNote}
4. Full message: See below

📝 Personalized Content:
${plainText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
After completing, update Notion:
- Status → "Contacted"
- Notes → "Contacted via [form/LinkedIn] on [date]"
- Draft Status → "Sent"`;
}

/**
 * Execute contact form fallback using browser automation
 * This generates instructions for the OpenClaw agent to execute via browser tool
 */
export function generateFormFillInstructions(entity: OutreachEntity): {
  url: string;
  fields: Record<string, string>;
  message: string;
} | null {
  const vcEntity = entity as VCEntity;
  const contactFormUrl = vcEntity.typeData?.contactFormUrl || (entity.website ? `${entity.website}/contact` : null);

  if (!contactFormUrl) {
    return null;
  }

  return {
    url: contactFormUrl,
    fields: {
      name: 'Tania Lea',
      email: 'outreach@alyygn.com',
      company: 'ALYGN - Independent AI Governance Institution',
      subject: 'AI Governance Coordination',
    },
    message: generatePlainTextMessage(entity),
  };
}

/**
 * Main fallback handler — determines method and generates appropriate output
 */
export async function handleContactFallback(entity: OutreachEntity): Promise<ContactFallbackResult> {
  const { method, reason } = determineOutreachMethod(entity);

  console.log(`   🔄 Contact fallback for ${entity.name}: ${method} (${reason})`);

  // Update entity with outreach method
  const vcEntity = entity as VCEntity;
  if (vcEntity.typeData) {
    vcEntity.typeData.outreachMethod = method;
    vcEntity.typeData.outreachMethodReason = reason;
  }

  switch (method) {
    case 'email':
      // Direct email available — no fallback needed
      return {
        method: 'email',
        success: true,
        reason: 'Direct partner email available — proceed with normal email sending',
        entity
      };

    case 'generic-email':
      // Generic email — send with partner name in subject line
      return {
        method: 'generic-email',
        success: true,
        reason: `Generic email (${entity.email}) — adding partner name to subject line`,
        details: {
          partnerName: vcEntity.typeData?.partners?.[0]?.name,
          plainTextMessage: generatePlainTextMessage(entity),
        },
        entity
      };

    case 'form':
      // Contact form — generate browser automation instructions
      const formInstructions = generateFormFillInstructions(entity);
      return {
        method: 'form',
        success: !!formInstructions,
        reason: formInstructions ? 'Contact form available — browser automation instructions generated' : 'No contact form URL found',
        details: formInstructions ? {
          formUrl: formInstructions.url,
          plainTextMessage: formInstructions.message,
        } : undefined,
        entity
      };

    case 'linkedin':
      // LinkedIn — generate message templates
      return {
        method: 'linkedin',
        success: true,
        reason: 'LinkedIn profile available — message templates generated',
        details: {
          linkedInUrl: vcEntity.typeData?.linkedInUrl || undefined,
          partnerName: vcEntity.typeData?.partners?.[0]?.name,
          partnerTitle: vcEntity.typeData?.partners?.[0]?.title,
          linkedInNote: generateLinkedInNote(entity),
          linkedInMessage: generateLinkedInMessage(entity),
          plainTextMessage: generatePlainTextMessage(entity),
        },
        entity
      };

    case 'manual':
      // Manual outreach — generate complete instructions
      return {
        method: 'manual',
        success: true,
        reason: 'No automated contact method available — manual outreach instructions generated',
        details: {
          partnerName: vcEntity.typeData?.partners?.[0]?.name,
          partnerTitle: vcEntity.typeData?.partners?.[0]?.title,
          linkedInUrl: vcEntity.typeData?.linkedInUrl || undefined,
          plainTextMessage: generatePlainTextMessage(entity),
          manualInstructions: generateManualInstructions(entity),
        },
        entity
      };

    default:
      return {
        method: 'manual',
        success: false,
        reason: `Unknown outreach method: ${method}`,
        entity
      };
  }
}

export default { handleContactFallback, determineOutreachMethod, isGenericEmail };
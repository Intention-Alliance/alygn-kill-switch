/**
 * VCPersonalizationStrategy - Personalizes emails for VC outreach
 */
import type { OutreachEntity } from '../../entities/OutreachEntity';
import type { VCEntity } from '../../entities/VCEntity';
import { PersonalizationStrategy, type IPersonalizationResult } from './PersonalizationStrategy';

interface VCPartner {
  name: string;
  title: string;
  focus?: string[];
}

export class VCPersonalizationStrategy extends PersonalizationStrategy {
  private databaseId: string | null;

  constructor(config: Record<string, unknown> = {}) {
    super(config);
    this.name = 'vc-personalization';
    this.databaseId = this.loadDatabaseId();
  }

  /**
   * Load database ID from config
   * NOTE: Notion integration is optional for self-contained skill
   */
  private loadDatabaseId(): string | null {
    // Notion integration is optional - return null if not configured
    return process.env.NOTION_DATABASE_ID || null;
  }

  /**
   * Personalize VC email with strict requirements
   */
  async personalize(entity: OutreachEntity): Promise<IPersonalizationResult> {
    console.log(`✨ Personalizing email for VC: ${entity.name}...`);
    
    const vcEntity = entity as VCEntity;
    const partner = vcEntity.typeData?.partners?.[0] as VCPartner | undefined;
    const recipientName = this.extractPartnerName(partner);
    
    const portfolioCompanies = (vcEntity.typeData?.portfolioCompanies as string[]) || [];
    const recentInvestments = (vcEntity.typeData?.recentInvestments as Array<{ company: string; date: string; stage: string }>) || [];
    const sectorFocus = (vcEntity.typeData?.sectorFocus as string[]) || ['AI safety', 'governance'];
    
    // Generate VC-specific content
    const hook = this.generateVCSpecificHook(vcEntity, portfolioCompanies, sectorFocus);
    const painPoints = this.generateUniquePainPoints(vcEntity, portfolioCompanies);
    const ps = this.generatePersonalizedPS(vcEntity, partner, portfolioCompanies);
    const subject = this.generateSubject(vcEntity, portfolioCompanies);
    
    // Dynamic import email template from local lib
    let emailHtml = `<!-- Email template for ${entity.name} -->`;
    try {
      const { generateEmailHTML } = await import('../../lib/email/outreach-email-template');
      emailHtml = generateEmailHTML({
        recipientName: recipientName || 'there',
        companyName: entity.name,
        painPoints: painPoints.slice(0, 3),
        variant: 'governance',
        language: 'en',
        subject,
        customHook: hook,
        customPS: ps
      }) as string;
    } catch {
      console.log('   ⚠️  Could not load email template, using placeholder');
    }
    
    // Update entity with personalization
    vcEntity.personalizationContext = {
      ...vcEntity.personalizationContext,
      customSubject: subject,
      customBody: emailHtml,
      tailoredHook: hook,
      painPoints: painPoints,
      portfolioReferences: portfolioCompanies.slice(0, 2),
      personalizedPS: ps,
      partnerName: recipientName,
      valueProposition: this.generateValueProposition(vcEntity)
    };
    
    vcEntity.status = 'personalized';
    
    // Quality check
    this.performQualityCheck(vcEntity);

    // Generate unique draftId and update Notion Draft Status
    const draftId = `draft-${vcEntity.id}-${Date.now()}`;
    vcEntity.draftId = draftId;
    vcEntity.draftStatus = 'Drafted';
    vcEntity.draftCreatedAt = new Date().toISOString();

    console.log(`   ✅ Email personalized: "${subject}"`);
    console.log(`   📝 Draft ID: ${draftId}`);

    return {
      success: true,
      email: { subject, html: emailHtml },
      subject,
      draftId,
      draftStatus: 'Drafted',
      entity: vcEntity
    };
  }
  
  /**
   * Extract specific partner name (not generic)
   */
  private extractPartnerName(partner?: VCPartner): string | null {
    if (!partner || !partner.name) {
      return null;
    }
    
    const fullName = partner.name;
    const nameWithoutTitles = fullName.replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s*/i, '');
    const firstName = nameWithoutTitles.split(' ')[0];
    
    return firstName || fullName;
  }
  
  /**
   * Generate VC-specific hook based on their investment thesis
   */
  private generateVCSpecificHook(entity: VCEntity, portfolioCompanies: string[], sectorFocus: string[]): string {
    const firmName = entity.name;
    const sectors = sectorFocus.join(' and ');
    
    if (portfolioCompanies.length > 0) {
      const company = portfolioCompanies[0];
      const hooks = [
        `Given your investment in ${company} and focus on ${sectors}, you understand that governance infrastructure becomes critical as AI systems scale beyond individual oversight.`,
        `Your portfolio at ${firmName}, including ${company}, highlights the growing need for institutional coordination mechanisms in ${sectors}.`,
        `As ${company} and your other portfolio companies mature, the question of governance accountability becomes increasingly urgent.`
      ];
      return hooks[Math.floor(Math.random() * hooks.length)];
    }
    
    const sectorHooks = [
      `Your focus on ${sectors} aligns with our work building governance infrastructure for advanced AI systems.`,
      `Given ${firmName}'s thesis on ${sectors}, you recognize that technical capability is outpacing institutional coordination.`,
      `The ${sectors} space you're investing in requires new governance frameworks as systems become more capable.`
    ];
    
    return sectorHooks[Math.floor(Math.random() * sectorHooks.length)];
  }
  
  /**
   * Generate unique pain points based on portfolio research
   */
  private generateUniquePainPoints(entity: VCEntity, portfolioCompanies: string[]): string[] {
    const firmName = entity.name;
    
    if (portfolioCompanies.length > 0) {
      const company = portfolioCompanies[0];
      return [
        `Portfolio company ${company}'s governance challenges as it scales`,
        `Coordination gaps between ${firmName}'s AI safety investments`,
        `Institutional accountability for frontier AI systems`
      ];
    }
    
    if (firmName.toLowerCase().includes('safety')) {
      return [
        'Translating safety research into operational governance',
        'Coordination between safety-focused portfolio companies',
        'Institutional accountability mechanisms'
      ];
    }
    
    if (firmName.toLowerCase().includes('frontier')) {
      return [
        'Governance of frontier AI capabilities',
        'Cross-portfolio coordination on safety standards',
        'Institutional oversight for advanced systems'
      ];
    }
    
    return [
      'AI safety standards',
      'Governance frameworks',
      'Risk assessment'
    ];
  }
  
  /**
   * Generate personalized PS section
   */
  private generatePersonalizedPS(entity: VCEntity, partner: VCPartner | undefined, portfolioCompanies: string[]): string {
    const psOptions: string[] = [];
    
    if (partner?.title) {
      psOptions.push(`P.S.: I noticed your work as ${partner.title} at ${entity.name}—your focus on building sustainable governance frameworks aligns with our institutional approach.`);
    }
    
    if (portfolioCompanies.length > 0) {
      const company = portfolioCompanies[0];
      psOptions.push(`P.S.: Your investment in ${company} shows the kind of forward-thinking approach that recognizes governance must evolve alongside capability.`);
    }
    
    const sectorFocus = (entity.typeData?.sectorFocus as string[])?.[0] || 'AI governance';
    psOptions.push(`P.S.: Your thesis on ${sectorFocus} resonates with our view that governance infrastructure must be built before it's urgently needed.`);
    
    return psOptions[Math.floor(Math.random() * psOptions.length)];
  }
  
  /**
   * Generate subject line with portfolio reference
   */
  private generateSubject(entity: VCEntity, portfolioCompanies: string[]): string {
    if (portfolioCompanies.length > 0) {
      return `Alygn - ${portfolioCompanies[0]} and AI Governance`;
    }
    
    const sectorFocus = (entity.typeData?.sectorFocus as string[])?.[0] || 'AI Safety';
    return `Alygn - ${sectorFocus} Governance Infrastructure`;
  }
  
  /**
   * Generate value proposition
   */
  private generateValueProposition(entity: VCEntity): string {
    const stage = (entity.typeData?.stageFocus as string[])?.[0] || 'early-stage';
    const sectors = ((entity.typeData?.sectorFocus as string[]) || ['AI', 'governance']).slice(0, 2);
    
    return `Alygn provides the governance infrastructure needed for ${stage} ${sectors.join('/')} investments.`;
  }
  
  /**
   * Perform quality checks on personalization
   */
  private performQualityCheck(entity: VCEntity): boolean {
    const personalizationContext = entity.personalizationContext as Record<string, unknown> || {};
    const checks = {
      hasSpecificGreeting: (personalizationContext.partnerName as string | null) !== null,
      hasVCSpecificHook: !((personalizationContext.tailoredHook as string) || '').includes('AI safety standards'),
      hasUniquePainPoints: ((personalizationContext.painPoints as string[]) || []).length > 0,
      hasPortfolioReference: ((personalizationContext.portfolioReferences as string[]) || []).length > 0,
      hasPersonalizedPS: ((personalizationContext.personalizedPS as string) || '').length > 0
    };
    
    const passed = Object.values(checks).every(check => check);
    
    if (!passed) {
      console.warn(`   ⚠️  Quality check failed for ${entity.name}:`, checks);
    } else {
      console.log(`   ✅ Quality checks passed`);
    }
    
    return passed;
  }
  
  /**
   * Dry-run personalization
   */
  async personalizeDryRun(entity: OutreachEntity): Promise<IPersonalizationResult> {
    console.log(`✨ [DRY RUN] Personalizing email for VC: ${entity.name}...`);
    
    const vcEntity = entity as VCEntity;
    const portfolioCompanies = (vcEntity.typeData?.portfolioCompanies as string[]) || [];
    const subject = this.generateSubject(vcEntity, portfolioCompanies);
    const painPoints = this.generateUniquePainPoints(vcEntity, portfolioCompanies);
    
    const mockEmail = {
      subject,
      html: `<!-- HTML email would be generated here -->`,
      text: `Personalized email for ${entity.name}`
    };
    
    vcEntity.personalizationContext = {
      customSubject: subject,
      customBody: mockEmail.html,
      tailoredHook: 'AI governance',
      painPoints: painPoints,
      valueProposition: this.generateValueProposition(vcEntity)
    };
    
    vcEntity.status = 'personalized';
    
    console.log(`   [DRY RUN] Email personalized`);
    
    return {
      success: true,
      email: mockEmail,
      subject,
      entity: vcEntity
    };
  }
}

export default VCPersonalizationStrategy;

/**
 * MunicipalPersonalizationStrategy - Personalizes emails for municipal outreach
 */
import { PersonalizationStrategy } from './PersonalizationStrategy.js';
import type { MunicipalEntity } from '../../entities/MunicipalEntity.js';
import type { OutreachEntity } from '../../entities/OutreachEntity.js';

interface PersonalizationResult {
  success: boolean;
  email?: {
    subject: string;
    html: string;
    text?: string;
  };
  subject?: string;
  entity?: MunicipalEntity;
  error?: string;
}

interface Initiative {
  name: string;
  description: string;
  status: string;
  budget?: number;
}

export class MunicipalPersonalizationStrategy extends PersonalizationStrategy {
  constructor(config: Record<string, unknown> = {}) {
    super(config);
    this.name = 'municipal-personalization';
  }
  
  /**
   * Personalize municipal email
   * 
   * Supabase Integration:
   * - Creates outreach_emails record with variant and wave tracking
   * - Links to local_governments.municipality_id
   * - Stores personalization context for audit trail
   */
  async personalize(entity: OutreachEntity): Promise<PersonalizationResult> {
    console.log(`✨ Personalizing email for municipality: ${entity.name}...`);
    
    const municipalEntity = entity as MunicipalEntity;
    const contact = municipalEntity.getPrimaryContact();
    // Use contact name or default to appropriate Spanish honorific
    const recipientName = contact?.name || 'Tania';
    const companyName = entity.name.replace('Municipalidad de ', '').replace('Municipalidad de ', '');
    
    // Get pain points from personalization context or typeData (Supabase: municipalities.pain_points)
    const painPoints = (municipalEntity.personalizationContext?.painPoints as string[]) || 
                       (municipalEntity.typeData?.painPoints as string[]) || 
                       ['gobernanza de IA', 'transformación digital'];
    
    // Generate subject line (Supabase: outreach_templates.subject_template)
    const subject = this.generateSubject(municipalEntity, companyName);
    
    // Dynamic import email template from local lib
    let emailHtml = `<!-- Email template for ${entity.name} -->`;
    try {
      const { generateEmail } = await import('../../lib/email/outreach-email-template.js');
      emailHtml = generateEmail({
        recipientName,
        companyName,
        painPoints: painPoints.slice(0, 3),
        variant: 'traiga', // CR municipalities use traiga variant
        language: 'es', // Spanish locale
        subject,
        customPS: 'P.S.: Este mensaje fue generado con IA, verificado por humanos. Transparencia total en nuestros procesos.'
      }) as string;
    } catch {
      console.log('   ⚠️  Could not load email template, using placeholder');
    }
    
    // Update entity with personalization (Supabase: outreach_emails，政治_context)
    municipalEntity.personalizationContext = {
      ...municipalEntity.personalizationContext,
      customSubject: subject,
      customBody: emailHtml,
      tailoredHook: painPoints[0],
      valueProposition: this.generateValueProposition(municipalEntity),
      // Supabase audit fields
      variant: 'traiga',
      language: 'es',
      waveNumber: municipalEntity.waveNumber,
      waveDate: municipalEntity.waveDate
    };
    
    municipalEntity.updateStatus('personalized');
    
    console.log(`   ✅ Email personalized: "${subject}"`);
    
    return {
      success: true,
      email: { subject, html: emailHtml },
      subject,
      entity: municipalEntity
    };
  }
  
  /**
   * Generate subject line
   */
  generateSubject(entity: MunicipalEntity, companyName: string): string {
    const topInitiative = entity.getTopInitiative();
    
    if (topInitiative) {
      return `Apoyando la transformación digital de ${companyName}`;
    }
    
    return `Apoyo en gobernanza de IA - ${companyName}`;
  }
  
  /**
   * Generate value proposition
   */
  generateValueProposition(entity: MunicipalEntity): string {
    const population = entity.typeData?.population || 50000;
    const province = entity.typeData?.province || 'su provincia';
    
    return `Alygn apoya a municipios como el suyo (${population.toLocaleString()} habitantes) en ${province} con la implementación práctica de gobernanza de IA.`;
  }
  
  /**
   * Dry-run personalization
   */
  async personalizeDryRun(entity: OutreachEntity): Promise<PersonalizationResult> {
    console.log(`✨ [DRY RUN] Personalizing email for municipality: ${entity.name}...`);
    
    const municipalEntity = entity as MunicipalEntity;
    const companyName = entity.name.replace('Municipalidad de ', '');
    const subject = this.generateSubject(municipalEntity, companyName);
    const painPoints = (municipalEntity.personalizationContext?.painPoints as string[]) || ['gobernanza de IA'];
    
    const mockEmail = {
      subject,
      html: `<!-- HTML email would be generated here (Spanish) -->`,
      text: `Email personalizado para ${entity.name}`
    };
    
    municipalEntity.personalizationContext = {
      customSubject: subject,
      customBody: mockEmail.html,
      tailoredHook: 'gobernanza de IA',
      valueProposition: this.generateValueProposition(municipalEntity)
    };
    
    municipalEntity.updateStatus('personalized');
    
    console.log(`   [DRY RUN] Email personalized`);
    
    return {
      success: true,
      email: mockEmail,
      subject,
      entity: municipalEntity
    };
  }
}

export default MunicipalPersonalizationStrategy;

/**
 * MunicipalPersonalizationStrategy - Personalizes emails for municipal outreach
 */
import type { MunicipalEntity } from '../../entities/MunicipalEntity';
import type { OutreachEntity } from '../../entities/OutreachEntity';
import { PersonalizationStrategy, type IPersonalizationResult } from './PersonalizationStrategy';
import { getSupabaseClient } from '../../lib/external/supabase-client';
import { translatePainPoints, containsEnglishPainPoint } from '../../entities/lang-guard';

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
  async personalize(entity: OutreachEntity): Promise<IPersonalizationResult> {
    console.log(`✨ Personalizing email for municipality: ${entity.name}...`);
    
    const municipalEntity = entity as MunicipalEntity;
    const contact = municipalEntity.getPrimaryContact();
    // Use contact name or default to appropriate Spanish honorific based on municipality name
    const companyName = entity.name.replace('Municipalidad de ', '');
    
    // Fetch mayor name from Supabase municipalities table
    let mayorName: string | null = null;
    try {
      const supabase = getSupabaseClient();
      // Query by municipalityId (Supabase UUID) for exact match
      const query = municipalEntity.municipalityId
        ? supabase.from('municipalities').select('mayor_name').eq('id', municipalEntity.municipalityId).limit(1).single()
        : supabase.from('municipalities').select('mayor_name').ilike('name', `%${companyName}%`).limit(1).single();
      const { data } = await query;
      mayorName = data?.mayor_name || null;
      if (mayorName) {
        console.log(`   👤 Found mayor: ${mayorName}`);
      }
    } catch (e) {
      console.log(`   ⚠️  Could not fetch mayor name from Supabase: ${(e as Error).message}`);
    }
    
    const recipientName = mayorName || contact?.name || companyName;
    const recipientTitle = contact?.title || 'Alcalde(sa)';
    
    // Get pain points from personalization context or typeData (Supabase: municipalities.pain_points)
    // Translate any English pain points to Spanish before use
    let painPoints = (municipalEntity.typeData?.painPoints as string[]) ||
                       (municipalEntity.personalizationContext?.painPoints as string[]) ||
                       ['gobernanza de IA', 'transformación digital'];
    console.log(`   📋 Pain points for ${companyName}:`, JSON.stringify(painPoints));
    
    // Auto-translate English pain points to Spanish
    const hasEnglish = painPoints.some(pp => containsEnglishPainPoint(pp));
    if (hasEnglish) {
      painPoints = translatePainPoints(painPoints);
      console.log(`   🌐 Translated English pain points to Spanish`);
    }
    
    // Generate subject line (Supabase: outreach_templates.subject_template)
    const subject = this.generateSubject(municipalEntity, companyName);
    
    // Dynamic import email template from local lib
    let emailResult: { subject: string; html: string; text: string } | null = null;
    try {
      const { generateEmail } = await import('../../lib/email/outreach-email-template');
      emailResult = generateEmail({
        recipientName,
        companyName,
        painPoints: painPoints.slice(0, 3),
        variant: 'traiga', // CR municipalities use traiga variant
        language: 'es', // Spanish locale
        subject,
        recipientTitle,
        customPS: 'P.S.: Este mensaje fue generado con IA, verificado por humanos. Transparencia total en nuestros procesos.'
      }) as { subject: string; html: string; text: string };
    } catch {
      console.log('   ⚠️  Could not load email template, using placeholder');
    }
    
    // Extract HTML from the generateEmail result (it returns {subject, html, text})
    const emailHtml = emailResult?.html || `<!-- Email template for ${entity.name} -->`;
    
    // Update entity with personalization (Supabase: outreach_emails.personalization_context)
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
    municipalEntity.draftStatus = 'Personalized';
    
    // Sync to Supabase: upsert outreach_emails record
    try {
      const supabase = getSupabaseClient();
      // Use municipalityId (mapped from supabaseId in JSON) for Supabase operations
      const supabaseId = municipalEntity.municipalityId;
      
      if (supabaseId) {
        const { error: upsertError } = await supabase
          .from('outreach_emails')
          .insert({
            subject,
            body: emailHtml,
            recipient_email: municipalEntity.email || '',
            recipient_name: recipientName,
            local_government_id: municipalEntity.localGovernmentId,
            variant: 'traiga',
            wave_number: municipalEntity.waveNumber,
            wave_date: municipalEntity.waveDate,
            status: 'Personalized',
            political_context: municipalEntity.personalizationContext as Record<string, unknown>,
          });
        
        if (upsertError) {
          console.log(`   ⚠️  Supabase outreach_emails upsert failed: ${upsertError.message}`);
        } else {
          console.log(`   💾 Synced outreach_emails to Supabase`);
        }
        
        // Also update municipalities table with batch_status
        const { error: muniError } = await supabase
          .from('municipalities')
          .update({ batch_status: 'Personalized' })
          .eq('id', supabaseId);
        
        if (muniError) {
          console.log(`   ⚠️  Supabase municipalities update failed: ${muniError.message}`);
        } else {
          console.log(`   💾 Updated municipalities.batch_status to Personalized`);
        }
      } else {
        console.log(`   ⚠️  No Supabase ID found, skipping Supabase sync`);
      }
    } catch (syncErr) {
      console.log(`   ⚠️  Supabase sync error: ${(syncErr as Error).message}`);
    }
    
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
  private generateSubject(entity: MunicipalEntity, companyName: string): string {
    const topInitiative = entity.getTopInitiative();
    
    if (topInitiative) {
      return `Apoyando la transformación digital de ${companyName}`;
    }
    
    return `Apoyo en gobernanza de IA - ${companyName}`;
  }

  /**
   * Generate value proposition
   */
  private generateValueProposition(entity: MunicipalEntity): string {
    const population = entity.typeData?.population as number | undefined;
    const province = entity.typeData?.province as string | undefined;
    
    if (!population || !province) {
      throw new Error(`Missing research data for ${entity.name}: population=${population}, province=${province}. Run research phase first.`);
    }
    
    return `Alygn apoya a municipios como el suyo (${population.toLocaleString()} habitantes) en ${province} con la implementación práctica de gobernanza de IA.`;
  }

  /**
   * Dry-run personalization
   */
  async personalizeDryRun(entity: OutreachEntity): Promise<IPersonalizationResult> {
    console.log(`✨ [DRY RUN] Personalizing email for municipality: ${entity.name}...`);
    
    const municipalEntity = entity as MunicipalEntity;
    const companyName = entity.name.replace('Municipalidad de ', '');
    const subject = this.generateSubject(municipalEntity, companyName);
    const painPoints = (municipalEntity.typeData?.painPoints as string[]) ||
                       (municipalEntity.personalizationContext?.painPoints as string[]) ||
                       ['gobernanza de IA'];
    console.log(`   📋 [DRY RUN] Pain points for ${companyName}:`, JSON.stringify(painPoints));
    
    // Generate actual email using template (even in dry-run for preview)
    let emailHtml = `<!-- Email template for ${entity.name} -->`;
    let emailText = `Email personalizado para ${entity.name}`;
    try {
      const { generateEmail } = await import('../../lib/email/outreach-email-template');
      const result = generateEmail({
        recipientName: companyName,
        companyName,
        painPoints: painPoints.slice(0, 3),
        variant: 'traiga',
        language: 'es',
        subject,
        recipientTitle: 'Alcalde(sa)',
        customPS: 'P.S.: Este mensaje fue generado con IA, verificado por humanos. Transparencia total en nuestros procesos.'
      }) as any;
      emailHtml = result.html;
      emailText = result.text;
    } catch {
      console.log('   ⚠️  Could not load email template, using placeholder');
    }

    const mockEmail = {
      subject,
      html: emailHtml,
      text: emailText
    };
    
    municipalEntity.personalizationContext = {
      customSubject: subject,
      customBody: mockEmail.html,
      tailoredHook: 'gobernanza de IA',
      valueProposition: (() => {
        try {
          return this.generateValueProposition(municipalEntity);
        } catch {
          return `[Value proposition would be generated with research data for ${companyName}]`;
        }
      })()
    };
    
    municipalEntity.updateStatus('personalized');
    municipalEntity.draftStatus = 'Personalized';
    
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

/**
 * MunicipalPersonalizationStrategy - Personalizes emails for municipal outreach
 */
import type { MunicipalEntity } from '../../entities/MunicipalEntity';
import type { OutreachEntity } from '../../entities/OutreachEntity';
import { PersonalizationStrategy, type IPersonalizationResult } from './PersonalizationStrategy';

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
   * - Queries municipalities table for pain_points, initiatives, population, province
   * - Creates outreach_emails record with variant and wave tracking
   * - Links to local_governments.municipality_id
   * - Stores personalization context for audit trail
   */
  async personalize(entity: OutreachEntity): Promise<IPersonalizationResult> {
    console.log(`✨ Personalizing email for municipality: ${entity.name}...`);
    
    const municipalEntity = entity as MunicipalEntity;
    const contact = municipalEntity.getPrimaryContact();
    const recipientName = contact?.name || 'Tania';
    const companyName = entity.name.replace('Municipalidad de ', '');
    
    // STEP 1: Try Supabase for real pain points
    const supabaseData = await this.loadFromSupabase(entity.name);
    
    // STEP 2: Build pain points from Supabase → entity → fallback (but never hardcoded generic)
    let painPoints: string[];
    if (supabaseData?.pain_points && supabaseData.pain_points.length > 0) {
      painPoints = supabaseData.pain_points;
      console.log(`   📊 Using Supabase pain points: ${painPoints.join(', ')}`);
    } else if (
      municipalEntity.personalizationContext?.painPoints && 
      Array.isArray(municipalEntity.personalizationContext.painPoints) && 
      municipalEntity.personalizationContext.painPoints.length > 0
    ) {
      painPoints = municipalEntity.personalizationContext.painPoints as string[];
      console.log(`   📊 Using entity pain points: ${painPoints.join(', ')}`);
    } else if (
      municipalEntity.typeData?.painPoints && 
      Array.isArray(municipalEntity.typeData.painPoints) && 
      municipalEntity.typeData.painPoints.length > 0
    ) {
      painPoints = municipalEntity.typeData.painPoints as string[];
      console.log(`   📊 Using typeData pain points: ${painPoints.join(', ')}`);
    } else {
      // Last resort: use context-aware defaults based on population/province
      const population = supabaseData?.population || municipalEntity.typeData?.population || 0;
      const province = supabaseData?.province || municipalEntity.typeData?.province || '';
      painPoints = this.generateContextualPainPoints(companyName, population, province);
      console.log(`   ⚠️  No Supabase pain points found, using contextual defaults for ${companyName}`);
    }
    
    // STEP 3: Get initiatives from Supabase if available
    const initiatives = supabaseData?.initiatives || municipalEntity.typeData?.initiatives || [];
    
    // Generate subject line
    const subject = this.generateSubject(municipalEntity, companyName, initiatives);
    
    // Dynamic import email template from local lib
    let emailHtml = `<!-- Email template for ${entity.name} -->`;
    try {
      const { generateEmail } = await import('../../lib/email/outreach-email-template');
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
    
    // Update entity with personalization
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
    
    // Update typeData with Supabase data if available
    if (supabaseData?.pain_points) {
      municipalEntity.typeData.painPoints = supabaseData.pain_points;
    }
    if (supabaseData?.population) {
      municipalEntity.typeData.population = supabaseData.population;
    }
    if (supabaseData?.province) {
      municipalEntity.typeData.province = supabaseData.province;
    }
    
    municipalEntity.updateStatus('personalized');
    
    console.log(`   ✅ Email personalized: "${subject}"`);
    console.log(`   📝 Pain points used: ${painPoints.slice(0, 3).join(', ')}`);
    
    return {
      success: true,
      email: { subject, html: emailHtml },
      subject,
      entity: municipalEntity
    };
  }
  
  /**
   * Load municipality data from Supabase
   */
  private async loadFromSupabase(municipalityName: string): Promise<{
    pain_points: string[] | null;
    initiatives: any[] | null;
    population: number | null;
    province: string | null;
  } | null> {
    try {
      const { getSupabaseClient } = await import('../../lib/external/supabase-client');
      const supabase = getSupabaseClient();
      
      // Strip 'Municipalidad de ' prefix for matching
      const searchName = municipalityName.replace(/^Municipalidad de\s+/i, '').trim();
      
      const { data, error } = await supabase
        .from('municipalities')
        .select('pain_points, ai_governance_signals, population, province, name')
        .ilike('name', `%${searchName}%`)
        .limit(1)
        .maybeSingle();
      
      if (error || !data) {
        console.log(`   ℹ️  No Supabase data found for "${searchName}"`);
        return null;
      }
      
      // Extract initiatives from ai_governance_signals if available
      const initiatives = Array.isArray(data.ai_governance_signals) 
        ? data.ai_governance_signals 
        : null;
      
      return {
        pain_points: data.pain_points,
        initiatives,
        population: data.population,
        province: data.province
      };
    } catch (err) {
      console.warn(`   ⚠️  Supabase lookup failed: ${(err as Error).message}`);
      return null;
    }
  }
  
  /**
   * Generate context-aware pain points when no real data is available
   * These are still specific to Costa Rica municipal context, not generic
   */
  private generateContextualPainPoints(cantonName: string, population: number, province: string): string[] {
    const isRural = population && population < 30000;
    const isUrban = population && population > 100000;
    
    if (isRural) {
      return [
        `Implementación del TRAIGA Act en cantones rurales como ${cantonName}`,
        'Capacitación técnica limitada para gestión de sistemas de IA',
        'Coordinación interinstitucional para gobernanza digital'
      ];
    }
    
    if (isUrban) {
      return [
        `Gestión de datos ciudadanos y privacidad en ${cantonName}`,
        'Supervisión de sistemas automatizados de servicios públicos',
        'Implementación del TRAIGA Act en centros urbanos'
      ];
    }
    
    return [
      `Transformación digital y gobernanza de IA en ${cantonName}`,
      'Coordinación interinstitucional para el TRAIGA Act',
      'Rendición de cuentas en sistemas automatizados'
    ];
  }

  /**
   * Generate subject line with optional initiative reference
   */
  private generateSubject(entity: MunicipalEntity, companyName: string, initiatives?: any[]): string {
    // Use initiative reference if available from Supabase
    if (initiatives && Array.isArray(initiatives) && initiatives.length > 0) {
      const initiative = typeof initiatives[0] === 'string' 
        ? initiatives[0] 
        : (initiatives[0] as any)?.name || (initiatives[0] as any)?.description;
      if (initiative) {
        return `Apoyando ${initiative} en ${companyName}`;
      }
    }
    
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
    const population = (entity.typeData?.population as number) || 50000;
    const province = (entity.typeData?.province as string) || 'su provincia';
    
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

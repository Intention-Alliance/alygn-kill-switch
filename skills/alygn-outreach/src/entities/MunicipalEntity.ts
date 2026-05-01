/**
 * MunicipalEntity - Municipality/City government entity
 * 
 * Supabase Schema Alignment:
 * - Uses `municipalities` table with proper column names
 * - Links to `local_governments` and `political_figures` via foreign keys
 * - Supports `local_governments.municipality_id` relationship
 */
import { OutreachEntity } from './OutreachEntity';
import type { ICostaRicaCanton, IMunicipalTypeData } from './types';
import { assertSpanishPainPoints, translatePainPoints, validateMunicipalSpanishIntegrity } from './lang-guard';

export type { ICostaRicaCanton, IMunicipalTypeData };

// Re-export COSTA_RICA_CANTONES for backwards compatibility
  export { COSTA_RICA_CANTONES } from './municipal-data';

export class MunicipalEntity extends OutreachEntity {
  typeData: IMunicipalTypeData;
  
  // Supabase columns not in base entity
  waveNumber: number | null;
  waveDate: string | null;
  batchStatus: string | null;
  municipalityId: string | null; // Supabase primary key
  localGovernmentId: string | null; // FK to local_governments
  outreachVariant: string | null;
  outreachSentAt: string | null;
  repliedAt: string | null;
  replySentiment: string | null;
  verifiedAt: string | null;
  researchedAt: string | null;
  xHandle: string | null;
  xUrl: string | null;
  xWarmupPhase1At: string | null;
  xWarmupPhase2At: string | null;
  xEngagementCount: number | null;
  xLastEngagementAt: string | null;

  constructor(data: Partial<IMunicipalTypeData> & { typeData?: Partial<IMunicipalTypeData>; [key: string]: unknown } = {}) {
    super({ ...data, type: 'municipal' });
    
    // Municipal-specific data
    let painPoints = data.typeData?.painPoints || data.painPoints || [];
    
    // B-001 Data Integrity Guard: Auto-translate English pain points to Spanish
    // Prevents English content from slipping into Costa Rica municipal data
    if (painPoints.length > 0) {
      painPoints = translatePainPoints(painPoints);
    }
    
    this.typeData = {
      governmentType: data.typeData?.governmentType || data.governmentType || 'city',
      population: data.typeData?.population ?? data.population ?? null,
      budget: data.typeData?.budget ?? data.budget ?? null,
      departments: data.typeData?.departments || data.departments || [],
      keyContacts: data.typeData?.keyContacts || data.keyContacts || [],
      initiatives: data.typeData?.initiatives || data.initiatives || [],
      painPoints,
      currentVendors: data.typeData?.currentVendors || data.currentVendors || [],
      procurementProcess: data.typeData?.procurementProcess ?? data.procurementProcess ?? null,
      decisionMakers: data.typeData?.decisionMakers || data.decisionMakers || [],
      province: data.typeData?.province ?? data.province ?? null,
      trAigaRelevant: data.typeData?.trAigaRelevant ?? data.trAigaRelevant ?? false
    };
    
    // Supabase column mappings
    this.waveNumber = (data.waveNumber as number | null) ?? data.wave_number ?? null;
    this.waveDate = (data.waveDate as string | null) ?? data.wave_date ?? null;
    this.batchStatus = (data.batchStatus as string | null) ?? data.batch_status ?? null;
    this.municipalityId = (data.municipalityId as string | null) ?? (data.supabaseId as string | null) ?? data.id ?? null;
    this.localGovernmentId = (data.localGovernmentId as string | null) ?? null;
    this.outreachVariant = (data.outreachVariant as string | null) ?? null;
    this.outreachSentAt = (data.outreachSentAt as string | null) ?? null;
    this.repliedAt = (data.repliedAt as string | null) ?? null;
    this.replySentiment = (data.replySentiment as string | null) ?? null;
    this.verifiedAt = (data.verifiedAt as string | null) ?? null;
    this.researchedAt = (data.researchedAt as string | null) ?? null;
    this.xHandle = (data.xHandle as string | null) ?? null;
    this.xUrl = (data.xUrl as string | null) ?? null;
    this.xWarmupPhase1At = (data.xWarmupPhase1At as string | null) ?? null;
    this.xWarmupPhase2At = (data.xWarmupPhase2At as string | null) ?? null;
    this.xEngagementCount = (data.xEngagementCount as number | null) ?? null;
    this.xLastEngagementAt = (data.xLastEngagementAt as string | null) ?? null;
  }
  
  /**
   * Get primary contact for outreach
   */
  getPrimaryContact(): { name: string; title: string; isDecisionMaker: boolean } | null {
    // Prefer decision makers
    if (this.typeData.decisionMakers && this.typeData.decisionMakers.length > 0) {
      const dm = this.typeData.decisionMakers.find(d => d.influence === 'high') || 
                 this.typeData.decisionMakers[0];
      return {
        name: dm.name,
        title: dm.title,
        isDecisionMaker: true
      };
    }
    
    // Fall back to key contacts
    if (this.typeData.keyContacts && this.typeData.keyContacts.length > 0) {
      const kc = this.typeData.keyContacts[0];
      return {
        name: kc.name,
        title: kc.title,
        isDecisionMaker: kc.isDecisionMaker
      };
    }
    
    return null;
  }
  
  /**
   * Get top initiative
   */
  getTopInitiative(): { name: string; description: string; status: string; budget?: number } | null {
    if (!this.typeData.initiatives || this.typeData.initiatives.length === 0) {
      return null;
    }
    
    // Prefer active initiatives
    const active = this.typeData.initiatives.find(i => i.status === 'active');
    if (active) return active;
    
    return this.typeData.initiatives[0];
  }
  
  /**
   * Check if municipality matches target criteria
   */
  matchesCriteria(criteria: {
    populationMin?: number;
    populationMax?: number;
    governmentTypes?: string[];
    regions?: string[];
  }): boolean {
    if (criteria.populationMin && this.typeData.population) {
      if (this.typeData.population < criteria.populationMin) return false;
    }
    
    if (criteria.populationMax && this.typeData.population) {
      if (this.typeData.population > criteria.populationMax) return false;
    }
    
    if (criteria.governmentTypes && criteria.governmentTypes.length > 0) {
      if (!criteria.governmentTypes.includes(this.typeData.governmentType || '')) return false;
    }
    
    if (criteria.regions && criteria.regions.length > 0) {
      const region = this.location.region || this.typeData.province;
      if (!criteria.regions.some(r => region?.toLowerCase().includes(r.toLowerCase()))) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Convert to plain object for Supabase upsert
   */
  toJSON(): ReturnType<OutreachEntity['toJSON']> & { 
    typeData: IMunicipalTypeData;
    // Supabase columns
    waveNumber: number | null;
    waveDate: string | null;
    batchStatus: string | null;
    municipalityId: string | null;
    localGovernmentId: string | null;
    outreachVariant: string | null;
    outreachSentAt: string | null;
    repliedAt: string | null;
    replySentiment: string | null;
    verifiedAt: string | null;
    researchedAt: string | null;
    xHandle: string | null;
    xUrl: string | null;
    xWarmupPhase1At: string | null;
    xWarmupPhase2At: string | null;
    xEngagementCount: number | null;
    xLastEngagementAt: string | null;
  } {
    return {
      ...super.toJSON(),
      typeData: this.typeData,
      // Supabase columns
      waveNumber: this.waveNumber,
      waveDate: this.waveDate,
      batchStatus: this.batchStatus,
      municipalityId: this.municipalityId,
      localGovernmentId: this.localGovernmentId,
      outreachVariant: this.outreachVariant,
      outreachSentAt: this.outreachSentAt,
      repliedAt: this.repliedAt,
      replySentiment: this.replySentiment,
      verifiedAt: this.verifiedAt,
      researchedAt: this.researchedAt,
      xHandle: this.xHandle,
      xUrl: this.xUrl,
      xWarmupPhase1At: this.xWarmupPhase1At,
      xWarmupPhase2At: this.xWarmupPhase2At,
      xEngagementCount: this.xEngagementCount,
      xLastEngagementAt: this.xLastEngagementAt
    };
  }
  
  /**
   * Create from plain object
   */
  static fromJSON(data: Record<string, unknown>): MunicipalEntity {
    return new MunicipalEntity(data as Parameters<typeof MunicipalEntity.prototype.constructor>[0]);
  }
  
  /**
   * Create from Costa Rica canton data
   * Maps to Supabase `municipalities` table columns
   */
  static fromCanton(canton: ICostaRicaCanton): MunicipalEntity {
    // B-001: Canonical Spanish pain points for Costa Rica municipalities
    // These are the ONLY pain points used for CR municipal outreach
    const PAIN_POINTS_CR = [
      'Complejidad de la transformación digital',
      'Recursos técnicos limitados',
      'Entrega de servicios ciudadanos',
      'Gobernanza de datos y privacidad',
      'Coordinación interinstitucional'
    ] as const;
    
    return new MunicipalEntity({
      name: `Municipalidad de ${canton.name}`,
      type: 'municipal',
      location: {
        city: canton.name,
        state: canton.province,
        country: 'Costa Rica',
        region: canton.province
      },
      status: 'discovered',
      priority: canton.population > 50000 ? 'high' : 'medium',
      // Supabase column mapping
      email: null, // Set separately after research
      website: null,
      phone: null,
      typeData: {
        governmentType: 'city',
        population: canton.population,
        budget: canton.budget,
        province: canton.province,
        departments: [
          { name: 'Tecnología', focus: ['transformación digital'] },
          { name: 'Planificación', focus: ['ciudad inteligente'] }
        ],
        painPoints: [...PAIN_POINTS_CR],
        trAigaRelevant: true
      },
      discoveredAt: new Date(),
      waveNumber: null,
      waveDate: null,
      batchStatus: null
    });
  }
}

export default MunicipalEntity;

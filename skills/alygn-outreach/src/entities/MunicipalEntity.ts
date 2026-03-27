/**
 * MunicipalEntity - Municipality/City government entity
 * 
 * Supabase Schema Alignment:
 * - Uses `municipalities` table with proper column names
 * - Links to `local_governments` and `political_figures` via foreign keys
 * - Supports `local_governments.municipality_id` relationship
 */
import { OutreachEntity } from './OutreachEntity.js';
import type { IMunicipalTypeData, IDepartment, IKeyContact, IInitiative, IDecisionMaker, ICostaRicaCanton } from './types.js';

export type { IMunicipalTypeData, IDepartment, IKeyContact, IInitiative, IDecisionMaker, ICostaRicaCanton };

// Costa Rica cantones data
export const COSTA_RICA_CANTONES: ICostaRicaCanton[] = [
  { name: 'San José', province: 'San José', population: 288054, budget: 150000000 },
  { name: 'Escazú', province: 'San José', population: 91117, budget: 45000000 },
  { name: 'Desamparados', province: 'San José', population: 208741, budget: 80000000 },
  { name: 'Puriscal', province: 'San José', population: 33484, budget: 25000000 },
  { name: 'Tarrazú', province: 'San José', population: 16260, budget: 18000000 },
  { name: 'Aserrí', province: 'San José', population: 58912, budget: 35000000 },
  { name: 'Mora', province: 'San José', population: 28378, budget: 22000000 },
  { name: 'Goicoechea', province: 'San José', population: 133022, budget: 60000000 },
  { name: 'Santa Ana', province: 'San José', population: 67496, budget: 40000000 },
  { name: 'Alajuelita', province: 'San José', population: 89148, budget: 38000000 },
  { name: 'Vázquez de Coronado', province: 'San José', population: 60882, budget: 32000000 },
  { name: 'Acosta', province: 'San José', population: 19734, budget: 15000000 },
  { name: 'Tibás', province: 'San José', population: 82409, budget: 42000000 },
  { name: 'Moravia', province: 'San José', population: 57182, budget: 30000000 },
  { name: 'Montes de Oca', province: 'San José', population: 56935, budget: 35000000 },
  { name: 'Turrubares', province: 'San José', population: 6964, budget: 8000000 },
  { name: 'Dota', province: 'San José', population: 9924, budget: 10000000 },
  { name: 'Curridabat', province: 'San José', population: 77232, budget: 45000000 },
  { name: 'Pérez Zeledón', province: 'San José', population: 134534, budget: 65000000 },
  { name: 'León Cortés', province: 'San José', population: 11379, budget: 12000000 },
  { name: 'Alajuela', province: 'Alajuela', population: 254212, budget: 120000000 },
  { name: 'San Ramón', province: 'Alajuela', population: 82985, budget: 45000000 },
  { name: 'Grecia', province: 'Alajuela', population: 76902, budget: 40000000 },
  { name: 'San Mateo', province: 'Alajuela', population: 6325, budget: 8000000 },
  { name: 'Atenas', province: 'Alajuela', population: 25585, budget: 20000000 },
  { name: 'Naranjo', province: 'Alajuela', population: 42918, budget: 28000000 },
  { name: 'Palmares', province: 'Alajuela', population: 37696, budget: 25000000 },
  { name: 'Poás', province: 'Alajuela', population: 29703, budget: 22000000 },
  { name: 'Orotina', province: 'Alajuela', population: 22088, budget: 18000000 },
  { name: 'San Carlos', province: 'Alajuela', population: 163745, budget: 75000000 },
  { name: 'Zarcero', province: 'Alajuela', population: 13671, budget: 15000000 },
  { name: 'Sarchí', province: 'Alajuela', population: 18205, budget: 16000000 },
  { name: 'Upala', province: 'Alajuela', population: 43453, budget: 30000000 },
  { name: 'Los Chiles', province: 'Alajuela', population: 23535, budget: 20000000 },
  { name: 'Guatuso', province: 'Alajuela', population: 15367, budget: 14000000 },
  { name: 'Río Cuarto', province: 'Alajuela', population: 11980, budget: 12000000 },
  { name: 'Cartago', province: 'Cartago', population: 147898, budget: 80000000 },
  { name: 'Paraíso', province: 'Cartago', population: 57543, budget: 35000000 },
  { name: 'La Unión', province: 'Cartago', population: 99788, budget: 50000000 },
  { name: 'Jiménez', province: 'Cartago', population: 14507, budget: 15000000 },
  { name: 'Turrialba', province: 'Cartago', population: 70386, budget: 42000000 },
  { name: 'Alvarado', province: 'Cartago', population: 14512, budget: 15000000 },
  { name: 'Oreamuno', province: 'Cartago', population: 45473, budget: 28000000 },
  { name: 'El Guarco', province: 'Cartago', population: 41616, budget: 25000000 },
  { name: 'Heredia', province: 'Heredia', population: 123616, budget: 70000000 },
  { name: 'Barva', province: 'Heredia', population: 40660, budget: 25000000 },
  { name: 'Santo Domingo', province: 'Heredia', population: 40585, budget: 25000000 },
  { name: 'Santa Barbara', province: 'Heredia', population: 33697, budget: 22000000 },
  { name: 'San Rafael', province: 'Heredia', population: 45965, budget: 28000000 },
  { name: 'San Isidro', province: 'Heredia', population: 20633, budget: 18000000 },
  { name: 'Belén', province: 'Heredia', population: 21333, budget: 20000000 },
  { name: 'Flores', province: 'Heredia', population: 20180, budget: 18000000 },
  { name: 'San Pablo', province: 'Heredia', population: 27479, budget: 22000000 },
  { name: 'Sarapiquí', province: 'Heredia', population: 57247, budget: 35000000 },
  { name: 'Liberia', province: 'Guanacaste', population: 62088, budget: 40000000 },
  { name: 'Nicoya', province: 'Guanacaste', population: 50925, budget: 35000000 },
  { name: 'Santa Cruz', province: 'Guanacaste', population: 55385, budget: 35000000 },
  { name: 'Bagaces', province: 'Guanacaste', population: 19967, budget: 18000000 },
  { name: 'Carrillo', province: 'Guanacaste', population: 37502, budget: 25000000 },
  { name: 'Cañas', province: 'Guanacaste', population: 26570, budget: 20000000 },
  { name: 'Abangares', province: 'Guanacaste', population: 18039, budget: 15000000 },
  { name: 'Tilarán', province: 'Guanacaste', population: 19215, budget: 16000000 },
  { name: 'Nandayure', province: 'Guanacaste', population: 11121, budget: 12000000 },
  { name: 'La Cruz', province: 'Guanacaste', population: 23996, budget: 18000000 },
  { name: 'Hojancha', province: 'Guanacaste', population: 7478, budget: 10000000 },
  { name: 'Puntarenas', province: 'Puntarenas', population: 115432, budget: 65000000 },
  { name: 'Esparza', province: 'Puntarenas', population: 28609, budget: 22000000 },
  { name: 'Buenos Aires', province: 'Puntarenas', population: 41881, budget: 28000000 },
  { name: 'Montes de Oro', province: 'Puntarenas', population: 13020, budget: 14000000 },
  { name: 'Osa', province: 'Puntarenas', population: 29433, budget: 22000000 },
  { name: 'Golfito', province: 'Puntarenas', population: 39282, budget: 25000000 },
  { name: 'Coto Brus', province: 'Puntarenas', population: 38453, budget: 24000000 },
  { name: 'Parrita', province: 'Puntarenas', population: 16830, budget: 16000000 },
  { name: 'Corredores', province: 'Puntarenas', population: 41698, budget: 28000000 },
  { name: 'Garabito', province: 'Puntarenas', population: 17229, budget: 15000000 },
  { name: 'Monteverde', province: 'Puntarenas', population: 6525, budget: 10000000 },
  { name: 'Puerto Jiménez', province: 'Puntarenas', population: 8721, budget: 11000000 },
  { name: 'Limón', province: 'Limón', population: 94001, budget: 55000000 },
  { name: 'Pococí', province: 'Limón', population: 128822, budget: 65000000 },
  { name: 'Siquirres', province: 'Limón', population: 56645, budget: 38000000 },
  { name: 'Talamanca', province: 'Limón', population: 30993, budget: 25000000 },
  { name: 'Matina', province: 'Limón', population: 37562, budget: 28000000 },
  { name: 'Guácimo', province: 'Limón', population: 41266, budget: 30000000 }
];

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
    this.typeData = {
      governmentType: data.typeData?.governmentType || data.governmentType || 'city',
      population: data.typeData?.population ?? data.population ?? null,
      budget: data.typeData?.budget ?? data.budget ?? null,
      departments: data.typeData?.departments || data.departments || [],
      keyContacts: data.typeData?.keyContacts || data.keyContacts || [],
      initiatives: data.typeData?.initiatives || data.initiatives || [],
      painPoints: data.typeData?.painPoints || data.painPoints || [],
      currentVendors: data.typeData?.currentVendors || data.currentVendors || [],
      procurementProcess: data.typeData?.procurementProcess ?? data.procurementProcess ?? null,
      decisionMakers: data.typeData?.decisionMakers || data.decisionMakers || [],
      province: data.typeData?.province ?? data.province ?? null,
      trAigaRelevant: data.typeData?.trAigaRelevant ?? data.trAigaRelevant ?? false
    };
    
    // Supabase column mappings
    this.waveNumber = (data.waveNumber as number | null) ?? null;
    this.waveDate = (data.waveDate as string | null) ?? null;
    this.batchStatus = (data.batchStatus as string | null) ?? null;
    this.municipalityId = (data.municipalityId as string | null) ?? data.id ?? null;
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
  getTopInitiative(): IInitiative | null {
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
      if (!criteria.governmentTypes.includes(this.typeData.governmentType)) return false;
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
      // email field maps to general_email or mayor_email
      email: null, // Set separately after research
      // website maps to website_url
      website: null,
      // phone maps to phone
      phone: null,
      typeData: {
        governmentType: 'city',
        population: canton.population,
        budget: canton.budget,
        province: canton.province,
        departments: [
          { name: 'Tecnología', focus: ['digital transformation'] },
          { name: 'Planificación', focus: ['smart city'] }
        ],
        painPoints: ['Digital transformation', 'Citizen services', 'Data governance'],
        trAigaRelevant: true
      },
      // Supabase audit fields (not directly on entity)
      discoveredAt: new Date(),
      // Wave tracking (Supabase: municipalities.wave_number, municipalities.wave_date)
      waveNumber: null,
      waveDate: null,
      // Batch status (Supabase: municipalities.batch_status)
      batchStatus: null
    });
  }
}

export default MunicipalEntity;

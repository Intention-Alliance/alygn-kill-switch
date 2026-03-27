/**
 * VCEntity - Venture Capital firm entity
 * 
 * Supabase Schema Alignment:
 * - VCs are tracked via political_figures table with is_decision_maker=true
 * - Or via separate vc_outreach table (if exists)
 * - Links to local_governments for municipal VC relationships
 */
import { OutreachEntity } from './OutreachEntity';
import type { IRecentInvestment, IVCPartner, IVCTypeData } from './types';

export type { IRecentInvestment, IVCPartner, IVCTypeData };

export class VCEntity extends OutreachEntity {
  typeData: IVCTypeData;

  constructor(data: Partial<IVCTypeData> & { typeData?: Partial<IVCTypeData>; [key: string]: unknown } = {}) {
    super({ ...data, type: 'vc' });
    
    // VC-specific data
    this.typeData = {
      firmType: data.typeData?.firmType || data.firmType || 'vc',
      stageFocus: data.typeData?.stageFocus || data.stageFocus || [],
      sectorFocus: data.typeData?.sectorFocus || data.sectorFocus || [],
      checkSizeMin: data.typeData?.checkSizeMin ?? data.checkSizeMin ?? null,
      checkSizeMax: data.typeData?.checkSizeMax ?? data.checkSizeMax ?? null,
      aum: data.typeData?.aum ?? data.aum ?? null,
      partners: data.typeData?.partners || data.partners || [],
      portfolioCompanies: data.typeData?.portfolioCompanies || data.portfolioCompanies || [],
      recentInvestments: data.typeData?.recentInvestments || data.recentInvestments || [],
      linkedInUrl: data.typeData?.linkedInUrl ?? data.linkedInUrl ?? null,
      crunchbaseUrl: data.typeData?.crunchbaseUrl ?? data.crunchbaseUrl ?? null,
      relevanceScore: data.typeData?.relevanceScore ?? data.relevanceScore ?? null
    };
  }
  
  /**
   * Get primary partner for outreach
   */
  getPrimaryPartner(): IVCPartner | null {
    if (!this.typeData.partners || this.typeData.partners.length === 0) {
      return null;
    }
    
    // Prefer partners with AI/governance focus
    const governanceKeywords = ['AI', 'safety', 'governance', 'alignment', 'ethics', 'policy'];
    const governancePartner = this.typeData.partners.find(p => 
      governanceKeywords.some(kw => 
        ((p.focus || p.title) as string || '').toLowerCase().includes(kw.toLowerCase())
      )
    );
    
    return governancePartner || this.typeData.partners[0];
  }
  
  /**
   * Check if firm matches target criteria
   */
  matchesCriteria(criteria: {
    stages?: string[];
    sectors?: string[];
    checkSizeMin?: number;
    checkSizeMax?: number;
  }): boolean {
    if (criteria.stages && criteria.stages.length > 0) {
      const hasMatchingStage = (this.typeData.stageFocus || []).some(
        stage => criteria.stages!.includes(stage.toLowerCase())
      );
      if (!hasMatchingStage) return false;
    }
    
    if (criteria.sectors && criteria.sectors.length > 0) {
      const hasMatchingSector = (this.typeData.sectorFocus || []).some(
        sector => criteria.sectors!.some(cs => sector.toLowerCase().includes(cs.toLowerCase()))
      );
      if (!hasMatchingSector) return false;
    }
    
    if (criteria.checkSizeMin && this.typeData.checkSizeMax) {
      if (this.typeData.checkSizeMax < criteria.checkSizeMin) return false;
    }
    
    if (criteria.checkSizeMax && this.typeData.checkSizeMin) {
      if (this.typeData.checkSizeMin > criteria.checkSizeMax) return false;
    }
    
    return true;
  }
  
  /**
   * Convert to plain object
   */
  toJSON(): ReturnType<OutreachEntity['toJSON']> & { typeData: IVCTypeData } {
    return {
      ...super.toJSON(),
      typeData: this.typeData
    };
  }
  
  /**
   * Create from plain object
   */
  static fromJSON(data: Record<string, unknown>): VCEntity {
    return new VCEntity(data as Parameters<typeof VCEntity.prototype.constructor>[0]);
  }
}

export default VCEntity;

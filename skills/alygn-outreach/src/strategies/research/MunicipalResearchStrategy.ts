/**
 * MunicipalResearchStrategy - Research municipalities for personalization
 */
import { MunicipalEntity, COSTA_RICA_CANTONES } from '../../entities/MunicipalEntity.js';
import { ResearchStrategy } from './ResearchStrategy.js';

export class MunicipalResearchStrategy extends ResearchStrategy {
  constructor(config: Record<string, unknown> = {}) {
    super(config);
    this.name = 'municipal-research';
  }
  
  /**
   * Research municipality
   */
  async research(entity: MunicipalEntity): Promise<{ success: boolean; research: Record<string, unknown>; entity: MunicipalEntity }> {
    console.log(`📚 Researching municipality: ${entity.name}...`);
    
    // For Costa Rica, use known data
    if (entity.location.country === 'Costa Rica') {
      return this.researchCostaRica(entity);
    }
    
    // Generic research
    return this.researchGeneric(entity);
  }
  
  /**
   * Research Costa Rica municipality
   */
  researchCostaRica(entity: MunicipalEntity): { success: boolean; research: Record<string, unknown>; entity: MunicipalEntity } {
    const cantonName = entity.name.replace('Municipalidad de ', '');
    const canton = COSTA_RICA_CANTONES.find(c => c.name === cantonName);
    
    if (!canton) {
      return this.researchGeneric(entity);
    }
    
    const research = {
      population: canton.population,
      budget: canton.budget,
      province: canton.province,
      initiatives: [
        { name: 'Transformación Digital Municipal', description: 'Modernización de servicios ciudadanos', status: 'active', budget: canton.budget * 0.05 },
        { name: 'Gobierno Abierto', description: 'Transparencia y datos abiertos', status: 'active', budget: canton.budget * 0.02 }
      ],
      painPoints: [
        'Digital transformation complexity',
        'Limited technical resources',
        'Citizen service delivery',
        'Data governance and privacy',
        'Inter-agency coordination'
      ],
      trAigaRelevant: true,
      keyContacts: this.generateKeyContacts(canton.name)
    };
    
    // Update entity
    entity.researchNotes = `Canton of ${canton.province} province. Population: ${canton.population}. Key initiatives: ${research.initiatives.map((i: { name: string }) => i.name).join(', ')}.`;
    entity.personalizationContext = {
      painPoints: research.painPoints,
      tailoredHook: 'TRAIGA Act compliance support',
      valueProposition: 'Support municipal AI governance and digital transformation'
    };
    
    if (!entity.typeData.population) {
      entity.typeData.population = canton.population;
    }
    if (!entity.typeData.budget) {
      entity.typeData.budget = canton.budget;
    }
    entity.typeData.initiatives = research.initiatives;
    entity.typeData.painPoints = research.painPoints;
    entity.typeData.keyContacts = research.keyContacts;
    entity.typeData.trAigaRelevant = true;
    
    entity.updateStatus('researched');
    
    console.log(`   ✅ Research complete for ${canton.name}`);
    
    return {
      success: true,
      research,
      entity
    };
  }
  
  /**
   * Generic municipality research
   */
  researchGeneric(entity: MunicipalEntity): { success: boolean; research: Record<string, unknown>; entity: MunicipalEntity } {
    const research = {
      initiatives: [
        { name: 'Digital Transformation', description: 'Modernizing municipal services', status: 'active' },
        { name: 'Citizen Engagement', description: 'Improving public participation', status: 'planned' }
      ],
      painPoints: [
        'Digital transformation',
        'Resource constraints',
        'Service delivery'
      ],
      keyContacts: this.generateKeyContacts(entity.name)
    };
    
    entity.researchNotes = `Municipality research: Focus on digital transformation and citizen services.`;
    entity.personalizationContext = {
      painPoints: research.painPoints,
      tailoredHook: 'Municipal governance support'
    };
    
    entity.typeData.initiatives = research.initiatives;
    entity.typeData.painPoints = research.painPoints;
    entity.typeData.keyContacts = research.keyContacts;
    
    entity.updateStatus('researched');
    
    return {
      success: true,
      research,
      entity
    };
  }
  
  /**
   * Dry-run research
   */
  async researchDryRun(entity: MunicipalEntity): Promise<{ success: boolean; research: Record<string, unknown>; entity: MunicipalEntity }> {
    console.log(`📚 [DRY RUN] Researching municipality: ${entity.name}...`);
    
    const mockResearch = {
      initiatives: [
        { name: 'Digital Transformation', description: 'Modernizing services', status: 'active', budget: 100000 }
      ],
      painPoints: ['AI accountability', 'Digital transformation', 'Citizen services'],
      trAigaRelevant: true,
      keyContacts: [{ name: 'Municipal Manager', title: 'City Manager', isDecisionMaker: true }]
    };
    
    entity.researchNotes = 'Research notes would be generated here.';
    entity.personalizationContext = {
      painPoints: mockResearch.painPoints,
      tailoredHook: 'TRAIGA Act compliance support'
    };
    
    entity.updateStatus('researched');
    
    console.log(`   [DRY RUN] Research complete`);
    
    return {
      success: true,
      research: mockResearch,
      entity
    };
  }
  
  /**
   * Generate key contacts
   */
  generateKeyContacts(municipalityName: string): Array<{ name: string; title: string; department: string; isDecisionMaker: boolean; focusAreas: string[] }> {
    return [
      {
        name: 'Municipal Manager',
        title: 'City Manager / Gerente Municipal',
        department: 'Executive',
        isDecisionMaker: true,
        focusAreas: ['Digital transformation', 'Service delivery']
      },
      {
        name: 'IT Director',
        title: 'Director de Tecnología',
        department: 'Technology',
        isDecisionMaker: false,
        focusAreas: ['Systems', 'Data governance']
      }
    ];
  }
}

export default MunicipalResearchStrategy;

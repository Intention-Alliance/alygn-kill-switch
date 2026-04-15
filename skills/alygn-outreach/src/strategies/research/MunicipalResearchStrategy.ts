/**
 * MunicipalResearchStrategy - Research municipalities for personalization
 */
import { MunicipalEntity } from '../../entities/MunicipalEntity';
import { COSTA_RICA_CANTONES } from '../../entities/municipal-data';
import { SPANISH_PAIN_POINTS } from '../../entities/lang-guard';
import { ResearchStrategy, type IResearchResult } from './ResearchStrategy';

export class MunicipalResearchStrategy extends ResearchStrategy {
  constructor(config: Record<string, unknown> = {}) {
    super(config);
    this.name = 'municipal-research';
  }

  /**
   * Research municipality
   */
  async research(entity: MunicipalEntity): Promise<IResearchResult> {
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
  private researchCostaRica(entity: MunicipalEntity): IResearchResult {
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
        'Complejidad de la transformación digital',
        'Recursos técnicos limitados',
        'Entrega de servicios ciudadanos',
        'Gobernanza de datos y privacidad',
        'Coordinación interinstitucional'
      ],
      trAigaRelevant: true,
      keyContacts: this.generateKeyContacts(canton.name)
    };
    
    // Update entity
    entity.researchNotes = `Cantón de la provincia de ${canton.province}. Población: ${canton.population}. Iniciativas clave: ${research.initiatives.map((i: { name: string }) => i.name).join(', ')}.`;
    entity.personalizationContext = {
      painPoints: research.painPoints,
      tailoredHook: 'Apoyo en implementación del TRAIGA Act',
      valueProposition: 'Apoyo en gobernanza de IA y transformación digital municipal'
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
  private researchGeneric(entity: MunicipalEntity): IResearchResult {
    const research = {
      initiatives: [
        { name: 'Transformación Digital', description: 'Modernización de servicios municipales', status: 'active' },
        { name: 'Participación Ciudadana', description: 'Mejora de la participación pública', status: 'planned' }
      ],
      // P1: Use SPANISH_PAIN_POINTS constant instead of inline strings
      painPoints: [...SPANISH_PAIN_POINTS],
      keyContacts: this.generateKeyContacts(entity.name)
    };
    
    entity.researchNotes = `Investigación municipal: Enfoque en transformación digital y servicios ciudadanos.`;
    entity.personalizationContext = {
      painPoints: research.painPoints,
      tailoredHook: 'Apoyo en gobernanza municipal'
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
  async researchDryRun(entity: MunicipalEntity): Promise<IResearchResult> {
    console.log(`📚 [DRY RUN] Researching municipality: ${entity.name}...`);
    
    const mockResearch = {
      initiatives: [
        { name: 'Transformación Digital', description: 'Modernización de servicios', status: 'active', budget: 100000 }
      ],
      // P1: Use SPANISH_PAIN_POINTS constant for consistency
      painPoints: [...SPANISH_PAIN_POINTS],
      trAigaRelevant: true,
      keyContacts: [{ name: 'Gerente Municipal', title: 'Gerente Municipal', isDecisionMaker: true }]
    };
    
    entity.researchNotes = 'Research notes would be generated here.';
    entity.personalizationContext = {
      painPoints: mockResearch.painPoints,
      tailoredHook: 'Apoyo en implementación del TRAIGA Act'
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
  private generateKeyContacts(municipalityName: string): Array<{ name: string; title: string; department: string; isDecisionMaker: boolean; focusAreas: string[] }> {
    return [
      {
        name: 'Gerente Municipal',
        title: 'Gerente Municipal',
        department: 'Ejecutivo',
        isDecisionMaker: true,
        focusAreas: ['Transformación digital', 'Entrega de servicios']
      },
      {
        name: 'Director de Tecnología',
        title: 'Director de Tecnología',
        department: 'Tecnología',
        isDecisionMaker: false,
        focusAreas: ['Sistemas', 'Gobernanza de datos']
      }
    ];
  }
}

export default MunicipalResearchStrategy;

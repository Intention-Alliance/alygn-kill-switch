/**
 * MunicipalDiscoveryStrategy - Discovers municipalities/governments for outreach
 */
import { MunicipalEntity, COSTA_RICA_CANTONES } from '../../entities/MunicipalEntity.js';
import type { ICostaRicaCanton } from '../../entities/MunicipalEntity.js';
import { DiscoveryStrategy } from './DiscoveryStrategy.js';

export class MunicipalDiscoveryStrategy extends DiscoveryStrategy {
  constructor(config: Record<string, unknown> = {}) {
    super(config);
    this.name = 'municipal-discovery';
  }
  
  /**
   * Discover municipalities
   * Supports regions: costa-rica, or generic query search
   */
  async discover(query: string, options: Record<string, unknown> = {}): Promise<MunicipalEntity[]> {
    const limit = (options.limit as number) || 20;
    const region = (options.region as string) || null;
    
    // Handle Costa Rica cantones discovery
    if (region === 'costa-rica' || query === 'costa-rica-cantones') {
      return this.discoverCostaRicaCantones(limit);
    }
    
    console.log(`🔍 Municipal Discovery: Searching "${query}"...`);
    
    // For dry-run, return mock data
    if (options.dryRun) {
      return this.generateMockMunicipals(query, limit);
    }
    
    // TODO: Implement actual discovery via web search
    // For now, return empty array
    console.log(`   ⚠️  Municipal discovery not yet implemented for non-CR regions`);
    return [];
  }
  
  /**
   * Discover Costa Rican cantones
   * Returns all 82 cantones with metadata
   */
  discoverCostaRicaCantones(limit: number): MunicipalEntity[] {
    console.log(`🔍 Costa Rica Discovery: Loading ${Math.min(limit, COSTA_RICA_CANTONES.length)} cantones...`);
    
    const cantones = COSTA_RICA_CANTONES.slice(0, limit);
    
    const entities = cantones.map((canton: ICostaRicaCanton) => {
      return MunicipalEntity.fromCanton(canton);
    });
    
    console.log(`   ✅ Created ${entities.length} municipal entities`);
    return entities;
  }
  
  /**
   * Research a municipality
   */
  async researchMunicipality(name: string, location: Record<string, unknown> = {}): Promise<MunicipalEntity | null> {
    console.log(`📚 Researching municipality: ${name}...`);
    
    // Generate municipal-specific research
    // For Costa Rica, use known data
    if ((location.country as string) === 'Costa Rica') {
      return this.researchCostaRicaMunicipality(name, location as { country: string });
    }
    
    // Generic municipality research
    return null;
  }
  
  /**
   * Research Costa Rica municipality
   */
  async researchCostaRicaMunicipality(name: string, location: { country: string }): Promise<MunicipalEntity | null> {
    const cantonName = name.replace('Municipalidad de ', '');
    const canton = COSTA_RICA_CANTONES.find(c => c.name === cantonName);
    
    if (!canton) {
      return null;
    }
    
    return new MunicipalEntity({
      name: `Municipalidad de ${canton.name}`,
      website: `https://www.${canton.name.toLowerCase().replace(/\s+/g, '')}.go.cr`,
      location: {
        city: canton.name,
        state: canton.province,
        country: 'Costa Rica',
        region: canton.province
      },
      typeData: {
        governmentType: 'city',
        population: canton.population,
        budget: canton.budget,
        province: canton.province,
        departments: [
          { name: 'Tecnología de la Información', focus: ['digital transformation', 'e-government'] },
          { name: 'Planificación Urbana', focus: ['smart city', 'data analytics'] },
          { name: 'Servicios Ciudadanos', focus: ['citizen engagement', 'transparency'] }
        ],
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
        trAigaRelevant: true
      },
      personalizationContext: {
        tailoredHook: 'TRAIGA Act compliance and AI governance',
        valueProposition: 'Support municipal AI governance implementation'
      }
    });
  }
  
  /**
   * Generate mock municipalities for dry-run
   */
  generateMockMunicipals(query: string, limit: number): MunicipalEntity[] {
    const provinces = ['San José', 'Alajuela', 'Cartago', 'Heredia', 'Guanacaste', 'Puntarenas', 'Limón'];
    const mockMunicipals: MunicipalEntity[] = [];
    
    for (let i = 0; i < Math.min(limit, provinces.length); i++) {
      const province = provinces[i];
      mockMunicipals.push(new MunicipalEntity({
        name: `Municipalidad de ${province}`,
        website: `https://www.${province.toLowerCase().replace(/\s+/g, '')}.go.cr`,
        location: {
          city: province,
          state: province,
          country: 'Costa Rica',
          region: province
        },
        typeData: {
          governmentType: 'city',
          population: 50000 + Math.floor(Math.random() * 200000),
          budget: 20000000 + Math.floor(Math.random() * 100000000),
          province: province,
          departments: [
            { name: 'Tecnología', focus: ['digital transformation'] },
            { name: 'Planificación', focus: ['smart city'] }
          ],
          initiatives: [
            { name: 'Digital Transformation', description: 'Modernizing services', status: 'active' }
          ],
          painPoints: ['AI accountability', 'Digital transformation', 'Citizen services'],
          trAigaRelevant: true
        }
      }));
    }
    
    return mockMunicipals;
  }
}

export default MunicipalDiscoveryStrategy;

/**
 * MunicipalDiscoveryStrategy - Discovers municipalities/governments for outreach
 * 
 * Mode B (dry-run + USE_DIRECT_API=true):
 *   - For Costa Rica: Use embedded real data
 *   - For other regions: Call Firecrawl API
 *   - Write results to data/dry-run/
 *   - Simulate Supabase writes
 */
import fs from 'fs';
import path from 'path';
import { MunicipalEntity } from '../../entities/MunicipalEntity';
import { COSTA_RICA_CANTONES } from '../../entities/municipal-data';
import type { ICostaRicaCanton } from '../../entities/types';
import { DiscoveryStrategy, type IDiscoveryOptions } from './DiscoveryStrategy';
import { getSupabaseSimulator } from '../../lib/simulation/SupabaseSimulator';
import { getDiscordReporter } from '../../lib/reporting/DiscordReporter';

export class MunicipalDiscoveryStrategy extends DiscoveryStrategy {
  constructor(config: Record<string, unknown> = {}) {
    super(config);
    this.name = 'municipal-discovery';
  }

  /**
   * Discover municipalities
   * Supports regions: costa-rica, or generic query search
   * 
   * Modes:
   * - dryRun=false, region=costa-rica: Query Supabase for unsent municipalities
   * - dryRun=true, USE_DIRECT_API=false: Return mock data (legacy behavior)
   * - dryRun=true, USE_DIRECT_API=true, Costa Rica: Use embedded data + simulate DB (Mode B)
   */
  async discover(query: string, options: IDiscoveryOptions = {}): Promise<MunicipalEntity[]> {
    const limit = options.limit || 20;
    const region = options.region || null;
    const dryRun = options.dryRun || false;
    const useDirectApi = process.env.USE_DIRECT_API === 'true';
    
    // Mode B: Dry-run with Direct API
    if (dryRun && useDirectApi) {
      console.log(`   🌐 Mode B: Dry-run + Direct API enabled`);
      
      // Costa Rica uses embedded data
      if (region === 'costa-rica' || query === 'costa-rica-cantones') {
        return this.discoverCostaRicaModeB(limit);
      }
      
      // Other regions: call Firecrawl API
      return await this.discoverViaFirecrawlModeB(query, limit, options);
    }
    
    // Production: Query Supabase for unsent municipalities (BEFORE static data)
    if (!dryRun && region === 'costa-rica') {
      return this.discoverFromSupabase(limit);
    }
    
    // Handle Costa Rica cantones discovery (legacy, no emails)
    if (region === 'costa-rica' || query === 'costa-rica-cantones') {
      return this.discoverCostaRicaCantones(limit);
    }
    
    // For dry-run (legacy), return mock data
    if (dryRun) {
      return this.generateMockMunicipals(query, limit);
    }
    
    // TODO: Implement actual discovery via web search
    // For now, return empty array
    console.log(`   ⚠️  Municipal discovery not yet implemented for non-CR regions`);
    return [];
  }

  /**
   * Discover municipalities from Supabase (unsent with valid emails)
   */
  private async discoverFromSupabase(limit: number): Promise<MunicipalEntity[]> {
    console.log(`\n   📊 Querying Supabase for unsent municipalities...`);
    
    try {
      // Load credentials
      const credentialsPath = path.join(process.env.HOME || '', '.openclaw/workspace/config/credentials.json');
      if (!fs.existsSync(credentialsPath)) {
        console.log(`   ⚠️  No credentials file found`);
        return [];
      }
      
      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      if (!credentials?.supabase?.url || !credentials?.supabase?.key) {
        console.log(`   ⚠️  No Supabase credentials found`);
        return [];
      }
      
      // Dynamic import
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(credentials.supabase.url, credentials.supabase.key);
      
      // Query unsent municipalities with valid emails
      const { data, error } = await supabase
        .from('municipalities')
        .select('*')
        .is('outreach_sent_at', null)
        .not('mayor_email', 'is', null)
        .order('priority_score', { ascending: false })
        .limit(limit);
      
      if (error) {
        console.log(`   ❌ Supabase error: ${error.message}`);
        return [];
      }
      
      if (!data || data.length === 0) {
        console.log(`   ⚠️  No unsent municipalities found in Supabase`);
        return [];
      }
      
      console.log(`   ✅ Found ${data.length} unsent municipalities`);
      
      // Convert to MunicipalEntity
      return data.map((muni: any) => new MunicipalEntity({
        id: muni.id,
        name: `Municipalidad de ${muni.name}`,
        type: 'municipal',
        email: muni.mayor_email,
        website: muni.website_url,
        phone: muni.phone,
        location: {
          city: muni.name,
          state: muni.province,
          country: muni.country || 'Costa Rica',
          region: muni.province
        },
        status: 'discovered',
        priority: muni.priority_score > 70 ? 'high' : 'medium',
        discoveredAt: muni.discovered_at || new Date(),
        typeData: {
          population: muni.population,
          budget: muni.budget,
          province: muni.province,
          painPoints: muni.pain_points || [],
          trAigaRelevant: true
        },
        waveNumber: muni.wave_number,
        waveDate: muni.wave_date,
        batchStatus: muni.batch_status
      }));
      
    } catch (err) {
      console.log(`   ⚠️  Failed to query Supabase: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Mode B for Costa Rica: Use embedded data + simulate DB writes
   */
  private discoverCostaRicaModeB(limit: number): MunicipalEntity[] {
    console.log(`\n   ═══════════════════════════════════════════`);
    console.log(`   🚀 MODE B: Costa Rica Municipal Discovery`);
    console.log(`   ═══════════════════════════════════════════`);
    
    // Create simulators and reporter
    const supabaseSim = getSupabaseSimulator({
      outputDir: path.join(process.cwd(), 'data', 'dry-run', 'supabase'),
      dryRunId: `municipal-cr-${Date.now()}`
    });
    
    const reporter = getDiscordReporter({
      outputDir: path.join(process.cwd(), 'data', 'dry-run', 'reports')
    });
    
    // Use the embedded Costa Rica data (real data)
    console.log(`\n   📊 Using embedded Costa Rica municipal data`);
    const cantones = COSTA_RICA_CANTONES.slice(0, limit);
    
    const entities = cantones.map((canton: ICostaRicaCanton) => {
      return MunicipalEntity.fromCanton(canton);
    });
    
    console.log(`   ✅ Created ${entities.length} municipal entities from embedded data`);
    
    // Save to data/dry-run/
    const dryRunDir = path.join(process.cwd(), 'data', 'dry-run');
    if (!fs.existsSync(dryRunDir)) {
      fs.mkdirSync(dryRunDir, { recursive: true });
    }
    
    const dataFile = path.join(dryRunDir, `municipal-cr-embedded-${Date.now()}.json`);
    fs.writeFileSync(dataFile, JSON.stringify({
      region: 'costa-rica',
      source: 'embedded',
      timestamp: new Date().toISOString(),
      mode: 'dry-run-direct-api',
      cantones: cantones.map(c => c.name),
      count: cantones.length
    }, null, 2));
    console.log(`   💾 Embedded data reference saved: ${dataFile}`);
    
    // Simulate Supabase writes
    console.log(`\n   📊 Simulating database writes...`);
    for (const entity of entities) {
      supabaseSim.upsertMunicipality(entity);
      supabaseSim.upsertLocalGovernment(entity);
    }
    supabaseSim.save();
    
    // Send Discord report
    console.log(`\n   📤 Sending Discord report...`);
    reporter.report('municipal', 'discover', {
      discovered: entities.length
    }, entities.map(e => ({ name: e.name, email: e.email, website: e.website })), {
      sendToDiscord: true,
      supabaseSim
    });
    
    console.log(`\n   ═══════════════════════════════════════════`);
    console.log(`   ✅ MODE B COMPLETE (Costa Rica)`);
    console.log(`   ═══════════════════════════════════════════\n`);
    
    return entities;
  }

  /**
   * Mode B for other regions: Call Firecrawl API
   */
  private async discoverViaFirecrawlModeB(query: string, limit: number, options: IDiscoveryOptions): Promise<MunicipalEntity[]> {
    console.log(`\n   ═══════════════════════════════════════════`);
    console.log(`   🚀 MODE B: Municipal Discovery via Firecrawl`);
    console.log(`   ═══════════════════════════════════════════`);
    
    // Create simulators and reporter
    const supabaseSim = getSupabaseSimulator({
      outputDir: path.join(process.cwd(), 'data', 'dry-run', 'supabase'),
      dryRunId: `municipal-${Date.now()}`
    });
    
    const reporter = getDiscordReporter({
      outputDir: path.join(process.cwd(), 'data', 'dry-run', 'reports')
    });
    
    // Call Firecrawl API
    console.log(`\n   📡 Calling Firecrawl API for: "${query}"...`);
    let entities: MunicipalEntity[] = [];
    
    try {
      entities = await this.fetchMunicipalitiesFromFirecrawl(query, limit);
    } catch (error) {
      console.error(`   ❌ Firecrawl API failed: ${(error as Error).message}`);
      console.log(`   📝 Falling back to mock data`);
      entities = this.generateMockMunicipals(query, limit);
      
      await reporter.report('municipal', 'discover', {
        discovered: entities.length,
        reason: `Firecrawl failed: ${(error as Error).message}`
      }, entities.map(e => ({ name: e.name, email: e.email, website: e.website })), {
        sendToDiscord: true,
        supabaseSim
      });
      
      return entities;
    }
    
    if (entities.length === 0) {
      console.log(`   ⚠️  No results from Firecrawl, using mock data`);
      entities = this.generateMockMunicipals(query, limit);
      
      await reporter.report('municipal', 'discover', {
        discovered: entities.length,
        reason: 'No Firecrawl results'
      }, entities.map(e => ({ name: e.name, email: e.email, website: e.website })), {
        sendToDiscord: true,
        supabaseSim
      });
      
      return entities;
    }
    
    console.log(`   ✅ Firecrawl returned ${entities.length} municipalities`);
    
    // Save to data/dry-run/
    const dryRunDir = path.join(process.cwd(), 'data', 'dry-run');
    if (!fs.existsSync(dryRunDir)) {
      fs.mkdirSync(dryRunDir, { recursive: true });
    }
    
    const dataFile = path.join(dryRunDir, `municipal-firecrawl-${Date.now()}.json`);
    fs.writeFileSync(dataFile, JSON.stringify({
      query,
      source: 'firecrawl',
      timestamp: new Date().toISOString(),
      mode: 'dry-run-direct-api',
      entities: entities.map(e => ({ name: e.name, website: e.website, country: e.location.country })),
      count: entities.length
    }, null, 2));
    console.log(`   💾 Firecrawl results saved: ${dataFile}`);
    
    // Simulate Supabase writes
    console.log(`\n   📊 Simulating database writes...`);
    for (const entity of entities) {
      supabaseSim.upsertMunicipality(entity);
      supabaseSim.upsertLocalGovernment(entity);
    }
    supabaseSim.save();
    
    // Send Discord report
    console.log(`\n   📤 Sending Discord report...`);
    await reporter.report('municipal', 'discover', {
      discovered: entities.length
    }, entities.map(e => ({ name: e.name, email: e.email, website: e.website })), {
      sendToDiscord: true,
      supabaseSim
    });
    
    console.log(`\n   ═══════════════════════════════════════════`);
    console.log(`   ✅ MODE B COMPLETE (Firecrawl)`);
    console.log(`   ═══════════════════════════════════════════\n`);
    
    return entities;
  }

  /**
   * Fetch municipalities from Firecrawl API
   */
  private async fetchMunicipalitiesFromFirecrawl(query: string, limit: number): Promise<MunicipalEntity[]> {
    // Load credentials
    const credentialsPath = path.resolve(__dirname, '../../../config/credentials.json');
    let credentials: { firecrawl?: { apiKey?: string } } = {};
    
    if (fs.existsSync(credentialsPath)) {
      credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    } else {
      const legacyPath = path.join(process.env.HOME || '', '.openclaw/workspace/config/credentials.json');
      if (fs.existsSync(legacyPath)) {
        credentials = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      }
    }
    
    const apiKey = credentials?.firecrawl?.apiKey;
    
    if (!apiKey) {
      throw new Error('No Firecrawl API key found in credentials');
    }
    
    // Firecrawl API for web scraping
    const response = await fetch('https://api.firecrawl.dev/v0/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `${query} municipal government website`,
        limit,
        scrapeOptions: {
          formats: ['metadata'],
          onlyMainContent: true
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Firecrawl API error: ${response.status}`);
    }
    
    const data = await response.json() as { data?: Array<{ url?: string; title?: string; description?: string }> };
    const results = data.data || [];
    
    // Convert to MunicipalEntity
    return results.map((r, i) => new MunicipalEntity({
      name: r.title || `${query} Municipality ${i + 1}`,
      website: r.url,
      location: {
        country: 'Unknown',
        region: 'Unknown'
      },
      typeData: {
        governmentType: 'city',
        province: 'Unknown',
        painPoints: ['Digital transformation', 'Citizen services'],
        trAigaRelevant: true
      }
    }));
  }

  /**
   * Discover Costa Rican cantones
   * Returns all 82 cantones with metadata
   */
  private discoverCostaRicaCantones(limit: number): MunicipalEntity[] {
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
  private async researchCostaRicaMunicipality(name: string, location: { country: string }): Promise<MunicipalEntity | null> {
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
   * Generate mock municipalities for dry-run (legacy mode)
   */
  private generateMockMunicipals(query: string, limit: number): MunicipalEntity[] {
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

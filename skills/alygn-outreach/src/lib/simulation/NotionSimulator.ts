/**
 * Notion Simulator - Simulates Notion API operations by writing to JSON files
 * Used for dry-run mode when USE_DIRECT_API=true
 */
import fs from 'fs';
import path from 'path';
import { MunicipalEntity } from '../../entities/MunicipalEntity';
import { VCEntity } from '../../entities/VCEntity';

export interface NotionSimulatorOptions {
  outputDir?: string;
  dryRunId?: string;
}

export interface SimulatedPage {
  id: string;
  parentPageId: string;
  title: string;
  properties: Record<string, unknown>;
  blocks: SimulatedBlock[];
  createdAt: string;
  updatedAt: string;
  simulated: true;
  entityId?: string;
  entityType?: 'municipal' | 'vc';
}

export interface SimulatedBlock {
  id: string;
  type: string;
  content: Record<string, unknown>;
}

/**
 * Check if entity has batchStatus (MunicipalEntity)
 */
function hasBatchStatus(entity: MunicipalEntity | VCEntity): entity is MunicipalEntity {
  return entity instanceof MunicipalEntity && 'batchStatus' in entity;
}

/**
 * Check if entity has outreachSentAt (MunicipalEntity)
 */
function hasOutreachSentAt(entity: MunicipalEntity | VCEntity): entity is MunicipalEntity {
  return entity instanceof MunicipalEntity && 'outreachSentAt' in entity;
}

/**
 * Check if entity has verifiedAt (MunicipalEntity)
 */
function hasVerifiedAt(entity: MunicipalEntity | VCEntity): entity is MunicipalEntity {
  return entity instanceof MunicipalEntity && 'verifiedAt' in entity;
}

/**
 * Check if entity has researchedAt (MunicipalEntity)
 */
function hasResearchedAt(entity: MunicipalEntity | VCEntity): entity is MunicipalEntity {
  return entity instanceof MunicipalEntity && 'researchedAt' in entity;
}

/**
 * NotionSimulator - Simulates Notion page creation for dry-run mode
 * 
 * When USE_DIRECT_API=true and dryRun=true, this class intercepts
 * Notion API calls and writes equivalent JSON output instead.
 */
export class NotionSimulator {
  private outputDir: string;
  private timestamp: string;
  private dryRunId: string;
  private pages: SimulatedPage[] = [];

  constructor(options: NotionSimulatorOptions = {}) {
    const now = new Date();
    this.timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.dryRunId = options.dryRunId || this.timestamp;
    this.outputDir = options.outputDir || path.join(process.cwd(), 'data', 'dry-run', 'notion');
    
    this.ensureOutputDir();
  }

  /**
   * Ensure output directory exists
   */
  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generate a simulated Notion page ID
   */
  private generatePageId(): string {
    return `sim-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generate a simulated block ID
   */
  private generateBlockId(): string {
    return `blk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Convert MunicipalEntity to simulated Notion page properties
   * Matches actual Notion page structure
   */
  private municipalToNotionProperties(entity: MunicipalEntity): Record<string, unknown> {
    return {
      title: {
        title: [{ type: 'text', text: { content: entity.name }, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' } }]
      },
      Country: {
        select: { name: entity.location.country || 'Costa Rica' }
      },
      Region: {
        select: { name: entity.location.region || entity.location.state || 'Unknown' }
      },
      Province: {
        select: { name: (entity.typeData.province as string) || 'Unknown' }
      },
      Website: {
        url: entity.website || null
      },
      Email: {
        email: entity.email || null
      },
      'Government Type': {
        select: { name: (entity.typeData.governmentType as string) || 'city' }
      },
      Population: {
        number: (entity.typeData.population as number) || null
      },
      Priority: {
        select: { name: entity.priority || 'medium' }
      },
      Status: {
        select: { name: entity.batchStatus || 'discovered' }
      },
      'Pain Points': {
        multi_select: ((entity.typeData.painPoints as string[]) || []).map(p => ({ name: p }))
      },
      'Verified': {
        checkbox: !!entity.verifiedAt
      },
      'Researched': {
        checkbox: !!entity.researchedAt
      },
      'Outreach Sent': {
        checkbox: !!entity.outreachSentAt
      }
    };
  }

  /**
   * Convert VCEntity to simulated Notion page properties
   * Matches actual Notion page structure
   */
  private vcToNotionProperties(entity: VCEntity): Record<string, unknown> {
    return {
      title: {
        title: [{ type: 'text', text: { content: entity.name }, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' } }]
      },
      'Firm Type': {
        select: { name: (entity.typeData.firmType as string) || 'vc' }
      },
      Website: {
        url: entity.website || null
      },
      Email: {
        email: entity.email || null
      },
      Country: {
        select: { name: entity.location.country || 'US' }
      },
      City: {
        rich_text: [{ type: 'text', text: { content: entity.location.city || '' } }]
      },
      'Stage Focus': {
        multi_select: ((entity.typeData.stageFocus as string[]) || []).map(s => ({ name: s }))
      },
      'Sector Focus': {
        multi_select: ((entity.typeData.sectorFocus as string[]) || []).map(s => ({ name: s }))
      },
      Priority: {
        select: { name: entity.priority || 'medium' }
      },
      Status: {
        select: { name: 'discovered' }
      },
      'Pain Points': {
        multi_select: ((entity.personalizationContext?.painPoints as string[]) || []).map(p => ({ name: p }))
      }
    };
  }

  /**
   * Create content blocks from MunicipalEntity
   */
  private createMunicipalBlocks(entity: MunicipalEntity): SimulatedBlock[] {
    const blocks: SimulatedBlock[] = [];
    
    // Overview heading
    blocks.push({
      id: this.generateBlockId(),
      type: 'heading_2',
      content: { heading_2: { rich_text: [{ type: 'text', text: { content: 'Overview' } }] } }
    });
    
    // Pain Points
    if (entity.typeData.painPoints && entity.typeData.painPoints.length > 0) {
      blocks.push({
        id: this.generateBlockId(),
        type: 'heading_3',
        content: { heading_3: { rich_text: [{ type: 'text', text: { content: 'Pain Points' } }] } }
      });
      blocks.push({
        id: this.generateBlockId(),
        type: 'bulleted_list_item',
        content: { bulleted_list_item: { rich_text: entity.typeData.painPoints.map(p => ({ type: 'text', text: { content: `• ${p}` } })) } }
      });
    }
    
    // Departments
    const departments = entity.typeData.departments as Array<{ name: string; focus: string[] }> | undefined;
    if (departments && departments.length > 0) {
      blocks.push({
        id: this.generateBlockId(),
        type: 'heading_3',
        content: { heading_3: { rich_text: [{ type: 'text', text: { content: 'Key Departments' } }] } }
      });
      for (const dept of departments) {
        blocks.push({
          id: this.generateBlockId(),
          type: 'bulleted_list_item',
          content: { bulleted_list_item: { rich_text: [{ type: 'text', text: { content: `${dept.name}: ${dept.focus.join(', ')}` } }] } }
        });
      }
    }
    
    // Initiatives
    const initiatives = entity.typeData.initiatives as Array<{ name: string; status: string }> | undefined;
    if (initiatives && initiatives.length > 0) {
      blocks.push({
        id: this.generateBlockId(),
        type: 'heading_3',
        content: { heading_3: { rich_text: [{ type: 'text', text: { content: 'Active Initiatives' } }] } }
      });
      for (const init of initiatives) {
        blocks.push({
          id: this.generateBlockId(),
          type: 'bulleted_list_item',
          content: { bulleted_list_item: { rich_text: [{ type: 'text', text: { content: `${init.name} (${init.status})` } }] } }
        });
      }
    }
    
    return blocks;
  }

  /**
   * Create content blocks from VCEntity
   */
  private createVCBlocks(entity: VCEntity): SimulatedBlock[] {
    const blocks: SimulatedBlock[] = [];
    
    // Partners
    if (entity.typeData.partners && entity.typeData.partners.length > 0) {
      blocks.push({
        id: this.generateBlockId(),
        type: 'heading_2',
        content: { heading_2: { rich_text: [{ type: 'text', text: { content: 'Partners' } }] } }
      });
      for (const partner of entity.typeData.partners) {
        blocks.push({
          id: this.generateBlockId(),
          type: 'bulleted_list_item',
          content: { bulleted_list_item: { rich_text: [{ type: 'text', text: { content: `${partner.name} - ${partner.title}` } }] } }
        });
      }
    }
    
    // Portfolio
    if (entity.typeData.portfolioCompanies && entity.typeData.portfolioCompanies.length > 0) {
      blocks.push({
        id: this.generateBlockId(),
        type: 'heading_2',
        content: { heading_2: { rich_text: [{ type: 'text', text: { content: 'Portfolio Companies' } }] } }
      });
      blocks.push({
        id: this.generateBlockId(),
        type: 'bulleted_list_item',
        content: { bulleted_list_item: { rich_text: entity.typeData.portfolioCompanies.map(p => ({ type: 'text', text: { content: p } })) } }
      });
    }
    
    // Recent Investments
    if (entity.typeData.recentInvestments && entity.typeData.recentInvestments.length > 0) {
      blocks.push({
        id: this.generateBlockId(),
        type: 'heading_2',
        content: { heading_2: { rich_text: [{ type: 'text', text: { content: 'Recent Investments' } }] } }
      });
      for (const inv of entity.typeData.recentInvestments) {
        blocks.push({
          id: this.generateBlockId(),
          type: 'bulleted_list_item',
          content: { bulleted_list_item: { rich_text: [{ type: 'text', text: { content: `${inv.company} (${inv.stage}, ${inv.date})` } }] } }
        });
      }
    }
    
    return blocks;
  }

  /**
   * Simulate creating a Notion page for a MunicipalEntity
   */
  simulateCreateMunicipalPage(entity: MunicipalEntity, parentPageId: string = 'sim-parent-default'): SimulatedPage {
    const page: SimulatedPage = {
      id: this.generatePageId(),
      parentPageId,
      title: entity.name,
      properties: this.municipalToNotionProperties(entity),
      blocks: this.createMunicipalBlocks(entity),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      simulated: true,
      entityId: entity.id,
      entityType: 'municipal'
    };
    
    this.pages.push(page);
    console.log(`   📝 [SIMULATED] Notion page created: ${entity.name}`);
    
    return page;
  }

  /**
   * Simulate creating a Notion page for a VCEntity
   */
  simulateCreateVCPage(entity: VCEntity, parentPageId: string = 'sim-parent-default'): SimulatedPage {
    const page: SimulatedPage = {
      id: this.generatePageId(),
      parentPageId,
      title: entity.name,
      properties: this.vcToNotionProperties(entity),
      blocks: this.createVCBlocks(entity),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      simulated: true,
      entityId: entity.id,
      entityType: 'vc'
    };
    
    this.pages.push(page);
    console.log(`   📝 [SIMULATED] Notion page created: ${entity.name}`);
    
    return page;
  }

  /**
   * Save all simulated pages to JSON files
   */
  save(): { pagesFile: string; summaryFile: string } {
    // Save individual pages
    const pagesFile = path.join(this.outputDir, `${this.dryRunId}-pages.json`);
    fs.writeFileSync(pagesFile, JSON.stringify(this.pages, null, 2));
    
    // Save summary
    const summary = {
      dryRunId: this.dryRunId,
      timestamp: this.timestamp,
      totalPages: this.pages.length,
      byType: {
        municipal: this.pages.filter(p => p.entityType === 'municipal').length,
        vc: this.pages.filter(p => p.entityType === 'vc').length
      },
      outputDir: this.outputDir
    };
    
    const summaryFile = path.join(this.outputDir, `${this.dryRunId}-summary.json`);
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    
    console.log(`\n   💾 [SIMULATED] Notion data saved:`);
    console.log(`      Pages: ${pagesFile}`);
    console.log(`      Summary: ${summaryFile}`);
    
    return { pagesFile, summaryFile };
  }

  /**
   * Get all simulated pages
   */
  getPages(): SimulatedPage[] {
    return this.pages;
  }

  /**
   * Get simulated page count
   */
  getCount(): number {
    return this.pages.length;
  }
}

/**
 * Create a singleton simulator for dry-run mode
 */
let simulatorInstance: NotionSimulator | null = null;

export function getNotionSimulator(options?: NotionSimulatorOptions): NotionSimulator {
  if (!simulatorInstance) {
    simulatorInstance = new NotionSimulator(options);
  }
  return simulatorInstance;
}

export function resetNotionSimulator(): void {
  simulatorInstance = null;
}

export default NotionSimulator;

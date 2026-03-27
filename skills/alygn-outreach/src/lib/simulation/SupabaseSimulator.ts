/**
 * Supabase Simulator - Simulates Supabase database operations by writing to JSON files
 * Used for dry-run mode when USE_DIRECT_API=true
 */
import fs from 'fs';
import path from 'path';
import { MunicipalEntity } from '../../entities/MunicipalEntity';
import { VCEntity } from '../../entities/VCEntity';
import type { MunicipalityInsert, LocalGovernmentRow, OutreachEmailInsert, PoliticalFigureInsert } from '../../entities/supabase-mappers';

export interface SupabaseSimulatorOptions {
  outputDir?: string;
  dryRunId?: string;
}

export interface SimulatedMunicipality extends MunicipalityInsert {
  _simulated: true;
  _entityId: string;
  _createdAt: string;
}

export interface SimulatedLocalGovernment extends LocalGovernmentRow {
  _simulated: true;
  _entityId: string;
}

export interface SimulatedOutreachEmail extends OutreachEmailInsert {
  _simulated: true;
  _entityId: string;
  _createdAt: string;
}

export interface SimulatedPoliticalFigure extends PoliticalFigureInsert {
  _simulated: true;
  _entityId: string;
  _createdAt: string;
}

export interface SupabaseSimulationSummary {
  dryRunId: string;
  timestamp: string;
  tables: {
    municipalities: number;
    local_governments: number;
    outreach_emails: number;
    political_figures: number;
  };
  outputDir: string;
}

/**
 * SupabaseSimulator - Simulates Supabase table writes for dry-run mode
 * 
 * When USE_DIRECT_API=true and dryRun=true, this class intercepts
 * Supabase database operations and writes equivalent JSON output instead.
 */
export class SupabaseSimulator {
  private outputDir: string;
  private timestamp: string;
  private dryRunId: string;
  private municipalities: SimulatedMunicipality[] = [];
  private localGovernments: SimulatedLocalGovernment[] = [];
  private outreachEmails: SimulatedOutreachEmail[] = [];
  private politicalFigures: SimulatedPoliticalFigure[] = [];

  constructor(options: SupabaseSimulatorOptions = {}) {
    const now = new Date();
    this.timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.dryRunId = options.dryRunId || this.timestamp;
    this.outputDir = options.outputDir || path.join(process.cwd(), 'data', 'dry-run', 'supabase');
    
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
   * Convert MunicipalEntity to Supabase municipalities row
   */
  private toMunicipalityRow(entity: MunicipalEntity): SimulatedMunicipality {
    return {
      _simulated: true,
      _entityId: entity.id,
      _createdAt: new Date().toISOString(),
      
      // Required fields
      name: entity.name,
      country: entity.location.country || 'Costa Rica',
      
      // Optional identification
      id: entity.municipalityId || entity.id,
      website_url: entity.website,
      phone: entity.phone,
      email: entity.email,
      
      // Location
      region: entity.location.region,
      province: (entity.typeData.province as string) || entity.location.state,
      
      // Municipal-specific
      population: (entity.typeData.population as number) || null,
      government_type: (entity.typeData.governmentType as string) || null,
      mayor_name: (entity.typeData.keyContacts as Array<{ name?: string }>)?.[0]?.name,
      mayor_email: entity.email,
      general_email: entity.email,
      
      // Pain points
      pain_points: entity.typeData.painPoints as string[] || null,
      
      // Research and verification (OutreachEntity base class dates are Date objects)
      verified_at: entity.verifiedAt ? new Date(entity.verifiedAt).toISOString() : null,
      researched_at: entity.researchedAt ? new Date(entity.researchedAt).toISOString() : null,
      
      // Outreach tracking (MunicipalEntity fields are strings from typeData)
      outreach_sent_at: entity.outreachSentAt || null,
      outreach_variant: entity.outreachVariant || null,
      replied_at: entity.repliedAt || null,
      reply_sentiment: entity.replySentiment || null,
      
      // Wave tracking
      wave_number: entity.waveNumber || null,
      wave_date: entity.waveDate || null,
      batch_status: entity.batchStatus || null,
      
      // X/Twitter tracking (OutreachEntity base class)
      x_handle: entity.xHandle,
      x_url: entity.xUrl,
      x_warmup_phase1_at: entity.xWarmupPhase1At ? new Date(entity.xWarmupPhase1At).toISOString() : null,
      x_warmup_phase2_at: entity.xWarmupPhase2At ? new Date(entity.xWarmupPhase2At).toISOString() : null,
      x_engagement_count: entity.xEngagementCount || null,
      x_last_engagement_at: entity.xLastEngagementAt ? new Date(entity.xLastEngagementAt).toISOString() : null,
      
      // Priority scoring
      priority_score: entity.priority === 'high' ? 100 : entity.priority === 'medium' ? 50 : 25,
      
      // Timestamps (OutreachEntity base class)
      discovered_at: entity.discoveredAt instanceof Date ? entity.discoveredAt.toISOString() : new Date(entity.discoveredAt).toISOString(),
      updated_at: entity.lastUpdatedAt instanceof Date ? entity.lastUpdatedAt.toISOString() : new Date(entity.lastUpdatedAt).toISOString(),
    };
  }

  /**
   * Convert MunicipalEntity to Supabase local_governments row
   */
  private toLocalGovernmentRow(entity: MunicipalEntity): SimulatedLocalGovernment {
    const keyContacts = entity.typeData.keyContacts as Array<{ name?: string; title?: string }> | undefined;
    return {
      _simulated: true,
      _entityId: entity.id,
      
      id: entity.localGovernmentId,
      municipality_id: entity.municipalityId || entity.id,
      name: entity.name,
      government_type: (entity.typeData.governmentType as string) || null,
      email: entity.email,
      phone: entity.phone,
      website_url: entity.website,
      head_name: keyContacts?.[0]?.name,
      head_title: keyContacts?.[0]?.title,
      city: entity.location.city,
      province: (entity.typeData.province as string) || null,
      country: entity.location.country,
      is_active: true,
      wave_number: entity.waveNumber || null,
      notes: null,
      address_line1: null,
      address_line2: null,
      postal_code: null,
    };
  }

  /**
   * Convert VCEntity to Supabase political_figures row
   */
  private toPoliticalFigureRow(entity: VCEntity): SimulatedPoliticalFigure {
    return {
      _simulated: true,
      _entityId: entity.id,
      _createdAt: new Date().toISOString(),
      
      full_name: entity.name,
      municipality_id: null,
      local_government_id: null,
      email: entity.email,
      phone: entity.phone,
      title: (entity.typeData.firmType as string) || 'vc',
      department: (entity.typeData.sectorFocus as string[])?.join(', ') || null,
      role_description: `VC firm: ${((entity.typeData.stageFocus as string[]) || []).join(', ')}`,
      ai_governance_interest: (entity.typeData.sectorFocus as string[])?.join(', ') || null,
      is_decision_maker: true,
      influence_level: 5,
      wave_number: null,
      linkedin_url: entity.typeData.linkedInUrl as string || null,
      x_handle: null,
      last_contacted_at: entity.sentAt instanceof Date ? entity.sentAt.toISOString() : (entity.sentAt ? new Date(entity.sentAt).toISOString() : null),
      created_at: entity.discoveredAt instanceof Date ? entity.discoveredAt.toISOString() : new Date(entity.discoveredAt).toISOString(),
      updated_at: entity.lastUpdatedAt instanceof Date ? entity.lastUpdatedAt.toISOString() : new Date(entity.lastUpdatedAt).toISOString(),
    };
  }

  /**
   * Simulate inserting/updating a municipality
   */
  upsertMunicipality(entity: MunicipalEntity): SimulatedMunicipality {
    const row = this.toMunicipalityRow(entity);
    
    // Check if exists (simulate upsert)
    const existingIndex = this.municipalities.findIndex(m => m.id === row.id);
    if (existingIndex >= 0) {
      this.municipalities[existingIndex] = { ...this.municipalities[existingIndex], ...row };
      console.log(`   📝 [SIMULATED] Supabase municipalities upsert: ${entity.name} (updated)`);
    } else {
      this.municipalities.push(row);
      console.log(`   📝 [SIMULATED] Supabase municipalities upsert: ${entity.name} (inserted)`);
    }
    
    return row;
  }

  /**
   * Simulate inserting/updating a local government
   */
  upsertLocalGovernment(entity: MunicipalEntity): SimulatedLocalGovernment {
    const row = this.toLocalGovernmentRow(entity);
    
    const existingIndex = this.localGovernments.findIndex(lg => lg.id === row.id);
    if (existingIndex >= 0) {
      this.localGovernments[existingIndex] = { ...this.localGovernments[existingIndex], ...row };
      console.log(`   📝 [SIMULATED] Supabase local_governments upsert: ${entity.name} (updated)`);
    } else {
      this.localGovernments.push(row);
      console.log(`   📝 [SIMULATED] Supabase local_governments upsert: ${entity.name} (inserted)`);
    }
    
    return row;
  }

  /**
   * Simulate inserting an outreach email
   */
  insertOutreachEmail(entity: MunicipalEntity | VCEntity, emailData: { subject: string; body: string; recipientEmail: string; recipientName: string }): SimulatedOutreachEmail {
    const isMunicipal = entity instanceof MunicipalEntity;
    const row: SimulatedOutreachEmail = {
      _simulated: true,
      _entityId: entity.id,
      _createdAt: new Date().toISOString(),
      
      subject: emailData.subject,
      body: emailData.body,
      recipient_email: emailData.recipientEmail,
      recipient_name: emailData.recipientName,
      local_government_id: isMunicipal ? (entity as MunicipalEntity).localGovernmentId : null,
      municipality_id: isMunicipal ? ((entity as MunicipalEntity).municipalityId || entity.id) : null,
      political_figure_id: !isMunicipal ? entity.id : null,
      variant: isMunicipal ? (entity as MunicipalEntity).outreachVariant : null,
      wave_number: isMunicipal ? (entity as MunicipalEntity).waveNumber : null,
      wave_date: isMunicipal ? (entity as MunicipalEntity).waveDate : null,
      status: 'draft',
      political_context: isMunicipal ? (entity as MunicipalEntity).personalizationContext as Record<string, unknown> || null : null,
    };
    
    this.outreachEmails.push(row);
    console.log(`   📝 [SIMULATED] Supabase outreach_emails insert: ${entity.name} → ${emailData.recipientEmail}`);
    
    return row;
  }

  /**
   * Simulate inserting a political figure (VC)
   */
  insertPoliticalFigure(entity: VCEntity): SimulatedPoliticalFigure {
    const row = this.toPoliticalFigureRow(entity);
    this.politicalFigures.push(row);
    console.log(`   📝 [SIMULATED] Supabase political_figures insert: ${entity.name}`);
    return row;
  }

  /**
   * Save all simulated data to JSON files
   */
  save(): { dataFile: string; summaryFile: string } {
    const data = {
      municipalities: this.municipalities,
      local_governments: this.localGovernments,
      outreach_emails: this.outreachEmails,
      political_figures: this.politicalFigures
    };
    
    const dataFile = path.join(this.outputDir, `${this.dryRunId}-data.json`);
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    
    const summary: SupabaseSimulationSummary = {
      dryRunId: this.dryRunId,
      timestamp: this.timestamp,
      tables: {
        municipalities: this.municipalities.length,
        local_governments: this.localGovernments.length,
        outreach_emails: this.outreachEmails.length,
        political_figures: this.politicalFigures.length
      },
      outputDir: this.outputDir
    };
    
    const summaryFile = path.join(this.outputDir, `${this.dryRunId}-summary.json`);
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    
    console.log(`\n   💾 [SIMULATED] Supabase data saved:`);
    console.log(`      Data: ${dataFile}`);
    console.log(`      Summary: ${summaryFile}`);
    
    return { dataFile, summaryFile };
  }

  /**
   * Get simulated municipality count
   */
  getMunicipalityCount(): number {
    return this.municipalities.length;
  }

  /**
   * Get simulated local government count
   */
  getLocalGovernmentCount(): number {
    return this.localGovernments.length;
  }

  /**
   * Get simulated outreach email count
   */
  getOutreachEmailCount(): number {
    return this.outreachEmails.length;
  }

  /**
   * Get simulated political figure count
   */
  getPoliticalFigureCount(): number {
    return this.politicalFigures.length;
  }

  /**
   * Get all simulated data
   */
  getData() {
    return {
      municipalities: this.municipalities,
      local_governments: this.localGovernments,
      outreach_emails: this.outreachEmails,
      political_figures: this.politicalFigures
    };
  }
}

/**
 * Create a singleton simulator for dry-run mode
 */
let simulatorInstance: SupabaseSimulator | null = null;

export function getSupabaseSimulator(options?: SupabaseSimulatorOptions): SupabaseSimulator {
  if (!simulatorInstance) {
    simulatorInstance = new SupabaseSimulator(options);
  }
  return simulatorInstance;
}

export function resetSupabaseSimulator(): void {
  simulatorInstance = null;
}

export default SupabaseSimulator;

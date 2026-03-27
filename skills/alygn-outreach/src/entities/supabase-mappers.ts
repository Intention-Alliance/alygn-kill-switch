/**
 * Supabase Mappers - Convert entities to Supabase database format
 * 
 * Maps skill entity types to Supabase table row types for upserts/inserts.
 */

import type { MunicipalEntity } from './MunicipalEntity.js';
import type { VCEntity } from './VCEntity.js';
import type { OutreachEntity } from './OutreachEntity.js';
import type {
  MunicipalityInsert,
  MunicipalityUpdate,
  LocalGovernmentRow,
  OutreachEmailInsert,
  PoliticalFigureInsert
} from './types.js';

/**
 * Convert MunicipalEntity to Supabase municipalities table insert
 */
export function toMunicipalityInsert(entity: MunicipalEntity): MunicipalityInsert {
  return {
    // Required fields
    name: entity.name,
    country: entity.location.country || 'Costa Rica',
    
    // Optional identification
    id: entity.municipalityId || entity.id,
    website_url: entity.website,
    phone: entity.phone,
    email: entity.email,
    
    // Location (Supabase: municipalities table)
    region: entity.location.region,
    province: entity.typeData.province || entity.location.state,
    
    // Municipal-specific (Supabase: municipalities table)
    population: entity.typeData.population,
    government_type: entity.typeData.governmentType,
    mayor_name: entity.typeData.keyContacts?.[0]?.name,
    mayor_email: entity.email, // If known
    general_email: entity.email,
    council_emails: null, // Will be populated after research
    
    // Pain points (Supabase: municipalities.pain_points as string[])
    pain_points: entity.typeData.painPoints,
    
    // AI governance signals (Supabase: municipalities.ai_governance_signals as Json)
    ai_governance_signals: null,
    
    // Research and verification
    verified_at: entity.verifiedAt,
    researched_at: entity.researchedAt,
    
    // Outreach tracking (Supabase: municipalities.outreach_* fields)
    outreach_sent_at: entity.outreachSentAt,
    outreach_variant: entity.outreachVariant,
    replied_at: entity.repliedAt,
    reply_sentiment: entity.replySentiment,
    
    // Wave tracking (Supabase: municipalities.wave_number, wave_date)
    wave_number: entity.waveNumber,
    wave_date: entity.waveDate,
    batch_status: entity.batchStatus,
    
    // X/Twitter tracking (Supabase: municipalities.x_* fields)
    x_handle: entity.xHandle,
    x_url: entity.xUrl,
    x_warmup_phase1_at: entity.xWarmupPhase1At,
    x_warmup_phase2_at: entity.xWarmupPhase2At,
    x_engagement_count: entity.xEngagementCount,
    x_last_engagement_at: entity.xLastEngagementAt,
    
    // Priority scoring (Supabase: municipalities.priority_score)
    priority_score: entity.priority === 'high' ? 100 : entity.priority === 'medium' ? 50 : 25,
    
    // Timestamps
    discovered_at: entity.discoveredAt.toISOString(),
    updated_at: entity.lastUpdatedAt.toISOString(),
  };
}

/**
 * Convert MunicipalEntity to Supabase municipalities table update
 */
export function toMunicipalityUpdate(entity: MunicipalEntity): MunicipalityUpdate {
  const insert = toMunicipalityInsert(entity);
  // Remove computed/auto fields that shouldn't be updated directly
  delete (insert as Partial<MunicipalityInsert>).id;
  delete (insert as Partial<MunicipalityInsert>).created_at;
  return insert;
}

/**
 * Convert MunicipalEntity to Supabase local_governments table insert
 */
export function toLocalGovernmentInsert(entity: MunicipalEntity): Partial<LocalGovernmentRow> {
  return {
    id: entity.localGovernmentId,
    municipality_id: entity.municipalityId || entity.id,
    name: entity.name,
    government_type: entity.typeData.governmentType,
    email: entity.email,
    phone: entity.phone,
    website_url: entity.website,
    head_name: entity.typeData.keyContacts?.[0]?.name,
    head_title: entity.typeData.keyContacts?.[0]?.title,
    city: entity.location.city,
    province: entity.typeData.province,
    country: entity.location.country,
    is_active: true,
    wave_number: entity.waveNumber,
    notes: null,
    address_line1: null,
    address_line2: null,
    postal_code: null,
  };
}

/**
 * Convert outreach personalization to Supabase outreach_emails insert
 */
export function toOutreachEmailInsert(
  entity: MunicipalEntity,
  emailData: { subject: string; body: string; recipientEmail: string; recipientName: string }
): OutreachEmailInsert {
  return {
    // Required fields
    subject: emailData.subject,
    body: emailData.body,
    recipient_email: emailData.recipientEmail,
    recipient_name: emailData.recipientName,
    
    // Links
    local_government_id: entity.localGovernmentId,
    municipality_id: entity.municipalityId || entity.id,
    political_figure_id: null,
    
    // Variant and wave (Supabase: outreach_emails.variant, wave_number, wave_date)
    variant: entity.outreachVariant || entity.personalizationContext?.variant as string || 'traiga',
    wave_number: entity.waveNumber,
    wave_date: entity.waveDate,
    
    // Status (Supabase: outreach_emails.status)
    status: 'draft', // Will be 'sent' after actually sending
    
    // Personalization context
    political_context: entity.personalizationContext as unknown as Record<string, unknown> | null,
  };
}

/**
 * Convert VC entity to Supabase political_figures insert
 * (VCs are tracked as political figures with is_decision_maker=true)
 */
export function toPoliticalFigureInsert(entity: VCEntity): PoliticalFigureInsert {
  return {
    // Required fields
    full_name: entity.name,
    
    // VCs have their own firm-level data
    municipality_id: null,
    local_government_id: null,
    
    // Contact
    email: entity.email,
    phone: entity.phone,
    
    // VC-specific
    title: entity.typeData.firmType,
    department: entity.typeData.sectorFocus?.join(', '),
    role_description: `VC firm: ${entity.typeData.stageFocus?.join(', ')}`,
    
    // AI governance interest
    ai_governance_interest: entity.typeData.sectorFocus?.join(', '),
    
    // Decision maker status (VCs are decision makers)
    is_decision_maker: true,
    influence_level: 5, // High influence
    
    // Wave tracking
    wave_number: null,
    
    // Links
    linkedin_url: null,
    x_handle: null,
    
    // Timestamps
    last_contacted_at: entity.sentAt?.toISOString(),
    created_at: entity.discoveredAt.toISOString(),
    updated_at: entity.lastUpdatedAt.toISOString(),
  };
}

/**
 * Create a database-ready municipality from entity data
 */
export function createSupabaseMunicipality(entity: MunicipalEntity): {
  municipality: MunicipalityInsert;
  localGovernment: Partial<LocalGovernmentRow>;
} {
  return {
    municipality: toMunicipalityInsert(entity),
    localGovernment: toLocalGovernmentInsert(entity),
  };
}

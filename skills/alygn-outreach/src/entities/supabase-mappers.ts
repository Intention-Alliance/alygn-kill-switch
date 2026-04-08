/**
 * Supabase Mappers - Convert entities to Supabase database format
 * 
 * Maps skill entity types to Supabase table row types for upserts/inserts.
 * 
 * Note: This file provides type definitions for Supabase integration.
 * The actual Supabase types should be defined in data/supabase/ directory.
 */

import type { MunicipalEntity } from './MunicipalEntity';
import type { VCEntity } from './VCEntity';

// Re-export types from types.ts
export type {
  ICostaRicaCanton, IMunicipalTypeData
} from './types';

/**
 * Supabase municipalities table insert type
 */
export interface MunicipalityInsert {
  name: string;
  country: string;
  id?: string;
  website_url?: string | null;
  phone?: string | null;
  email?: string | null;
  region?: string | null;
  province?: string | null;
  population?: number | null;
  government_type?: string | null;
  mayor_name?: string | null;
  mayor_email?: string | null;
  general_email?: string | null;
  council_emails?: string | null;
  pain_points?: string[] | null;
  ai_governance_signals?: unknown | null;
  verified_at?: string | null;
  researched_at?: string | null;
  outreach_sent_at?: string | null;
  outreach_variant?: string | null;
  replied_at?: string | null;
  reply_sentiment?: string | null;
  wave_number?: number | null;
  wave_date?: string | null;
  batch_status?: string | null;
  x_handle?: string | null;
  x_url?: string | null;
  x_warmup_phase1_at?: string | null;
  x_warmup_phase2_at?: string | null;
  x_engagement_count?: number | null;
  x_last_engagement_at?: string | null;
  priority_score?: number;
  discovered_at: string;
  updated_at: string;
  created_at?: string;
}

/**
 * Supabase municipalities table update type
 */
export type MunicipalityUpdate = Partial<MunicipalityInsert>;

/**
 * Supabase local_governments table row type
 */
export interface LocalGovernmentRow {
  id?: string | null;
  municipality_id?: string | null;
  name?: string | null;
  government_type?: string | null;
  email?: string | null;
  phone?: string | null;
  website_url?: string | null;
  head_name?: string | null;
  head_title?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  is_active?: boolean;
  wave_number?: number | null;
  notes?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Supabase outreach_emails table insert type
 */
export interface OutreachEmailInsert {
  subject: string;
  body: string;
  recipient_email: string;
  recipient_name: string;
  local_government_id?: string | null;
  political_figure_id?: string | null;
  variant?: string | null;
  wave_number?: number | null;
  wave_date?: string | null;
  status?: string;
  political_context?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Supabase political_figures table insert type
 */
export interface PoliticalFigureInsert {
  full_name: string;
  municipality_id?: string | null;
  local_government_id?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  department?: string | null;
  role_description?: string | null;
  ai_governance_interest?: string | null;
  is_decision_maker?: boolean;
  influence_level?: number;
  wave_number?: number | null;
  linkedin_url?: string | null;
  x_handle?: string | null;
  last_contacted_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

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
    mayor_email: entity.email,
    general_email: entity.email,
    council_emails: null,
    
    // Pain points
    pain_points: entity.typeData.painPoints,
    
    // AI governance signals
    ai_governance_signals: null,
    
    // Research and verification
    verified_at: entity.verifiedAt,
    researched_at: entity.researchedAt,
    
    // Outreach tracking
    outreach_sent_at: entity.outreachSentAt,
    outreach_variant: entity.outreachVariant,
    replied_at: entity.repliedAt,
    reply_sentiment: entity.replySentiment,
    
    // Wave tracking
    wave_number: entity.waveNumber,
    wave_date: entity.waveDate,
    batch_status: entity.batchStatus,
    
    // X/Twitter tracking
    x_handle: entity.xHandle,
    x_url: entity.xUrl,
    x_warmup_phase1_at: entity.xWarmupPhase1At,
    x_warmup_phase2_at: entity.xWarmupPhase2At,
    x_engagement_count: entity.xEngagementCount,
    x_last_engagement_at: entity.xLastEngagementAt,
    
    // Priority scoring
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
  // Remove computed/auto fields
  delete (insert as Record<string, unknown>).id;
  delete (insert as Record<string, unknown>).created_at;
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
    subject: emailData.subject,
    body: emailData.body,
    recipient_email: emailData.recipientEmail,
    recipient_name: emailData.recipientName,
    local_government_id: entity.localGovernmentId,
    political_figure_id: null,
    variant: entity.outreachVariant || (entity.personalizationContext?.variant as string) || 'traiga',
    wave_number: entity.waveNumber,
    wave_date: entity.waveDate,
    status: 'draft',
    political_context: entity.personalizationContext as Record<string, unknown> | null,
  };
}

/**
 * Convert VC entity to Supabase political_figures insert
 */
export function toPoliticalFigureInsert(entity: VCEntity): PoliticalFigureInsert {
  return {
    full_name: entity.name,
    municipality_id: null,
    local_government_id: null,
    email: entity.email,
    phone: entity.phone,
    title: entity.typeData.firmType,
    department: entity.typeData.sectorFocus?.join(', '),
    role_description: `VC firm: ${entity.typeData.stageFocus?.join(', ')}`,
    ai_governance_interest: entity.typeData.sectorFocus?.join(', '),
    is_decision_maker: true,
    influence_level: 5,
    wave_number: null,
    linkedin_url: entity.typeData.linkedInUrl || null,
    x_handle: null,
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

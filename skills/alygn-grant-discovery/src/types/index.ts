/**
 * ALYGN Grant Discovery - Shared Types
 */

export type GrantStatus = 'discovered' | 'researched' | 'aligned' | 'tracked' | 'applied' | 'closed';
export type DeadlineType = 'fixed' | 'rolling' | 'annual' | 'closed';
export type ResearchSourceType = 'grok' | 'perplexity' | 'web_fetch' | 'manual';

/**
 * Grant amount details
 */
export interface GrantAmount {
  min?: number;
  max: number;
  currency: string;
  notes?: string;
}

/**
 * Eligibility criteria for a grant
 */
export interface GrantEligibility {
  entityTypes: string[];
  geographicRestrictions?: string[];
  requirements: string[];
}

/**
 * Research source metadata
 */
export interface ResearchSource {
  url: string;
  source: ResearchSourceType;
  date: Date;
  confidence: number;
}

/**
 * Organization culture information
 */
export interface OrganizationCulture {
  values: string[];
  approach: string;
  community: string;
  leadership?: string[];
}

/**
 * Application process details
 */
export interface ApplicationProcess {
  steps: string[];
  formUrl?: string;
  contactEmail?: string;
  requiredDocuments: string[];
}

/**
 * Alignment validation result
 */
export interface AlignmentResult {
  score: number;
  rationale: string;
  repositioning?: {
    required: boolean;
    recommendations: string[];
  };
  recommendedApproach: string;
}

/**
 * Configuration for the discovery pipeline
 */
export interface PipelineConfig {
  notion: {
    apiKey: string;
    databaseId: string;
  };
  email: EmailConfig;
  discovery: {
    sources: ResearchSourceType[];
    focusAreas: string[];
    excludeClosed: boolean;
  };
  grok?: {
    apiKey?: string;
  };
  perplexity?: {
    apiKey?: string;
  };
}

/**
 * Email service configuration
 */
export interface EmailConfig {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  from: string;
  to: string;
}

/**
 * Change detection result
 */
export interface GrantChange {
  type: 'new' | 'updated' | 'deadline_changed' | 'amount_changed' | 'status_changed';
  grantId: string;
  grantName: string;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  detectedAt: Date;
}

/**
 * Pipeline execution result
 */
export interface PipelineResult {
  phase: 'discover' | 'research' | 'validate' | 'sync';
  success: boolean;
  grantsProcessed: number;
  grants: GrantEntity[];
  errors: string[];
  changes?: GrantChange[];
  stateFile?: string;
}

/**
 * Partial grant entity for discovery/merging
 */
export type PartialGrantEntity = Partial<GrantEntity>;

// GrantEntity will be imported from its own file
export type { GrantEntity } from '../entities/GrantEntity';

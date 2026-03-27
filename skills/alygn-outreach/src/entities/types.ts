/**
 * Entity Type Definitions for Alygn Outreach Skill
 * TypeScript interfaces for all entity types
 * 
 * Self-contained: No external imports from scripts/alygn
 */

// Base location interface
export interface Location {
  city: string | null;
  state: string | null;
  country: string | null;
  region: string | null;
}

// Entity status types
export type EntityStatus = 'discovered' | 'validated' | 'researched' | 'personalized' | 'sent' | 'replied' | 'meeting' | 'passed' | 'not_interested';

// Priority levels
export type Priority = 'high' | 'medium' | 'low';

// Draft status for approval workflow
export type DraftStatus = 'Not drafted' | 'Drafted' | 'Approved' | 'Rejected' | 'Sent';

// Email validation result
export interface IEmailValidation {
  result: 'valid' | 'invalid' | 'risky' | 'unknown' | 'error';
  confidence: number;
  details?: {
    reason?: string;
    message?: string;
    error?: string;
    rawStatus?: string;
  };
  validator?: string;
}

// Base outreach entity interface
export interface IOutreachEntity {
  id: string;
  type: 'vc' | 'municipal';
  name: string;
  email: string | null;
  website: string | null;
  phone: string | null;
  location: Location;
  status: EntityStatus;
  priority: Priority;
  discoveredAt: Date;
  lastUpdatedAt: Date;
  outreachCount: number;
  researchNotes: string | null;
  personalizationContext: Record<string, unknown> | null;
  typeData: Record<string, unknown>;
  emailValidation: IEmailValidation | null;
  sentEmailId: string | null;
  sentAt: Date | null;
  draftStatus: DraftStatus;
  draftId?: string;
  draftCreatedAt?: string;
  pageId?: string;
}

// VC-specific type data
export interface IVCTypeData extends Record<string, unknown> {
  firmType?: 'vc' | 'angel' | 'corporate' | 'accelerator';
  stageFocus?: string[];
  sectorFocus?: string[];
  checkSizeMin?: number | null;
  checkSizeMax?: number | null;
  aum?: number | null;
  partners?: IVCPartner[];
  portfolioCompanies?: string[];
  recentInvestments?: IRecentInvestment[];
  linkedInUrl?: string | null;
  crunchbaseUrl?: string | null;
  relevanceScore?: number | null;
}

// VC partner
export interface IVCPartner {
  name: string;
  title: string;
  focus?: string[];
}

// Recent investment
export interface IRecentInvestment {
  company: string;
  date: string;
  stage: string;
}

// Municipal-specific type data
export interface IMunicipalTypeData extends Record<string, unknown> {
  governmentType?: 'city' | 'county' | 'state' | 'regional';
  population?: number | null;
  budget?: number | null;
  departments?: IDepartment[];
  keyContacts?: IKeyContact[];
  initiatives?: IInitiative[];
  painPoints?: string[];
  currentVendors?: string[];
  procurementProcess?: string | null;
  decisionMakers?: IDecisionMaker[];
  province?: string | null;
  trAigaRelevant?: boolean;
}

// Department
export interface IDepartment {
  name: string;
  focus: string[];
}

// Key contact
export interface IKeyContact {
  name: string;
  title: string;
  department?: string;
  isDecisionMaker: boolean;
  focusAreas?: string[];
}

// Initiative
export interface IInitiative {
  name: string;
  description: string;
  status: 'active' | 'planned' | 'completed' | 'paused';
  budget?: number;
}

// Decision maker
export interface IDecisionMaker {
  name: string;
  title: string;
  influence: 'high' | 'medium' | 'low';
}

// Costa Rica Canton data
export interface ICostaRicaCanton {
  name: string;
  province: string;
  population: number;
  budget: number;
}

// Pipeline result types
export interface IPipelineResult {
  success: boolean;
  entity?: IOutreachEntity;
  failedAt?: string;
  error?: string;
  stageResults?: Record<string, unknown>;
}

export interface IStageResult {
  success: boolean;
  entity?: IOutreachEntity;
  error?: string;
  duration?: number;
}

// Discovery result
export interface IDiscoveryResult {
  success: boolean;
  entities: IOutreachEntity[];
  error?: string;
}

// Validation result
export interface IValidationResult {
  valid: boolean;
  confidenceScore: number;
  result: 'valid' | 'invalid' | 'risky' | 'unknown';
  details: {
    reason: string;
    message: string;
  };
  validator?: string;
}

// Research result
export interface IResearchResult {
  success: boolean;
  research: Record<string, unknown>;
  entity: IOutreachEntity;
  error?: string;
}

// Personalization result
export interface IPersonalizationResult {
  success: boolean;
  email?: {
    subject: string;
    html: string;
    text?: string;
  };
  subject?: string;
  draftId?: string;
  draftStatus?: DraftStatus;
  entity?: IOutreachEntity;
  error?: string;
}

// Sending result
export interface ISendingResult {
  success: boolean;
  messageId?: string;
  error?: string;
  testMode?: boolean;
  originalTo?: string;
  skipped?: boolean;
  reason?: string;
  wouldSend?: boolean;
  previouslySentAt?: string;
  provider?: string;
}

// CLI argument types
export interface ICLIArgs {
  type: 'vc' | 'municipal';
  action: 'discover' | 'validate' | 'research' | 'personalize' | 'send' | 'pipeline';
  dryRun: boolean;
  limit: number;
  region: string | null;
  input: string | null;
  draftStatus: DraftStatus;
  sendToList: string[];
  config: Record<string, unknown>;
}

// Strategy config types
export interface IDiscoveryConfig {
  searchQueries?: string[];
}

export interface IValidationConfig {
  validatorType?: 'regex-mx' | 'zerobounce';
  checkMxRecords?: boolean;
  checkDisposable?: boolean;
  checkRoleBased?: boolean;
  minConfidenceScore?: number;
}

export interface ISendingConfig {
  providerType?: 'smtp' | 'smartlead';
  providerConfig?: Record<string, unknown>;
  fromEmail?: string;
  testEmail?: string;
  rateLimitMs?: number;
}

// Notion page update
export interface INotionPageUpdate {
  [key: string]: unknown;
}

/**
 * Reporting types for Discord dry-run reports
 */

import type { IOutreachEntity } from '../entities/types.js';

/** Stage of the pipeline */
export type ReportStage = 'discover' | 'validate' | 'research' | 'personalize' | 'send';

/** Entity type */
export type ReportEntityType = 'vc' | 'municipal';

/** API call record */
export interface IApiCall {
  name: string;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  durationMs: number;
  requestSummary: string;
  responseSummary?: string;
  error?: string;
}

/** Database simulation record */
export interface IDatabaseSimulation {
  notion?: {
    wouldCreate: number;
    wouldUpdate: number;
    databaseName: string;
    filePath: string;
  };
  supabase?: {
    wouldInsert: number;
    wouldUpdate: number;
    tables: string[];
    filePath: string;
  };
}

/** Validation result in report */
export interface IValidationReport {
  email: string;
  status: 'valid' | 'invalid' | 'risky' | 'unknown';
  confidence: number;
  validator: string;
  reason?: string;
}

/** Action item for next steps */
export interface IActionItem {
  text: string;
  completed?: boolean;
}

/** Complete dry-run report data */
export interface IDryRunReport {
  timestamp: Date;
  entityType: ReportEntityType;
  stage: ReportStage;
  entityCount: number;
  apiCalls: IApiCall[];
  entities: IOutreachEntity[];
  databaseSimulation: IDatabaseSimulation;
  validations: IValidationReport[];
  recommendations: string[];
  actionItems: IActionItem[];
  stateFilePath: string;
  productionSummary: string;
  filterInfo?: {
    draftStatus?: string;
    sendToList?: string[];
    passedCount: number;
    totalCount: number;
  };
  maxEntitiesToShow?: number;
  maxJsonLines?: number;
}

/** Discord message chunk (for splitting long reports) */
export interface IMessageChunk {
  content: string;
  isContinuation: boolean;
}

/** Reporter configuration */
export interface IReporterConfig {
  webhookUrl?: string;
  maxMessageLength: number;
  includeFullJson: boolean;
  maxEntitiesToShow: number;
  maxJsonLines: number;
}

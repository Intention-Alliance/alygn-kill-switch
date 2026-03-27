/**
 * GrantEntity
 * Represents a funding opportunity with full research and alignment data
 */

import type { 
  GrantStatus, 
  DeadlineType, 
  ResearchSource, 
  GrantAmount, 
  GrantEligibility, 
  OrganizationCulture, 
  ApplicationProcess 
} from '../types/index';

/**
 * Grant Entity - Core data structure for funding opportunities
 * 
 * @property {string} id - Unique identifier for the grant
 * @property {'grant'} type - Entity type discriminator
 * @property {string} name - Grant program name
 * @property {string} organization - Funding organization
 * @property {GrantStatus} status - Current pipeline status
 * @property {GrantAmount} amount - Funding amount details
 * @property {Date} [deadline] - Application deadline
 * @property {DeadlineType} deadlineType - Deadline recurrence type
 * @property {GrantEligibility} eligibility - Who can apply
 * @property {string[]} researchAreas - Supported research topics
 * @property {string[]} exclusions - Explicitly excluded topics
 * @property {number} alignmentScore - 0-10 ALYGN fit score
 * @property {string} alignmentRationale - Why this score was given
 * @property {ResearchSource[]} researchSources - Where data came from
 * @property {OrganizationCulture} organizationCulture - Funder's values and approach
 * @property {ApplicationProcess} [applicationProcess] - How to apply
 * @property {string} [notionPageId] - Synced Notion page
 * @property {Date} [lastSyncedAt] - Last Notion sync timestamp
 */
export class GrantEntity {
  id: string;
  type: 'grant' = 'grant';
  name: string;
  organization: string;
  status: GrantStatus;
  
  // Core details
  amount: GrantAmount;
  deadline?: Date;
  deadlineType: DeadlineType;
  
  // Eligibility
  eligibility: GrantEligibility;
  
  // Focus areas
  researchAreas: string[];
  exclusions: string[];
  
  // Alignment
  alignmentScore: number;
  alignmentRationale: string;
  repositioningRequired?: {
    from: string;
    to: string;
  };
  
  // Research metadata
  researchSources: ResearchSource[];
  
  // Organization culture
  organizationCulture: OrganizationCulture;
  
  // Application details
  applicationProcess?: ApplicationProcess;
  
  // Notion sync
  notionPageId?: string;
  lastSyncedAt?: Date;

  /**
   * Creates a new GrantEntity instance
   * 
   * @param {Partial<GrantEntity>} data - Initial data to populate the entity
   */
  constructor(data: Partial<GrantEntity> = {}) {
    this.id = data.id || this.generateId();
    this.name = data.name || '';
    this.organization = data.organization || '';
    this.status = data.status || 'discovered';
    
    this.amount = data.amount || {
      max: 0,
      currency: 'USD'
    };
    
    this.deadline = data.deadline ? new Date(data.deadline) : undefined;
    this.deadlineType = data.deadlineType || 'rolling';
    
    this.eligibility = data.eligibility || {
      entityTypes: [],
      requirements: []
    };
    
    this.researchAreas = data.researchAreas || [];
    this.exclusions = data.exclusions || [];
    
    this.alignmentScore = data.alignmentScore ?? 0;
    this.alignmentRationale = data.alignmentRationale || '';
    this.repositioningRequired = data.repositioningRequired;
    
    this.researchSources = data.researchSources?.map(s => ({
      ...s,
      date: new Date(s.date)
    })) || [];
    
    this.organizationCulture = data.organizationCulture || {
      values: [],
      approach: '',
      community: ''
    };
    
    this.applicationProcess = data.applicationProcess;
    this.notionPageId = data.notionPageId;
    this.lastSyncedAt = data.lastSyncedAt ? new Date(data.lastSyncedAt) : undefined;
  }

  /**
   * Generate a unique ID for the grant
   * @private
   * @returns {string} Unique grant identifier
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const nameSlug = this.name 
      ? this.name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20)
      : 'grant';
    return `${nameSlug}-${timestamp}-${random}`;
  }

  /**
   * Update the grant status and record the change
   * 
   * @param {GrantStatus} newStatus - New status to set
   * @returns {void}
   */
  updateStatus(newStatus: GrantStatus): void {
    this.status = newStatus;
  }

  /**
   * Add a research source to the grant
   * 
   * @param {ResearchSource} source - Research source to add
   * @returns {void}
   */
  addResearchSource(source: ResearchSource): void {
    this.researchSources.push({
      ...source,
      date: new Date(source.date)
    });
  }

  /**
   * Calculate the average confidence across all research sources
   * 
   * @returns {number} Average confidence score (0-1)
   */
  getAverageConfidence(): number {
    if (this.researchSources.length === 0) return 0;
    const sum = this.researchSources.reduce((acc, s) => acc + s.confidence, 0);
    return sum / this.researchSources.length;
  }

  /**
   * Check if the grant is still accepting applications
   * 
   * @returns {boolean} True if grant is open
   */
  isOpen(): boolean {
    if (this.deadlineType === 'closed') return false;
    if (this.deadlineType === 'rolling') return true;
    if (!this.deadline) return true;
    return new Date() < this.deadline;
  }

  /**
   * Get days until deadline (negative if past)
   * 
   * @returns {number | null} Days until deadline or null if no deadline
   */
  getDaysUntilDeadline(): number | null {
    if (!this.deadline) return null;
    const diff = this.deadline.getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Convert the entity to a plain JSON object
   * 
   * @returns {Record<string, unknown>} Serializable grant data
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      organization: this.organization,
      status: this.status,
      amount: this.amount,
      deadline: this.deadline?.toISOString(),
      deadlineType: this.deadlineType,
      eligibility: this.eligibility,
      researchAreas: this.researchAreas,
      exclusions: this.exclusions,
      alignmentScore: this.alignmentScore,
      alignmentRationale: this.alignmentRationale,
      repositioningRequired: this.repositioningRequired,
      researchSources: this.researchSources.map(s => ({
        ...s,
        date: s.date.toISOString()
      })),
      organizationCulture: this.organizationCulture,
      applicationProcess: this.applicationProcess,
      notionPageId: this.notionPageId,
      lastSyncedAt: this.lastSyncedAt?.toISOString()
    };
  }

  /**
   * Create a GrantEntity from a plain JSON object
   * 
   * @param {Record<string, unknown>} data - Plain object data
   * @returns {GrantEntity} Reconstructed GrantEntity
   */
  static fromJSON(data: Record<string, unknown>): GrantEntity {
    return new GrantEntity(data as Partial<GrantEntity>);
  }

  /**
   * Create a GrantEntity from a partial data object
   * Useful for merging discovery results
   * 
   * @param {Partial<GrantEntity>} data - Partial grant data
   * @returns {GrantEntity} Complete GrantEntity
   */
  static fromPartial(data: Partial<GrantEntity>): GrantEntity {
    return new GrantEntity(data);
  }
}

export default GrantEntity;

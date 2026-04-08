/**
 * OutreachEntity - Base class for all outreach entities (VCs, Municipalities)
 */
import type {
  DraftStatus,
  EntityStatus,
  IEmailValidation,
  INotionPageUpdate,
  IOutreachEntity,
  Location,
  Priority
} from './types';

export type {
  DraftStatus, EntityStatus, IEmailValidation,
  INotionPageUpdate, IOutreachEntity,
  Location, Priority
};

/**
 * OutreachEntity - Base class for all outreach entities
 */
export class OutreachEntity implements IOutreachEntity {
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

  constructor(data: Partial<IOutreachEntity> = {}) {
    // Common identification
    this.id = data.id || this.generateId();
    this.type = data.type || 'vc'; // 'vc' | 'municipal'
    this.name = data.name || '';
    
    // Contact information
    this.email = data.email ?? null;
    this.website = data.website ?? null;
    this.phone = data.phone ?? null;
    
    // Location
    this.location = {
      city: data.location?.city ?? null,
      state: data.location?.state ?? null,
      country: data.location?.country ?? null,
      region: data.location?.region ?? null
    };
    
    // Outreach state
    this.status = data.status || 'discovered';
    this.priority = data.priority || 'medium';
    
    // Metadata
    this.discoveredAt = data.discoveredAt ? new Date(data.discoveredAt) : new Date();
    this.lastUpdatedAt = data.lastUpdatedAt ? new Date(data.lastUpdatedAt) : new Date();
    this.outreachCount = data.outreachCount || 0;
    
    // Content
    this.researchNotes = data.researchNotes ?? null;
    this.personalizationContext = data.personalizationContext ?? null;
    
    // Type-specific data (polymorphic)
    this.typeData = data.typeData || {};
    
    // Validation metadata
    this.emailValidation = data.emailValidation ?? null;
    
    // Email metadata
    this.sentEmailId = data.sentEmailId ?? null;
    this.sentAt = data.sentAt ? new Date(data.sentAt) : null;
    
    // Draft status for approval workflow - mapped to batch_status for municipalities
    this.draftStatus = data.draftStatus ?? data.batch_status ?? 'Not drafted';
    this.draftId = data.draftId;
    this.draftCreatedAt = data.draftCreatedAt;
    this.pageId = data.pageId;
  }
  
  /**
   * Generate unique ID
   */
  generateId(): string {
    const prefix = this.type || 'entity';
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  }
  
  /**
   * Update status and timestamp
   */
  updateStatus(newStatus: EntityStatus): void {
    this.status = newStatus;
    this.lastUpdatedAt = new Date();
  }
  
  /**
   * Set email validation result
   */
  setEmailValidation(result: IEmailValidation): void {
    this.emailValidation = result;
    this.lastUpdatedAt = new Date();
  }
  
  /**
   * Mark as sent
   */
  markSent(messageId: string): void {
    this.status = 'sent';
    this.sentEmailId = messageId;
    this.sentAt = new Date();
    this.outreachCount++;
    this.lastUpdatedAt = new Date();
    this.draftStatus = 'Sent';
  }
  
  /**
   * Increment outreach count
   */
  incrementOutreachCount(): void {
    this.outreachCount++;
    this.lastUpdatedAt = new Date();
  }
  
  /**
   * Convert to plain object for serialization
   */
  toJSON(): IOutreachEntity {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      email: this.email,
      website: this.website,
      phone: this.phone,
      location: this.location,
      status: this.status,
      priority: this.priority,
      discoveredAt: this.discoveredAt,
      lastUpdatedAt: this.lastUpdatedAt,
      outreachCount: this.outreachCount,
      researchNotes: this.researchNotes,
      personalizationContext: this.personalizationContext,
      typeData: this.typeData,
      emailValidation: this.emailValidation,
      sentEmailId: this.sentEmailId,
      sentAt: this.sentAt,
      draftStatus: this.draftStatus,
      draftId: this.draftId,
      draftCreatedAt: this.draftCreatedAt,
      pageId: this.pageId
    };
  }
  
  /**
   * Create from plain object
   */
  static fromJSON(data: Partial<IOutreachEntity>): OutreachEntity {
    return new OutreachEntity(data);
  }
}

export default OutreachEntity;

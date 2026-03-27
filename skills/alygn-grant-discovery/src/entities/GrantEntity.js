// GrantEntity - Base entity for grant opportunities
import { logger } from '../utils/logger.js';

export const GRANT_TYPES = {
  FEDERAL: 'federal',
  PRIVATE: 'private',
  CORPORATE: 'corporate',
  RESEARCH_INSTITUTION: 'research-institution'
};

export const PIPELINE_STATUS = {
  DISCOVERED: 'discovered',
  RESEARCHED: 'researched',
  VALIDATED: 'validated',
  SCORED: 'scored',
  SUBMITTED: 'submitted',
  AWARDED: 'awarded',
  REJECTED: 'rejected',
  CLOSED: 'closed'
};

export const PRIORITY_LEVELS = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low'
};

export class GrantEntity {
  constructor(data = {}) {
    this.id = data.id || this.generateId();
    this.type = 'grant';
    this.grantType = data.grantType || GRANT_TYPES.FEDERAL;
    this.name = data.name || 'Untitled Grant';
    this.agency = data.agency || '';
    this.url = data.url || '';
    this.email = data.email || '';
    this.location = data.location || { country: 'US', state: null };

    // Pipeline stage
    this.status = data.status || PIPELINE_STATUS.DISCOVERED;

    // Financials
    this.amount = {
      min: data.amount?.min || 0,
      max: data.amount?.max || 0,
      currency: data.amount?.currency || 'USD'
    };

    // Deadlines
    this.deadline = {
      LOI: data.deadline?.LOI || null,
      full: data.deadline?.full || null,
      notification: data.deadline?.notification || null,
      start: data.deadline?.start || null
    };

    // Duration
    this.duration = {
      minMonths: data.duration?.minMonths || 12,
      maxMonths: data.duration?.maxMonths || 36
    };

    // Eligibility
    this.eligibility = {
      organizationTypes: data.eligibility?.organizationTypes || ['nonprofit', 'university'],
      geographicRequirements: data.eligibility?.geographicRequirements || ['US-based'],
      aiSpecific: data.eligibility?.aiSpecific || true
    };

    // Mission alignment tags
    this.focusAreas = data.focusAreas || [];

    // Research + scoring outputs (filled during pipeline)
    this.typeData = data.typeData || {
      alignmentScore: 0,
      priorityScore: 0,
      eligibilityConfidence: 0,
      researchSources: [],
      keyRequirements: [],
      applicationComplexity: 'medium',
      fitSummary: ''
    };

    // Timestamps
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();

    // Source tracking (for cross-referencing)
    this._sources = data._sources || [];
    this._confidence = data._confidence || 1.0;
  }

  generateId() {
    const prefix = 'grant';
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `${prefix}-${timestamp}-${random}`;
  }

  addSource(source) {
    if (!this._sources.includes(source)) {
      this._sources.push(source);
    }
  }

  merge(other) {
    // Merge fields, taking highest confidence values
    if (other.name && other.name.length > this.name.length) this.name = other.name;
    if (other.agency && !this.agency) this.agency = other.agency;
    if (other.url && !this.url) this.url = other.url;
    if (other.email && !this.email) this.email = other.email;

    // Merge amounts (take max of each)
    if (other.amount?.max > this.amount.max) this.amount.max = other.amount.max;
    if (other.amount?.min > this.amount.min) this.amount.min = other.amount.min;

    // Merge deadlines (prefer earliest)
    if (other.deadline?.LOI && (!this.deadline.LOI || other.deadline.LOI < this.deadline.LOI)) {
      this.deadline.LOI = other.deadline.LOI;
    }
    if (other.deadline?.full && (!this.deadline.full || other.deadline.full < this.deadline.full)) {
      this.deadline.full = other.deadline.full;
    }

    // Merge focus areas
    if (other.focusAreas) {
      other.focusAreas.forEach(area => {
        if (!this.focusAreas.includes(area)) this.focusAreas.push(area);
      });
    }

    // Merge sources
    if (other._sources) {
      other._sources.forEach(s => this.addSource(s));
    }

    // Take highest alignment score
    if (other.typeData?.alignmentScore > this.typeData.alignmentScore) {
      this.typeData.alignmentScore = other.typeData.alignmentScore;
    }

    this.updatedAt = new Date().toISOString();
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      grantType: this.grantType,
      name: this.name,
      agency: this.agency,
      url: this.url,
      email: this.email,
      location: this.location,
      status: this.status,
      amount: this.amount,
      deadline: this.deadline,
      duration: this.duration,
      eligibility: this.eligibility,
      focusAreas: this.focusAreas,
      typeData: this.typeData,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      _sources: this._sources
    };
  }

  static fromJSON(json) {
    const grant = new GrantEntity(json);
    grant._sources = json._sources || [];
    grant._confidence = json._confidence || 1.0;
    return grant;
  }
}

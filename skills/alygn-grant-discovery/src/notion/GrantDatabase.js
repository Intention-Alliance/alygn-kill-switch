// GrantDatabase - Notion API wrapper for Grant Opportunities Tracker
import { logger } from '../utils/logger.js';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

export class GrantDatabase {
  constructor() {
    this.databaseId = process.env.NOTION_GRANTS_DB_ID || 'grant-opportunities-tracker';
    this.token = process.env.NOTION_API_KEY;
  }

  _headers() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    };
  }

  async _request(method, endpoint, body = null) {
    const url = `${NOTION_API_BASE}${endpoint}`;
    const options = {
      method,
      headers: this._headers()
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Notion API error ${response.status}: ${error}`);
    }
    return response.json();
  }

  // Query grants with filters
  async queryGrants(filters = {}) {
    const body = {
      filter: this._buildFilter(filters)
    };

    if (filters.sort) {
      body.sorts = [filters.sort];
    }

    if (filters.pageSize) {
      body.page_size = filters.pageSize;
    }

    return this._request('POST', `/databases/${this.databaseId}/query`, body);
  }

  _buildFilter(filters) {
    const conditions = [];

    if (filters.status) {
      conditions.push({
        property: 'Status',
        select: { equals: filters.status }
      });
    }

    if (filters.grantType) {
      conditions.push({
        property: 'Grant Type',
        select: { equals: filters.grantType }
      });
    }

    if (filters.minScore) {
      conditions.push({
        property: 'ALYGN Fit Score',
        number: { greater_than_or_equal_to: filters.minScore }
      });
    }

    if (filters.deadlineWithin) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + filters.deadlineWithin);
      conditions.push({
        property: 'Full Deadline',
        date: { less_than_or_equal_to: cutoff.toISOString() }
      });
    }

    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return { and: conditions };
  }

  // Create or update a grant
  async upsertGrant(grant) {
    try {
      // Try to find existing by name + agency
      const existing = await this._findExisting(grant);
      if (existing) {
        return this.updateGrant(grant, existing.id);
      }
      return this.createGrant(grant);
    } catch (error) {
      logger.error(`Upsert failed for grant ${grant.id}`, { error: error.message });
      throw error;
    }
  }

  async _findExisting(grant) {
    const response = await this.queryGrants({
      filter: {
        property: 'Grant Name',
        title: { equals: grant.name }
      }
    });

    return response.results?.find(p =>
      p.properties?.Agency?.rich_text?.[0]?.text?.content === grant.agency
    );
  }

  async createGrant(grant) {
    const properties = this._toNotionProperties(grant);
    return this._request('POST', '/pages', { parent: { database_id: this.databaseId }, properties });
  }

  async updateGrant(grant, pageId) {
    const properties = this._toNotionProperties(grant);
    return this._request('PATCH', `/pages/${pageId}`, { properties });
  }

  _toNotionProperties(grant) {
    return {
      'Grant Name': { title: [{ text: { content: grant.name } }] },
      'Agency/Funder': { rich_text: [{ text: { content: grant.agency || '' } }] },
      'Grant Type': { select: { name: grant.grantType } },
      'Status': { select: { name: grant.status } },
      'Priority': { select: { name: this._calculatePriority(grant) } },
      'Amount Min': { number: grant.amount?.min || 0 },
      'Amount Max': { number: grant.amount?.max || 0 },
      'LOI Deadline': grant.deadline?.LOI ? { date: { start: grant.deadline.LOI } } : { date: null },
      'Full Deadline': grant.deadline?.full ? { date: { start: grant.deadline.full } } : { date: null },
      'Notification Date': grant.deadline?.notification ? { date: { start: grant.deadline.notification } } : { date: null },
      'Project Start': grant.deadline?.start ? { date: { start: grant.deadline.start } } : { date: null },
      'Duration (months)': { number: grant.duration?.maxMonths || 0 },
      'Focus Areas': { multi_select: (grant.focusAreas || []).map(f => ({ name: f })) },
      'ALYGN Fit Score': { number: grant.typeData?.alignmentScore || 0 },
      'Priority Score': { number: grant.typeData?.priorityScore || 0 },
      'Eligibility Confidence': { number: grant.typeData?.eligibilityConfidence || 0 },
      'Eligibility Notes': { rich_text: [{ text: { content: grant.typeData?.eligibilityNotes || '' } }] },
      'Key Requirements': { rich_text: [{ text: { content: (grant.typeData?.keyRequirements || []).join('; ') } }] },
      'Application Complexity': { select: { name: grant.typeData?.applicationComplexity || 'medium' } },
      'Fit Summary': { rich_text: [{ text: { content: grant.typeData?.fitSummary || '' } }] },
      'Notes': { rich_text: [{ text: { content: '' } }] }
    };
  }

  _calculatePriority(grant) {
    if (!grant.deadline?.full) return 'Low';
    const days = Math.ceil((new Date(grant.deadline.full) - new Date()) / (1000 * 60 * 60 * 24));
    if (days <= 7) return 'Critical';
    if (days <= 30) return 'High';
    if (days <= 90) return 'Medium';
    return 'Low';
  }

  async getGrantsWithDeadline(days = 14) {
    const response = await this.queryGrants({ deadlineWithin: days });
    return response.results?.map(p => this._fromNotionPage(p)) || [];
  }

  async getAllGrants() {
    const response = await this.queryGrants({ pageSize: 100 });
    return response.results?.map(p => this._fromNotionPage(p)) || [];
  }

  _fromNotionPage(page) {
    const p = page.properties;
    return {
      id: page.id,
      name: p['Grant Name']?.title?.[0]?.text?.content || '',
      agency: p['Agency/Funder']?.rich_text?.[0]?.text?.content || '',
      grantType: p['Grant Type']?.select?.name || 'federal',
      status: p['Status']?.select?.name || 'discovered',
      amount: {
        min: p['Amount Min']?.number || 0,
        max: p['Amount Max']?.number || 0,
        currency: 'USD'
      },
      deadline: {
        LOI: p['LOI Deadline']?.date?.start,
        full: p['Full Deadline']?.date?.start,
        notification: p['Notification Date']?.date?.start,
        start: p['Project Start']?.date?.start
      },
      duration: {
        maxMonths: p['Duration (months)']?.number || 24
      },
      focusAreas: p['Focus Areas']?.multi_select?.map(s => s.name) || [],
      typeData: {
        alignmentScore: p['ALYGN Fit Score']?.number || 0,
        priorityScore: p['Priority Score']?.number || 0,
        eligibilityConfidence: p['Eligibility Confidence']?.number || 0,
        eligibilityNotes: p['Eligibility Notes']?.rich_text?.[0]?.text?.content || '',
        keyRequirements: (p['Key Requirements']?.rich_text?.[0]?.text?.content || '').split(';').filter(Boolean),
        applicationComplexity: p['Application Complexity']?.select?.name || 'medium',
        fitSummary: p['Fit Summary']?.rich_text?.[0]?.text?.content || ''
      }
    };
  }
}

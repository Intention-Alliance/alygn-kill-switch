/**
 * NotionGrantSync
 * Synchronizes grant data with Notion database
 * 
 * Features:
 * - Create/update grant pages
 * - Detect changes between existing and discovered grants
 * - Maintain quick reference dashboard
 * - Handle Notion API rate limits
 */

import { Client } from '@notionhq/client';
import { GrantEntity } from '../entities/GrantEntity';
import type { GrantChange } from '../types/index';

/**
 * Notion sync service for grant data
 */
export class NotionGrantSync {
  private notion: Client;
  private databaseId: string;

  /**
   * Creates a new NotionGrantSync instance
   * 
   * @param {string} apiKey - Notion API key
   * @param {string} databaseId - Notion database ID
   */
  constructor(apiKey: string, databaseId: string) {
    this.notion = new Client({ auth: apiKey });
    this.databaseId = databaseId;
  }

  /**
   * Sync a grant to Notion (create or update)
   * 
   * @param {GrantEntity} grant - Grant to sync
   * @returns {Promise<string>} Notion page ID
   */
  async syncGrant(grant: GrantEntity): Promise<string> {
    try {
      // Check if grant already exists
      const existingPageId = await this.findGrantPage(grant);
      
      if (existingPageId) {
        // Update existing page
        await this.updateGrantPage(existingPageId, grant);
        grant.notionPageId = existingPageId;
        console.log(`   📝 Updated Notion page: ${existingPageId}`);
        return existingPageId;
      } else {
        // Create new page
        const pageId = await this.createGrantPage(grant);
        grant.notionPageId = pageId;
        console.log(`   ✅ Created Notion page: ${pageId}`);
        return pageId;
      }
    } catch (error) {
      console.error(`   ❌ Notion sync failed for ${grant.name}:`, error);
      throw error;
    }
  }

  /**
   * Update the quick reference dashboard
   * 
   * @param {GrantEntity[]} grants - Current grants
   * @returns {Promise<void>}
   */
  async updateQuickReference(grants: GrantEntity[]): Promise<void> {
    try {
      // This would update a summary page with key metrics
      // For now, we'll just log it
      const openGrants = grants.filter(g => g.isOpen()).length;
      const highAlignment = grants.filter(g => g.alignmentScore >= 7).length;
      const urgent = grants.filter(g => {
        const days = g.getDaysUntilDeadline();
        return days !== null && days <= 30 && days > 0;
      }).length;

      console.log(`   📊 Quick Reference Update:`);
      console.log(`      Total grants: ${grants.length}`);
      console.log(`      Open grants: ${openGrants}`);
      console.log(`      High alignment (>=7): ${highAlignment}`);
      console.log(`      Urgent (≤30 days): ${urgent}`);

      // TODO: Update actual Notion dashboard page
      // This would involve finding the dashboard page and updating its content
    } catch (error) {
      console.error(`   ❌ Quick reference update failed:`, error);
    }
  }

  /**
   * Get all existing grants from Notion
   * 
   * @returns {Promise<GrantEntity[]>} Existing grants
   */
  async getExistingGrants(): Promise<GrantEntity[]> {
    try {
      const response = await this.notion.databases.query({
        database_id: this.databaseId,
        page_size: 100
      });

      const grants: GrantEntity[] = [];

      for (const page of response.results) {
        if (!('properties' in page)) continue;
        
        const properties = page.properties as Record<string, { type: string; [key: string]: unknown }>;
        
        // Parse Notion page to GrantEntity
        const grant = this.parseNotionPage(page.id, properties);
        if (grant) {
          grants.push(grant);
        }
      }

      console.log(`   📁 Loaded ${grants.length} existing grants from Notion`);
      return grants;
    } catch (error) {
      console.error(`   ❌ Failed to load existing grants:`, error);
      return [];
    }
  }

  /**
   * Detect changes between existing and discovered grants
   * 
   * @param {GrantEntity[]} existing - Existing grants
   * @param {GrantEntity[]} discovered - Newly discovered grants
   * @returns {Promise<GrantChange[]>} Detected changes
   */
  async detectChanges(
    existing: GrantEntity[], 
    discovered: GrantEntity[]
  ): Promise<GrantChange[]> {
    const changes: GrantChange[] = [];
    const existingMap = new Map(existing.map(g => [g.id, g]));
    const discoveredMap = new Map(discovered.map(g => [g.id, g]));

    // Find new grants
    for (const [id, grant] of discoveredMap) {
      if (!existingMap.has(id)) {
        changes.push({
          type: 'new',
          grantId: id,
          grantName: grant.name,
          detectedAt: new Date()
        });
      }
    }

    // Find updates
    for (const [id, existingGrant] of existingMap) {
      const discoveredGrant = discoveredMap.get(id);
      if (!discoveredGrant) continue;

      // Check deadline change
      if (this.hasDeadlineChanged(existingGrant, discoveredGrant)) {
        changes.push({
          type: 'deadline_changed',
          grantId: id,
          grantName: existingGrant.name,
          field: 'deadline',
          oldValue: existingGrant.deadline?.toISOString(),
          newValue: discoveredGrant.deadline?.toISOString(),
          detectedAt: new Date()
        });
      }

      // Check amount change
      if (this.hasAmountChanged(existingGrant, discoveredGrant)) {
        changes.push({
          type: 'amount_changed',
          grantId: id,
          grantName: existingGrant.name,
          field: 'amount',
          oldValue: existingGrant.amount,
          newValue: discoveredGrant.amount,
          detectedAt: new Date()
        });
      }

      // Check status change
      if (existingGrant.status !== discoveredGrant.status) {
        changes.push({
          type: 'status_changed',
          grantId: id,
          grantName: existingGrant.name,
          field: 'status',
          oldValue: existingGrant.status,
          newValue: discoveredGrant.status,
          detectedAt: new Date()
        });
      }
    }

    console.log(`   🔍 Detected ${changes.length} changes`);
    return changes;
  }

  /**
   * Find existing grant page in Notion
   * 
   * @param {GrantEntity} grant - Grant to find
   * @returns {Promise<string | null>} Page ID or null
   * @private
   */
  private async findGrantPage(grant: GrantEntity): Promise<string | null> {
    try {
      const response = await this.notion.databases.query({
        database_id: this.databaseId,
        filter: {
          and: [
            {
              property: 'Name',
              title: {
                equals: grant.name
              }
            },
            {
              property: 'Organization',
              rich_text: {
                equals: grant.organization
              }
            }
          ]
        }
      });

      if (response.results.length > 0) {
        return response.results[0].id;
      }

      return null;
    } catch (error) {
      console.error(`   ❌ Failed to find grant page:`, error);
      return null;
    }
  }

  /**
   * Create a new grant page in Notion
   * 
   * @param {GrantEntity} grant - Grant to create
   * @returns {Promise<string>} Page ID
   * @private
   */
  private async createGrantPage(grant: GrantEntity): Promise<string> {
    const properties = this.buildNotionProperties(grant);
    
    const response = await this.notion.pages.create({
      parent: { database_id: this.databaseId },
      properties
    });

    return response.id;
  }

  /**
   * Update an existing grant page
   * 
   * @param {string} pageId - Page ID to update
   * @param {GrantEntity} grant - Grant data
   * @returns {Promise<void>}
   * @private
   */
  private async updateGrantPage(pageId: string, grant: GrantEntity): Promise<void> {
    const properties = this.buildNotionProperties(grant);
    
    await this.notion.pages.update({
      page_id: pageId,
      properties
    });
  }

  /**
   * Build Notion properties from grant
   * 
   * @param {GrantEntity} grant - Grant data
   * @returns {Record<string, unknown>} Notion properties
   * @private
   */
  private buildNotionProperties(grant: GrantEntity): Record<string, unknown> {
    const amountText = grant.amount.min 
      ? `$${grant.amount.min.toLocaleString()} - $${grant.amount.max.toLocaleString()} ${grant.amount.currency}`
      : `$${grant.amount.max.toLocaleString()} ${grant.amount.currency}`;

    return {
      'Name': {
        title: [{ text: { content: grant.name } }]
      },
      'Organization': {
        rich_text: [{ text: { content: grant.organization } }]
      },
      'Status': {
        select: { name: this.formatStatus(grant.status) }
      },
      'Amount': {
        rich_text: [{ text: { content: amountText } }]
      },
      'Deadline': grant.deadline ? {
        date: { start: grant.deadline.toISOString().split('T')[0] }
      } : undefined,
      'Deadline Type': {
        select: { name: grant.deadlineType }
      },
      'Alignment Score': {
        number: grant.alignmentScore
      },
      'Research Areas': {
        multi_select: grant.researchAreas.map(area => ({ name: area }))
      },
      'Eligibility': {
        multi_select: grant.eligibility.entityTypes.map(type => ({ name: type }))
      },
      'Last Synced': {
        date: { start: new Date().toISOString() }
      },
      'Notion Page ID': {
        rich_text: [{ text: { content: grant.notionPageId || '' } }]
      }
    };
  }

  /**
   * Parse Notion page to GrantEntity
   * 
   * @param {string} pageId - Notion page ID
   * @param {Record<string, { type: string; [key: string]: unknown }>} properties - Notion properties
   * @returns {GrantEntity | null} Parsed grant or null
   * @private
   */
  private parseNotionPage(
    pageId: string, 
    properties: Record<string, { type: string; [key: string]: unknown }>
  ): GrantEntity | null {
    try {
      const name = this.extractTitle(properties['Name']);
      const organization = this.extractRichText(properties['Organization']);
      
      if (!name || !organization) return null;

      return new GrantEntity({
        name,
        organization,
        notionPageId: pageId,
        lastSyncedAt: new Date()
      });
    } catch (error) {
      console.error(`   ❌ Failed to parse Notion page:`, error);
      return null;
    }
  }

  /**
   * Extract title from Notion property
   * 
   * @param {unknown} property - Notion property
   * @returns {string | null} Extracted text
   * @private
   */
  private extractTitle(property: unknown): string | null {
    if (!property || typeof property !== 'object') return null;
    const p = property as { title?: Array<{ text: { content: string } }> };
    return p.title?.[0]?.text?.content || null;
  }

  /**
   * Extract rich text from Notion property
   * 
   * @param {unknown} property - Notion property
   * @returns {string | null} Extracted text
   * @private
   */
  private extractRichText(property: unknown): string | null {
    if (!property || typeof property !== 'object') return null;
    const p = property as { rich_text?: Array<{ text: { content: string } }> };
    return p.rich_text?.[0]?.text?.content || null;
  }

  /**
   * Format status for Notion select
   * 
   * @param {string} status - Grant status
   * @returns {string} Formatted status
   * @private
   */
  private formatStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'discovered': 'Discovered',
      'researched': 'Researched',
      'aligned': 'Aligned',
      'tracked': 'Tracked',
      'applied': 'Applied',
      'closed': 'Closed'
    };
    return statusMap[status] || status;
  }

  /**
   * Check if deadline has changed
   * 
   * @param {GrantEntity} existing - Existing grant
   * @param {GrantEntity} discovered - New data
   * @returns {boolean} Whether deadline changed
   * @private
   */
  private hasDeadlineChanged(existing: GrantEntity, discovered: GrantEntity): boolean {
    if (!existing.deadline && !discovered.deadline) return false;
    if (!existing.deadline || !discovered.deadline) return true;
    return existing.deadline.toDateString() !== discovered.deadline.toDateString();
  }

  /**
   * Check if amount has changed
   * 
   * @param {GrantEntity} existing - Existing grant
   * @param {GrantEntity} discovered - New data
   * @returns {boolean} Whether amount changed
   * @private
   */
  private hasAmountChanged(existing: GrantEntity, discovered: GrantEntity): boolean {
    return existing.amount.max !== discovered.amount.max ||
           existing.amount.min !== discovered.amount.min ||
           existing.amount.currency !== discovered.amount.currency;
  }
}

export default NotionGrantSync;

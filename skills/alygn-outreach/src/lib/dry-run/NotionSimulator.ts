/**
 * NotionSimulator — Simulates Notion API writes as JSON files
 * 
 * In Mode B dry-run, instead of calling notion.pages.create() or
 * notion.pages.update(), this module writes equivalent JSON files
 * that match the Notion API response structure exactly.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDryRunBaseDir, ensureDryRunDirs } from './DryRunSimulator';

/**
 * Notion page object as returned by the real API (simulated).
 * Matches @notionhq/client BlockObjectResponse shape.
 */
export interface SimulatedNotionPage {
  object: 'page';
  id: string;
  created_time: string;
  last_edited_time: string;
  archived: boolean;
  properties: Record<string, unknown>;
  parent: { page_id: string } | { database_id: string };
  url: string;
  dryRun: true;
  simulatedAt: string;
  /** Original entity ID from our domain model, for traceability */
  entityId?: string;
  entityType?: 'vc' | 'municipal';
}

/**
 * Simulated Notion database query response
 */
export interface SimulatedNotionQueryResult {
  object: 'list';
  results: SimulatedNotionPage[];
  has_more: boolean;
  next_cursor: string | null;
  dryRun: true;
  simulatedAt: string;
}

/**
 * Write a simulated Notion page creation result.
 * 
 * @param entityType - 'vc' | 'municipal'
 * @param entityId - Our domain entity ID (for traceability)
 * @param pageProperties - The properties object that would be sent to Notion
 * @param parentPageId - The Notion parent page ID
 */
export async function simulateNotionCreatePage(
  entityType: 'vc' | 'municipal',
  entityId: string,
  pageProperties: Record<string, unknown>,
  parentPageId: string
): Promise<SimulatedNotionPage> {
  const baseDir = getDryRunBaseDir();
  ensureDryRunDirs(baseDir);

  const timestamp = Date.now();
  const simulatedId = `dry-run-${crypto.randomUUID().slice(0, 8)}`;

  const page: SimulatedNotionPage = {
    object: 'page',
    id: simulatedId,
    created_time: new Date().toISOString(),
    last_edited_time: new Date().toISOString(),
    archived: false,
    properties: pageProperties,
    parent: { page_id: parentPageId },
    url: `https://notion.so/${simulatedId.replace(/-/g, '')}`,
    dryRun: true,
    simulatedAt: new Date().toISOString(),
    entityId,
    entityType,
  };

  const filename = `notion-${entityType}-${entityId}-${timestamp}.json`;
  const filepath = path.join(baseDir, 'notion', filename);

  fs.writeFileSync(filepath, JSON.stringify(page, null, 2));

  console.log(`[NOTION DRY RUN] Would create page: ${pageProperties['title'] || simulatedId}`);
  console.log(`                 Saved to: ${filepath}`);

  return page;
}

/**
 * Write a simulated Notion page update result.
 * 
 * @param entityType - 'vc' | 'municipal'  
 * @param entityId - Our domain entity ID
 * @param pageId - The existing Notion page ID (preserved in output)
 * @param updatedProperties - The properties that would be sent to Notion
 */
export async function simulateNotionUpdatePage(
  entityType: 'vc' | 'municipal',
  entityId: string,
  pageId: string,
  updatedProperties: Record<string, unknown>
): Promise<SimulatedNotionPage> {
  const baseDir = getDryRunBaseDir();
  ensureDryRunDirs(baseDir);

  const timestamp = Date.now();

  const page: SimulatedNotionPage = {
    object: 'page',
    id: pageId, // Keep original ID to show what would be updated
    created_time: new Date().toISOString(), // Would be original creation time in real API
    last_edited_time: new Date().toISOString(),
    archived: false,
    properties: updatedProperties,
    parent: { page_id: 'unknown' }, // Would be original parent in real API
    url: `https://notion.so/${pageId.replace(/-/g, '')}`,
    dryRun: true,
    simulatedAt: new Date().toISOString(),
    entityId,
    entityType,
  };

  const filename = `notion-${entityType}-${entityId}-update-${timestamp}.json`;
  const filepath = path.join(baseDir, 'notion', filename);

  fs.writeFileSync(filepath, JSON.stringify(page, null, 2));

  console.log(`[NOTION DRY RUN] Would update page: ${pageId}`);
  console.log(`                 Saved to: ${filepath}`);

  return page;
}

/**
 * Write a simulated Notion database query result.
 */
export async function simulateNotionQueryDatabase(
  databaseId: string,
  results: SimulatedNotionPage[]
): Promise<SimulatedNotionQueryResult> {
  const baseDir = getDryRunBaseDir();
  ensureDryRunDirs(baseDir);

  const timestamp = Date.now();

  const queryResult: SimulatedNotionQueryResult = {
    object: 'list',
    results,
    has_more: false,
    next_cursor: null,
    dryRun: true,
    simulatedAt: new Date().toISOString(),
  };

  const filename = `notion-query-${databaseId}-${timestamp}.json`;
  const filepath = path.join(baseDir, 'notion', filename);

  fs.writeFileSync(filepath, JSON.stringify(queryResult, null, 2));

  console.log(`[NOTION DRY RUN] Would query database: ${databaseId}`);
  console.log(`                 Saved to: ${filepath}`);

  return queryResult;
}

export default {
  simulateNotionCreatePage,
  simulateNotionUpdatePage,
  simulateNotionQueryDatabase,
};

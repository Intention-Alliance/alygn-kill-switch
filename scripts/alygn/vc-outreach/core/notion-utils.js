/**
 * Notion Utilities for VC Outreach Tracking
 */

import { Client } from "@notionhq/client";
import fs from "fs";
import path from "path";

const NOTION_TOKEN = process.env.NOTION_TOKEN;

export function getClient() {
  if (!NOTION_TOKEN) {
    // Try loading from credentials
    const credentialsPath = path.join(process.env.HOME, '.openclaw', 'workspace', 'config', 'credentials.json');
    if (fs.existsSync(credentialsPath)) {
      const creds = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      if (creds.notion?.token) {
        return new Client({ auth: creds.notion.token });
      }
    }
    throw new Error('NOTION_TOKEN not found');
  }
  return new Client({ auth: NOTION_TOKEN });
}

export async function updateSentStatus(pageId, messageId, sentDate) {
  const notion = getClient();
  
  await notion.pages.update({
    page_id: pageId,
    properties: {
      'Status': { select: { name: 'Sent' } },
      'Sent Date': { date: { start: sentDate } },
      'Notes': {
        rich_text: [{
          text: { content: `Sent: ${sentDate} | ID: ${messageId}` }
        }]
      }
    }
  });
}

/**
 * Update entity status in Notion
 * Creates or updates a VC entry with the given status
 * @param {Object} entity - VC entity with name, email, website
 * @param {string} status - Status to set (e.g., 'Ready for outreach', 'Not contacted')
 * @returns {Promise<Object>} Notion page result
 */
export async function updateNotionStatus(entity, status) {
  const notion = getClient();
  
  // Check if NOTION_VC_DATABASE_ID is set
  const databaseId = process.env.NOTION_VC_DATABASE_ID;
  if (!databaseId) {
    throw new Error('NOTION_VC_DATABASE_ID not configured');
  }
  
  // First, try to find existing page
  const existing = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: 'Name',
      title: { equals: entity.name }
    }
  });
  
  const properties = {
    'Name': { title: [{ text: { content: entity.name } }] },
    'Status': { select: { name: status } },
    'Email': { email: entity.email || null },
    'Website': { url: entity.website || null },
    'Updated At': { date: { start: new Date().toISOString() } }
  };
  
  if (existing.results.length > 0) {
    // Update existing page
    const pageId = existing.results[0].id;
    await notion.pages.update({
      page_id: pageId,
      properties
    });
    return { action: 'updated', pageId };
  } else {
    // Create new page
    const result = await notion.pages.create({
      parent: { database_id: databaseId },
      properties
    });
    return { action: 'created', pageId: result.id };
  }
}

export async function queryApprovedEmails(databaseId, limit = 10) {
  const notion = getClient();
  
  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: 'Status',
      select: { equals: 'Approved' }
    },
    page_size: limit
  });
  
  return response.results;
}

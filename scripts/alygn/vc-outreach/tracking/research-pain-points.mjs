/**
 * VC Pain Points Research Script
 * 
 * Fills missing pain points for VCs marked "Ready for outreach" in Notion.
 * Uses xAI/Grok API for research, then updates Notion directly.
 * 
 * Usage: node research-pain-points.mjs [--limit=5] [--dry-run]
 */

import { Client } from '@notionhq/client';
import fs from 'fs';
import path from 'path';

const NOTION_KEY = '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';
const XAI_KEY = 'xai-nWiIX9uhlvbuSSHAnunVw8LOcP3VwBy3G8mUBcYr9ry620oPs4pfmEwQfVL5UjlHwCsdBVXnGJFQ7UCY';
const XAI_ENDPOINT = 'https://api.x.ai/v1';
const XAI_MODEL = 'grok-4-1-fast-reasoning';
const DATABASE_ID = '30533487-4af6-81e7-ad64-000bbd4829ff';

const notion = new Client({ auth: NOTION_KEY });

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : 5;

console.log('🚀 VC Pain Points Research');
console.log(`   Limit: ${LIMIT} | Dry run: ${dryRun}`);
console.log('');

/**
 * Fetch VCs needing pain points from Notion
 */
async function fetchVCsNeedingPainPoints(limit) {
  const all = [];
  let cursor = undefined;
  
  do {
    const params = {
      data_source_id: DATABASE_ID,
      page_size: 100,
      filter: {
        and: [
          { property: 'Status', select: { equals: 'Ready for outreach' } }
        ]
      }
    };
    if (cursor) params.start_cursor = cursor;
    const res = await notion.dataSources.query(params);
    all.push(...res.results);
    cursor = res.next_cursor;
  } while (cursor);

  const needResearch = all.filter(p => {
    const pp = p.properties['Pain Points']?.multi_select || [];
    return pp.length === 0;
  }).map(p => ({
    pageId: p.id,
    name: p.properties.Name?.title?.[0]?.text?.content || 'Unknown',
    email: p.properties.Email?.email,
    website: p.properties.Website?.url,
    partners: p.properties.Partners?.rich_text?.[0]?.text?.content,
    focusAreas: p.properties['Focus Areas']?.multi_select?.map(s => s.name) || [],
    geography: p.properties.Geography?.rich_text?.[0]?.text?.content,
    notes: p.properties.Notes?.rich_text?.[0]?.text?.content
  }));

  console.log(`📦 Found ${needResearch.length} VCs needing pain points (limiting to ${limit})`);
  return needResearch.slice(0, limit);
}

/**
 * Research VC pain points using xAI/Grok
 */
async function researchPainPoints(vc) {
  const prompt = `You are an expert VC researcher. Analyze ${vc.name} and identify their top 3 pain points as a venture capital firm.

Context about ${vc.name}:
- Website: ${vc.website || 'Unknown'}
- Partners: ${vc.partners || 'Unknown'}
- Focus Areas: ${vc.focusAreas.join(', ') || 'Unknown'}
- Geography: ${vc.geography || 'Unknown'}

Consider:
1. What challenges do their portfolio companies face in AI safety/governance?
2. What gaps exist in their current investment thesis around responsible AI?
3. What market friction points affect their deal flow or portfolio growth?

Return ONLY a JSON array of exactly 3 pain point strings. Each pain point should be specific, actionable, and 10-25 words long. Example format:
["Pain point 1 description", "Pain point 2 description", "Pain point 3 description"]`;

  try {
    const response = await fetch(`${XAI_ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: XAI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`xAI API ${response.status}: ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    
    // Parse JSON array from response
    let painPoints;
    try {
      // Try direct parse
      painPoints = JSON.parse(content);
    } catch {
      // Try extracting JSON from markdown code blocks
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        painPoints = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse pain points from response');
      }
    }

    if (!Array.isArray(painPoints) || painPoints.length < 1) {
      throw new Error('Invalid pain points format');
    }

    // Notion multi_select doesn't allow commas - replace with semicolons
    return painPoints.slice(0, 3).map(String).map(pp => pp.replace(/,/g, ';'));
  } catch (error) {
    console.error(`   ❌ Research failed for ${vc.name}: ${error.message}`);
    return null;
  }
}

/**
 * Update VC pain points in Notion
 */
async function updateNotionPainPoints(pageId, painPoints) {
  try {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        'Pain Points': {
          multi_select: painPoints.map(point => ({ name: point }))
        }
      }
    });
    return true;
  } catch (error) {
    console.error(`   ❌ Notion update failed: ${error.message}`);
    return false;
  }
}

/**
 * Main
 */
async function main() {
  const vcs = await fetchVCsNeedingPainPoints(LIMIT);
  
  if (vcs.length === 0) {
    console.log('✅ No VCs need research!');
    return;
  }

  const stats = { researched: 0, updated: 0, failed: 0 };

  for (const vc of vcs) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🔍 ${vc.name}`);
    console.log(`   Email: ${vc.email || 'N/A'} | Website: ${vc.website || 'N/A'}`);
    console.log(`   Partners: ${vc.partners || 'N/A'}`);

    if (dryRun) {
      console.log('   [DRY RUN] Would research pain points');
      stats.researched++;
      continue;
    }

    const painPoints = await researchPainPoints(vc);
    
    if (painPoints) {
      console.log(`   📋 Pain points found:`);
      painPoints.forEach((pp, i) => console.log(`      ${i + 1}. ${pp}`));
      stats.researched++;

      const updated = await updateNotionPainPoints(vc.pageId, painPoints);
      if (updated) {
        stats.updated++;
        console.log(`   ✅ Notion updated`);
      } else {
        stats.failed++;
      }
    } else {
      stats.failed++;
    }

    // Rate limit: wait 2s between API calls
    if (vcs.indexOf(vc) < vcs.length - 1) {
      console.log('   ⏳ Waiting 2s...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Research complete!`);
  console.log(`   Researched: ${stats.researched}`);
  console.log(`   Updated: ${stats.updated}`);
  console.log(`   Failed: ${stats.failed}`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
import { Client } from '@notionhq/client';
import { getNotionKey } from './shared/load-credentials.js';

const DATA_SOURCE_ID = '30533487-4af6-81e7-ad64-000bbd4829ff';

// Create notion client directly
const notion = new Client({ auth: getNotionKey() });

async function findAndUpdateVC(vcId, vcName) {
  console.log(`🔍 Looking for VC: ${vcName} (ID: ${vcId})`);

  try {
    // Query by ID in the ID field using dataSources API
    const response = await notion.dataSources.query({
      data_source_id: DATA_SOURCE_ID,
      filter: {
        property: 'ID',
        rich_text: {
          equals: vcId
        }
      },
      page_size: 10
    });

    if (response.results.length === 0) {
      console.log(`   ⚠️  VC not found by ID, trying by name...`);

      // Try by name
      const nameResponse = await notion.dataSources.query({
        data_source_id: DATA_SOURCE_ID,
        filter: {
          property: 'Name',
          title: {
            contains: vcName
          }
        },
        page_size: 10
      });

      if (nameResponse.results.length === 0) {
        console.log(`   ❌ VC not found: ${vcName}`);
        return null;
      }

      const page = nameResponse.results[0];
      console.log(`   ✅ Found by name: ${page.id}`);
      return page;
    }

    const page = response.results[0];
    console.log(`   ✅ Found by ID: ${page.id}`);
    return page;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return null;
  }
}

async function updateDraftStatus(page, vcName) {
  try {
    await notion.pages.update({
      page_id: page.id,
      properties: {
        'Draft Status': {
          select: { name: 'Approved' }
        }
      }
    });
    console.log(`   ✅ Updated Draft Status to "Approved" for ${vcName}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Failed to update: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Updating VC Draft Status to "Approved"\n');

  const vcs = [
    { id: 'vc-hC5bXd', name: 'Air Street Capital' },
    { id: 'vc-zTC37p', name: '2048 Ventures' }
  ];

  const results = [];

  for (const vc of vcs) {
    const page = await findAndUpdateVC(vc.id, vc.name);
    if (page) {
      const success = await updateDraftStatus(page, vc.name);
      results.push({ name: vc.name, id: vc.id, pageId: page.id, success });
    } else {
      results.push({ name: vc.name, id: vc.id, pageId: null, success: false });
    }
    console.log('');
  }

  console.log('\n📊 Summary:');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);

const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

const notion = new Client({ auth: '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' });
const PAGE_ID = '34133487-4af6-81ff-85ae-e87aafbf5cd1';

const assets = [
  {
    path: 'docs/developer-advocate/assets/portraits/2026-04-13-zero-trust-ai-infrastructure-portrait.png',
    caption: 'Zero-Trust AI Infrastructure - Featured Portrait',
    location: 'Post 1 (X Thread)'
  },
  {
    path: 'docs/developer-advocate/assets/diagrams/2026-04-13-zero-trust-architecture-diagram.png',
    caption: 'Zero-Trust Architecture Diagram',
    location: 'Blog Tutorial'
  },
  {
    path: 'docs/developer-advocate/assets/infographics/2026-04-13-cloud-vs-local-infobae-style.png',
    caption: 'Cloud vs Local Cost Comparison (Infobae Style)',
    location: 'Post 7 (X Thread)'
  }
];

async function uploadAssetToNotion(assetPath, caption, location) {
  const fullPath = path.join('/home/andlersrv/.openclaw/workspace', assetPath);
  
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    return null;
  }

  try {
    // Step 1: Create file upload
    console.log(`📤 Creating upload for ${path.basename(assetPath)}...`);
    const upload = await notion.fileUploads.create({
      mode: 'single_part',
      filename: path.basename(assetPath),
      content_type: 'image/png'
    });
    console.log(`   Upload ID: ${upload.id}`);

    // Step 2: Send file content (SDK auto-completes for single_part)
    console.log(`   Uploading file...`);
    const fileData = fs.readFileSync(fullPath);
    const blob = new Blob([fileData], { type: 'image/png' });
    
    await notion.fileUploads.send({
      file_upload_id: upload.id,
      file: {
        filename: path.basename(assetPath),
        data: blob
      }
    });

    // Step 3: Attach to page (NO complete needed - SDK does it automatically)
    console.log(`   Attaching to page with caption...`);
    await notion.blocks.children.append({
      block_id: PAGE_ID,
      children: [{
        object: 'block',
        type: 'image',
        image: {
          type: 'file_upload',
          file_upload: { id: upload.id },
          caption: [{
            type: 'text',
            text: { content: `${caption} - ${location}` }
          }]
        }
      }]
    });

    console.log(`   ✅ Asset attached!`);
    return upload.id;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    if (error.body) {
      console.error(`   Details:`, JSON.stringify(error.body, null, 2));
    }
    return null;
  }
}

async function uploadAllAssets() {
  console.log('🚀 Starting asset upload to Notion...\n');
  
  const results = [];
  for (const asset of assets) {
    console.log(`\n📎 Uploading: ${path.basename(asset.path)}`);
    console.log(`   Location: ${asset.location}`);
    
    const uploadId = await uploadAssetToNotion(asset.path, asset.caption);
    results.push({ ...asset, uploadId, success: !!uploadId });
  }

  console.log('\n📊 Upload Summary:');
  results.forEach(r => {
    console.log(`   ${r.success ? '✅' : '❌'} ${path.basename(r.path)} - ${r.location}`);
  });

  const successCount = results.filter(r => r.success).length;
  console.log(`\n✅ Uploaded ${successCount}/${assets.length} assets to Notion page`);
  console.log(`Page URL: https://www.notion.so/${PAGE_ID.replace(/-/g, '')}`);
}

uploadAllAssets();

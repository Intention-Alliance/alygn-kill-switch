const https = require('https');
const fs = require('fs');

const NOTION_KEY = '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';

const PAGES = {
    blog: { id: '34233487-4af6-81eb-87d3-c717badf21f1', file: 'docs/developer-advocate/blog/ai-safety-hardware-evolution.md', title: 'Blog Tutorial' },
    linkedin: { id: '34233487-4af6-8162-aa66-d89b8872b396', file: 'docs/developer-advocate/social/ai-safety-governance-linkedin.md', title: 'LinkedIn Post' },
    xthread: { id: '34233487-4af6-81e6-a2e8-e3e4604f0635', file: 'docs/developer-advocate/social/ai-safety-governance-x-thread.md', title: 'X/Twitter Thread' },
    assets: { id: '34233487-4af6-8171-97fe-c142b5c61d69', file: 'docs/developer-advocate/ai-safety-assets-plan.md', title: 'Asset Integration Plan' },
    rollout: { id: '34233487-4af6-812a-bec8-f2399f042965', file: 'docs/developer-advocate/30-day-content-rollout-plan.md', title: '30-Day Rollout Plan' }
};

function markdownToBlocks(md) {
    const lines = md.split('\n');
    const blocks = [];
    
    for (const line of lines) {
        if (!line.trim()) continue;
        
        let block = { object: 'block', type: 'paragraph', paragraph: { rich_text: [] } };
        
        if (line.startsWith('# ')) {
            block = { object: 'block', type: 'heading_1', heading_1: { rich_text: [] } };
            block.heading_1.rich_text = [{ type: 'text', text: { content: line.slice(2) } }];
        } else if (line.startsWith('## ')) {
            block = { object: 'block', type: 'heading_2', heading_2: { rich_text: [] } };
            block.heading_2.rich_text = [{ type: 'text', text: { content: line.slice(3) } }];
        } else if (line.startsWith('### ')) {
            block = { object: 'block', type: 'heading_3', heading_3: { rich_text: [] } };
            block.heading_3.rich_text = [{ type: 'text', text: { content: line.slice(4) } }];
        } else if (line.startsWith('- ')) {
            block = { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [] } };
            block.bulleted_list_item.rich_text = [{ type: 'text', text: { content: line.slice(2) } }];
        } else if (line.match(/^\d+\. /)) {
            block = { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [] } };
            block.numbered_list_item.rich_text = [{ type: 'text', text: { content: line.replace(/^\d+\. /, '') } }];
        } else {
            block.paragraph.rich_text = [{ type: 'text', text: { content: line } }];
        }
        
        blocks.push(block);
    }
    
    return blocks;
}

async function uploadBlocks(pageId, blocks) {
    const chunks = [];
    for (let i = 0; i < blocks.length; i += 100) {
        chunks.push(blocks.slice(i, i + 100));
    }
    
    for (let i = 0; i < chunks.length; i++) {
        const data = JSON.stringify({ children: chunks[i] });
        
        await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'api.notion.com',
                path: `/v1/blocks/${pageId}/children`,
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${NOTION_KEY}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            }, (res) => {
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    let body = '';
                    res.on('data', d => body += d);
                    res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${body}`)));
                }
            });
            
            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }
}

async function uploadPage(name, config) {
    console.log(`📄 Uploading: ${config.title}...`);
    
    const content = fs.readFileSync(config.file, 'utf8');
    const blocks = markdownToBlocks(content);
    
    await uploadBlocks(config.id, blocks);
    
    console.log(`  ✅ ${config.title} uploaded (${blocks.length} blocks)`);
    console.log(`  URL: https://www.notion.so/${config.id}\n`);
}

async function main() {
    console.log('📤 Uploading AI Safety Content Batch to Notion...\n');
    
    for (const [name, config] of Object.entries(PAGES)) {
        await uploadPage(name, config);
    }
    
    console.log('✅ All content uploaded with proper formatting!');
    console.log('\nAccess at: https://www.notion.so/AI-Safety-Governance-Content-Batch-342334874af68132a9a3c7ab83f67684');
}

main().catch(console.error);

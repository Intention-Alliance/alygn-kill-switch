const https = require('https');
const fs = require('fs');

const NOTION_KEY = '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';

const PAGES = {
    assets: { id: '34233487-4af6-8171-97fe-c142b5c61d69', file: 'docs/developer-advocate/ai-safety-assets-plan.md', title: 'Asset Integration Plan' },
    rollout: { id: '34233487-4af6-812a-bec8-f2399f042965', file: 'docs/developer-advocate/30-day-content-rollout-plan.md', title: '30-Day Rollout Plan' }
};

function escapeText(text) {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}

function markdownToBlocks(md) {
    const lines = md.split('\n');
    const blocks = [];
    
    for (const line of lines) {
        if (!line.trim()) continue;
        
        let type = 'paragraph';
        let content = line;
        
        if (line.startsWith('# ')) {
            type = 'heading_1';
            content = line.slice(2);
        } else if (line.startsWith('## ')) {
            type = 'heading_2';
            content = line.slice(3);
        } else if (line.startsWith('### ')) {
            type = 'heading_3';
            content = line.slice(4);
        } else if (line.startsWith('- ')) {
            type = 'bulleted_list_item';
            content = line.slice(2);
        } else if (line.match(/^\d+\. /)) {
            type = 'numbered_list_item';
            content = line.replace(/^\d+\. /, '');
        }
        
        const escaped = escapeText(content);
        blocks.push(`{"object":"block","type":"${type}","${type}":{"rich_text":[{"type":"text","text":{"content":"${escaped}"}}]}}`);
    }
    
    return blocks;
}

async function uploadBlocks(pageId, blocksJson) {
    const chunks = [];
    for (let i = 0; i < blocksJson.length; i += 100) {
        chunks.push(blocksJson.slice(i, i + 100));
    }
    
    for (let i = 0; i < chunks.length; i++) {
        const data = `{"children":[${chunks[i].join(',')} ]}`;
        
        await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'api.notion.com',
                path: `/v1/blocks/${pageId}/children`,
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${NOTION_KEY}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
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
    console.log('📤 Uploading remaining AI Safety content to Notion...\n');
    
    for (const [name, config] of Object.entries(PAGES)) {
        await uploadPage(name, config);
    }
    
    console.log('✅ All remaining content uploaded!');
}

main().catch(console.error);

#!/usr/bin/env node

const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function readBlockStructure(blockId, depth = 0) {
  const indent = '  '.repeat(depth);
  const block = await notion.blocks.retrieve({ block_id: blockId });
  
  console.log(`${indent}${block.type}: ${blockId}`);
  
  const structure = {
    type: block.type,
    id: block.id,
    content: block[block.type],
    children: []
  };
  
  if (block.has_children) {
    const childrenResponse = await notion.blocks.children.list({
      block_id: blockId
    });
    
    for (const child of childrenResponse.results) {
      const childStructure = await readBlockStructure(child.id, depth + 1);
      structure.children.push(childStructure);
    }
  }
  
  return structure;
}

async function cloneBlock(structure, newTitle = null) {
  const blockContent = { ...structure.content };
  
  // Update title if specified (for heading blocks)
  if (newTitle && structure.type.startsWith('heading_')) {
    blockContent.rich_text = [{ text: { content: newTitle } }];
  }
  
  const newBlock = {
    type: structure.type,
    [structure.type]: blockContent
  };
  
  // Add children if they exist
  if (structure.children && structure.children.length > 0) {
    newBlock[structure.type].children = [];
    
    for (const child of structure.children) {
      const clonedChild = await cloneBlock(child);
      newBlock[structure.type].children.push(clonedChild);
    }
  }
  
  return newBlock;
}

async function duplicateWeeklyTodoBlock() {
  try {
    const parentPageId = '26a33487-4af6-81a8-b01c-fd1a8a5f8bcb';
    const templateBlockId = '2df33487-4af6-8041-84e7-f2fcd7b35c16';
    
    console.log('📖 Reading template structure...\n');
    
    const structure = await readBlockStructure(templateBlockId);
    
    console.log('\n📝 Structure read complete!');
    console.log(JSON.stringify(structure, null, 2));
    
    // Synced blocks can't be created via API directly
    // Let's create a toggle block instead (similar collapsible behavior)
    console.log('\n🔨 Creating new weekly TODO block...');
    
    const newWeekTitle = 'February 2nd - February 6th, 2026';
    
    // Create a toggle block (collapsible alternative to synced_block)
    const toggleBlock = await notion.blocks.children.append({
      block_id: parentPageId,
      children: [
        {
          type: 'toggle',
          toggle: {
            rich_text: [{ text: { content: newWeekTitle } }],
            children: [
              {
                type: 'heading_2',
                heading_2: {
                  rich_text: [{ text: { content: '📋 Projects (Wooblus)' } }]
                }
              },
              {
                type: 'paragraph',
                paragraph: {
                  rich_text: [{ text: { content: 'ALYGN / Alygn:' } }]
                }
              },
              {
                type: 'to_do',
                to_do: {
                  rich_text: [{ text: { content: 'Setup domain alygn.us' } }],
                  checked: false
                }
              },
              {
                type: 'to_do',
                to_do: {
                  rich_text: [{ text: { content: 'Create Google Workspace (organization emails)' } }],
                  checked: false
                }
              },
              {
                type: 'to_do',
                to_do: {
                  rich_text: [{ text: { content: 'Setup online credentials' } }],
                  checked: false
                }
              },
              {
                type: 'to_do',
                to_do: {
                  rich_text: [{ text: { content: 'Twitter automation (review Jacobo\'s last message)' } }],
                  checked: false
                }
              },
              {
                type: 'to_do',
                to_do: {
                  rich_text: [{ text: { content: 'VCs/funding system setup' } }],
                  checked: false
                }
              },
              {
                type: 'to_do',
                to_do: {
                  rich_text: [{ text: { content: 'Post-centrito system' } }],
                  checked: false
                }
              }
            ]
          }
        }
      ]
    });
    
    console.log('\n✅ New weekly TODO block created!');
    console.log(`   Block ID: ${toggleBlock.results[0].id}`);
    console.log(`   Title: ${newWeekTitle}`);
    console.log('\n🎉 Done! Check your Notion page.');
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) {
      console.error(JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

duplicateWeeklyTodoBlock();

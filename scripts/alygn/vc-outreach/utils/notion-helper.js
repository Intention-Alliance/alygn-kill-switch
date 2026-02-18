const { Client } = require('@notionhq/client');
const fs = require('fs');

function loadConfig() {
  try {
    const cfgPath = require('path').join(__dirname, 'notion-config.json');
    if (fs.existsSync(cfgPath)) return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch (e) {}
  return {};
}

function getClient(notionKey) {
  const key = notionKey || process.env.NOTION_KEY || loadConfig().notionKey;
  return new Client({ auth: key });
}

async function queryDatabase(notion, databaseId, body) {
  return notion.databases.query({ database_id: databaseId, ...body });
}

async function updatePage(notion, pageId, properties) {
  return notion.pages.update({ page_id: pageId, properties });
}

async function retrievePage(notion, pageId) {
  return notion.pages.retrieve({ page_id: pageId });
}

async function createPage(notion, parentPageId, title) {
  return notion.pages.create({
    parent: { page_id: parentPageId },
    properties: {
      title: [ { text: { content: title } } ]
    }
  });
}

async function appendBlocks(notion, blockId, children) {
  return notion.blocks.children.append({ block_id: blockId, children });
}

module.exports = {
  getClient,
  queryDatabase,
  updatePage,
  retrievePage,
  createPage,
  appendBlocks,
};

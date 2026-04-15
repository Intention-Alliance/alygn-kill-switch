const { Client } = require('@notionhq/client');
const notion = new Client({ auth: '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' });
const PAGE_ID = '34133487-4af6-81ff-85ae-e87aafbf5cd1';
const posts = [
  "Post 1: We built AIInfrastructure on lean budget. Zero API costs. Zero exposed ports. ZeroTrust architecture",
  "Post 2: Constraint: 24/7 LLM plus remote access. Cloud equals costs plus data leaving perimeter. Local non-negotiable.",
  "Post 3: ZeroTrust Networking: WireGuard mesh. Identity-bound. Zero inbound ports. LLM invisible to scanners.",
  "Post 4: Intelligent Routing: Dual-path. Proxy buffering OFF. Token streaming requires it. DevOps",
  "Post 5: HA Compute: Primary GPU plus secondary fallback. Auto failover. Zero downtime.",
  "Post 6: Queuing: Models in VRAM permanently. Extended timeouts. Sequential but patient.",
  "Post 7: Results: Zero API costs, full sovereignty, zero downtime. Clever engineering plus ZeroTrust mindset."
];
async function updatePage() {
  try {
    const children = [
      { object: 'block', type: 'divider', divider: {} },
      { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: 'X Thread Content (7 posts)' } }] } }
    ];
    posts.forEach(post => {
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: post } }] }
      });
    });
    const response = await notion.blocks.children.append({ block_id: PAGE_ID, children });
    console.log('Success! Added', response.results.length, 'blocks');
  } catch (error) {
    console.error('Error:', error.message);
  }
}
updatePage();

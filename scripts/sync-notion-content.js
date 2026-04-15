const { Client } = require('@notionhq/client');
const notion = new Client({ auth: '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' });
const PAGE_ID = '34133487-4af6-81ff-85ae-e87aafbf5cd1';

const xThreadPosts = [
  "Post 1/7 (Hook): We built #AIInfrastructure on a lean startup budget. Zero cloud API costs. Zero exposed ports. Zero compromises. Here's the #ZeroTrust architecture",
  "Post 2/7: The constraint: 24/7 LLM access for automated agents + secure remote access for the team. Cloud APIs meant recurring costs + data leaving our perimeter. Local inference was non-negotiable. But remote access without exposure? That's the #StartupEngineering challenge.",
  "Post 3/7: #ZeroTrust Networking: Mesh network via WireGuard. Identity-bound access through our workspace provider. Zero inbound ports to the public internet. Our #LLM infrastructure is invisible to automated scanners. Your perimeter doesn't need visibility to be accessible.",
  "Post 4/7: Intelligent Routing: Dual-path architecture: Encrypted tunnel for remote traffic, Direct local path for on-network access. Critical: disabled proxy buffering. Buffered responses break real-time token streaming. #DevOps matters.",
  "Post 5/7: High-Availability Compute: Primary: GPU-powered for complex reasoning, Secondary: Always-on fallback. Automatic failover when primary conserves resources. Automated operations never experience downtime. Always on.",
  "Post 6/7: Hardware-Aware Queuing: The bottleneck: multiple agents querying simultaneously = timeouts. Our approach: Models stay resident in VRAM permanently, Extended client timeouts (patient queuing > forced concurrency). Stability over speed. Sequential but patient.",
  "Post 7/7: The results: Enterprise security on startup budget, Zero recurring #LLM API costs, 100% data sovereignty, Zero downtime operations, Secure access from anywhere. The takeaway: You don't need enterprise budgets for enterprise infrastructure. You need clever engineering and a #ZeroTrust mindset. #AIInfrastructure #StartupEngineering #DevOps #CTO"
];

const linkedInContent = `Six months ago, I was staring at our cloud LLM bill doing the math. At our growth rate, we'd burn 2-3k/month within a year. For a lean startup, that's a runway killer. Worse: every prompt contained proprietary data. Agent conversations, code snippets, business logic - all stored on someone else's servers. So I made a decision: we're going local. No cloud APIs. No recurring costs. No data leaving our perimeter. Here's what we built: Zero-Trust Networking (Identity-bound mesh network. Zero inbound ports), Intelligent Routing (Dual-path architecture. Proxy buffering disabled), High-Availability Cluster (Primary GPU + secondary fallback. Zero downtime), Hardware-Aware Queuing (Models stay resident in VRAM. Extended timeouts), Defense-in-Depth (Firewall rules enforce routing layer). Results: Zero recurring LLM API costs, 100% data sovereignty, Zero downtime operations, Enterprise security on startup budget. Key Learnings: 1) Start with Zero-Trust networking, 2) Patient queuing beats forced concurrency, 3) Test failover before you need it, 4) Documentation is your future friend.`;

async function updateNotionPage() {
  try {
    // First, get existing blocks to delete
    const existingBlocks = await notion.blocks.children.list({ block_id: PAGE_ID });
    
    // Delete incorrect content (keep first 6 blocks which are headers)
    const blocksToDelete = existingBlocks.results.slice(6);
    for (const block of blocksToDelete) {
      await notion.blocks.delete({ block_id: block.id });
    }

    // Add correct X Thread content
    const xThreadBlocks = [
      { object: 'block', type: 'divider', divider: {} },
      { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: 'X Thread Content (7 posts - EXACT)' } }] } }
    ];
    
    xThreadPosts.forEach(post => {
      xThreadBlocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: post } }] }
      });
    });

    await notion.blocks.children.append({ block_id: PAGE_ID, children: xThreadBlocks });

    // Add LinkedIn content
    const linkedInBlocks = [
      { object: 'block', type: 'divider', divider: {} },
      { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: 'LinkedIn Post (3 min read)' } }] } },
      { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: linkedInContent } }] } }
    ];

    await notion.blocks.children.append({ block_id: PAGE_ID, children: linkedInBlocks });

    console.log('Success! Updated Notion page with EXACT content from local files');
    console.log('Page URL: https://www.notion.so/' + PAGE_ID.replace(/-/g, ''));
  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
  }
}

updateNotionPage();

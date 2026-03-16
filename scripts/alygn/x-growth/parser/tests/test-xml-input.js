/**
 * Test script for XML parsing functionality
 * Tests the parser with sample XML-style Grok output
 */

import { parseGrokOutput, parseXmlContent } from '../twitter-content-parser.js';

// Sample XML output from Grok
const sampleXmlOutput = `
<responses>
  <content>
    <text>
      The EU AI Act's risk-based approach is reshaping how companies deploy AI systems. High-risk applications now require strict compliance checks, impacting everything from hiring algorithms to medical diagnostics.
    </text>
    <sources>
      <url>https://ec.europa.eu/commission/presscorner/detail/en/ip_23_2591</url>
      <url>https://www.europarl.europa.eu/topics/en/article/20230601STO94539</url>
    </sources>
    <governance_angle>
      This creates opportunities for governance tools that automate compliance documentation and risk assessment workflows.
    </governance_angle>
  </content>
  
  <content>
    <text>
      Open-source AI models face new transparency requirements under the EU AI Act. Developers must publish technical documentation and model cards detailing training data, compute resources, and known limitations.
    </text>
    <sources>
      <url>https://opensource.org/blog/eu-ai-act-what-open-source-needs-to-know</url>
    </sources>
    <governance_angle>
      This could accelerate adoption of model governance platforms that help open-source teams meet documentation standards without slowing innovation.
    </governance_angle>
  </content>
  
  <content>
    <text>
      Corporate AI governance is shifting from voluntary principles to mandatory accountability. Boards are now personally liable for AI risk oversight in several jurisdictions.
    </text>
    <sources>
      <url>https://www.law360.com/articles/1745892/ai-governance-board-accountability</url>
      <url>https://hbr.org/2024/01/ai-governance-is-a-board-level-issue</url>
    </sources>
    <governance_angle>
      This creates demand for executive dashboards that translate AI risk metrics into board-ready reports with clear accountability trails.
    </governance_angle>
  </content>
</responses>
`;

// Sample markdown output (for backward compatibility testing)
const sampleMarkdownOutput = `
### Response

**EU AI Act Compliance Tools**
The EU AI Act's risk-based approach is reshaping how companies deploy AI systems. High-risk applications now require strict compliance checks. https://ec.europa.eu/commission/presscorner/detail/en/ip_23_2591

**Open-Source Documentation Requirements**
Open-source AI models face new transparency requirements under the EU AI Act. Developers must publish technical documentation and model cards. https://opensource.org/blog/eu-ai-act-what-open-source-needs-to-know

**Board-Level AI Accountability**
Corporate AI governance is shifting from voluntary principles to mandatory accountability. Boards are now personally liable for AI risk oversight. https://www.law360.com/articles/1745892/ai-governance-board-accountability
`;

async function runTests() {
  console.log('='.repeat(80));
  console.log('🧪 XML Parser Test Suite\n');
  
  // Test 1: XML Parsing
  console.log('TEST 1: XML Parsing Mode');
  console.log('-'.repeat(80));
  const xmlResult = await parseGrokOutput(sampleXmlOutput);
  console.log(`\n✅ Parsing mode: ${xmlResult.parsingMode}`);
  console.log(`📊 Total posts: ${xmlResult.totalPosts}`);
  console.log(`✅ Valid posts: ${xmlResult.validPosts}`);
  console.log(`📚 Sources extracted: ${xmlResult.sourcesExtracted}\n`);
  
  xmlResult.posts.forEach((post, idx) => {
    console.log(`\n📝 Post #${post.id} [${post.status}]`);
    console.log(`   Main: ${post.mainTweet.substring(0, 80)}...`);
    if (post.replyTweet) {
      console.log(`   Reply: ${post.replyTweet.substring(0, 80)}...`);
    }
    console.log(`   Source: ${post.sourceUrl || 'none'}`);
    if (post.issues.length > 0) {
      console.log(`   ⚠️  Issues: ${post.issues.join(', ')}`);
    }
  });
  
  // Test 2: Markdown Fallback
  console.log('\n\n' + '='.repeat(80));
  console.log('TEST 2: Markdown Fallback Mode (Backward Compatibility)');
  console.log('-'.repeat(80));
  const markdownResult = await parseGrokOutput(sampleMarkdownOutput);
  console.log(`\n✅ Parsing mode: ${markdownResult.parsingMode}`);
  console.log(`📊 Total posts: ${markdownResult.totalPosts}`);
  console.log(`✅ Valid posts: ${markdownResult.validPosts}\n`);
  
  markdownResult.posts.forEach((post, idx) => {
    console.log(`\n📝 Post #${post.id} [${post.status}]`);
    console.log(`   Main: ${post.mainTweet.substring(0, 80)}...`);
    if (post.replyTweet) {
      console.log(`   Reply: ${post.replyTweet.substring(0, 80)}...`);
    }
    console.log(`   Source: ${post.sourceUrl || 'none'}`);
  });
  
  // Test 3: Direct XML Content Extraction
  console.log('\n\n' + '='.repeat(80));
  console.log('TEST 3: Direct XML Content Extraction');
  console.log('-'.repeat(80));
  const xmlPosts = parseXmlContent(sampleXmlOutput);
  if (xmlPosts) {
    console.log(`\n✅ Extracted ${xmlPosts.length} content blocks`);
    xmlPosts.forEach((post, idx) => {
      console.log(`\n   Content #${idx + 1}:`);
      console.log(`   - Content: ${post.content.substring(0, 60)}...`);
      console.log(`   - Source URL: ${post.sourceUrl || 'none'}`);
      console.log(`   - All Sources: ${post.allSources.length}`);
      console.log(`   - Governance Angle: ${post.governanceAngle ? 'present' : 'none'}`);
    });
  }
  
  console.log('\n\n' + '='.repeat(80));
  console.log('✅ All tests completed!\n');
}

runTests().catch(console.error);

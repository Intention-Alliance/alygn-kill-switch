/**
 * Realistic test scenario - simulates actual Grok output with all the issues
 */

import { formatPost, stripUrlsAndCitations } from '../twitter-content-parser.js';

console.log('🧪 Realistic Parser Test - Simulating Actual Grok Output\n');
console.log('=' .repeat(70));

// Simulate problematic content that would have failed before
const problematicContent = `
**New AI Governance Framework Launched**

The European Union has announced a comprehensive AI governance framework [[1]](https://ec.europa.eu/commission/presscorner/detail/en/ip_24_1234) that aims to accelerate innovation while ensuring safety standards. The framework includes provisions for:

- Risk-based classification of AI systems [[2]]
- Mandatory transparency requirements for high-risk applications (https://ai-act.eu/details)
- International cooperation mechanisms [[3]](https://oecd.ai/governance)

According to experts, this accelerating adoption of governance standards will help build trust [[4]]. More details at https://ec.europa.eu/digital-single-market/en/artificial-intelligence [[5]].

Key benefits include:
1. Faster approval processes for low-risk AI [[6]]
2. Clear guidelines for developers (https://standards.iso.org/ai)
3. Harmonized regulations across member states [[7]]
`;

console.log('\n📝 INPUT (problematic content with URLs and citations):\n');
console.log(problematicContent);
console.log('\n' + '-'.repeat(70));

// Test the cleaning function
console.log('\n🔧 Testing stripUrlsAndCitations:\n');
const cleaned = stripUrlsAndCitations(problematicContent);
console.log(cleaned);
console.log('\n✅ URLs removed:', !cleaned.includes('http://') && !cleaned.includes('https://'));
console.log('✅ Citations removed:', !cleaned.includes('[['));

console.log('\n' + '-'.repeat(70));

// Test full formatting
console.log('\n🎯 Testing formatPost (with TinyURL):\n');
const formatted = await formatPost(problematicContent, 'https://ec.europa.eu/commission/presscorner/detail/en/ip_24_1234');

console.log('📱 MAIN TWEET:');
console.log(formatted.main);
console.log(`\n   Length: ${formatted.main.length} chars`);

if (formatted.reply) {
  console.log('\n💬 REPLY TWEET:');
  console.log(formatted.reply);
  console.log(`\n   Length: ${formatted.reply.length} chars`);
  
  // Verify no original URLs in reply (TinyURL is OK)
  console.log('\n✅ VALIDATION:');
  const hasOriginalUrl = formatted.reply.match(/https?:\/\/(?!tinyurl\.com)/);
  console.log('   - No original URLs (TinyURL OK):', !hasOriginalUrl);
  console.log('   - No [[ markers:', !formatted.reply.includes('[['));
  console.log('   - No ]] markers:', !formatted.reply.includes(']]'));
  console.log('   - Under 280 chars:', formatted.reply.length < 280);
  
  // Check for word boundary (should not end mid-word)
  const lastWord = formatted.reply.split(' ').pop();
  const endsWithEllipsis = formatted.reply.endsWith('...');
  console.log('   - Ends properly:', endsWithEllipsis || /\w+$/.test(lastWord));
}

console.log('\n' + '='.repeat(70));
console.log('🎉 Test completed!\n');

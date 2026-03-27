// GrokDiscoveryStrategy - Discover grants via Grok search
import { GrantEntity } from '../../entities/GrantEntity.js';
import { logger } from '../../utils/logger.js';

export class GrokDiscoveryStrategy {
  constructor(config = {}) {
    this.config = config;
    this.queries = config.queries || [
      'AI safety research grants 2026',
      'AGI governance funding opportunities',
      'frontier AI oversight grants',
      'responsible AI development funding',
      'AI alignment research grants non-profits'
    ];
  }

  async discover(context) {
    const { limit = 50 } = context;
    const grants = [];

    for (const query of this.queries) {
      if (grants.length >= limit) break;

      try {
        const results = await this._searchGrok(query);
        results.forEach(result => {
          const grant = this._parseResult(result);
          if (grant) {
            grant.addSource('grok');
            grants.push(grant);
          }
        });
      } catch (error) {
        logger.error(`Grok search failed for query: ${query}`, { error: error.message });
      }

      await this._throttle();
    }

    return grants.slice(0, limit);
  }

  async _searchGrok(query) {
    // Using llm-task for Grok via the configured provider
    // In production, this would call the Grok API directly
    const prompt = `
Search for AI safety and governance grants matching: "${query}"

Return a JSON array of grants with:
- name: Grant program name
- agency: Funding organization
- url: Link to grant page
- amount: { min, max, currency } if available
- deadline: { full } if available
- focusAreas: array of relevant focus areas

Only include grants with clear deadlines in 2026 or 2027.
Return as JSON array (empty array if none found).
`;

    try {
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROK_API_KEY || ''}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'grok-3',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        throw new Error(`Grok API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      return JSON.parse(content || '{}').grants || [];
    } catch (error) {
      logger.error(`Grok API call failed`, { error: error.message });
      return [];
    }
  }

  _parseResult(result) {
    if (!result.name) return null;

    return new GrantEntity({
      name: result.name,
      agency: result.agency,
      url: result.url,
      amount: result.amount,
      deadline: result.deadline,
      focusAreas: result.focusAreas || [],
      grantType: this._inferGrantType(result.agency, result.name)
    });
  }

  _inferGrantType(agency, name) {
    const combined = `${agency} ${name}`.toLowerCase();

    if (combined.includes('nsf') || combined.includes('darpa') || combined.includes('nih') ||
        combined.includes('doe') || combined.includes('federal')) {
      return 'federal';
    }
    if (combined.includes('foundation') || combined.includes('openphil') || combined.includes('慈善')) {
      return 'private';
    }
    if (combined.includes('google.org') || combined.includes('microsoft') || combined.includes('meta') ||
        combined.includes('corporate') || combined.includes('csr')) {
      return 'corporate';
    }
    if (combined.includes('university') || combined.includes('mit') || combined.includes('stanford') ||
        combined.includes('berkeley') || combined.includes('research institution')) {
      return 'research-institution';
    }

    return 'private'; // default assumption for AI safety
  }

  async _throttle() {
    await new Promise(r => setTimeout(r, 1000)); // 1 req/sec safe rate
  }
}

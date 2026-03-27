// PerplexityDiscoveryStrategy - Deep research grants via Perplexity API
import { GrantEntity } from '../../entities/GrantEntity.js';
import { logger } from '../../utils/logger.js';

export class PerplexityDiscoveryStrategy {
  constructor(config = {}) {
    this.config = config;
    this.queries = config.queries || [
      'NSF AI safety funding opportunities 2026',
      'DARPA AI governance grants',
      'foundation AI alignment grants',
      'corporate responsible AI grants'
    ];
  }

  async discover(context) {
    const { limit = 50 } = context;
    const grants = [];

    for (const query of this.queries) {
      if (grants.length >= limit) break;

      try {
        const results = await this._deepSearch(query);
        results.forEach(result => {
          const grant = this._parseResult(result);
          if (grant) {
            grant.addSource('perplexity');
            grants.push(grant);
          }
        });
      } catch (error) {
        logger.error(`Perplexity search failed for query: ${query}`, { error: error.message });
      }

      await this._throttle();
    }

    return grants.slice(0, limit);
  }

  async _deepSearch(query) {
    const prompt = `
Conduct deep research on: "${query}"

For each grant found, return:
- name: Full grant program name
- agency: Funding organization name
- url: Direct URL to grant page
- amount: { min, max, currency } if specified
- deadline: { LOI, full } application deadlines
- eligibility: Key eligibility requirements
- focusAreas: AI safety/governance tags
- keyRequirements: Top 3-5 requirements

Focus on grants where:
- ALYGN (nonprofit AI governance organization) would be eligible
- Deadline is within next 18 months
- Amount is $100K+

Return as JSON: { grants: [...] }
`;

    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY || ''}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        throw new Error(`Perplexity API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      return JSON.parse(content || '{}').grants || [];
    } catch (error) {
      logger.error(`Perplexity API call failed`, { error: error.message });
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
      eligibility: result.eligibility,
      focusAreas: result.focusAreas || [],
      typeData: {
        ...result.typeData,
        researchSources: result.researchSources || []
      }
    });
  }

  async _throttle() {
    // Perplexity rate limit handling
    await new Promise(r => setTimeout(r, 2000));
  }
}

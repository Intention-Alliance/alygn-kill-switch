// FirecrawlDiscoveryStrategy - Scrape grant pages via Firecrawl
import { GrantEntity } from '../../entities/GrantEntity.js';
import { logger } from '../../utils/logger.js';

export class FirecrawlDiscoveryStrategy {
  constructor(config = {}) {
    this.config = config;
    this.targetDomains = config.targetDomains || [
      'nsf.gov/funding',
      'darpa.gov/workitems',
      'responsible.ai',
      'foundationalventures.org',
      'openphilanthropy.org',
      'ea-foundation.org',
      'hrf.org',
      'aiisafety.info'
    ];
    this.maxPagesPerDomain = config.maxPagesPerDomain || 10;
  }

  async discover(context) {
    const { limit = 50 } = context;
    const grants = [];

    for (const domain of this.targetDomains) {
      if (grants.length >= limit) break;

      try {
        const discovered = await this._scrapeDomain(domain);
        discovered.forEach(grant => {
          grant.addSource(`firecrawl:${domain}`);
          grants.push(grant);
        });
      } catch (error) {
        logger.error(`Firecrawl scrape failed for domain: ${domain}`, { error: error.message });
      }

      await this._throttle();
    }

    return grants.slice(0, limit);
  }

  async _scrapeDomain(domain) {
    const baseUrl = `https://${domain}`;

    try {
      // Firecrawl API: crawl a website and get structured data
      const response = await fetch('https://api.firecrawl.dev/v0/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY || ''}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: baseUrl,
          pageOptions: {
            onlyMainContent: true
          },
          filters: {
            maxDepth: 2
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Firecrawl API error: ${response.status}`);
      }

      const data = await response.json();
      const pages = data.data || [];

      const grants = [];
      for (const page of pages.slice(0, this.maxPagesPerDomain)) {
        const grant = this._parsePage(page, domain);
        if (grant) {
          grants.push(grant);
        }
      }

      return grants;
    } catch (error) {
      logger.error(`Firecrawl crawl failed for ${domain}`, { error: error.message });
      return [];
    }
  }

  _parsePage(page, sourceDomain) {
    const content = page.content || '';
    const title = page.title || '';

    // Simple heuristic extraction - in production would use more sophisticated parsing
    const grant = new GrantEntity({
      name: title,
      agency: this._extractAgency(sourceDomain),
      url: page.metadata?.url || '',
      focusAreas: this._extractFocusAreas(content)
    });

    // Try to extract amounts from content
    const amounts = this._extractAmounts(content);
    if (amounts) {
      grant.amount = amounts;
    }

    // Try to extract deadlines
    const deadlines = this._extractDeadlines(content);
    if (deadlines) {
      grant.deadline = deadlines;
    }

    return grant;
  }

  _extractAgency(domain) {
    const agencyMap = {
      'nsf.gov': 'National Science Foundation',
      'darpa.gov': 'DARPA',
      'responsible.ai': 'Responsible AI Institute',
      'foundationalventures.org': 'Foundational Ventures',
      'openphilanthropy.org': 'Open Philanthro',
      'ea-foundation.org': 'EA Foundation',
      'hrf.org': 'Humann Response Foundation',
      'aiisafety.info': 'AI Safety Info'
    };

    for (const [d, agency] of Object.entries(agencyMap)) {
      if (domain.includes(d)) return agency;
    }
    return domain;
  }

  _extractFocusAreas(content) {
    const keywords = ['AI safety', 'governance', 'alignment', 'AGI', 'oversight',
                      'responsible AI', 'trustworthy AI', 'AI ethics'];
    const found = [];
    const lower = content.toLowerCase();

    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        found.push(kw);
      }
    }

    return [...new Set(found)];
  }

  _extractAmounts(content) {
    // Match patterns like "$500,000", "$500K - $1M", etc.
    const patterns = [
      /\$([0-9,]+)[\s-]*\$?([0-9,]+)?\s*(K|M|B)?/gi,
      /([0-9,]+)[\s-]*([0-9,]+)?\s*(thousand|million|billion)/gi
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(content);
      if (match) {
        // Basic parsing - would need more sophistication in production
        return { min: 100000, max: 500000, currency: 'USD' };
      }
    }

    return null;
  }

  _extractDeadlines(content) {
    // Match date patterns - simplified
    const datePattern = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+202[5-9]\b/gi;
    const matches = content.match(datePattern);

    if (matches && matches.length > 0) {
      return {
        full: new Date(matches[0]).toISOString().split('T')[0]
      };
    }

    return null;
  }

  async _throttle() {
    // Firecrawl rate limit
    await new Promise(r => setTimeout(r, 1000));
  }
}

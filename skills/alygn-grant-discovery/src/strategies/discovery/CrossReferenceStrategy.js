// CrossReferenceStrategy - Merge and deduplicate grants from multiple sources
import { GrantEntity } from '../../entities/GrantEntity.js';
import { logger } from '../../utils/logger.js';

export class CrossReferenceStrategy {
  constructor() {
    this.deduplicationKeys = ['name', 'agency', 'url'];
  }

  async discover(context) {
    const { grants = [], context: ctx } = context;

    if (grants.length === 0) {
      return [];
    }

    // Group by normalized key
    const groups = this._groupByDeduplicationKey(grants);

    // Merge each group into a single GrantEntity
    const deduplicated = [];
    const conflicts = [];

    for (const [key, group] of Object.entries(groups)) {
      if (group.length === 1) {
        deduplicated.push(this._toGrantEntity(group[0]));
        continue;
      }

      // Multiple sources for same grant - merge
      const merged = this._mergeGroup(group, conflicts);
      deduplicated.push(merged);
    }

    logger.info(`Cross-reference complete: ${grants.length} raw → ${deduplicated.length} deduplicated`);

    if (conflicts.length > 0) {
      logger.warn(`${conflicts.length} field conflicts detected during merge`, { conflicts });
    }

    // Sort by confidence (sources count)
    deduplicated.sort((a, b) => b._sources.length - a._sources.length);

    return deduplicated;
  }

  _groupByDeduplicationKey(grants) {
    const groups = {};

    for (const grant of grants) {
      const key = this._normalizeKey(grant);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(grant);
    }

    return groups;
  }

  _normalizeKey(grant) {
    // Create a deduplication key from name + agency + url
    const name = (grant.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const agency = (grant.agency || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const url = (grant.url || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    return `${name}|${agency}|${url}`.substring(0, 200);
  }

  _toGrantEntity(raw) {
    if (raw instanceof GrantEntity) {
      return raw;
    }
    return new GrantEntity(raw);
  }

  _mergeGroup(group, conflicts) {
    // Start with the most complete grant (most fields filled)
    const sorted = [...group].sort((a, b) => {
      const aFields = Object.values(a).filter(v => v != null && v !== '').length;
      const bFields = Object.values(b).filter(v => v != null && v !== '').length;
      return bFields - aFields;
    });

    let base = this._toGrantEntity(sorted[0]);
    const sources = new Set();

    // Collect all sources
    for (const item of sorted) {
      if (item._sources) {
        item._sources.forEach(s => sources.add(s));
      }
      if (item instanceof GrantEntity) {
        base._sources.forEach(s => sources.add(s));
      }
    }

    base._sources = Array.from(sources);

    // Merge remaining grants into base
    for (let i = 1; i < sorted.length; i++) {
      const other = sorted[i];
      const merged = base.merge(this._toGrantEntity(other));
      base = merged;
    }

    // Set confidence based on source agreement
    base._confidence = this._calculateConfidence(group);

    return base;
  }

  _calculateConfidence(group) {
    // More sources = higher confidence
    const sourceCount = new Set();
    group.forEach(g => {
      if (g._sources) {
        g._sources.forEach(s => sourceCount.add(s));
      }
    });

    // Normalize to 0.5-1.0 range
    const base = 0.5;
    const bonus = Math.min(sourceCount.size * 0.1, 0.5);
    return Math.min(base + bonus, 1.0);
  }
}

// EligibilityResearchStrategy - Verify ALYGN eligibility for each grant
import { logger } from '../../utils/logger.js';

const ALYGN_PROFILE = {
  organizationType: 'nonprofit-501c3',
  location: { country: 'US', state: null },
  mission: 'AI governance and coordination',
  yearsOperating: 1,
  focusAreas: ['AI safety', 'governance', 'alignment', 'AGI oversight']
};

export class EligibilityResearchStrategy {
  constructor(config = {}) {
    this.config = config;
    this.alynProfile = ALYGN_PROFILE;
  }

  async research(grant, context) {
    logger.debug(`Eligibility research for grant: ${grant.name}`);

    const analysis = this._analyzeEligibility(grant);

    return {
      ...grant,
      typeData: {
        ...grant.typeData,
        eligibilityConfidence: analysis.confidence,
        eligibilityNotes: analysis.notes,
        potentialBarriers: analysis.barriers,
        recommendedMitigations: analysis.mitigations
      }
    };
  }

  _analyzeEligibility(grant) {
    const barriers = [];
    const mitigations = [];
    let score = 1.0; // Start optimistic

    // Check organization type
    const eligibleOrgTypes = grant.eligibility?.organizationTypes || [];
    const requiresNonprofit = eligibleOrgTypes.some(t =>
      t.toLowerCase().includes('nonprofit') || t.toLowerCase().includes('501')
    );
    const allowsNonprofit = eligibleOrgTypes.length === 0 ||
      eligibleOrgTypes.some(t =>
        t.toLowerCase().includes('nonprofit') ||
        t.toLowerCase().includes('academic') ||
        t.toLowerCase().includes('institution') ||
        t === 'any' || t === '*'
      );

    if (requiresNonprofit || allowsNonprofit) {
      // ALYGN is nonprofit - good fit
    } else if (eligibleOrgTypes.length > 0) {
      barriers.push('Organization type restriction - ALYGN may not qualify');
      mitigations.push('Verify 501(c)(3) status satisfies requirement');
      score -= 0.3;
    }

    // Check geographic requirements
    const geoReqs = grant.eligibility?.geographicRequirements || [];
    if (geoReqs.includes('US-based') || geoReqs.includes('US only')) {
      // ALYGN is US-based - good
    } else if (geoReqs.includes('International')) {
      // Also fine
    } else if (geoReqs.some(r => r.toLowerCase().includes('eu') || r.toLowerCase().includes('europe'))) {
      barriers.push('Grant may prioritize EU-based organizations');
      mitigations.push('Confirm whether US organizations are eligible');
      score -= 0.1;
    }

    // Check AI safety focus alignment
    const focusAreas = grant.focusAreas || [];
    const alygnFocus = this.alynProfile.focusAreas;
    const hasOverlap = focusAreas.some(f =>
      alygnFocus.some(a => a.toLowerCase().includes(f.toLowerCase()) ||
                          f.toLowerCase().includes(a.toLowerCase()))
    );

    if (!hasOverlap) {
      barriers.push('AI safety/governance may not be explicit focus');
      mitigations.push('Review grant description for implicit AI governance relevance');
      score -= 0.2;
    }

    // Check grant size appropriateness
    const amountMax = grant.amount?.max || 0;
    if (amountMax < 50000) {
      barriers.push('Grant amount may be too small for ALYGN\'s scale');
      mitigations.push('Consider whether smaller grants are worth application effort');
      score -= 0.1;
    }

    // Check duration
    const durationMin = grant.duration?.minMonths || 0;
    if (durationMin > 36) {
      barriers.push('Long project duration may exceed ALYGN\'s planning horizon');
      mitigations.push('Evaluate if shorter timeline is negotiable');
      score -= 0.1;
    }

    return {
      confidence: Math.max(0, Math.min(score, 1.0)),
      notes: barriers.length === 0
        ? 'ALYGN appears eligible. Review specific requirements before applying.'
        : `Potential eligibility concerns: ${barriers.join('; ')}. Mitigations available.`,
      barriers,
      mitigations
    };
  }
}

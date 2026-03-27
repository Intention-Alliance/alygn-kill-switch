// AlygnFitScorer - Score ALYGN mission alignment for grants
import { logger } from '../../utils/logger.js';

const DEFAULT_WEIGHTS = {
  aiSafetyExplicit: 3.0,
  governanceRelevant: 2.0,
  alignmentResearch: 2.0,
  nonprofitEligible: 1.0
};

export class AlygnFitScorer {
  constructor(weights = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  async score(grant, context) {
    let score = 0;
    const factors = [];

    const nameLower = (grant.name || '').toLowerCase();
    const agencyLower = (grant.agency || '').toLowerCase();
    const focusAreas = (grant.focusAreas || []).map(f => f.toLowerCase());
    const combined = `${nameLower} ${agencyLower} ${focusAreas.join(' ')}`;

    // Explicit AI safety mention
    const aiSafetyKeywords = ['ai safety', 'safe AI', 'AI safety', 'AIS'];
    const hasAiSafety = aiSafetyKeywords.some(kw => combined.includes(kw));
    if (hasAiSafety) {
      score += this.weights.aiSafetyExplicit;
      factors.push({ factor: 'aiSafetyExplicit', value: true, weight: this.weights.aiSafetyExplicit });
    }

    // Governance relevance
    const governanceKeywords = ['governance', 'oversight', 'accountability', 'coordination',
                               'trust', 'responsible', 'compliance', 'policy'];
    const hasGovernance = governanceKeywords.some(kw => combined.includes(kw));
    if (hasGovernance) {
      score += this.weights.governanceRelevant;
      factors.push({ factor: 'governanceRelevant', value: true, weight: this.weights.governanceRelevant });
    }

    // Alignment research
    const alignmentKeywords = ['alignment', 'alignment research', 'value alignment',
                               'AI values', 'intent alignment'];
    const hasAlignment = alignmentKeywords.some(kw => combined.includes(kw));
    if (hasAlignment) {
      score += this.weights.alignmentResearch;
      factors.push({ factor: 'alignmentResearch', value: true, weight: this.weights.alignmentResearch });
    }

    // AGI/Frontier AI
    const agiKeywords = ['AGI', 'frontier AI', 'advanced AI', 'artificial general intelligence',
                        'transformative AI', 'TAI'];
    const hasAgi = agiKeywords.some(kw => combined.includes(kw));
    if (hasAgi) {
      score += this.weights.alignmentResearch * 0.5; // Bonus for AGI focus
      factors.push({ factor: 'agiRelevance', value: true, weight: this.weights.alignmentResearch * 0.5 });
    }

    // Nonprofit eligibility
    const orgTypes = grant.eligibility?.organizationTypes || [];
    const nonprofitFriendly = orgTypes.length === 0 ||
      orgTypes.some(t => t.toLowerCase().includes('nonprofit') ||
                         t.toLowerCase().includes('academic') ||
                         t.toLowerCase().includes('institution') ||
                         t === 'any');
    if (nonprofitFriendly) {
      score += this.weights.nonprofitEligible;
      factors.push({ factor: 'nonprofitEligible', value: true, weight: this.weights.nonprofitEligible });
    }

    // Normalize to 1-10 scale
    const maxPossible = this.weights.aiSafetyExplicit +
                        this.weights.governanceRelevant +
                        this.weights.alignmentResearch +
                        this.weights.nonprofitEligible;

    const normalizedScore = Math.min(10, Math.max(1, (score / maxPossible) * 10));

    logger.debug(`ALYGN fit score for ${grant.name}: ${normalizedScore.toFixed(1)}`, { score, maxPossible, factors });

    return {
      score: Math.round(normalizedScore * 10) / 10,
      factors,
      maxPossible: Math.round(maxPossible * 10) / 10
    };
  }
}

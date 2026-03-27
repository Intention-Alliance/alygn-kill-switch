/**
 * ALYGNAlignmentValidator
 * Validates grants against ALYGN's research focus and institutional fit
 * 
 * Scoring criteria:
 * - Research alignment (0-5): Match with ALYGN's core research areas
 * - Institutional fit (0-3): Compatibility with ALYGN's structure and values
 * - Exclusion check (0-2): Penalty for excluded topics
 * 
 * Total: 0-10 scale
 */

import { GrantEntity } from '../../entities/GrantEntity';
import type { AlignmentResult } from '../../types/index';

/**
 * ALYGN's core research focus areas
 */
const ALYGN_RESEARCH_AREAS = [
  'AI safety',
  'AI alignment',
  'AI governance',
  'AGI governance',
  'technical AI safety',
  'AI policy',
  'AI oversight',
  'mechanism design for AI',
  'multi-stakeholder AI coordination',
  'AI standards and evaluation'
];

/**
 * ALYGN's institutional characteristics
 */
const ALYGN_INSTITUTIONAL_PROFILE = {
  entityTypes: ['non-profit', 'research organization'],
  values: ['open research', 'collaborative', 'high-impact', 'long-term thinking'],
  approach: 'technical and policy-oriented',
  community: 'AI safety and governance research community'
};

/**
 * Topics that are excluded or penalized
 */
const EXCLUDED_TOPICS = [
  'AGI development',
  'AI capabilities research',
  'general AI',
  'military applications',
  'surveillance',
  'weapons',
  'offensive capabilities'
];

/**
 * Validator for assessing ALYGN alignment of grants
 */
export class ALYGNAlignmentValidator {
  /**
   * Validates a grant's alignment with ALYGN
   * 
   * @param {GrantEntity} grant - Grant to validate
   * @returns {AlignmentResult} Validation result with score and recommendations
   */
  validate(grant: GrantEntity): AlignmentResult {
    console.log(`🔍 Validating alignment for: ${grant.name}...`);

    // Check for exclusions first
    const exclusions = this.checkExclusions(grant);
    if (exclusions.length > 0) {
      return {
        score: 0,
        rationale: `Excluded due to: ${exclusions.join(', ')}`,
        repositioning: {
          required: false,
          recommendations: []
        },
        recommendedApproach: 'Not recommended - significant exclusions'
      };
    }

    // Calculate component scores
    const researchAlignment = this.checkResearchAlignment(grant);
    const institutionalFit = this.checkInstitutionalFit(grant);
    
    // Calculate final score (0-10)
    const score = Math.min(researchAlignment + institutionalFit, 10);

    // Generate rationale
    const rationale = this.generateRationale(grant, researchAlignment, institutionalFit);

    // Determine repositioning needs
    const repositioning = this.assessRepositioning(grant, score);

    // Recommend approach
    const recommendedApproach = this.recommendApproach(grant, score, repositioning.required);

    console.log(`   ✅ Alignment score: ${score}/10`);

    return {
      score,
      rationale,
      repositioning: repositioning.required ? repositioning : undefined,
      recommendedApproach
    };
  }

  /**
   * Check for excluded topics
   * 
   * @param {GrantEntity} grant - Grant to check
   * @returns {string[]} List of exclusion matches
   * @private
   */
  private checkExclusions(grant: GrantEntity): string[] {
    const found: string[] = [];
    
    // Check explicit exclusions
    for (const exclusion of grant.exclusions) {
      if (EXCLUDED_TOPICS.some(t => exclusion.toLowerCase().includes(t.toLowerCase()))) {
        found.push(exclusion);
      }
    }

    // Check research areas
    const grantText = [
      ...grant.researchAreas,
      grant.name,
      grant.organization
    ].join(' ').toLowerCase();

    for (const topic of EXCLUDED_TOPICS) {
      if (grantText.includes(topic.toLowerCase())) {
        found.push(topic);
      }
    }

    return [...new Set(found)];
  }

  /**
   * Check alignment with ALYGN research areas
   * 
   * @param {GrantEntity} grant - Grant to check
   * @returns {number} Score (0-5)
   * @private
   */
  private checkResearchAlignment(grant: GrantEntity): number {
    let score = 0;
    const grantAreas = grant.researchAreas.map(a => a.toLowerCase());

    // Direct matches with ALYGN core areas
    for (const area of grantAreas) {
      for (const alygnArea of ALYGN_RESEARCH_AREAS) {
        if (area.includes(alygnArea.toLowerCase())) {
          score += 1.5;
        } else if (this.calculateSimilarity(area, alygnArea) > 0.7) {
          score += 1.0;
        }
      }
    }

    // Check organization name and grant name for keywords
    const nameText = `${grant.name} ${grant.organization}`.toLowerCase();
    for (const area of ALYGN_RESEARCH_AREAS) {
      if (nameText.includes(area.toLowerCase())) {
        score += 0.5;
      }
    }

    // Check if it's a known ALYGN-aligned funder
    const knownFunders = ['open philanthropy', 'future of life', 'longview', 'long-term future fund'];
    if (knownFunders.some(f => grant.organization.toLowerCase().includes(f))) {
      score += 2;
    }

    return Math.min(score, 5);
  }

  /**
   * Check institutional fit
   * 
   * @param {GrantEntity} grant - Grant to check
   * @returns {number} Score (0-3)
   * @private
   */
  private checkInstitutionalFit(grant: GrantEntity): number {
    let score = 0;

    // Entity type compatibility
    const eligibleTypes = grant.eligibility.entityTypes.map(t => t.toLowerCase());
    const ourTypes = ALYGN_INSTITUTIONAL_PROFILE.entityTypes.map(t => t.toLowerCase());
    
    const typeMatch = eligibleTypes.some(t => ourTypes.includes(t));
    if (typeMatch) score += 1;

    // Value alignment
    const cultureText = [
      ...grant.organizationCulture.values,
      grant.organizationCulture.approach
    ].join(' ').toLowerCase();

    for (const value of ALYGN_INSTITUTIONAL_PROFILE.values) {
      if (cultureText.includes(value.toLowerCase())) {
        score += 0.5;
      }
    }

    // Geographic flexibility
    if (!grant.eligibility.geographicRestrictions || 
        grant.eligibility.geographicRestrictions.length === 0) {
      score += 0.5; // Global eligibility is good
    } else {
      const flexibleRegions = ['global', 'international', 'any country'];
      if (grant.eligibility.geographicRestrictions.some(r => 
          flexibleRegions.some(f => r.toLowerCase().includes(f)))) {
        score += 0.5;
      }
    }

    return Math.min(score, 3);
  }

  /**
   * Calculate text similarity (simple implementation)
   * 
   * @param {string} a - First text
   * @param {string} b - Second text
   * @returns {number} Similarity score (0-1)
   * @private
   */
  private calculateSimilarity(a: string, b: string): number {
    const aWords = new Set(a.toLowerCase().split(/\s+/));
    const bWords = new Set(b.toLowerCase().split(/\s+/));
    
    const intersection = [...aWords].filter(x => bWords.has(x));
    const union = new Set([...aWords, ...bWords]);
    
    return intersection.length / union.size;
  }

  /**
   * Generate alignment rationale
   * 
   * @param {GrantEntity} grant - Grant being evaluated
   * @param {number} researchScore - Research alignment score
   * @param {number} fitScore - Institutional fit score
   * @returns {string} Rationale text
   * @private
   */
  private generateRationale(
    grant: GrantEntity, 
    researchScore: number, 
    fitScore: number
  ): string {
    const parts: string[] = [];

    if (researchScore >= 4) {
      parts.push('Strong research alignment with ALYGN core focus areas.');
    } else if (researchScore >= 2) {
      parts.push('Moderate research alignment; some overlap with ALYGN priorities.');
    } else {
      parts.push('Limited direct research alignment.');
    }

    if (fitScore >= 2.5) {
      parts.push('Excellent institutional fit.');
    } else if (fitScore >= 1.5) {
      parts.push('Good institutional fit with minor adjustments needed.');
    } else {
      parts.push('Institutional fit requires careful positioning.');
    }

    // Add specific research area matches
    const matchingAreas = grant.researchAreas.filter(area => 
      ALYGN_RESEARCH_AREAS.some(a => area.toLowerCase().includes(a.toLowerCase()))
    );
    
    if (matchingAreas.length > 0) {
      parts.push(`Matching areas: ${matchingAreas.join(', ')}.`);
    }

    return parts.join(' ');
  }

  /**
   * Assess repositioning needs
   * 
   * @param {GrantEntity} grant - Grant being evaluated
   * @param {number} score - Alignment score
   * @returns {object} Repositioning assessment
   * @private
   */
  private assessRepositioning(grant: GrantEntity, score: number): {
    required: boolean;
    recommendations: string[];
  } {
    if (score >= 7) {
      return { required: false, recommendations: [] };
    }

    const recommendations: string[] = [];

    if (score < 5) {
      recommendations.push('Consider reframing proposal to emphasize AI safety applications');
    }

    // Check for missing ALYGN keywords
    const missingKeywords = ALYGN_RESEARCH_AREAS.filter(area => 
      !grant.researchAreas.some(ra => ra.toLowerCase().includes(area.toLowerCase()))
    );

    if (missingKeywords.length > 0) {
      recommendations.push(`Emphasize connections to: ${missingKeywords.slice(0, 3).join(', ')}`);
    }

    // Entity type guidance
    if (!grant.eligibility.entityTypes.includes('non-profit')) {
      recommendations.push('Consider partnership structure to meet eligibility requirements');
    }

    return {
      required: recommendations.length > 0,
      recommendations
    };
  }

  /**
   * Recommend approach strategy
   * 
   * @param {GrantEntity} grant - Grant being evaluated
   * @param {number} score - Alignment score
   * @param {boolean} needsRepositioning - Whether repositioning is needed
   * @returns {string} Approach recommendation
   * @private
   */
  private recommendApproach(grant: GrantEntity, score: number, needsRepositioning: boolean): string {
    if (score >= 8) {
      return 'High priority: Strong alignment. Proceed with full application. Consider multi-year engagement.';
    }

    if (score >= 6) {
      const base = 'Good alignment: Proceed with standard application';
      if (needsRepositioning) {
        return `${base} after incorporating repositioning recommendations.`;
      }
      return `${base}. Monitor for additional opportunities.`;
    }

    if (score >= 4) {
      return 'Moderate alignment: Evaluate effort vs. potential. Consider informal outreach first to gauge fit.';
    }

    if (score >= 2) {
      return 'Low alignment: Only pursue if strategic reasons exist (e.g., relationship building). Low priority.';
    }

    return 'Poor alignment: Not recommended unless grant landscape changes significantly.';
  }
}

export default ALYGNAlignmentValidator;

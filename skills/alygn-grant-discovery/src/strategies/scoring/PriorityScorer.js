// PriorityScorer - Calculate priority based on deadline urgency and grant amount
import { logger } from '../../utils/logger.js';

const DEFAULT_WEIGHTS = {
  deadlineWeight: 0.4,
  amountWeight: 0.3,
  confidenceWeight: 0.3
};

export class PriorityScorer {
  constructor(weights = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  async score(grant, context) {
    const deadlineScore = this._calculateDeadlineScore(grant);
    const amountScore = this._calculateAmountScore(grant);
    const confidenceScore = grant.typeData?.eligibilityConfidence || 0.5;

    // Weighted composite
    const composite =
      (deadlineScore * this.weights.deadlineWeight) +
      (amountScore * this.weights.amountWeight) +
      (confidenceScore * this.weights.confidenceWeight);

    const normalizedScore = Math.min(100, Math.max(0, composite * 100));

    logger.debug(`Priority score for ${grant.name}: ${normalizedScore.toFixed(1)}`, {
      deadlineScore,
      amountScore,
      confidenceScore
    });

    return {
      score: Math.round(normalizedScore),
      deadlineScore,
      amountScore,
      confidenceScore,
      composite
    };
  }

  _calculateDeadlineScore(grant) {
    if (!grant.deadline?.full) return 0.5; // No deadline = neutral

    const now = new Date();
    const deadline = new Date(grant.deadline.full);
    const daysUntil = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) return 0; // Past deadline
    if (daysUntil <= 7) return 1.0; // Critical
    if (daysUntil <= 14) return 0.9;
    if (daysUntil <= 30) return 0.7;
    if (daysUntil <= 60) return 0.5;
    if (daysUntil <= 90) return 0.3;
    if (daysUntil <= 180) return 0.2;
    return 0.1; // > 6 months out
  }

  _calculateAmountScore(grant) {
    const amountMax = grant.amount?.max || 0;
    const amountMin = grant.amount?.min || 0;

    // Baseline: $100K is score 0.5, scale from there
    const baseline = 100000;
    const targetMax = 5000000; // $5M = max score

    if (amountMax >= targetMax) return 1.0;
    if (amountMax >= baseline) {
      return Math.min(1.0, amountMax / targetMax);
    }
    if (amountMax > 0) {
      return Math.max(0.1, amountMax / baseline * 0.5);
    }
    return 0.2; // Unknown amount = low-mid
  }
}

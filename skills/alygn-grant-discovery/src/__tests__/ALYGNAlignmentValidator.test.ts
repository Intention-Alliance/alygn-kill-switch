/**
 * ALYGNAlignmentValidator Test Suite
 * 
 * Run with: bun test
 */

import { describe, it, expect } from 'bun:test';
import { GrantEntity } from '../entities/GrantEntity';
import { ALYGNAlignmentValidator } from '../strategies/alignment/ALYGNAlignmentValidator';

describe('ALYGNAlignmentValidator', () => {
  const validator = new ALYGNAlignmentValidator();

  describe('validate', () => {
    it('should score highly aligned grants', () => {
      const grant = new GrantEntity({
        name: 'AI Safety Research Grant',
        organization: 'Open Philanthropy',
        researchAreas: ['AI safety', 'AI alignment', 'technical safety'],
        organizationCulture: {
          values: ['high impact', 'long-term thinking'],
          approach: 'Collaborative',
          community: 'AI safety research'
        },
        eligibility: {
          entityTypes: ['non-profit', 'academic'],
          requirements: []
        },
        exclusions: []
      });

      const result = validator.validate(grant);
      
      expect(result.score).toBeGreaterThanOrEqual(6);
      expect(result.rationale).toContain('alignment');
      expect(result.repositioning?.required).toBeFalsy();
    });

    it('should exclude grants with forbidden topics', () => {
      const grant = new GrantEntity({
        name: 'AGI Development Grant',
        organization: 'Some Org',
        researchAreas: ['AGI development', 'AI capabilities'],
        exclusions: ['AI safety'],
        organizationCulture: {
          values: ['innovation'],
          approach: 'Competitive',
          community: 'Tech'
        },
        eligibility: {
          entityTypes: ['corporate'],
          requirements: []
        }
      });

      const result = validator.validate(grant);
      
      expect(result.score).toBe(0);
      expect(result.rationale).toContain('Excluded');
    });

    it('should suggest repositioning for moderately aligned grants', () => {
      const grant = new GrantEntity({
        name: 'AI Research Grant',
        organization: 'NSF',
        researchAreas: ['machine learning', 'AI applications'],
        organizationCulture: {
          values: ['scientific excellence'],
          approach: 'Academic',
          community: 'Academic research'
        },
        eligibility: {
          entityTypes: ['academic'],
          requirements: []
        },
        exclusions: []
      });

      const result = validator.validate(grant);
      
      expect(result.score).toBeGreaterThanOrEqual(2);
      expect(result.score).toBeLessThan(7);
      expect(result.repositioning?.required).toBe(true);
      expect(result.repositioning?.recommendations.length).toBeGreaterThan(0);
    });
  });
});

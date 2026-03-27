/**
 * GrantEntity Test Suite
 * 
 * Run with: bun test
 */

import { describe, it, expect } from 'bun:test';
import { GrantEntity } from '../entities/GrantEntity';

describe('GrantEntity', () => {
  describe('constructor', () => {
    it('should create a grant with default values', () => {
      const grant = new GrantEntity({
        name: 'Test Grant',
        organization: 'Test Org'
      });

      expect(grant.name).toBe('Test Grant');
      expect(grant.organization).toBe('Test Org');
      expect(grant.status).toBe('discovered');
      expect(grant.type).toBe('grant');
      expect(grant.id).toBeDefined();
    });

    it('should handle amount ranges', () => {
      const grant = new GrantEntity({
        name: 'Test Grant',
        organization: 'Test Org',
        amount: {
          min: 100000,
          max: 500000,
          currency: 'USD'
        }
      });

      expect(grant.amount.min).toBe(100000);
      expect(grant.amount.max).toBe(500000);
      expect(grant.amount.currency).toBe('USD');
    });
  });

  describe('isOpen', () => {
    it('should return true for rolling deadlines', () => {
      const grant = new GrantEntity({
        name: 'Test',
        organization: 'Test',
        deadlineType: 'rolling'
      });
      expect(grant.isOpen()).toBe(true);
    });

    it('should return false for closed deadlines', () => {
      const grant = new GrantEntity({
        name: 'Test',
        organization: 'Test',
        deadlineType: 'closed'
      });
      expect(grant.isOpen()).toBe(false);
    });

    it('should check past deadlines', () => {
      const pastDate = new Date(Date.now() - 86400000); // Yesterday
      const grant = new GrantEntity({
        name: 'Test',
        organization: 'Test',
        deadline: pastDate,
        deadlineType: 'fixed'
      });
      expect(grant.isOpen()).toBe(false);
    });
  });

  describe('getDaysUntilDeadline', () => {
    it('should calculate days correctly', () => {
      const futureDate = new Date(Date.now() + 7 * 86400000); // 7 days from now
      const grant = new GrantEntity({
        name: 'Test',
        organization: 'Test',
        deadline: futureDate,
        deadlineType: 'fixed'
      });
      
      const days = grant.getDaysUntilDeadline();
      expect(days).toBeGreaterThanOrEqual(6);
      expect(days).toBeLessThanOrEqual(8);
    });

    it('should return null for no deadline', () => {
      const grant = new GrantEntity({
        name: 'Test',
        organization: 'Test'
      });
      expect(grant.getDaysUntilDeadline()).toBeNull();
    });
  });

  describe('toJSON and fromJSON', () => {
    it('should serialize and deserialize correctly', () => {
      const original = new GrantEntity({
        name: 'Test Grant',
        organization: 'Test Org',
        amount: { max: 100000, currency: 'USD' },
        researchAreas: ['AI safety'],
        status: 'discovered'
      });

      const json = original.toJSON();
      const restored = GrantEntity.fromJSON(json);

      expect(restored.name).toBe(original.name);
      expect(restored.organization).toBe(original.organization);
      expect(restored.researchAreas).toEqual(original.researchAreas);
    });
  });
});

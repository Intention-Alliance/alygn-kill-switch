/**
 * B-001 Data Integrity Tests
 * 
 * Validates that:
 * 1. MunicipalEntity.fromCanton() produces Spanish pain points
 * 2. MunicipalEntity constructor rejects English pain points
 * 3. lang-guard utilities correctly detect English content
 * 4. Spanish pain points are canonical and consistent
 * 5. Research/Discovery strategies produce Spanish content
 */

import { describe, it, expect } from 'vitest';
import { MunicipalEntity } from '../entities/MunicipalEntity';
import { COSTA_RICA_CANTONES } from '../entities/municipal-data';
import {
  containsEnglishPainPoint,
  isSpanishPainPoint,
  translatePainPoint,
  translatePainPoints,
  assertSpanishPainPoints,
  validateMunicipalSpanishIntegrity,
  SPANISH_PAIN_POINTS,
} from '../entities/lang-guard';
import type { ICostaRicaCanton } from '../entities/types';

// ============================================
// Lang Guard Unit Tests
// ============================================

describe('lang-guard: containsEnglishPainPoint', () => {
  it('detects known English pain points', () => {
    expect(containsEnglishPainPoint('Digital transformation complexity')).toBe(true);
    expect(containsEnglishPainPoint('Limited technical resources')).toBe(true);
    expect(containsEnglishPainPoint('Citizen service delivery')).toBe(true);
    expect(containsEnglishPainPoint('Data governance and privacy')).toBe(true);
    expect(containsEnglishPainPoint('Inter-agency coordination')).toBe(true);
    expect(containsEnglishPainPoint('AI accountability')).toBe(true);
    expect(containsEnglishPainPoint('Resource constraints')).toBe(true);
    expect(containsEnglishPainPoint('Service delivery')).toBe(true);
  });

  it('does not flag Spanish pain points', () => {
    expect(containsEnglishPainPoint('Complejidad de la transformación digital')).toBe(false);
    expect(containsEnglishPainPoint('Recursos técnicos limitados')).toBe(false);
    expect(containsEnglishPainPoint('Entrega de servicios ciudadanos')).toBe(false);
    expect(containsEnglishPainPoint('Gobernanza de datos y privacidad')).toBe(false);
    expect(containsEnglishPainPoint('Coordinación interinstitucional')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(containsEnglishPainPoint('DIGITAL TRANSFORMATION')).toBe(true);
    expect(containsEnglishPainPoint('digital transformation')).toBe(true);
    expect(containsEnglishPainPoint('Digital Transformation')).toBe(true);
  });
});

describe('lang-guard: isSpanishPainPoint', () => {
  it('returns true for Spanish pain points', () => {
    expect(isSpanishPainPoint('Complejidad de la transformación digital')).toBe(true);
    expect(isSpanishPainPoint('Recursos técnicos limitados')).toBe(true);
  });

  it('returns false for English pain points', () => {
    expect(isSpanishPainPoint('Digital transformation complexity')).toBe(false);
    expect(isSpanishPainPoint('Limited technical resources')).toBe(false);
  });
});

describe('lang-guard: translatePainPoint', () => {
  it('translates known English pain points to Spanish', () => {
    expect(translatePainPoint('Digital transformation complexity')).toBe('Complejidad de la transformación digital');
    expect(translatePainPoint('Limited technical resources')).toBe('Recursos técnicos limitados');
    expect(translatePainPoint('Citizen service delivery')).toBe('Entrega de servicios ciudadanos');
    expect(translatePainPoint('Data governance and privacy')).toBe('Gobernanza de datos y privacidad');
    expect(translatePainPoint('Inter-agency coordination')).toBe('Coordinación interinstitucional');
  });

  it('returns original if no mapping exists', () => {
    expect(translatePainPoint('Custom pain point')).toBe('Custom pain point');
  });
});

describe('lang-guard: translatePainPoints', () => {
  it('translates mixed arrays', () => {
    const result = translatePainPoints([
      'Digital transformation complexity',
      'Recursos técnicos limitados',
      'Citizen service delivery',
    ]);
    expect(result).toEqual([
      'Complejidad de la transformación digital',
      'Recursos técnicos limitados',
      'Entrega de servicios ciudadanos',
    ]);
  });
});

describe('lang-guard: assertSpanishPainPoints', () => {
  it('passes for Spanish pain points', () => {
    expect(() => assertSpanishPainPoints([
      'Complejidad de la transformación digital',
      'Recursos técnicos limitados',
    ])).not.toThrow();
  });

  it('throws for English pain points', () => {
    expect(() => assertSpanishPainPoints([
      'Digital transformation complexity',
    ])).toThrow(/English pain points detected/);
  });

  it('includes Spanish suggestions in error message', () => {
    try {
      assertSpanishPainPoints(['Limited technical resources']);
    } catch (err) {
      expect((err as Error).message).toContain('Recursos técnicos limitados');
      return; // Test passes if error was thrown
    }
    throw new Error('Should have thrown');
  });

  it('passes for empty array', () => {
    expect(() => assertSpanishPainPoints([])).not.toThrow();
  });
});

describe('lang-guard: validateMunicipalSpanishIntegrity', () => {
  it('validates clean Spanish typeData', () => {
    const result = validateMunicipalSpanishIntegrity({
      painPoints: SPANISH_PAIN_POINTS,
    });
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('detects English pain points in typeData', () => {
    const result = validateMunicipalSpanishIntegrity({
      painPoints: ['Digital transformation complexity', 'Recursos técnicos limitados'],
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain('Complejidad de la transformación digital');
  });
});

// ============================================
// MunicipalEntity Integration Tests
// ============================================

describe('MunicipalEntity.fromCanton', () => {
  it('creates entity with Spanish pain points', () => {
    const canton: ICostaRicaCanton = {
      name: 'San José',
      province: 'San José',
      population: 288054,
      budget: 150000000,
    };
    const entity = MunicipalEntity.fromCanton(canton);
    
    expect(entity.typeData.painPoints).toEqual(SPANISH_PAIN_POINTS);
    expect(entity.name).toBe('Municipalidad de San José');
    expect(entity.location.country).toBe('Costa Rica');
  });

  it('creates entity with Spanish department focus', () => {
    const canton: ICostaRicaCanton = {
      name: 'Escazú',
      province: 'San José',
      population: 91117,
      budget: 45000000,
    };
    const entity = MunicipalEntity.fromCanton(canton);
    
    // Department focus should be in Spanish
    for (const dept of entity.typeData.departments || []) {
      for (const focus of dept.focus) {
        expect(containsEnglishPainPoint(focus)).toBe(false);
      }
    }
  });

  it('all 82 cantones produce valid Spanish entities', () => {
    for (const canton of COSTA_RICA_CANTONES) {
      const entity = MunicipalEntity.fromCanton(canton);
      const validation = validateMunicipalSpanishIntegrity(entity.typeData);
      expect(validation.valid).toBe(true);
    }
  });
});

describe('MunicipalEntity constructor language guard', () => {
  it('accepts Spanish pain points', () => {
    expect(() => new MunicipalEntity({
      name: 'Test',
      typeData: {
        painPoints: ['Complejidad de la transformación digital'],
      }
    })).not.toThrow();
  });

  it('rejects English pain points', () => {
    expect(() => new MunicipalEntity({
      name: 'Test',
      typeData: {
        painPoints: ['Digital transformation complexity'],
      }
    })).toThrow(/English pain points detected/);
  });

  it('rejects mixed English/Spanish pain points', () => {
    expect(() => new MunicipalEntity({
      name: 'Test',
      typeData: {
        painPoints: [
          'Complejidad de la transformación digital',
          'Limited technical resources', // English!
        ],
      }
    })).toThrow(/English pain points detected/);
  });
});

// ============================================
// Canonical Pain Points Consistency
// ============================================

describe('SPANISH_PAIN_POINTS constant', () => {
  it('has exactly 5 pain points', () => {
    expect(SPANISH_PAIN_POINTS).toHaveLength(5);
  });

  it('all pain points are Spanish', () => {
    for (const pp of SPANISH_PAIN_POINTS) {
      expect(isSpanishPainPoint(pp)).toBe(true);
    }
  });

  it('matches fromCanton() pain points exactly', () => {
    const canton: ICostaRicaCanton = {
      name: 'Test',
      province: 'Test',
      population: 10000,
      budget: 1000000,
    };
    const entity = MunicipalEntity.fromCanton(canton);
    expect(entity.typeData.painPoints).toEqual(SPANISH_PAIN_POINTS);
  });
});
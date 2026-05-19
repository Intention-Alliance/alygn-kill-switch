import { describe, it, expect } from 'bun:test';
import { secureCompare } from '../secure-compare';

describe('secureCompare', () => {
  it('returns true for identical strings', () => {
    expect(secureCompare('hello', 'hello')).toBe(true);
  });

  it('returns false for different strings of same length', () => {
    expect(secureCompare('hello', 'world')).toBe(false);
  });

  it('returns false for strings of different lengths', () => {
    expect(secureCompare('short', 'very-long-string')).toBe(false);
  });

  it('returns false when first argument is undefined', () => {
    expect(secureCompare(undefined, 'hello')).toBe(false);
  });

  it('returns false when second argument is undefined', () => {
    expect(secureCompare('hello', undefined)).toBe(false);
  });

  it('returns false when both arguments are undefined', () => {
    expect(secureCompare(undefined, undefined)).toBe(false);
  });

  it('returns false when any argument is an empty string', () => {
    expect(secureCompare('', 'hello')).toBe(false);
    expect(secureCompare('hello', '')).toBe(false);
    expect(secureCompare('', '')).toBe(false);
  });

  it('returns true for long identical strings (1KB, timing-safe)', () => {
    const long = 'x'.repeat(1024);
    expect(secureCompare(long, long)).toBe(true);
  });

  it('returns false for long different strings (1KB, timing-safe)', () => {
    const a = 'x'.repeat(1024);
    const b = 'x'.repeat(1023) + 'y';
    expect(secureCompare(a, b)).toBe(false);
  });
});

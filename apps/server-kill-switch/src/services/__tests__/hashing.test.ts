import { test, expect } from 'bun:test'
import { hashingService } from '../hashing'

test('generateApiKey: produces wk_ prefix', () => {
  const key = hashingService.generateApiKey()
  expect(key.startsWith('wk_')).toBe(true)
})

test('generateApiKey: length is 51 (wk_ + 48 hex chars)', () => {
  const key = hashingService.generateApiKey()
  expect(key.length).toBe(51) // 3 + 48
})

test('generateApiKey: all chars after wk_ are hex', () => {
  const key = hashingService.generateApiKey()
  const payload = key.slice(3) // strip 'wk_'
  expect(payload.length).toBe(48)
  expect(/^[0-9a-f]+$/.test(payload)).toBe(true)
})

test('generateApiKey: 1000 successive calls produce no duplicates', () => {
  const keys = new Set<string>()
  for (let i = 0; i < 1000; i++) {
    keys.add(hashingService.generateApiKey())
  }
  expect(keys.size).toBe(1000)
})
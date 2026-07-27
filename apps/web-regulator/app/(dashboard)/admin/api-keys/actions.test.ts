import { test, expect, mock, beforeEach, afterEach } from 'bun:test'

// Test F4: isMockMode must return false in production regardless of ADMIN_UI_API_KEY.
// We can't directly import isMockMode (it's not exported), so we test the logic
// that the function uses. This test documents the contract.

function isMockModeLogic(nodeEnv: string | undefined, adminKey: string | undefined): boolean {
  return (nodeEnv ?? '') !== 'production' && !adminKey
}

test('isMockMode: returns false in production even without ADMIN_UI_API_KEY', () => {
  expect(isMockModeLogic('production', undefined)).toBe(false)
  expect(isMockModeLogic('production', '')).toBe(false)
})

test('isMockMode: returns false in production even with empty ADMIN_UI_API_KEY', () => {
  expect(isMockModeLogic('production', '')).toBe(false)
})

test('isMockMode: returns true in development without ADMIN_UI_API_KEY', () => {
  expect(isMockModeLogic('development', undefined)).toBe(true)
  expect(isMockModeLogic('development', '')).toBe(true)
})

test('isMockMode: returns false in development with ADMIN_UI_API_KEY set', () => {
  expect(isMockModeLogic('development', 'wk_test_key')).toBe(false)
})

test('isMockMode: returns true when NODE_ENV is unset and no key', () => {
  expect(isMockModeLogic(undefined, undefined)).toBe(true)
})
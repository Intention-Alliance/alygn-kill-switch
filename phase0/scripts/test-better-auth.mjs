#!/usr/bin/env bun

/**
 * Better-Auth Integration Test Script
 *
 * Tests:
 * 1. Login returns 200 + Set-Cookie
 * 2. Cookie is HttpOnly, SameSite=Strict
 * 3. /v1/auth/me returns user when authenticated
 * 4. /v1/auth/me returns 401 when not authenticated
 * 5. Kill Switch endpoints still protected with session cookie
 */

const BASE_URL = process.env.KILL_SWITCH_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@alygn.com';
const ADMIN_PASSWORD = process.env.KILL_SWITCH_AUTH_TOKEN || 'andlersrv-auth-token-2026';

let failures = 0;
let passed = 0;

function log(emoji, label, ...args) {
  console.log(`${emoji} ${label}`, ...args);
}

function assert(condition, msg) {
  if (condition) {
    passed++;
    log('✅', 'PASS:', msg);
  } else {
    failures++;
    log('❌', 'FAIL:', msg);
  }
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(`${BASE_URL}${url}`, {
    ...opts,
    redirect: 'manual',
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { _raw: text };
  }
  return { status: res.status, headers: res.headers, data };
}

// ─── Test 1: Login ──────────────────────────────────────────────

log('🔐', 'Test 1: Login with valid credentials');

const loginResult = await fetchJSON('/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
});

assert(loginResult.status === 200, `Login returns 200 (got ${loginResult.status})`);

const setCookie = loginResult.headers.get('set-cookie');
assert(!!setCookie, 'Set-Cookie header is present');

if (setCookie) {
  const cookieLower = setCookie.toLowerCase();
  assert(cookieLower.includes('httponly'), 'Cookie is HttpOnly');
  assert(cookieLower.includes('samesite=strict'), 'Cookie is SameSite=Strict');
  log('📋', 'Cookie value:', setCookie);

  // ─── Test 2: /v1/auth/me with cookie ─────────────────────────

  log('👤', 'Test 2: /v1/auth/me with session cookie');

  // Extract the cookie name=value for sending back
  const cookieValue = setCookie.split(';')[0]; // "name=value"

  const meResult = await fetchJSON('/v1/auth/me', {
    method: 'GET',
    headers: { Cookie: cookieValue },
  });

  assert(meResult.status === 200, `/v1/auth/me returns 200 (got ${meResult.status})`);
  assert(!!meResult.data?.user, `Returns user object: ${JSON.stringify(meResult.data?.user)}`);

  // ─── Test 3: /v1/auth/me without cookie ──────────────────────

  log('🚫', 'Test 3: /v1/auth/me without cookie');

  const meNoCookie = await fetchJSON('/v1/auth/me', { method: 'GET' });

  assert(meNoCookie.status === 401, `/v1/auth/me returns 401 without cookie (got ${meNoCookie.status})`);

  // ─── Test 4: Protected endpoint with cookie ─────────────────

  log('🛡️', 'Test 4: Protected endpoint with session cookie');

  const statusResult = await fetchJSON('/v1/kill-switch/status', {
    method: 'GET',
    headers: { Cookie: cookieValue },
  });

  assert(statusResult.status === 200, `Kill Switch status returns 200 with cookie (got ${statusResult.status})`);
  assert(statusResult.data?.state !== undefined, `Returns state: ${statusResult.data?.state}`);

  // ─── Test 5: Protected endpoint without cookie ──────────────

  log('🔒', 'Test 5: Protected endpoint without cookie');

  const statusNoAuth = await fetchJSON('/v1/kill-switch/status', { method: 'GET' });

  assert(statusNoAuth.status === 401 || statusNoAuth.status === 403,
    `Kill Switch status returns ${statusNoAuth.status} without auth (expected 401 or 403)`);

  // ─── Test 6: Logout ─────────────────────────────────────────

  log('👋', 'Test 6: Logout');

  const logoutResult = await fetchJSON('/v1/auth/logout', {
    method: 'POST',
    headers: { Cookie: cookieValue },
  });

  const logoutCookie = logoutResult.headers.get('set-cookie');
  assert(logoutResult.status === 200, `Logout returns 200 (got ${logoutResult.status})`);
  if (logoutCookie) {
    assert(logoutCookie.toLowerCase().includes('max-age=0'), 'Logout clears cookie');
  }

  // ─── Test 7: After logout, /v1/auth/me = 401 ───────────────

  log('🔄', 'Test 7: /v1/auth/me after logout');
  const meAfterLogout = await fetchJSON('/v1/auth/me', { method: 'GET' });
  assert(meAfterLogout.status === 401, `/v1/auth/me returns 401 after logout (got ${meAfterLogout.status})`);
}

// ─── Test 8: Invalid login ─────────────────────────────────────

log('❌', 'Test 8: Login with invalid credentials');

const invalidLogin = await fetchJSON('/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: 'wrong-password' }),
});

assert(invalidLogin.status === 401 || invalidLogin.status === 403,
  `Invalid login returns ${invalidLogin.status} (expected 401 or 403)`);

// ─── Test 9: POST request body parsing ─────────────────────────

log('📦', 'Test 9: Login with missing fields');

const missingFields = await fetchJSON('/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
});

assert(missingFields.status >= 400, `Missing fields returns ${missingFields.status} (expected 4xx)`);

// ─── Summary ──────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failures}`);
console.log('='.repeat(50));

if (failures > 0) {
  process.exit(1);
} else {
  console.log('\n🎉 All tests passed! Better-Auth integration working correctly.');
}

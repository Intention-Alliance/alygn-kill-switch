import { timingSafeEqual } from 'crypto';

function secureCompare(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const body = JSON.stringify({
  email: "admin@alyygn.com",
  password: process.env.KILL_SWITCH_AUTH_TOKEN
});

const parsed = JSON.parse(body);

console.log('secureCompare(email):', secureCompare(parsed.email, "admin@alyygn.com"));
console.log('secureCompare(password):', secureCompare(parsed.password, process.env.KILL_SWITCH_AUTH_TOKEN));
console.log('Both:', secureCompare(parsed.email, "admin@alyygn.com") && secureCompare(parsed.password, process.env.KILL_SWITCH_AUTH_TOKEN));

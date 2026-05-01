import { timingSafeEqual } from 'crypto';

function secureCompare(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const validEmail = process.env.ADMIN_EMAIL || 'admin@alyygn.com';
const validPassword = process.env.KILL_SWITCH_AUTH_TOKEN;
const email = 'admin@alyygn.com';
const password = '760654b50534b6709b76399af9aef753e991cb0b899080edaed340567966d847';

console.log('validEmail:', validEmail);
console.log('validPassword length:', validPassword?.length);
console.log('email match:', secureCompare(email, validEmail));
console.log('password match:', secureCompare(password, validPassword));
console.log('RESULT:', secureCompare(email, validEmail) && secureCompare(password, validPassword));

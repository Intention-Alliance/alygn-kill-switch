// Quick auth test
import { timingSafeEqual } from 'crypto';

function secureCompare(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const env = process.env.KILL_SWITCH_AUTH_TOKEN;
const test = "760654b50534b6709b76399af9aef753e991cb0b899080edaed340567966d847";

console.log('ENV var:', env);
console.log('Test:', test);
console.log('Lengths:', env?.length, test?.length);
console.log('secureCompare:', secureCompare(env, test));
console.log('Direct ===:', env === test);
console.log('Buffer compare:', timingSafeEqual(Buffer.from(env || ''), Buffer.from(test)));

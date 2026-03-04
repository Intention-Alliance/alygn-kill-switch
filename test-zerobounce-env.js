// Test ZeroBounce env var
const apiKey = process.env.ZEROBOUNCE_API_KEY;
console.log('ZEROBOUNCE_API_KEY:', apiKey ? 'SET' : 'NOT SET');
if (apiKey) {
  console.log('Length:', apiKey.length);
  console.log('Prefix:', apiKey.substring(0, 8) + '...');
}

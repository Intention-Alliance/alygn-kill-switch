import http from 'http';

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/v1/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
};

const body = JSON.stringify({
  email: 'admin@alyygn.com',
  password: '760654b50534b6709b76399af9aef753e991cb0b899080edaed340567966d847',
});

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.write(body);
req.end();

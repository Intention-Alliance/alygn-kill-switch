// Test full auth flow
const bodyData = Buffer.from(JSON.stringify({
  email: "admin@alyygn.com",
  password: "760654b50534b6709b76399af9aef753e991cb0b899080edaed340567966d847"
}));

// Simulate parseBody
let data = '';
const req = {
  on: (event, cb) => {
    if (event === 'data') cb(bodyData);
    if (event === 'end') cb();
    return req;
  }
};

// Simulate the auth handler logic
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function test() {
  const body = await parseBody(req);
  const { email, password } = body;
  const validEmail = process.env.ADMIN_EMAIL || 'admin@alyygn.com';
  const validPassword = process.env.KILL_SWITCH_AUTH_TOKEN;

  console.log('email:', email);
  console.log('password length:', password?.length);
  console.log('validPassword length:', validPassword?.length);
  console.log('email match:', email === validEmail);
  console.log('password match:', password === validPassword);
}

test();

import { parseBody } from './apps/kill-switch-api/src/utils/body-parser';

const mockReq = {
  on: (event: string, cb: any) => {
    if (event === 'data') {
      cb(Buffer.from(JSON.stringify({
        email: 'admin@alyygn.com',
        password: '760654b50534b6709b76399af9aef753e991cb0b899080edaed340567966d847'
      })));
    }
    if (event === 'end') {
      cb();
    }
    return mockReq;
  }
};

async function test() {
  const body = await parseBody(mockReq);
  console.log('Parsed body:', body);
  console.log('Email:', body.email);
  console.log('Password:', body.password);
  console.log('Password length:', body.password?.length);
  console.log('Env password:', process.env.KILL_SWITCH_AUTH_TOKEN);
  console.log('Match:', body.password === process.env.KILL_SWITCH_AUTH_TOKEN);
}

test();

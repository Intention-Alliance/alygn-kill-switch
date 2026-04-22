/**
 * Email Verification Script
 * Verifies mayor/council emails using ZeroBounce API
 * 
 * Usage:
 *   node verify-emails.js --input=/tmp/muni-cr-researched.json --mock
 */

import fs from "fs";

const ZEROBOUNCE_API_KEY = process.env.ZEROBOUNCE_API_KEY;
const MOCK_MODE = process.argv.includes('--mock');

if (!MOCK_MODE && !ZEROBOUNCE_API_KEY) {
  console.error('❌ Missing ZEROBOUNCE_API_KEY environment variable (use --mock for mock mode)');
  process.exit(1);
}

/**
 * Verifies emails for municipalities
 * @param {Array} municipalities - Researched municipalities
 * @param {boolean} mock - Use mock data
 * @returns {Promise<Array>} Municipalities with verified emails
 */
async function verifyEmails(municipalities, mock = false) {
  console.log(`✅ Verifying emails for ${municipalities.length} municipalities...`);
  
  if (mock || !ZEROBOUNCE_API_KEY) {
    console.log('⚠️  Mock mode or no API key - simulating verification');
    return simulateVerification(municipalities);
  }
  
  const verified = [];
  
  for (const muni of municipalities) {
    try {
      const result = await verifySingleMunicipality(muni);
      verified.push({ ...muni, ...result });
    } catch (error) {
      console.error(`Error verifying ${muni.name}:`, error.message);
      verified.push({
        ...muni,
        email_verification_status: 'error',
        email_verification_error: error.message
      });
    }
  }
  
  const validCount = verified.filter(m => m.email_verification_status === 'valid').length;
  console.log(`✅ Verified: ${validCount}/${verified.length} valid emails`);
  
  return verified;
}

/**
 * Verifies single municipality emails
 */
async function verifySingleMunicipality(municipality) {
  const result = {
    email_verification_status: 'pending',
    verified_at: new Date().toISOString(),
    email_verification: {}
  };
  
  // Verify mayor email
  if (municipality.contacts?.mayor_email) {
    const verification = await verifyEmail(municipality.contacts.mayor_email);
    result.email_verification.mayor = verification;
    
    if (verification.status === 'valid') {
      result.email_verification_status = 'valid';
    } else if (verification.status === 'catch-all' || verification.status === 'unknown') {
      result.email_verification_status = 'risky';
    } else {
      result.email_verification_status = 'invalid';
    }
  }
  
  // Verify council emails
  if (municipality.contacts?.council_emails?.length > 0) {
    result.email_verification.council = [];
    for (const email of municipality.contacts.council_emails) {
      const verification = await verifyEmail(email);
      result.email_verification.council.push(verification);
    }
  }
  
  return result;
}

/**
 * Verifies single email using ZeroBounce
 */
async function verifyEmail(email) {
  const apiUrl = `https://api.zerobounce.net/v2/validate?api_key=${ZEROBOUNCE_API_KEY}&email=${encodeURIComponent(email)}`;
  
  const response = await fetch(apiUrl);
  
  if (!response.ok) {
    throw new Error(`ZeroBounce error: ${response.status}`);
  }
  
  const data = await response.json();
  
  return {
    email: data.address,
    status: data.status, // valid, invalid, catch-all, unknown, spamtrap, abuse, do_not_mail
    sub_status: data.sub_status,
    free_email: data.free_email,
    did_you_mean: data.did_you_mean,
    account: data.account,
    domain: data.domain,
    domain_age_days: data.domain_age_days,
    smtp_provider: data.smtp_provider,
    mx_found: data.mx_found,
    mx_record: data.mx_record,
    firstname: data.firstname,
    lastname: data.lastname,
    gender: data.gender,
    country: data.country,
    region: data.region,
    city: data.city,
    zipcode: data.zipcode,
    processed_at: data.processed_at
  };
}

/**
 * Simulates email verification (mock mode)
 */
function simulateVerification(municipalities) {
  return municipalities.map(muni => {
    const isValid = Math.random() > 0.1; // 90% valid rate
    
    return {
      ...muni,
      email_verification_status: isValid ? 'valid' : 'invalid',
      verified_at: new Date().toISOString(),
      email_verification: {
        mayor: {
          email: muni.contacts?.mayor_email,
          status: isValid ? 'valid' : 'invalid',
          sub_status: isValid ? 'none' : 'no_dns_entries',
          free_email: false,
          mock: true
        },
        council: (muni.contacts?.council_emails || []).map(email => ({
          email,
          status: Math.random() > 0.15 ? 'valid' : 'invalid',
          mock: true
        }))
      },
      mock: true
    };
  });
}

/**
 * Saves verification results
 */
function saveResults(municipalities, outputFile) {
  const output = {
    verified_at: new Date().toISOString(),
    count: municipalities.length,
    valid_count: municipalities.filter(m => m.email_verification_status === 'valid').length,
    risky_count: municipalities.filter(m => m.email_verification_status === 'risky').length,
    invalid_count: municipalities.filter(m => m.email_verification_status === 'invalid').length,
    municipalities
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`💾 Saved to ${outputFile}`);
  
  return output;
}

// CLI usage
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  const inputArg = args.find(a => a.startsWith('--input='));
  const outputArg = args.find(a => a.startsWith('--output='));
  
  if (!inputArg) {
    console.error('Usage: node verify-emails.js --input=/path/to/municipalities.json [--output=file.json] [--mock]');
    process.exit(1);
  }
  
  const inputFile = inputArg.split('=')[1];
  const outputFile = outputArg ? outputArg.split('=')[1] : '/tmp/muni-verified.json';
  
  try {
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    const municipalities = data.municipalities || data;
    
    verifyEmails(municipalities, MOCK_MODE)
      .then(verified => {
        saveResults(verified, outputFile);
        
        console.log('\n📊 Verification Summary:');
        console.log(`   Total: ${verified.length}`);
        console.log(`   Valid: ${verified.filter(m => m.email_verification_status === 'valid').length}`);
        console.log(`   Risky: ${verified.filter(m => m.email_verification_status === 'risky').length}`);
        console.log(`   Invalid: ${verified.filter(m => m.email_verification_status === 'invalid').length}`);
        console.log(`   Mode: ${MOCK_MODE ? 'MOCK' : 'LIVE'}`);
      })
      .catch(error => {
        console.error('❌ Error:', error.message);
        process.exit(1);
      });
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

export {
  verifyEmails,
  verifySingleMunicipality,
  verifyEmail
};

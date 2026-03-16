/**
 * Email Sender Script
 * Sends personalized emails via Smartlead (multi-domain)
 * 
 * Usage:
 *   node email-sender.js --input=/tmp/muni-cr-approved.json --mock
 */

import fs from "fs";

const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY;
const EMAIL_SMTP_PASSWORD = process.env.EMAIL_SMTP_PASSWORD;
const MOCK_MODE = process.argv.includes('--mock');

/**
 * Sends emails to municipalities
 * @param {Array} municipalities - Approved municipalities with outreach
 * @param {boolean} mock - Use mock mode
 * @returns {Promise<Object>} Send results
 */
async function sendEmails(municipalities, mock = false) {
  console.log(`📧 Sending emails to ${municipalities.length} municipalities...`);
  
  if (mock || !SMARTLEAD_API_KEY) {
    console.log('⚠️  Mock mode or no API key - simulating send');
    return simulateSend(municipalities);
  }
  
  const results = {
    sent_at: new Date().toISOString(),
    total: municipalities.length,
    sent: 0,
    failed: 0,
    campaigns: {}
  };
  
  for (const muni of municipalities) {
    try {
      const result = await sendSingleEmail(muni);
      results.sent++;
      results.campaigns[muni.name] = result;
    } catch (error) {
      console.error(`Error sending to ${muni.name}:`, error.message);
      results.failed++;
      results.campaigns[muni.name] = {
        status: 'error',
        error: error.message
      };
    }
  }
  
  console.log(`✅ Sent: ${results.sent}/${results.total}`);
  return results;
}

/**
 * Sends single email via Smartlead
 */
async function sendSingleEmail(municipality) {
  if (!municipality.outreach) {
    throw new Error('Missing outreach content');
  }
  
  const outreach = municipality.outreach;
  const email = municipality.contacts?.mayor_email || municipality.contacts?.general_email;
  
  if (!email) {
    throw new Error('No email address found');
  }
  
  // Smartlead API: Create email send
  const response = await fetch('https://api.smartlead.ai/v1/campaigns/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': SMARTLEAD_API_KEY
    },
    body: JSON.stringify({
      campaign_id: `alygn-muni-wave1-${outreach.variant}`,
      to: email,
      from: 'Alygn Governance <governance@alygn.org>',
      subject: outreach.subject,
      body: outreach.body,
      variables: {
        municipality: municipality.name,
        mayor_name: municipality.contacts?.mayor_name || 'Mayor'
      }
    })
  });
  
  if (!response.ok) {
    throw new Error(`Smartlead error: ${response.status}`);
  }
  
  const data = await response.json();
  
  return {
    status: 'sent',
    message_id: data.message_id,
    campaign_id: data.campaign_id,
    sent_at: new Date().toISOString()
  };
}

/**
 * Simulates email sending (mock mode)
 */
function simulateSend(municipalities) {
  const results = {
    sent_at: new Date().toISOString(),
    total: municipalities.length,
    sent: municipalities.length,
    failed: 0,
    campaigns: {},
    mock: true
  };
  
  municipalities.forEach((muni, index) => {
    results.campaigns[muni.name] = {
      status: 'sent (mock)',
      message_id: `mock-msg-${index + 1}`,
      campaign_id: `alygn-muni-wave1-${muni.outreach?.variant || 'governance'}`,
      sent_at: new Date().toISOString(),
      to: muni.contacts?.mayor_email || 'unknown',
      subject: muni.outreach?.subject || 'No subject',
      mock: true
    };
  });
  
  console.log(`✅ Simulated send: ${results.sent} emails`);
  return results;
}

/**
 * Saves send results
 */
function saveResults(results, outputFile) {
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`💾 Saved to ${outputFile}`);
  return results;
}

// CLI usage
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  const inputArg = args.find(a => a.startsWith('--input='));
  const outputArg = args.find(a => a.startsWith('--output='));
  
  if (!inputArg) {
    console.error('Usage: node email-sender.js --input=/path/to/approved.json [--output=send-results.json] [--mock]');
    process.exit(1);
  }
  
  const inputFile = inputArg.split('=')[1];
  const outputFile = outputArg ? outputArg.split('=')[1] : '/tmp/muni-sent.json';
  
  try {
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    const municipalities = data.municipalities || data;
    
    // Filter only approved municipalities
    const approved = municipalities.filter(m => 
      m.outreach && m.outreach_status !== 'error'
    );
    
    console.log(`📧 Sending to ${approved.length} approved municipalities...`);
    
    sendEmails(approved, MOCK_MODE)
      .then(results => {
        saveResults(results, outputFile);
        
        console.log('\n📊 Send Summary:');
        console.log(`   Total approved: ${approved.length}`);
        console.log(`   Sent: ${results.sent}`);
        console.log(`   Failed: ${results.failed}`);
        console.log(`   Mode: ${results.mock ? 'MOCK' : 'LIVE'}`);
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
  sendEmails,
  sendSingleEmail
};

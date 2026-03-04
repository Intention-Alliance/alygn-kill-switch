/**
 * X Warmup Phase 2 - Quote + Strategic Reply
 * Advanced engagement: Quote tweet with Alygn perspective + reply to conversation
 * 
 * Usage:
 *   node x-warmup-phase2.js --input=/tmp/muni-cr-researched.json --mock
 */

const fs = require('fs');

const MOCK_MODE = process.argv.includes('--mock');

// Rate limits (CONSERVATIVE)
const MAX_QUOTES_PER_DAY = 4;
const MAX_REPLIES_PER_DAY = 6;

/**
 * Builds quote tweet text with Alygn perspective
 */
function buildQuoteText(municipalityName) {
    const perspectives = [
        `Important perspective from ${municipalityName}. Governance legitimacy is the infrastructure that enables coordination without centralization. #AIGovernance`,
        `This highlights why municipal leadership matters in AI governance. Coordination must exist before crisis, not improvised during one. #AIPolicy`,
        `${municipalityName} understands that the hardest AI risks are institutional, not technical. Neutral infrastructure enables accountability.`
    ];
    return perspectives[Math.floor(Math.random() * perspectives.length)] + '\n\nmore at @aialygn';
}

/**
 * Builds reply text
 */
function buildReplyText(municipalityName) {
    const replies = [
        `Great discussion from ${municipalityName}! This is exactly why neutral coordination infrastructure matters for AI governance.`,
        `Valuable perspective. Municipalities like ${municipalityName} are key to building AI governance preparedness from the ground up.`,
        `Important point. Local leadership combined with neutral governance frameworks creates resilient coordination.`
    ];
    return replies[Math.floor(Math.random() * replies.length)];
}

/**
 * Executes Phase 2 warmup
 */
async function executePhase2(municipalities, mock = false) {
    console.log(`🔥 X Warmup Phase 2: Quote + Reply for ${municipalities.length} municipalities...`);
    
    const eligible = municipalities.filter(m => 
        m.x_handle && 
        m.x_warmup_phase1_at && 
        !m.x_warmup_phase2_at
    );
    
    console.log(`   Eligible for Phase 2: ${eligible.length}`);
    
    if (eligible.length === 0) {
        console.log('⚠️  No municipalities eligible for Phase 2');
        return { executed: 0, results: [] };
    }
    
    if (mock || true) {
        console.log('⚠️  Mock mode - simulating Phase 2');
        return simulatePhase2(eligible);
    }
    
    console.log('❌ Live mode not implemented - use shared x-api-executor.js directly');
    return { executed: 0, results: [] };
}

/**
 * Simulates Phase 2 (mock mode)
 */
function simulatePhase2(municipalities) {
    const results = {
        executed_at: new Date().toISOString(),
        total: municipalities.length,
        quoted: 0,
        replied: 0,
        errors: 0,
        engagements: [],
        mock: true
    };
    
    municipalities.forEach((muni, index) => {
        if (index >= MAX_QUOTES_PER_DAY) return;
        
        results.quoted++;
        results.engagements.push({
            municipality: muni.name,
            x_handle: muni.x_handle,
            action: 'quote',
            content: buildQuoteText(muni.name),
            completed_at: new Date().toISOString(),
            mock: true
        });
        
        results.replied++;
        results.engagements.push({
            municipality: muni.name,
            x_handle: muni.x_handle,
            action: 'reply',
            content: buildReplyText(muni.name),
            completed_at: new Date().toISOString(),
            mock: true
        });
        
        muni.x_warmup_phase2_at = new Date().toISOString();
        muni.x_engagement_count = (muni.x_engagement_count || 0) + 2;
    });
    
    console.log(`✅ Simulated Phase 2: ${results.quoted} quoted, ${results.replied} replied`);
    return results;
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const inputArg = args.find(a => a.startsWith('--input='));
    const outputArg = args.find(a => a.startsWith('--output='));
    
    if (!inputArg) {
        console.error('Usage: node x-warmup-phase2.js --input=/path/to/municipalities.json [--output=results.json] [--mock]');
        process.exit(1);
    }
    
    const inputFile = inputArg.split('=')[1];
    const outputFile = outputArg ? outputArg.split('=')[1] : '/tmp/muni-x-warmup-phase2.json';
    
    try {
        const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
        const municipalities = data.municipalities || data;
        
        const results = executePhase2(municipalities, MOCK_MODE);
        
        fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
        console.log(`💾 Saved to ${outputFile}`);
        
        data.municipalities = municipalities;
        fs.writeFileSync(inputFile, JSON.stringify(data, null, 2));
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

module.exports = { executePhase2, simulatePhase2 };

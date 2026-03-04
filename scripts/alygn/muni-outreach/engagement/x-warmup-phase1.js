/**
 * X Warmup Phase 1 - Follow + Like Strategy
 * Initial engagement: Follow municipality + like 2-3 recent tweets
 * 
 * Usage:
 *   node x-warmup-phase1.js --input=/tmp/muni-cr-researched.json --mock
 */

const fs = require('fs');

const MOCK_MODE = process.argv.includes('--mock');

// Rate limits (CONSERVATIVE - stay well below X API limits)
const MAX_FOLLOWS_PER_DAY = 4;   // Hard limit
const MAX_LIKES_PER_DAY = 8;     // Hard limit
const MIN_DELAY_SECONDS = 10;
const MAX_DELAY_SECONDS = 15;

/**
 * Executes Phase 1 warmup for municipalities
 */
async function executePhase1(municipalities, mock = false) {
    console.log(`🔥 X Warmup Phase 1: Follow + Like for ${municipalities.length} municipalities...`);
    
    const eligible = municipalities.filter(m => 
        m.x_handle && 
        !m.x_warmup_phase1_at
    );
    
    console.log(`   Eligible for Phase 1: ${eligible.length}`);
    
    if (eligible.length === 0) {
        console.log('⚠️  No municipalities eligible for Phase 1');
        return { executed: 0, results: [] };
    }
    
    if (mock || true) {
        console.log('⚠️  Mock mode - simulating Phase 1');
        return simulatePhase1(eligible);
    }
    
    // Live mode would use shared X API executor here
    console.log('❌ Live mode not implemented - use shared x-api-executor.js directly');
    return { executed: 0, results: [] };
}

/**
 * Simulates Phase 1 (mock mode)
 */
function simulatePhase1(municipalities) {
    const results = {
        executed_at: new Date().toISOString(),
        total: municipalities.length,
        followed: 0,
        liked: 0,
        errors: 0,
        engagements: [],
        mock: true
    };
    
    municipalities.forEach((muni, index) => {
        if (index >= MAX_FOLLOWS_PER_DAY) return;
        
        results.followed++;
        results.engagements.push({
            municipality: muni.name,
            x_handle: muni.x_handle,
            action: 'follow',
            completed_at: new Date().toISOString(),
            mock: true
        });
        
        for (let i = 0; i < 2; i++) {
            results.liked++;
            results.engagements.push({
                municipality: muni.name,
                x_handle: muni.x_handle,
                action: 'like',
                tweet_id: `mock-tweet-${index}-${i}`,
                completed_at: new Date().toISOString(),
                mock: true
            });
        }
        
        muni.x_warmup_phase1_at = new Date().toISOString();
        muni.x_engagement_count = (muni.x_engagement_count || 0) + 3;
    });
    
    console.log(`✅ Simulated Phase 1: ${results.followed} followed, ${results.liked} liked`);
    return results;
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const inputArg = args.find(a => a.startsWith('--input='));
    const outputArg = args.find(a => a.startsWith('--output='));
    
    if (!inputArg) {
        console.error('Usage: node x-warmup-phase1.js --input=/path/to/municipalities.json [--output=results.json] [--mock]');
        process.exit(1);
    }
    
    const inputFile = inputArg.split('=')[1];
    const outputFile = outputArg ? outputArg.split('=')[1] : '/tmp/muni-x-warmup-phase1.json';
    
    try {
        const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
        const municipalities = data.municipalities || data;
        
        const results = executePhase1(municipalities, MOCK_MODE);
        
        fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
        console.log(`💾 Saved to ${outputFile}`);
        
        // Update input file
        data.municipalities = municipalities;
        fs.writeFileSync(inputFile, JSON.stringify(data, null, 2));
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

module.exports = { executePhase1, simulatePhase1 };

# Testing Guide - Alygn X/Twitter Growth

**Date:** 2026-03-01  
**Purpose:** Test scripts and workflows without API credentials

---

## Quick Start Testing

### 1. Test Format Enforcer
```bash
cd ~/.openclaw/workspace

# Test basic formatting
node scripts/alygn/x-growth/posting/format-enforcer.js "Governance is infrastructure"

# Test validation
node scripts/alygn/x-growth/posting/format-enforcer.js --validate "Test content #AIGovernance more at @aialygn"
```

**Expected output:**
```
Formatted tweet:
Governance is infrastructure

#AIGovernance

more at @aialygn

Length: 79 chars
```

---

### 2. Test Workflow Validator
```bash
cd ~/.openclaw/workspace

# Test with sample workflow
node scripts/alygn/x-growth/parser/workflow-validator.js scripts/alygn/x-growth/parser/test-workflow.json
```

**Expected output:**
```
✅ Workflow loaded successfully
Summary: {
  "posts": 2,
  "replies": 1,
  "quotes": 0,
  "follows": 1
}
✅ Validation passed - no issues found
```

---

### 3. Test Thread Generator (Mock Mode)
```bash
cd ~/.openclaw/workspace

# Generate thread about AI governance
node scripts/alygn/x-growth/content/thread-generator.js --topic="AI governance legitimacy" --type=thread --count=5

# Load pre-approved prompts
node scripts/alygn/x-growth/content/thread-generator.js --prompts=1,13
```

**Expected output:**
```
Generating thread about "AI governance legitimacy" (5 tweets)...

--- Generated Content ---
1. Governance can't be retrofitted at frontier scale...

Saved to /tmp/x-growth-generated-[timestamp].md
```

---

### 4. Test Decision Engine (Mock Mode)
```bash
cd ~/.openclaw/workspace

# Create test trends file
cat > /tmp/test-trends.json << 'EOF'
[
  {
    "topic": "AI Safety Summit",
    "tweet_count": 15000,
    "category": "AI Safety",
    "sample_tweets": [
      "World leaders gather for AI Safety Summit",
      "New AI regulations announced"
    ],
    "url": "https://x.com/explore"
  }
]
EOF

# Evaluate trends
node scripts/alygn/x-growth/research/decision-engine.js --trends=/tmp/test-trends.json
```

**Expected output:**
```
Evaluating 1 trends...

--- Engagement Decisions ---
Replies: 1
Quotes: 0
Follows: 1
Metadata: {
  "evaluatedAt": "2026-03-01T...",
  "totalTrends": 1,
  "engageCount": 2,
  ...
}

Saved to /tmp/x-growth-decisions-[timestamp].json
```

---

### 5. Test Daily Summary
```bash
cd ~/.openclaw/workspace

# Create mock phase results
mkdir -p /tmp/x-growth-test
echo '{"posts": [{"id": 1, "content": "Test"}]}' > /tmp/x-growth-phase6-results.json

# Generate summary
node scripts/alygn/x-growth/daily-summary.js
```

**Expected output:**
```
Summary saved to /tmp/x-growth-summary-[timestamp].json

📊 **Alygn X/Twitter Daily Summary**
Date: 3/1/2026, 3:20:00 AM

✅ **Posted Content**: success
...
```

---

### 6. Test Lobster Workflow (Dry Run)
```bash
cd ~/.openclaw/workspace

# List available workflows
lobster workflows.list

# Run workflow (will fail at API calls, but tests structure)
lobster run .lobster/alygn-x-growth-daily.lobster

# Or with dry-run (if supported)
lobster run .lobster/alygn-x-growth-daily.lobster --dry-run
```

---

## Integration Testing

### Test Skill Invocation
```bash
# Test skill info
openclaw skills info alygn-x-growth

# Invoke skill (if configured)
openclaw invoke --tool alygn-x-growth --action daily-growth
```

---

## Mock Data Files

### Test Workflow JSON
Location: `scripts/alygn/x-growth/parser/test-workflow.json`

Contains:
- 2 posts (valid format)
- 1 reply
- 1 follow

### Test Trends JSON
Create manually:
```json
[
  {
    "topic": "AI Governance",
    "tweet_count": 10000,
    "category": "Technology",
    "sample_tweets": ["Tweet 1", "Tweet 2"]
  }
]
```

---

## Expected Behaviors

### Without API Keys
- ✅ Scripts run without crashing
- ✅ Mock data returned instead of API calls
- ✅ Clear logging of mock mode
- ✅ Output files created in `/tmp/`

### With API Keys
- ✅ Real Grok API calls for content generation
- ✅ Real X API calls for posting
- ✅ Real browser automation for discovery
- ✅ Actual tweets posted to @aialygn

---

## Troubleshooting

### "Module not found" errors
```bash
# Ensure you're in workspace directory
cd ~/.openclaw/workspace

# Check file exists
ls -la scripts/alygn/x-growth/parser/workflow-validator.js
```

### "Permission denied" errors
```bash
# Make scripts executable
chmod +x scripts/alygn/x-growth/**/*.js
```

### Lobster not found
```bash
# Verify Lobster in PATH
which lobster

# Or use full path
~/.local/bin/lobster run ...
```

---

## Test Checklist

- [ ] Format enforcer works (basic + validation)
- [ ] Workflow validator passes test file
- [ ] Thread generator creates mock content
- [ ] Decision engine evaluates mock trends
- [ ] Daily summary aggregates results
- [ ] Lobster workflow runs (at least partially)
- [ ] All output files created in `/tmp/`
- [ ] No crashes or unhandled errors

---

## Next Steps After Testing

1. ✅ Fix any bugs found during testing
2. ✅ Update documentation with lessons learned
3. ⏳ Wait for credentials (Supabase, ZeroBounce, etc.)
4. ⏳ Test with real APIs
5. ⏳ Deploy to production cron

---

**Status:** Ready for testing  
**Estimated test time:** 30-45 minutes

# Cronjob: alygn-research-angel

**Schedule:** 6:30 AM daily (Mon-Fri)
**Type:** Angel Discovery
**Purpose:** Research and discover new angel investor leads for upcoming outreach waves

## Execution Flow

### Phase 1: Load Configuration

- Read: `$HOME/.openclaw/.agents/skills/alygn-outreach/config/research-config.json`
- Check: target_sectors, founder_backgrounds, portfolio_companies

### Phase 2: Discover New Angels

- Command: `USE_DIRECT_API=true bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=angel --action=discover --source=angellist,linkedin,gmail --limit=15`
- Output: Raw angel lead data

### Phase 3: Enrich Leads

- Command: `bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=angel --action=research --input=$HOME/.openclaw/workspace/reports/alygn/ai-waves/wave-{today}-angel.json`
- Gather: Investment history, sector focus, warm connection paths

### Phase 4: Score and Filter

- Score leads based on: Sector match, fintech experience, intro potential
- Filter: Minimum score threshold 0.5
- Output: `$HOME/.openclaw/workspace/reports/alygn/ai-waves/wave-{today}-angel.json` with status "researched"

## Success Criteria

- [ ] Minimum 10 new angel leads discovered
- [ ] All leads enriched with background data
- [ ] Leads scored and filtered
- [ ] Wave file created with status "researched"

## Error Handling

- If discovery API fails: Use fallback sources (LinkedIn export)
- If enrichment fails: Mark lead as "needs_manual_research"
- If fewer than 10 leads: Log warning, continue with available

## Reporting

- Send discovery summary to Discord #updates
- Include: new angels found, top matches, any manual research needed

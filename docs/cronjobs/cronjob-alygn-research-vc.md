# Cronjob: alygn-research-vc

**Schedule:** 6:00 AM daily (Mon-Fri)
**Type:** VC Discovery
**Purpose:** Research and discover new VC leads for upcoming outreach waves

## Execution Flow

### Phase 1: Load Configuration

- Read: ~/.openclaw/workspace/skills/alygn-outreach/config/research-config.json
- Check: target_fund_types, geographic_focus, check_size_range

### Phase 2: Discover New VCs

- Command: USE_DIRECT_API=true bun ~/.openclaw/workspace/skills/alygn-outreach/bin/alygn-outreach.ts --type=vc --action=discover --source=crunchbase,gmail,cal --limit=10
- Output: Raw VC lead data

### Phase 3: Enrich Leads

- Command: bun ~/.openclaw/workspace/skills/alygn-outreach/bin/alygn-outreach.ts --type=vc --action=research --input=/tmp/discoveries/vc-{today}.json
- Gather: Recent investments, thesis alignment, partner info, intro paths

### Phase 4: Score and Filter

- Score leads based on: Alygn fit, recent activity, warm intro potential
- Filter: Minimum score threshold 0.6
- Output: /tmp/waves/wave-{today}-vc.json with status "researched"

## Success Criteria

- [ ] Minimum 5 new VC leads discovered
- [ ] All leads enriched with firm data
- [ ] Leads scored and filtered
- [ ] Wave file created with status "researched"

## Error Handling

- If discovery API fails: Use fallback sources (manual list)
- If enrichment fails: Mark lead as "needs_manual_research"
- If fewer than 5 leads: Log warning, continue with available

## Reporting

- Send discovery summary to Discord #updates
- Include: new leads found, top scored VCs, any manual research needed

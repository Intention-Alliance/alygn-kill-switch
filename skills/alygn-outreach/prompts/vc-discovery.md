# VC Discovery Meta Prompt

Use this prompt when discovering Venture Capital firms for AI governance outreach.

## Query Building

Build search queries combining:
- AI governance keywords: "AI safety", "AI alignment", "AGI governance", "AI oversight", "existential risk"
- VC firm indicators: "venture capital", "investment", "fund", "partners"
- Geographic filters: "San Francisco", "New York", "Austin", "Boston" (optional)

## Example Queries

```
AI safety venture capital firms partners
AI alignment investors funding
existential risk venture capital AGI
frontier tech governance investors
responsible AI venture capital fund
```

## Discovery Criteria

Score VCs based on:
1. **Sector Focus** (weight: 40%)
   - AI safety/alignment/existential risk: +4 points
   - AI governance/ethics/policy: +3 points
   - General AI/ML: +2 points

2. **Stage Focus** (weight: 30%)
   - Seed/Pre-seed: +3 points
   - Series A: +2 points
   - Later stages: +1 point

3. **Governance Signals** (weight: 30%)
   - Published AI governance research: +2 points
   - Active in AI safety community: +2 points
   - Portfolio includes safety-focused companies: +1 point

## Output Format

Return JSON array:
```json
[
  {
    "name": "Firm Name",
    "website": "https://...",
    "email": "contact@...",
    "firmType": "vc|angel|corporate|accelerator",
    "stageFocus": ["seed", "series-a"],
    "sectorFocus": ["AI safety", "governance"],
    "partners": [{"name": "Name", "title": "Title"}],
    "portfolioCompanies": ["Company1", "Company2"],
    "relevanceScore": 8
  }
]
```

## Quality Gates

- Skip firms without public contact information
- Skip generic "AI" investors without governance focus
- Skip if email appears role-based (info@, admin@)
- Validate emails before adding to results

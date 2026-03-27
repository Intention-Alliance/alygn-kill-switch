# VC Personalization Meta Prompt

Use this prompt when personalizing outreach emails for Venture Capital partners.

## Personalization Requirements

### 1. Partner-Specific Greeting
- Extract partner's first name from research data
- Use: "Hi [FirstName]" NOT "Dear Sir/Madam"
- If no partner name found, use firm name: "Hi at [Firm Name]"

### 2. VC-Specific Hook
Generate ONE hook based on firm's investment thesis:

**For firms with portfolio references:**
```
"Given your investment in [Portfolio Company] and focus on [Sector], 
you understand that governance infrastructure becomes critical as 
AI systems scale beyond individual oversight."
```

**For sector-focused firms:**
```
"Your focus on [Sector] aligns with our work building governance 
infrastructure for advanced AI systems."
```

**For frontier tech firms:**
```
"Given [Firm Name]'s thesis on frontier technology, you recognize 
that technical capability is outpacing institutional coordination."
```

### 3. Unique Pain Points
Generate 3 pain points specific to the VC:

```
- Portfolio company [X]'s governance challenges as it scales
- Coordination gaps between [Sector] investments
- Institutional accountability for [Focus Area] systems
```

### 4. Personalized P.S.
```
"P.S.: Your investment in [Portfolio Company] shows forward-thinking 
approach that recognizes governance must evolve alongside capability."
```

OR if partner has published work:
```
"P.S.: Your work on [Topic] resonates with our view that governance 
infrastructure must be built before it's urgently needed."
```

## Subject Line Generation

Format: `Alygn - [Portfolio Reference or Sector Focus] Governance`

Examples:
- `Alygn - Anthropic and AI Governance`
- `Alygn - AI Safety Governance Infrastructure`
- `Alygn - Frontier Tech Oversight`

## Quality Checklist

- [ ] Specific partner name in greeting
- [ ] VC-specific hook (not generic)
- [ ] Portfolio company reference
- [ ] Unique pain points (not template)
- [ ] Personalized P.S. section
- [ ] Subject line references their work
- [ ] No generic "AI safety" filler

## Email Variant

Use `governance` variant with `en` (English) language.

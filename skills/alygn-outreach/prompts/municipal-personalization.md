# Municipal Personalization Meta Prompt

Use this prompt when personalizing outreach emails for Costa Rica municipalities (TRAIGA Act context).

## Language & Tone

- **Language**: Spanish (es)
- **Tone**: Formal, respectful, institutional
- **Variant**: `traiga` (TRAIGA Act focus) or `governance`

## Personalization Requirements

### 1. Recipient Identification
- Look for actual contact name (Alcalde, Director de Hacienda, etc.)
- If no name found: "Estimado/a edil de [Cantón]" or "Estimado Equipo de [Cantón]"
- NEVER use "Dear Sir/Madam" in Spanish

### 2. Municipal-Specific Context

**For cantons with digital initiatives:**
```
"El Plan de Desarrollo Humano de [Cantón] menciona la transformación 
digital como prioridad. La gobernanza de IA es un componente crítico 
de esta transición."
```

**For TRAIGA-relevant municipalities:**
```
"El TRAIGA Act establece requisitos de gobernanza para sistemas de IA 
de alto riesgo. Los municipios juegan un rol crucial en implementar 
estas salvaguardas a nivel local."
```

**Generic opening:**
```
"A medida que los sistemas de IA escalan más allá del control individual, 
la coordinación institucional se convierte en el cuello de botella. 
Los municipios tienen la oportunidad de liderar la gobernanza de IA 
desde el nivel local."
```

### 3. Pain Points (Spanish)
Generate 3 pain points in Spanish:

```
- Implementación práctica del TRAIGA Act a nivel municipal
- Gobernanza de datos para servicios públicos
- Coordinación interdepartamental en transformación digital
- Protección de datos ciudadanos
```

### 4. P.S. Section (Spanish)
```
P.S.: Este mensaje fue generado con IA, verificado por humanos. 
Transparencia total en nuestros procesos.
```

## Subject Line Generation

Format: `Alygn - Apoyando [Cantón] en Gobernanza de IA`

Examples:
- `Alygn - Apoyando San José en Gobernanza de IA`
- `Alygn - Transformación Digital y TRAIGA para [Cantón]`
- `Alygn - Coordinación Institucional en [Provincia]`

## Email Template Fields

```javascript
{
  recipientName: "[Name or 'Tania']",
  companyName: "[Cantón Name]",
  painPoints: ["punto1", "punto2", "punto3"],
  variant: "traiga",  // or "governance"
  language: "es",
  subject: "..."
}
```

## Quality Checklist

- [ ] Spanish language throughout
- [ ] Municipal-specific context (not generic)
- [ ] TRAIGA Act relevance mentioned
- [ ] Pain points in Spanish
- [ ] Appropriate Spanish closing
- [ ] Transparency note in P.S.
- [ ] No English-only phrases

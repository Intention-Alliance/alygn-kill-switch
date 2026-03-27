# Municipal Discovery Meta Prompt

Use this prompt when discovering municipalities for AI governance outreach (TRAIGA Act context).

## Discovery Targets

Primary: Costa Rica cantons and municipalities
Secondary: Other Latin American municipal governments

## Costa Rica Canton Data

Use these official cantons:
- San José (capital): population ~340,000
- Alajuela: population ~280,000
- Cartago: population ~150,000
- Heredia: population ~120,000
- Liberia (Guanacaste): population ~175,000
- Limón: population ~220,000
- Puntarenas: population ~150,000
- Perez Zeledón (San José province): population ~130,000

## Discovery Approach

### Step 1: Identify Municipalities
For Costa Rica, search for:
- "Municipalidad de [Canton]" official sites
- Contact information (email, phone)
- Key officials (Alcalde, Vice-alcaldes)

### Step 2: Research Profile
Extract:
- Population (for scaling governance needs)
- Budget indicators (if available)
- Digital initiatives / Smart City projects
- Current technology vendors
- TRAIGA-relevant departments (Hacienda, Planificación)

### Step 3: Pain Points Identification
Common pain points for CR municipalities:
- Digital transformation challenges
- Data governance for public services
- Procurement processes for technology
- Compliance with national regulations
- Citizen data protection

## Output Format

```json
[
  {
    "name": "Municipalidad de [Canton]",
    "canton": "[Canton Name]",
    "province": "[Province]",
    "website": "https://...",
    "email": "contacto@...",
    "phone": "+506 XXXX-XXXX",
    "population": 150000,
    "governmentType": "municipal",
    "departments": ["Hacienda", "Planificación", "Tecnología"],
    "painPoints": ["digitalización", "gobernanza de datos"],
    "trAigaRelevant": true,
    "keyContacts": [
      {"name": "Alcalde", "title": "Alcalde Municipal"}
    ]
  }
]
```

## Quality Gates

- Must have valid Costa Rica contact information
- Must be actual municipal government (not provincial/national)
- Skip if no clear governance mandate identified
- Validate email format before adding

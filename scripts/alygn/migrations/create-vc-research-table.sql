CREATE TABLE IF NOT EXISTS vc_research (
  id SERIAL PRIMARY KEY,
  vc_name TEXT UNIQUE NOT NULL,
  thesis TEXT,
  portfolio TEXT[],
  partners JSONB,
  recent_investments JSONB,
  pain_points TEXT[],
  governance_signals TEXT[],
  why_alygn TEXT,
  contact_form_url TEXT,
  linkedin_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_vc_research_name ON vc_research(vc_name);
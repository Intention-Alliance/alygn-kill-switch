-- Migration: Add vc_research table for persistent VC research data
-- This stores Perplexity API research results to avoid re-calling the API

CREATE TABLE IF NOT EXISTS vc_research (
  id SERIAL PRIMARY KEY,
  vc_name TEXT NOT NULL,
  thesis TEXT,
  portfolio TEXT[],
  partners JSONB,
  recent_investments JSONB,
  pain_points TEXT[],
  governance_signals TEXT[],
  why_alygn TEXT,
  contact_form_url TEXT,
  linkedin_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one research record per VC
  CONSTRAINT vc_research_unique_name UNIQUE(vc_name)
);

-- Index for fast lookups by VC name
CREATE INDEX IF NOT EXISTS idx_vc_research_name ON vc_research(vc_name);

-- Enable RLS
ALTER TABLE vc_research ENABLE ROW LEVEL SECURITY;

-- Policy: Allow read access
CREATE POLICY "Public read access" ON vc_research
  FOR SELECT USING (true);

-- Policy: Allow insert
CREATE POLICY "Public insert access" ON vc_research
  FOR INSERT WITH CHECK (true);

-- Policy: Allow update
CREATE POLICY "Public update access" ON vc_research
  FOR UPDATE USING (true);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_vc_research_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vc_research_updated_at
  BEFORE UPDATE ON vc_research
  FOR EACH ROW
  EXECUTE FUNCTION update_vc_research_updated_at();
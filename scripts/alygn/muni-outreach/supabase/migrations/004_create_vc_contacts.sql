-- Migration: Create vc_contacts table for dynamic VC discovery
-- Issue #45: Replace static SEED_VCS with Supabase query

-- Create vc_contacts table
CREATE TABLE IF NOT EXISTS vc_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  firm TEXT,
  email TEXT,
  website TEXT,
  linkedin_url TEXT,
  twitter_handle TEXT,
  investment_focus TEXT[] DEFAULT '{}',
  fund_size TEXT,
  stage_preferences TEXT[] DEFAULT '{}',
  geography TEXT,
  status TEXT DEFAULT 'discovered' CHECK (status IN ('discovered', 'validated', 'researched', 'personalized', 'approved', 'sent', 'replied', 'rejected')),
  relevance_score INTEGER DEFAULT 0,
  email_validated BOOLEAN DEFAULT FALSE,
  email_validation_result TEXT,
  pain_points TEXT[] DEFAULT '{}',
  thesis TEXT,
  recent_investments TEXT[] DEFAULT '{}',
  partners TEXT[] DEFAULT '{}',
  governance_signals TEXT[] DEFAULT '{}',
  source TEXT,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Wave tracking
  wave_number INTEGER,
  wave_date TIMESTAMPTZ,
  last_outreach_at TIMESTAMPTZ
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_vc_contacts_status ON vc_contacts(status);
CREATE INDEX IF NOT EXISTS idx_vc_contacts_wave ON vc_contacts(wave_number) WHERE wave_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vc_contacts_email_validated ON vc_contacts(email_validated) WHERE email_validated = TRUE;

-- Enable RLS
ALTER TABLE vc_contacts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read all VCs
CREATE POLICY "Public read access" ON vc_contacts
  FOR SELECT USING (true);

-- Policy: Users can insert VCs
CREATE POLICY "Public insert access" ON vc_contacts
  FOR INSERT WITH CHECK (true);

-- Policy: Users can update VCs
CREATE POLICY "Public update access" ON vc_contacts
  FOR UPDATE USING (true);

-- Seed initial VC data from the original SEED_VCS list
INSERT INTO vc_contacts (name, firm, investment_focus, stage_preferences, status, source, relevance_score) VALUES
  ('Anthropic', 'Anthropic', ARRAY['AI safety', 'AI alignment'], ARRAY['seed', 'series-a'], 'discovered', 'seed_list', 10),
  ('OpenAI Startup Fund', 'OpenAI', ARRAY['AI safety', 'frontier tech'], ARRAY['seed', 'series-a'], 'discovered', 'seed_list', 10),
  ('Lux Capital', 'Lux Capital', ARRAY['frontier tech', 'deep tech'], ARRAY['seed', 'series-a'], 'discovered', 'seed_list', 8),
  ('Founders Fund', 'Founders Fund', ARRAY['frontier tech', 'AI'], ARRAY['seed', 'series-a'], 'discovered', 'seed_list', 8),
  ('Andreessen Horowitz', 'A16Z', ARRAY['AI', 'technology'], ARRAY['seed', 'series-a', 'series-b'], 'discovered', 'seed_list', 7),
  ('Sequoia Capital', 'Sequoia', ARRAY['AI', 'technology'], ARRAY['seed', 'series-a', 'series-b'], 'discovered', 'seed_list', 7),
  ('Greylock Partners', 'Greylock', ARRAY['AI', 'enterprise'], ARRAY['seed', 'series-a'], 'discovered', 'seed_list', 7),
  ('Bessemer Venture Partners', 'Bessemer', ARRAY['AI', 'cloud'], ARRAY['seed', 'series-a', 'series-b'], 'discovered', 'seed_list', 6),
  ('First Round Capital', 'First Round', ARRAY['seed', 'early stage'], ARRAY['pre-seed', 'seed'], 'discovered', 'seed_list', 7),
  ('Accel', 'Accel', ARRAY['AI', 'technology'], ARRAY['seed', 'series-a'], 'discovered', 'seed_list', 6),
  ('Index Ventures', 'Index', ARRAY['AI', 'technology'], ARRAY['seed', 'series-a'], 'discovered', 'seed_list', 6),
  ('Atomico', 'Atomico', ARRAY['AI', 'technology'], ARRAY['seed', 'series-a'], 'discovered', 'seed_list', 6),
  ('General Catalyst', 'General Catalyst', ARRAY['AI', 'technology'], ARRAY['seed', 'series-a'], 'discovered', 'seed_list', 6),
  ('Lightspeed Venture Partners', 'Lightspeed', ARRAY['AI', 'technology'], ARRAY['seed', 'series-a'], 'discovered', 'seed_list', 6),
  ('Khosla Ventures', 'Khosla', ARRAY['frontier tech', 'AI'], ARRAY['seed', 'series-a'], 'discovered', 'seed_list', 7),
  ('DCVC', 'DCVC', ARRAY['deep tech', 'AI'], ARRAY['seed', 'series-a'], 'discovered', 'seed_list', 7),
  ('Bloomberg Beta', 'Bloomberg Beta', ARRAY['AI', 'finance'], ARRAY['seed', 'series-a'], 'discovered', 'seed_list', 5),
  ('GV (Google Ventures)', 'GV', ARRAY['AI', 'technology'], ARRAY['seed', 'series-a', 'series-b'], 'discovered', 'seed_list', 7),
  ('Gradient Ventures', 'Gradient', ARRAY['AI', 'machine learning'], ARRAY['seed', 'series-a'], 'discovered', 'seed_list', 8),
  ('M12 (Microsoft)', 'M12', ARRAY['AI', 'enterprise'], ARRAY['seed', 'series-a'], 'discovered', 'seed_list', 6),
  ('Alexa Fund', 'Alexa Fund', ARRAY['AI', 'voice'], ARRAY['seed', 'series-a'], 'discovered', 'seed_list', 5),
  ('Intel Capital', 'Intel Capital', ARRAY['AI', 'semiconductors'], ARRAY['seed', 'series-a', 'series-b'], 'discovered', 'seed_list', 5),
  ('NVIDIA Ventures', 'NVIDIA', ARRAY['AI', 'GPU'], ARRAY['seed', 'series-a'], 'discovered', 'seed_list', 6)
ON CONFLICT DO NOTHING;

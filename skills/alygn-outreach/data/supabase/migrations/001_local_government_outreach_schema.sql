-- Alygn Municipal Outreach - Initial Schema
-- Date: March 5, 2026
-- Description: Core tables for local government outreach tracking

-- =============================================
-- LOCAL GOVERNMENTS TABLE
-- =============================================
-- Stores cantones (CR), counties (USA), municipalities, etc.
DROP TABLE IF EXISTS local_governments CASCADE;
CREATE TABLE IF NOT EXISTS local_governments (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- canton, county, municipality, borough, etc.
  country TEXT NOT NULL, -- cr, us, uk, etc.
  province TEXT, -- San José, California, etc.
  x_handle TEXT, -- Twitter/X handle without @
  website TEXT,
  priority_score INTEGER DEFAULT 50,
  x_activity_score INTEGER,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  wave_number INTEGER DEFAULT 1,
  UNIQUE(name, country)
);

CREATE INDEX IF NOT EXISTS idx_local_governments_country ON local_governments (country);
CREATE INDEX IF NOT EXISTS idx_local_governments_wave ON local_governments (wave_number);
CREATE INDEX IF NOT EXISTS idx_local_governments_priority ON local_governments (priority_score DESC);

-- =============================================
-- POLITICAL FIGURES TABLE
-- =============================================
-- Stores politicians within local governments
DROP TABLE IF EXISTS political_figures CASCADE;
CREATE TABLE IF NOT EXISTS political_figures (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  local_government_id UUID REFERENCES local_governments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  x_handle TEXT, -- Twitter/X handle without @
  party TEXT, -- PLN, PUSC, FA, etc.
  position TEXT, -- Regidor, Alcalde, Diputado, etc.
  ideology_alignment TEXT DEFAULT 'unknown', -- high, medium, low, unknown
  x_activity_score INTEGER,
  ai_interest_score INTEGER,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  wave_number INTEGER DEFAULT 1
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_political_figures_lg ON political_figures (local_government_id);
CREATE INDEX IF NOT EXISTS idx_political_figures_alignment ON political_figures (ideology_alignment);
CREATE INDEX IF NOT EXISTS idx_political_figures_party ON political_figures (party);


-- =============================================
-- X ENGAGEMENTS TABLE
-- =============================================
-- Tracks our X/Twitter engagements with local governments
DROP TABLE IF EXISTS x_engagements CASCADE;
CREATE TABLE IF NOT EXISTS x_engagements (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  local_government_id UUID REFERENCES local_governments(id) ON DELETE CASCADE,
  engagement_type TEXT NOT NULL, -- follow, like, reply, quote, retweet
  target_tweet_id TEXT, -- Tweet ID we engaged with
  target_tweet_url TEXT,
  engaged_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_x_engagements_lg ON x_engagements (local_government_id);
CREATE INDEX IF NOT EXISTS idx_x_engagements_type ON x_engagements (engagement_type);
CREATE INDEX IF NOT EXISTS idx_x_engagements_date ON x_engagements (engaged_at DESC);

-- =============================================
-- OUTREACH EMAILS TABLE
-- =============================================
-- Tracks emails sent to local governments/politicians
DROP TABLE IF EXISTS outreach_emails CASCADE;
CREATE TABLE IF NOT EXISTS outreach_emails (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  local_government_id UUID REFERENCES local_governments(id),
  political_figure_id UUID REFERENCES political_figures(id),
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'draft', -- draft, sent, approved, skipped
  variant TEXT, -- governance, institutional
  sent_at TIMESTAMPTZ,
  message_id TEXT, -- Email message ID for tracking
  
  -- Reply tracking
  reply_received_at TIMESTAMPTZ,
  reply_category TEXT, -- positive, negative, ooo, opted_out, referred, clarification
  reply_sentiment TEXT, -- positive, neutral, negative
  reply_confidence INTEGER,
  meeting_requested BOOLEAN DEFAULT FALSE,
  follow_up_needed BOOLEAN DEFAULT FALSE,
  referred_to TEXT, -- Email/name if referred
  
  -- Political context
  political_context JSONB,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  wave_number INTEGER DEFAULT 1
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_outreach_emails_lg ON outreach_emails (local_government_id);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_status ON outreach_emails (status);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_reply ON outreach_emails (reply_received_at);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_wave ON outreach_emails (wave_number);

-- =============================================
-- TARGET LOCAL GOVERNMENTS TABLE
-- =============================================
-- Seed table: list of local governments to discover
DROP TABLE IF EXISTS target_local_governments CASCADE;

-- =============================================
-- CHECKPOINTS TABLE
-- =============================================
-- Stores pipeline checkpoints for resumability
DROP TABLE IF EXISTS checkpoints CASCADE;
CREATE TABLE IF NOT EXISTS checkpoints (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  region TEXT NOT NULL,
  wave_number INTEGER NOT NULL,
  step TEXT NOT NULL, -- discovery, x-warmup, campaign-approval, compliance
  state JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()  
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_checkpoints_region_wave ON checkpoints (region, wave_number);
CREATE INDEX IF NOT EXISTS idx_checkpoints_step ON checkpoints (step);

-- =============================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================
COMMENT ON TABLE public.local_governments IS 'Cantones (CR), counties (USA), municipalities, boroughs (UK), etc.';
COMMENT ON COLUMN public.local_governments.type IS 'canton, county, municipality, borough, district, etc.';
COMMENT ON COLUMN public.political_figures.ideology_alignment IS 'high: AI governance focus, medium: tech in gov, low: no relevant content';
COMMENT ON COLUMN public.x_engagements.engagement_type IS 'follow, like, reply, quote, retweet';
COMMENT ON COLUMN public.outreach_emails.reply_category IS 'positive, negative, ooo, opted_out, referred, clarification';

-- =============================================
-- SEED DATA: COSTA RICA CANTONES (82 total)
-- =============================================
-- Insert first 20 cantones for testing (San José province)
-- INSERT INTO local_governments (name, type, country, province, priority) VALUES
--   ('San José', 'canton', 'cr', 'San José', 95),
--   ('Escazú', 'canton', 'cr', 'San José', 90),
--   ('Desamparados', 'canton', 'cr', 'San José', 85),
--   ('Puriscal', 'canton', 'cr', 'San José', 70),
--   ('Tarrazú', 'canton', 'cr', 'San José', 65),
--   ('Aserrí', 'canton', 'cr', 'San José', 80),
--   ('Mora', 'canton', 'cr', 'San José', 75),
--   ('Goicoechea', 'canton', 'cr', 'San José', 85),
--   ('Santa Ana', 'canton', 'cr', 'San José', 90),
--   ('Alajuelita', 'canton', 'cr', 'San José', 80),
--   ('Vásquez de Coronado', 'canton', 'cr', 'San José', 85),
--   ('Acosta', 'canton', 'cr', 'San José', 60),
--   ('Tibás', 'canton', 'cr', 'San José', 80),
--   ('Moravia', 'canton', 'cr', 'San José', 75),
--   ('Montes de Oca', 'canton', 'cr', 'San José', 85),
--   ('Turrubares', 'canton', 'cr', 'San José', 55),
--   ('Dota', 'canton', 'cr', 'San José', 50),
--   ('Curridabat', 'canton', 'cr', 'San José', 85),
--   ('Pérez Zeledón', 'canton', 'cr', 'San José', 80),
--   ('León Cortés Castro', 'canton', 'cr', 'San José', 70)
-- ON CONFLICT (name, country) DO NOTHING;

-- =============================================
-- HELPER FUNCTIONS
-- =============================================
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for local_governments
CREATE TRIGGER update_local_governments_updated_at
  BEFORE UPDATE ON local_governments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for checkpoints
CREATE TRIGGER update_checkpoints_updated_at
  BEFORE UPDATE ON checkpoints
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY (RLS) - Optional
-- =============================================
-- Enable RLS if needed for multi-tenant setup
-- ALTER TABLE local_governments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE political_figures ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE x_engagements ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE outreach_emails ENABLE ROW LEVEL SECURITY;

-- =============================================
-- GRANTS - Optional
-- =============================================
-- Grant permissions to specific roles if needed
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;


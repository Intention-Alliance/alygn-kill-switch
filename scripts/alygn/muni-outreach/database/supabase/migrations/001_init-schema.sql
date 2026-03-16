-- Alygn Municipal Outreach - Initial Schema
-- Date: March 5, 2026
-- Description: Core tables for local government outreach tracking

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- LOCAL GOVERNMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS local_governments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  country TEXT NOT NULL,
  province TEXT,
  x_handle TEXT,
  website TEXT,
  priority_score INTEGER DEFAULT 50,
  x_activity_score INTEGER,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  wave_number INTEGER DEFAULT 1,
  
  UNIQUE(name, country)
);

CREATE INDEX IF NOT EXISTS idx_local_governments_country ON local_governments(country);
CREATE INDEX IF NOT EXISTS idx_local_governments_wave ON local_governments(wave_number);

-- =============================================
-- POLITICAL FIGURES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS political_figures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_government_id UUID REFERENCES local_governments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  x_handle TEXT,
  party TEXT,
  position TEXT,
  ideology_alignment TEXT DEFAULT 'unknown',
  x_activity_score INTEGER,
  ai_interest_score INTEGER,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  wave_number INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_political_figures_lg ON political_figures(local_government_id);
CREATE INDEX IF NOT EXISTS idx_political_figures_alignment ON political_figures(ideology_alignment);

-- =============================================
-- X ENGAGEMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS x_engagements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_government_id UUID REFERENCES local_governments(id) ON DELETE CASCADE,
  engagement_type TEXT NOT NULL,
  target_tweet_id TEXT,
  target_tweet_url TEXT,
  engaged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_x_engagements_lg ON x_engagements(local_government_id);

-- =============================================
-- OUTREACH EMAILS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS outreach_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_government_id UUID REFERENCES local_governments(id),
  political_figure_id UUID REFERENCES political_figures(id),
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  variant TEXT,
  sent_at TIMESTAMPTZ,
  message_id TEXT,
  reply_received_at TIMESTAMPTZ,
  reply_category TEXT,
  reply_sentiment TEXT,
  meeting_requested BOOLEAN DEFAULT FALSE,
  follow_up_needed BOOLEAN DEFAULT FALSE,
  wave_number INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_emails_lg ON outreach_emails(local_government_id);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_status ON outreach_emails(status);

-- =============================================
-- TARGET LOCAL GOVERNMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS target_local_governments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  country TEXT NOT NULL,
  province TEXT,
  official_website TEXT,
  priority INTEGER DEFAULT 50,
  discovered_at TIMESTAMPTZ,
  wave_number INTEGER DEFAULT 1,
  
  UNIQUE(name, country)
);

-- =============================================
-- CHECKPOINTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS checkpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  region TEXT NOT NULL,
  wave_number INTEGER NOT NULL,
  step TEXT NOT NULL,
  state JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_region_wave ON checkpoints(region, wave_number);

-- =============================================
-- HELPER FUNCTION
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_local_governments_updated_at
  BEFORE UPDATE ON local_governments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

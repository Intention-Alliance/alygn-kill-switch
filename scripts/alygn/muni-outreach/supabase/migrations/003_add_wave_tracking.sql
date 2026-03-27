-- ============================================================================
-- Migration: 001_add_wave_tracking.sql
-- Purpose: Add wave tracking fields to support the 6-cronjob architecture
-- Description: Adds wave_number, wave_date, and batch_status columns to
--              track municipalities through waves of outreach
-- ============================================================================

-- ============================================================================
-- SECTION 1: SAFE COLUMN ADDITIONS TO EXISTING TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. municipalities table updates
-- ----------------------------------------------------------------------------

-- Add wave_number column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'municipalities' AND column_name = 'wave_number'
    ) THEN
        ALTER TABLE municipalities
        ADD COLUMN wave_number INTEGER DEFAULT 1;
        COMMENT ON COLUMN municipalities.wave_number IS 'Wave number for batch outreach (1-6 for cronjob architecture)';
    END IF;
END $$;

-- Add wave_date column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'municipalities' AND column_name = 'wave_date'
    ) THEN
        ALTER TABLE municipalities
        ADD COLUMN wave_date DATE;
        COMMENT ON COLUMN municipalities.wave_date IS 'Date when municipality was assigned to current wave';
    END IF;
END $$;

-- Add batch_status column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'municipalities' AND column_name = 'batch_status'
    ) THEN
        ALTER TABLE municipalities
        ADD COLUMN batch_status TEXT DEFAULT 'researched';
        COMMENT ON COLUMN municipalities.batch_status IS 'Current status in wave: researched | drafted | approved | sent | failed';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. outreach_emails table updates
-- ----------------------------------------------------------------------------

-- Ensure wave_number column exists (already has default 1 per current schema)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'outreach_emails' AND column_name = 'wave_number'
    ) THEN
        ALTER TABLE outreach_emails
        ADD COLUMN wave_number INTEGER DEFAULT 1;
        COMMENT ON COLUMN outreach_emails.wave_number IS 'Wave number when email was sent';
    END IF;
END $$;

-- Add wave_date column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'outreach_emails' AND column_name = 'wave_date'
    ) THEN
        ALTER TABLE outreach_emails
        ADD COLUMN wave_date DATE;
        COMMENT ON COLUMN outreach_emails.wave_date IS 'Date of wave when email was sent';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. x_engagements table updates
-- ----------------------------------------------------------------------------

-- Add wave_number column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'x_engagements' AND column_name = 'wave_number'
    ) THEN
        ALTER TABLE x_engagements
        ADD COLUMN wave_number INTEGER DEFAULT 1;
        COMMENT ON COLUMN x_engagements.wave_number IS 'Wave number when engagement occurred';
    END IF;
END $$;

-- ============================================================================
-- SECTION 2: CREATE NEW TABLES FOR WAVE TRACKING
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4. checkpoints table
-- Description: Tracks cronjob checkpoint states for wave processing
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkpoints (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    
    -- Wave tracking
    wave_number INTEGER NOT NULL,
    wave_date DATE NOT NULL,
    
    -- Checkpoint state
    cronjob_name TEXT NOT NULL, -- e.g., 'research-wave', 'draft-wave', 'approve-wave', 'send-wave', 'track-wave', 'report-wave'
    status TEXT DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
    
    -- Checkpoint data
    last_processed_id UUID, -- Last municipality ID processed
    processed_count INTEGER DEFAULT 0,
    total_count INTEGER,
    
    -- Error tracking
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique checkpoints per wave/cronjob
    CONSTRAINT unique_wave_cronjob UNIQUE (wave_number, cronjob_name)
);

-- Add comments
COMMENT ON TABLE checkpoints IS 'Tracks cronjob checkpoint states for wave processing in 6-cronjob architecture';
COMMENT ON COLUMN checkpoints.cronjob_name IS 'Name of the cronjob: research-wave, draft-wave, approve-wave, send-wave, track-wave, report-wave';
COMMENT ON COLUMN checkpoints.status IS 'Current status: pending, running, completed, failed';
COMMENT ON COLUMN checkpoints.last_processed_id IS 'Last municipality ID processed for resumability';

-- ----------------------------------------------------------------------------
-- 5. local_governments table
-- Description: Extended local government tracking for larger municipalities
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS local_governments (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    
    -- Relationship to municipality
    municipality_id UUID REFERENCES municipalities(id) ON DELETE CASCADE,
    
    -- Government details
    name TEXT NOT NULL,
    government_type TEXT, -- 'municipal', 'county', 'regional', etc.
    
    -- Contact info
    head_name TEXT,
    head_title TEXT,
    email TEXT,
    phone TEXT,
    website_url TEXT,
    
    -- Address
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    postal_code TEXT,
    country TEXT,
    
    -- Wave tracking
    wave_number INTEGER DEFAULT 1,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE local_governments IS 'Extended local government entities within municipalities';
COMMENT ON COLUMN local_governments.wave_number IS 'Wave assignment for coordinated outreach';

-- ----------------------------------------------------------------------------
-- 6. political_figures table
-- Description: Key political contacts and decision makers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS political_figures (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    
    -- Relationship to municipality
    municipality_id UUID REFERENCES municipalities(id) ON DELETE CASCADE,
    
    -- Optional relationship to local government
    local_government_id UUID REFERENCES local_governments(id) ON DELETE SET NULL,
    
    -- Figure details
    full_name TEXT NOT NULL,
    title TEXT, -- 'Mayor', 'Councilor', 'Secretary', etc.
    department TEXT,
    role_description TEXT,
    
    -- Contact info
    email TEXT,
    phone TEXT,
    x_handle TEXT,
    linkedin_url TEXT,
    
    -- AI Governance relevance
    is_decision_maker BOOLEAN DEFAULT FALSE,
    influence_level INTEGER CHECK (influence_level BETWEEN 1 AND 10),
    ai_governance_interest TEXT, -- 'high', 'medium', 'low', 'unknown'
    
    -- Wave tracking
    wave_number INTEGER DEFAULT 1,
    
    -- Outreach tracking
    last_contacted_at TIMESTAMPTZ,
    contact_preference TEXT, -- 'email', 'phone', 'x', 'linkedin'
    notes TEXT,
    
    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE political_figures IS 'Key political contacts and decision makers for outreach';
COMMENT ON COLUMN political_figures.wave_number IS 'Wave assignment for coordinated outreach';
COMMENT ON COLUMN political_figures.is_decision_maker IS 'Whether this person has decision-making authority';
COMMENT ON COLUMN political_figures.influence_level IS 'Influence level 1-10 for prioritization';

-- ============================================================================
-- SECTION 3: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Indexes for municipalities table
CREATE INDEX IF NOT EXISTS idx_municipalities_wave_number ON municipalities(wave_number);
CREATE INDEX IF NOT EXISTS idx_municipalities_wave_date ON municipalities(wave_date);
CREATE INDEX IF NOT EXISTS idx_municipalities_batch_status ON municipalities(batch_status);
CREATE INDEX IF NOT EXISTS idx_municipalities_wave_status ON municipalities(wave_number, batch_status);

-- Indexes for outreach_emails table
CREATE INDEX IF NOT EXISTS idx_outreach_emails_wave_number ON outreach_emails(wave_number);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_wave_date ON outreach_emails(wave_date);

-- Indexes for x_engagements table
CREATE INDEX IF NOT EXISTS idx_x_engagements_wave_number ON x_engagements(wave_number);

-- Indexes for checkpoints table
CREATE INDEX IF NOT EXISTS idx_checkpoints_wave ON checkpoints(wave_number, wave_date);
CREATE INDEX IF NOT EXISTS idx_checkpoints_cronjob ON checkpoints(cronjob_name);
CREATE INDEX IF NOT EXISTS idx_checkpoints_status ON checkpoints(status);

-- Indexes for local_governments table
CREATE INDEX IF NOT EXISTS idx_local_gov_municipality ON local_governments(municipality_id);
CREATE INDEX IF NOT EXISTS idx_local_gov_wave ON local_governments(wave_number);

-- Indexes for political_figures table
CREATE INDEX IF NOT EXISTS idx_political_figs_municipality ON political_figures(municipality_id);
CREATE INDEX IF NOT EXISTS idx_political_figs_wave ON political_figures(wave_number);
CREATE INDEX IF NOT EXISTS idx_political_figs_decision_maker ON political_figures(is_decision_maker) WHERE is_decision_maker = TRUE;

-- ============================================================================
-- SECTION 4: UPDATE VIEWS WITH WAVE TRACKING
-- ============================================================================

-- Update pipeline summary view to include wave tracking
DROP VIEW IF EXISTS v_pipeline_summary;
CREATE OR REPLACE VIEW v_pipeline_summary AS
SELECT 
    wave_number,
    COUNT(*) as total_municipalities,
    COUNT(*) FILTER (WHERE batch_status = 'researched') as researched,
    COUNT(*) FILTER (WHERE batch_status = 'drafted') as drafted,
    COUNT(*) FILTER (WHERE batch_status = 'approved') as approved,
    COUNT(*) FILTER (WHERE batch_status = 'sent') as sent,
    COUNT(*) FILTER (WHERE batch_status = 'failed') as failed,
    COUNT(*) FILTER (WHERE replied_at IS NOT NULL) as replied,
    ROUND(100.0 * COUNT(*) FILTER (WHERE replied_at IS NOT NULL) / NULLIF(COUNT(*) FILTER (WHERE batch_status = 'sent'), 0), 2) as reply_rate_percent
FROM municipalities
GROUP BY wave_number
ORDER BY wave_number;

COMMENT ON VIEW v_pipeline_summary IS 'Summary of outreach pipeline by wave number';

-- Create view for wave status
DROP VIEW IF EXISTS v_wave_status;
CREATE OR REPLACE VIEW v_wave_status AS
SELECT 
    wave_number,
    wave_date,
    COUNT(*) as total_municipalities,
    batch_status,
    COUNT(*) as count_in_status
FROM municipalities
GROUP BY wave_number, wave_date, batch_status
ORDER BY wave_number, batch_status;

COMMENT ON VIEW v_wave_status IS 'Status breakdown by wave for monitoring';

-- Create view for cronjob tracking
DROP VIEW IF EXISTS v_cronjob_status;
CREATE OR REPLACE VIEW v_cronjob_status AS
SELECT 
    c.wave_number,
    c.cronjob_name,
    c.status,
    c.processed_count,
    c.total_count,
    c.started_at,
    c.completed_at,
    c.error_message,
    CASE 
        WHEN c.total_count > 0 THEN ROUND(100.0 * c.processed_count / c.total_count, 2)
        ELSE 0
    END as completion_percentage
FROM checkpoints c
ORDER BY c.wave_number, c.cronjob_name;

COMMENT ON VIEW v_cronjob_status IS 'Current status of all cronjobs by wave';

-- ============================================================================
-- SECTION 5: TRIGGER FOR AUTO-UPDATING updated_at
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for new tables
DROP TRIGGER IF EXISTS trg_checkpoints_updated_at ON checkpoints;
CREATE TRIGGER trg_checkpoints_updated_at
    BEFORE UPDATE ON checkpoints
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_local_gov_updated_at ON local_governments;
CREATE TRIGGER trg_local_gov_updated_at
    BEFORE UPDATE ON local_governments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_political_figs_updated_at ON political_figures;
CREATE TRIGGER trg_political_figs_updated_at
    BEFORE UPDATE ON political_figures
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SECTION 6: VALIDATION AND VERIFICATION
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 001_add_wave_tracking.sql completed successfully';
    RAISE NOTICE 'Added wave tracking columns to: municipalities, outreach_emails, x_engagements';
    RAISE NOTICE 'Created new tables: checkpoints, local_governments, political_figures';
    RAISE NOTICE 'Created indexes for wave_number queries';
    RAISE NOTICE 'Updated views: v_pipeline_summary, v_wave_status, v_cronjob_status';
END $$;

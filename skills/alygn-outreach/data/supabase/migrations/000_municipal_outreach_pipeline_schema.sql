-- Alygn Global Municipal Outreach Database Schema
-- Supabase PostgreSQL with pgvector extension

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Enable pgvector for AI embeddings (future use)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ============================================
-- MAIN TABLE: Municipalities
-- ============================================
CREATE TABLE IF NOT EXISTS municipalities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Basic Info
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    region TEXT,
    province TEXT,
    population INTEGER,
    
    -- Contact Info
    website_url TEXT,
    mayor_name TEXT,
    mayor_email TEXT,
    council_emails TEXT[],
    general_email TEXT,
    phone TEXT,
    
    -- Social Media
    x_handle TEXT,
    x_url TEXT,
    
    -- Pipeline Status
    discovered_at TIMESTAMPTZ DEFAULT NOW(),
    researched_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    outreach_sent_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,
    reply_sentiment TEXT, -- 'positive', 'neutral', 'negative'
    
    -- X/Twitter Engagement Tracking
    x_warmup_phase1_at TIMESTAMPTZ, -- Follow + like
    x_warmup_phase2_at TIMESTAMPTZ, -- Quote + reply
    x_engagement_count INTEGER DEFAULT 0,
    x_last_engagement_at TIMESTAMPTZ,
    
    -- Outreach Details
    wave_number INTEGER DEFAULT 1,
    priority_score INTEGER DEFAULT 50, -- 0-100 calculated
    outreach_variant TEXT, -- 'governance' or 'institutional'
    
    -- Research Data (JSON for flexibility)
    pain_points TEXT[],
    ai_governance_signals JSONB,
    notes JSONB,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_municipalities_country ON municipalities(country);
CREATE INDEX IF NOT EXISTS idx_municipalities_wave ON municipalities(wave_number);
CREATE INDEX IF NOT EXISTS idx_municipalities_status ON municipalities(outreach_sent_at);
CREATE INDEX IF NOT EXISTS idx_municipalities_priority ON municipalities(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_municipalities_x_handle ON municipalities(x_handle);
CREATE INDEX IF NOT EXISTS idx_municipalities_discovered ON municipalities(discovered_at);

-- ============================================
-- TABLE: Outreach Emails Log
-- ============================================
CREATE TABLE IF NOT EXISTS outreach_emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Email Details
    variant TEXT NOT NULL, -- 'governance' or 'institutional'
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    
    -- Sending Info
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    message_id TEXT,
    status TEXT DEFAULT 'sent', -- 'sent', 'bounced', 'replied', 'failed'
    
    -- X Context (what happened before email)
    x_warmup_completed BOOLEAN DEFAULT FALSE,
    x_engagements_before_email INTEGER DEFAULT 0,
    days_between_x_and_email INTEGER,
    
    -- Response Tracking
    replied_at TIMESTAMPTZ,
    reply_sentiment TEXT,
    reply_body TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE outreach_emails
    ADD COLUMN IF NOT EXISTS municipality_id UUID REFERENCES municipalities(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_outreach_emails_municipality ON outreach_emails(municipality_id);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_status ON outreach_emails(status);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_sent_at ON outreach_emails(sent_at);

-- ============================================
-- TABLE: X/Twitter Engagements
-- ============================================
CREATE TABLE IF NOT EXISTS x_engagements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    municipality_id UUID REFERENCES municipalities(id) ON DELETE CASCADE,
    
    -- Engagement Details
    engagement_type TEXT NOT NULL, -- 'follow', 'like', 'reply', 'quote'
    x_handle TEXT NOT NULL,
    x_user_id TEXT,
    tweet_id TEXT, -- For replies/quotes
    
    -- Content
    content TEXT, -- For replies/quotes
    
    -- Timing
    engaged_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Context
    phase INTEGER, -- 1 or 2 (warmup phases)
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE x_engagements 
    ADD COLUMN IF NOT EXISTS municipality_id UUID REFERENCES municipalities(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_x_engagements_municipality ON x_engagements(municipality_id);
CREATE INDEX IF NOT EXISTS idx_x_engagements_type ON x_engagements(engagement_type);
CREATE INDEX IF NOT EXISTS idx_x_engagements_engaged_at ON x_engagements(engaged_at);

-- ============================================
-- TABLE: Outreach Templates
-- ============================================
CREATE TABLE IF NOT EXISTS outreach_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Template Info
    name TEXT NOT NULL, -- 'governance_v1', 'institutional_v1'
    variant TEXT NOT NULL, -- 'governance' or 'institutional'
    version TEXT NOT NULL, -- '1.0', '1.1', etc.
    
    -- Content
    subject_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    
    -- Variables that can be replaced
    variables TEXT[], -- ['municipality', 'mayor_name', 'pain_point', etc.]
    
    -- Performance Tracking
    sent_count INTEGER DEFAULT 0,
    reply_rate DECIMAL(5,2) DEFAULT 0, -- Percentage
    
    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial templates
INSERT INTO outreach_templates (name, variant, version, subject_template, body_template, variables) VALUES
('governance_v1', 'governance', '1.0', 
 'Coordination Before Crisis: AI Governance for {municipality}',
 'Dear {mayor_name},

{municipality} faces the same AI governance challenges as cities worldwide: coordination across departments, accountability for automated systems, and preparedness for AI-driven disruptions.

Alygn is an independent institution supporting coordination across AI developers, operators, and public institutions—without centralizing control or asserting authority.

We''re sharing neutral governance infrastructure that enables:
• Cross-departmental AI accountability frameworks
• Emergency coordination without standing control
• Legitimacy through process, not enforcement

{personalized_pain_point}

Would your council be open to a 30-minute conversation about how Alygn supports municipal AI governance preparedness?

Governance legitimacy, not technology, is the infrastructure that scales.

Best regards,
{name}
Alygn Governance Coordination

--
Alygn: Neutral AI governance infrastructure
{unsubscribe_link}',
 ARRAY['municipality', 'mayor_name', 'personalized_pain_point', 'name', 'unsubscribe_link']),

('institutional_v1', 'institutional', '1.0',
 'The Real AI Risk is Coordination Failure',
 'Dear {mayor_name},

The hardest AI risks aren''t technical—they''re institutional.

When AI systems operate at scale, coordination failure across departments and jurisdictions becomes the systemic threat. Governance can''t be retrofitted at frontier scale.

Alygn provides neutral infrastructure for:
• Accountability without centralization
• Oversight without control
• Coordination without authority

{personalized_local_context}

We''re forming a network of municipalities committed to AI governance preparedness. {municipality}''s leadership in {area} makes you an ideal founding participant.

Are you available for a brief conversation next week?

Institutional legitimacy is the infrastructure that endures.

Best regards,
{name}
Alygn Institutional Coordination

--
Alygn: Supports coordination, enables accountability
{unsubscribe_link}',
 ARRAY['mayor_name', 'personalized_local_context', 'municipality', 'area', 'name', 'unsubscribe_link']);

-- ============================================
-- VIEWS: Useful Queries
-- ============================================

-- View: Pipeline Summary
CREATE OR REPLACE VIEW v_pipeline_summary AS
SELECT 
    wave_number,
    COUNT(*) as total_municipalities,
    COUNT(*) FILTER (WHERE researched_at IS NOT NULL) as researched,
    COUNT(*) FILTER (WHERE verified_at IS NOT NULL) as verified,
    COUNT(*) FILTER (WHERE outreach_sent_at IS NOT NULL) as sent,
    COUNT(*) FILTER (WHERE replied_at IS NOT NULL) as replied,
    ROUND(100.0 * COUNT(*) FILTER (WHERE replied_at IS NOT NULL) / NULLIF(COUNT(*) FILTER (WHERE outreach_sent_at IS NOT NULL), 0), 2) as reply_rate_percent
FROM municipalities
GROUP BY wave_number;

-- View: X Warmup Status
CREATE OR REPLACE VIEW v_x_warmup_status AS
SELECT 
    id,
    name,
    x_handle,
    x_warmup_phase1_at,
    x_warmup_phase2_at,
    x_engagement_count,
    CASE 
        WHEN x_warmup_phase2_at IS NOT NULL THEN 'phase2_complete'
        WHEN x_warmup_phase1_at IS NOT NULL THEN 'phase1_complete'
        WHEN x_handle IS NOT NULL THEN 'pending'
        ELSE 'no_x_handle'
    END as warmup_status
FROM municipalities;

-- View: Ready for Email (X warmup complete)
CREATE OR REPLACE VIEW v_ready_for_email AS
SELECT 
    m.*,
    oe.subject as last_email_subject,
    oe.sent_at as last_email_sent_at
FROM municipalities m
LEFT JOIN outreach_emails oe ON m.id = oe.municipality_id
WHERE m.x_warmup_phase2_at IS NOT NULL
  AND m.outreach_sent_at IS NULL
ORDER BY m.priority_score DESC;

-- ============================================
-- FUNCTIONS: Automation Helpers
-- ============================================

-- Function: Calculate priority score
CREATE OR REPLACE FUNCTION calculate_priority_score(
    p_population INTEGER,
    p_has_email BOOLEAN,
    p_has_x_handle BOOLEAN,
    p_has_ai_signals BOOLEAN,
    p_has_pain_points BOOLEAN
) RETURNS INTEGER AS $$
DECLARE
    score INTEGER := 50;
BEGIN
    -- Population boost
    IF p_population > 100000 THEN
        score := score + 20;
    ELSIF p_population > 50000 THEN
        score := score + 15;
    ELSIF p_population > 20000 THEN
        score := score + 10;
    END IF;
    
    -- Has email
    IF p_has_email THEN
        score := score + 15;
    END IF;
    
    -- Has X handle
    IF p_has_x_handle THEN
        score := score + 10;
    END IF;
    
    -- Has AI governance signals
    IF p_has_ai_signals THEN
        score := score + 15;
    END IF;
    
    -- Has pain points identified
    IF p_has_pain_points THEN
        score := score + 10;
    END IF;
    
    -- Cap at 100
    RETURN LEAST(100, score);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Update priority score trigger
CREATE OR REPLACE FUNCTION update_priority_score_trigger()
RETURNS TRIGGER AS $$
BEGIN
    NEW.priority_score := calculate_priority_score(
        NEW.population,
        (NEW.mayor_email IS NOT NULL OR NEW.general_email IS NOT NULL),
        (NEW.x_handle IS NOT NULL),
        (NEW.ai_governance_signals IS NOT NULL AND jsonb_array_length(NEW.ai_governance_signals) > 0),
        (NEW.pain_points IS NOT NULL AND array_length(NEW.pain_points, 1) > 0)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update priority score
CREATE OR REPLACE TRIGGER trg_update_priority_score
BEFORE INSERT OR UPDATE ON municipalities
FOR EACH ROW
EXECUTE FUNCTION update_priority_score_trigger();

-- ============================================
-- ROW LEVEL SECURITY (RLS) - Optional
-- ============================================
-- Enable if you want to restrict access
-- ALTER TABLE municipalities ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE outreach_emails ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE x_engagements ENABLE ROW LEVEL SECURITY;

-- ============================================
-- COMMENTS: Documentation
-- ============================================
COMMENT ON TABLE municipalities IS 'Main table for municipal outreach pipeline tracking';
COMMENT ON TABLE outreach_emails IS 'Log of all outreach emails sent with response tracking';
COMMENT ON TABLE x_engagements IS 'X/Twitter engagement tracking for warm-up strategy';
COMMENT ON TABLE outreach_templates IS 'Email templates with versioning and performance tracking';


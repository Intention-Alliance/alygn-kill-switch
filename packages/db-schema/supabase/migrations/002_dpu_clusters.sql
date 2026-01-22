-- ============================================================================
-- DPU CLUSTERS REGISTRY
-- Description: Tracking machines/clusters running the DPU telemetry system
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS dpu_clusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    gpus INTEGER NOT NULL DEFAULT 0,
    avg_latency FLOAT DEFAULT 0,
    uptime FLOAT DEFAULT 100.0,
    total_requests BIGINT DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('operational', 'degraded', 'offline')) DEFAULT 'offline',
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for slug-based lookups
CREATE INDEX idx_dpu_clusters_slug ON dpu_clusters (slug);

-- Enable RLS
ALTER TABLE dpu_clusters ENABLE ROW LEVEL SECURITY;

-- Read policy for everyone
CREATE POLICY "Allow public read access to clusters"
ON dpu_clusters FOR SELECT
USING (true);

-- Insert/Update policy for service role
CREATE POLICY "Allow service_role to manage clusters"
ON dpu_clusters FOR ALL
TO service_role
USING (true);

-- Seed data based on former mock data
INSERT INTO dpu_clusters (slug, name, location, gpus, avg_latency, uptime, status)
VALUES 
    ('austin-primary', 'Austin Primary', 'Austin, TX', 1024, 2.8, 99.98, 'operational'),
    ('dallas-corridor', 'Dallas Corridor', 'Dallas, TX', 768, 3.1, 99.95, 'operational'),
    ('houston-grid', 'Houston Grid', 'Houston, TX', 512, 4.2, 98.50, 'degraded'),
    ('san-antonio-hub', 'San Antonio Hub', 'San Antonio, TX', 384, 3.4, 99.99, 'operational')
ON CONFLICT (slug) DO NOTHING;

COMMIT;

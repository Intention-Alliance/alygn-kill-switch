-- ============================================================================
-- CLUSTER GPUS REGISTRY
-- Description: Tracking specific GPU hardware within clusters
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS cluster_gpus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cluster_id UUID NOT NULL REFERENCES dpu_clusters(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    memory_gb INTEGER NOT NULL,
    cores INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cluster-based lookups
CREATE INDEX idx_cluster_gpus_cluster_id ON cluster_gpus (cluster_id);

-- Enable RLS
ALTER TABLE cluster_gpus ENABLE ROW LEVEL SECURITY;

-- Read policy
CREATE POLICY "Allow public read access to cluster gpus"
ON cluster_gpus FOR SELECT
USING (true);

-- Manage policy for service role
CREATE POLICY "Allow service_role to manage cluster gpus"
ON cluster_gpus FOR ALL
TO service_role
USING (true);

-- Trigger to update dpu_clusters.gpus total
CREATE OR REPLACE FUNCTION sync_cluster_gpu_count()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        UPDATE dpu_clusters
        SET gpus = (SELECT COUNT(*) FROM cluster_gpus WHERE cluster_id = NEW.cluster_id),
            updated_at = NOW()
        WHERE id = NEW.cluster_id;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE dpu_clusters
        SET gpus = (SELECT COUNT(*) FROM cluster_gpus WHERE cluster_id = OLD.cluster_id),
            updated_at = NOW()
        WHERE id = OLD.cluster_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_cluster_gpu_count
AFTER INSERT OR UPDATE OR DELETE ON cluster_gpus
FOR EACH ROW
EXECUTE FUNCTION sync_cluster_gpu_count();

COMMIT;

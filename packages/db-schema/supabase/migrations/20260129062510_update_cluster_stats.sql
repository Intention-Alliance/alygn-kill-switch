-- Add policy_violations and last_seen columns if they don't exist
ALTER TABLE dpu_clusters ADD COLUMN IF NOT EXISTS policy_violations BIGINT DEFAULT 0;
ALTER TABLE dpu_clusters ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;

-- Function to update cluster stats on new log entry
CREATE OR REPLACE FUNCTION update_cluster_stats()
RETURNS TRIGGER AS $$
DECLARE
    lat numeric;
BEGIN
    -- Extract latency from proof_data->'metadata'->'latency_ms'
    lat := (NEW.proof_data->'metadata'->>'latency_ms')::numeric;

    UPDATE dpu_clusters
    SET 
        -- Increment total request count
        total_requests = COALESCE(total_requests, 0) + 1,
        
        -- Update last seen timestamp
        last_seen = NEW.timestamp,
        
        -- Increment policy violations if redline_violated is set
        policy_violations = CASE 
            WHEN NEW.redline_violated IS NOT NULL AND NEW.redline_violated <> '' THEN COALESCE(policy_violations, 0) + 1
            ELSE COALESCE(policy_violations, 0)
        END,
        
        -- Update average latency (simple moving average if latency is provided)
        avg_latency = CASE 
            WHEN lat IS NOT NULL THEN
                CASE 
                    WHEN avg_latency IS NULL OR avg_latency = 0 THEN lat
                    ELSE (avg_latency * 0.9 + lat * 0.1)
                END
            ELSE avg_latency
        END
    WHERE slug = NEW.dpu_id OR id::text = NEW.dpu_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to execute the function after insert on compliance_audit_log
DROP TRIGGER IF EXISTS update_cluster_stats_trigger ON compliance_audit_log;
CREATE TRIGGER update_cluster_stats_trigger
AFTER INSERT ON compliance_audit_log
FOR EACH ROW
EXECUTE FUNCTION update_cluster_stats();

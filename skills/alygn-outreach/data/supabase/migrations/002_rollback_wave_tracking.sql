-- ============================================================================
-- Rollback Script: 001_rollback_wave_tracking.sql
-- Purpose: Remove wave tracking columns and tables added by 001_add_wave_tracking.sql
-- WARNING: This will DROP DATA in the new tables. Use with caution!
-- ============================================================================

-- ============================================================================
-- SECTION 1: REMOVE TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS trg_checkpoints_updated_at ON checkpoints;
DROP TRIGGER IF EXISTS trg_local_gov_updated_at ON local_governments;
DROP TRIGGER IF EXISTS trg_political_figs_updated_at ON political_figures;

-- ============================================================================
-- SECTION 2: REMOVE VIEWS
-- ============================================================================

DROP VIEW IF EXISTS v_cronjob_status;
DROP VIEW IF EXISTS v_wave_status;

-- Restore original pipeline summary view (without wave tracking)
DROP VIEW IF EXISTS v_pipeline_summary;
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

-- ============================================================================
-- SECTION 3: REMOVE INDEXES
-- ============================================================================

-- Drop indexes for municipalities
DROP INDEX IF EXISTS idx_municipalities_wave_number;
DROP INDEX IF EXISTS idx_municipalities_wave_date;
DROP INDEX IF EXISTS idx_municipalities_batch_status;
DROP INDEX IF EXISTS idx_municipalities_wave_status;

-- Drop indexes for outreach_emails
DROP INDEX IF EXISTS idx_outreach_emails_wave_number;
DROP INDEX IF EXISTS idx_outreach_emails_wave_date;

-- Drop indexes for x_engagements
DROP INDEX IF EXISTS idx_x_engagements_wave_number;

-- Drop indexes for checkpoints
DROP INDEX IF EXISTS idx_checkpoints_wave;
DROP INDEX IF EXISTS idx_checkpoints_cronjob;
DROP INDEX IF EXISTS idx_checkpoints_status;

-- Drop indexes for local_governments
DROP INDEX IF EXISTS idx_local_gov_municipality;
DROP INDEX IF EXISTS idx_local_gov_wave;

-- Drop indexes for political_figures
DROP INDEX IF EXISTS idx_political_figs_municipality;
DROP INDEX IF EXISTS idx_political_figs_wave;
DROP INDEX IF EXISTS idx_political_figs_decision_maker;

-- ============================================================================
-- SECTION 4: DROP NEW TABLES (WITH CASCADE)
-- ============================================================================

-- Drop tables with CASCADE to remove dependent objects
DROP TABLE IF EXISTS political_figures CASCADE;
DROP TABLE IF EXISTS local_governments CASCADE;
DROP TABLE IF EXISTS checkpoints CASCADE;

-- ============================================================================
-- SECTION 5: REMOVE COLUMNS FROM EXISTING TABLES
-- ============================================================================

-- Remove columns from municipalities
ALTER TABLE municipalities DROP COLUMN IF EXISTS batch_status;
ALTER TABLE municipalities DROP COLUMN IF EXISTS wave_date;
-- Note: wave_number is kept as it existed before this migration

-- Remove columns from outreach_emails
ALTER TABLE outreach_emails DROP COLUMN IF EXISTS wave_date;
-- Note: wave_number is kept as it existed before this migration

-- Remove columns from x_engagements
-- Note: wave_number is a new addition, so we remove it
ALTER TABLE x_engagements DROP COLUMN IF EXISTS wave_number;

-- ============================================================================
-- SECTION 6: CLEANUP (OPTIONAL)
-- ============================================================================

-- Remove the update function if it's no longer needed
-- (Keep it if other tables still use it)
-- DROP FUNCTION IF EXISTS update_updated_at_column();

-- ============================================================================
-- SECTION 7: ROLLBACK VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_count INT;
BEGIN
    -- Verify columns were removed
    SELECT COUNT(*) INTO v_count
    FROM information_schema.columns
    WHERE table_name IN ('municipalities', 'outreach_emails', 'x_engagements')
        AND column_name IN ('wave_date', 'batch_status');
    
    IF v_count = 0 THEN
        RAISE NOTICE '✓ Wave tracking columns successfully removed';
    ELSE
        RAISE NOTICE '⚠ Some columns may still exist: %', v_count;
    END IF;
    
    -- Verify tables were dropped
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_name IN ('checkpoints', 'local_governments', 'political_figures');
    
    IF v_count = 0 THEN
        RAISE NOTICE '✓ Wave tracking tables successfully dropped';
    ELSE
        RAISE NOTICE '⚠ Some tables may still exist: %', v_count;
    END IF;
END $$;

-- ============================================================================
-- SECTION 8: FINAL STATUS
-- ============================================================================

-- Output final rollback status
DO $$
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'ROLLBACK COMPLETE';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Removed columns: wave_date, batch_status';
    RAISE NOTICE 'Removed table: checkpoints';
    RAISE NOTICE 'Removed table: local_governments';
    RAISE NOTICE 'Removed table: political_figures';
    RAISE NOTICE 'Dropped related indexes and views';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Note: wave_number columns were preserved';
    RAISE NOTICE '      as they existed before this migration';
    RAISE NOTICE '============================================';
END $$;

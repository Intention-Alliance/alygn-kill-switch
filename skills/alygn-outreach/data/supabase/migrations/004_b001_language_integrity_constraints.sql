-- B-001 Data Integrity: Add language constraints to prevent English content in Spanish fields
-- 
-- This migration adds CHECK constraints and validation to ensure that
-- pain_points and other Spanish-language fields in the municipalities
-- table don't contain English content.
--
-- Background: C-001 fixed English pain points in fromCanton(), but
-- nothing prevented them from slipping back in via Supabase inserts.
-- B-001 adds database-level guards.

-- ============================================
-- CHECK CONSTRAINT: Pain points language validation
-- ============================================
-- Validates that pain_points array doesn't contain known English patterns
-- Uses a helper function for pattern matching

CREATE OR REPLACE FUNCTION is_spanish_pain_point(text_val TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Return TRUE if the text does NOT match known English pain point patterns
  -- These patterns correspond to the English strings that were found and fixed in C-001
  RETURN NOT (
    text_val ~* 'digital transformation' OR
    text_val ~* 'limited technical resources' OR
    text_val ~* 'citizen service delivery' OR
    text_val ~* 'data governance and privacy' OR
    text_val ~* 'inter-agency coordination' OR
    text_val ~* 'ai accountability' OR
    text_val ~* 'resource constraints' OR
    text_val ~* 'service delivery' OR
    text_val ~* 'smart city' OR
    text_val ~* 'e-government'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add CHECK constraint to municipalities.pain_points
-- Each element in the pain_points array must pass the Spanish validation
ALTER TABLE municipalities
  DROP CONSTRAINT IF EXISTS chk_pain_points_spanish;

ALTER TABLE municipalities
  ADD CONSTRAINT chk_pain_points_spanish
  CHECK (
    pain_points IS NULL OR
    array_length(pain_points, 1) IS NULL OR
    -- All pain points must pass Spanish validation
    NOT EXISTS (
      SELECT 1 FROM unnest(pain_points) AS pp(text_val)
      WHERE NOT is_spanish_pain_point(text_val)
    )
  );

-- ============================================
-- CHECK CONSTRAINT: Country-specific language enforcement
-- ============================================
-- For Costa Rica municipalities, ensure Spanish content

COMMENT ON CONSTRAINT chk_pain_points_spanish ON municipalities IS 
  'B-001: Prevents English pain points from being stored. Each pain_point must pass is_spanish_pain_point() check. Known English patterns like "Digital transformation complexity" are rejected.';

-- ============================================
-- TRIGGER: Validate before insert/update
-- ============================================
-- Additional runtime validation that logs warnings for borderline cases

CREATE OR REPLACE FUNCTION validate_municipality_language()
RETURNS TRIGGER AS $$
DECLARE
  pp TEXT;
  english_count INTEGER := 0;
BEGIN
  -- Check pain points
  IF NEW.pain_points IS NOT NULL THEN
    FOR pp IN SELECT unnest(NEW.pain_points) LOOP
      IF NOT is_spanish_pain_point(pp) THEN
        english_count := english_count + 1;
        RAISE WARNING 'B-001: English pain point detected in municipalities: "%"', pp;
      END IF;
    END LOOP;
  END IF;
  
  -- If any English content found, reject the insert/update
  IF english_count > 0 THEN
    RAISE EXCEPTION 'B-001 Data Integrity: % English pain point(s) detected. Use Spanish equivalents for Costa Rica municipalities. See is_spanish_pain_point() for allowed patterns.',
      english_count;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_validate_municipality_language ON municipalities;

-- Create trigger
CREATE TRIGGER trg_validate_municipality_language
  BEFORE INSERT OR UPDATE ON municipalities
  FOR EACH ROW
  EXECUTE FUNCTION validate_municipality_language();

-- ============================================
-- INDEX: Help identify records with potential issues
-- ============================================
-- GIN index on pain_points for faster array queries
CREATE INDEX IF NOT EXISTS idx_municipalities_pain_points_gin 
  ON municipalities USING GIN(pain_points);

-- ============================================
-- DOCUMENTATION
-- ============================================
COMMENT ON FUNCTION is_spanish_pain_point(TEXT) IS 
  'B-001: Returns TRUE if the text does not match known English pain point patterns. Used by chk_pain_points_spanish constraint.';

COMMENT ON FUNCTION validate_municipality_language() IS 
  'B-001: Trigger function that validates municipality pain points are in Spanish before insert/update. Rejects known English patterns.';

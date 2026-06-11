-- andlerDev_targets: Andler Develops target account state
CREATE TABLE IF NOT EXISTS andlerDev_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    x_handle TEXT NOT NULL,
    x_user_id TEXT,
    display_name TEXT,
    bio TEXT,
    follower_count INTEGER,
    relevance_score INTEGER,         -- 1-10
    audience_hook TEXT,              -- 'web3' | 'cto' | 'eng-lead' | 'personal'
    linkedin_path TEXT,              -- '/in/...' when known
    x_warmup_phase1_at TIMESTAMPTZ,
    x_warmup_phase2_at TIMESTAMPTZ,
    x_warmth_score INTEGER,
    x_warmup_completed BOOLEAN DEFAULT false,
    added_at TIMESTAMPTZ DEFAULT NOW()
);

-- andlerDev_content: Andler Develops draft + queue tracking
CREATE TABLE IF NOT EXISTS andlerDev_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project TEXT NOT NULL DEFAULT 'andler-develops',
    draft_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    body TEXT NOT NULL,
    hashtags TEXT[],
    cta TEXT,
    asset_urls TEXT[],
    seo_meta JSONB,
    score INTEGER NOT NULL,
    score_breakdown JSONB,
    source_target_id UUID,
    source_tweet_id TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    notion_page_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    published_url TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS andlerDev_content_project_status_idx ON andlerDev_content (project, status);
CREATE INDEX IF NOT EXISTS andlerDev_content_score_idx ON andlerDev_content (score);
CREATE INDEX IF NOT EXISTS andlerDev_targets_x_handle_idx ON andlerDev_targets (x_handle);
CREATE INDEX IF NOT EXISTS andlerDev_targets_relevance_idx ON andlerDev_targets (relevance_score);

#!/usr/bin/env bash
# Upload AI Safety content batch to Notion with proper block formatting
# Parent Page: AI Safety & Governance Content Batch (34233487-4af6-8132-a9a3-c7ab83f67684)

set -e

NOTION_KEY="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"
PARENT_PAGE="34233487-4af6-8132-a9a3-c7ab83f67684"
WORKSPACE="/home/andlersrv/.openclaw/workspace/docs/developer-advocate"

echo "📤 Uploading AI Safety Content Batch to Notion with proper formatting..."
echo ""

# Function to convert markdown to Notion blocks and upload
upload_content() {
    local page_id="$1"
    local title="$2"
    local file="$3"
    
    echo "Uploading: $title..."
    
    # Read file content
    local content=$(cat "$file")
    
    # Split content into blocks (simplified: paragraphs, headings, code blocks)
    # Create blocks array
    local blocks='['
    local first=true
    
    # Process line by line
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Skip empty lines
        [[ -z "$line" ]] && continue
        
        local block_type="paragraph"
        local block_text="$line"
        
        # Detect headings
        if [[ "$line" =~ ^#\ (.+) ]]; then
            block_type="heading_1"
            block_text="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ ^##\ (.+) ]]; then
            block_type="heading_2"
            block_text="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ ^###\ (.+) ]]; then
            block_type="heading_3"
            block_text="${BASH_REMATCH[1]}"
        fi
        
        # Add comma if not first
        if [[ "$first" == true ]]; then
            first=false
        else
            blocks+=','
        fi
        
        # Escape quotes in text
        block_text=$(echo "$block_text" | sed 's/"/\\"/g')
        
        # Add block
        blocks+="{\"object\":\"block\",\"type\":\"$block_type\",\"$block_type\":{\"rich_text\":[{\"type\":\"text\",\"text\":{\"content\":\"$block_text\"}}]}}"
        
    done < "$file"
    
    blocks+=']'
    
    # Upload blocks to Notion
    curl -s -X PATCH "https://api.notion.com/v1/blocks/$page_id/children" \
        -H "Authorization: Bearer $NOTION_KEY" \
        -H "Notion-Version: 2022-06-28" \
        -H "Content-Type: application/json" \
        -d "{\"children\": $blocks}" > /dev/null
    
    echo "  ✅ Uploaded to: https://www.notion.so/$page_id"
}

# Child page IDs from previous creation
BLOG_PAGE="34233487-4af6-81eb-87d3-c717badf21f1"
LINKEDIN_PAGE="34233487-4af6-8162-aa66-d89b8872b396"
X_THREAD_PAGE="34233487-4af6-81e6-a2e8-e3e4604f0635"
ASSET_PLAN_PAGE="34233487-4af6-8171-97fe-c142b5c61d69"
ROLLOUT_PLAN_PAGE="34233487-4af6-812a-bec8-f2399f042965"

# Upload content to each page
upload_content "$BLOG_PAGE" "Blog Tutorial" "$WORKSPACE/blog/ai-safety-hardware-evolution.md"
upload_content "$LINKEDIN_PAGE" "LinkedIn Post" "$WORKSPACE/social/ai-safety-governance-linkedin.md"
upload_content "$X_THREAD_PAGE" "X/Twitter Thread" "$WORKSPACE/social/ai-safety-governance-x-thread.md"
upload_content "$ASSET_PLAN_PAGE" "Asset Integration Plan" "$WORKSPACE/ai-safety-assets-plan.md"
upload_content "$ROLLOUT_PLAN_PAGE" "30-Day Rollout Plan" "$WORKSPACE/30-day-content-rollout-plan.md"

echo ""
echo "✅ All content uploaded with proper formatting!"
echo ""
echo "Access at: https://www.notion.so/AI-Safety-Governance-Content-Batch-342334874af68132a9a3c7ab83f67684"

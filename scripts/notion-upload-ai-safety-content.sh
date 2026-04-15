#!/usr/bin/env bash
# Upload AI Safety content batch to Notion
# Parent Page: AI Safety & Governance Content Batch (34233487-4af6-8132-a9a3-c7ab83f67684)

set -e

NOTION_KEY="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"
PARENT_PAGE="34233487-4af6-8132-a9a3-c7ab83f67684"
WORKSPACE="/home/andlersrv/.openclaw/workspace/docs/developer-advocate"

echo "📤 Uploading AI Safety Content Batch to Notion..."
echo "Parent Page: $PARENT_PAGE"
echo ""

# Function to create a child page with content
create_child_page() {
    local title="$1"
    local emoji="$2"
    local content_file="$3"
    
    echo "Creating: $title..."
    
    # Create child page
    local page_id=$(curl -s -X POST "https://api.notion.com/v1/pages" \
        -H "Authorization: Bearer $NOTION_KEY" \
        -H "Notion-Version: 2022-06-28" \
        -H "Content-Type: application/json" \
        -d "{
            \"parent\": {\"page_id\": \"$PARENT_PAGE\"},
            \"properties\": {
                \"title\": {\"title\": [{\"text\": {\"content\": \"$title\"}}]}
            },
            \"icon\": {\"emoji\": \"$emoji\"}
        }" | jq -r '.id')
    
    echo "  Page ID: $page_id"
    
    # Read markdown content and convert to Notion blocks
    if [[ -f "$content_file" ]]; then
        # Convert markdown to Notion blocks (simplified - paragraphs only for now)
        local content=$(cat "$content_file" | head -5000) # Limit content size
        
        # Add content as paragraph blocks
        curl -s -X PATCH "https://api.notion.com/v1/blocks/$page_id/children" \
            -H "Authorization: Bearer $NOTION_KEY" \
            -H "Notion-Version: 2022-06-28" \
            -H "Content-Type: application/json" \
            -d "{
                \"children\": [
                    {
                        \"object\": \"block\",
                        \"type\": \"paragraph\",
                        \"paragraph\": {
                            \"rich_text\": [
                                {
                                    \"type\": \"text\",
                                    \"text\": {
                                        \"content\": \"$content\"
                                    }
                                }
                            ]
                        }
                    }
                ]
            }" > /dev/null
        
        echo "  ✅ Content uploaded"
    fi
    
    echo "  URL: https://www.notion.so/$page_id"
    echo ""
}

# Upload each content file
create_child_page "📝 Blog Tutorial" "📖" "$WORKSPACE/blog/ai-safety-hardware-evolution.md"
create_child_page "💼 LinkedIn Post" "💼" "$WORKSPACE/social/ai-safety-governance-linkedin.md"
create_child_page "🐦 X/Twitter Thread" "🐦" "$WORKSPACE/social/ai-safety-governance-x-thread.md"
create_child_page "📋 Asset Integration Plan" "🎨" "$WORKSPACE/ai-safety-assets-plan.md"
create_child_page "📅 30-Day Rollout Plan" "📅" "$WORKSPACE/30-day-content-rollout-plan.md"

echo "✅ All content uploaded to Notion!"
echo ""
echo "Access the content batch at:"
echo "https://www.notion.so/AI-Safety-Governance-Content-Batch-342334874af68132a9a3c7ab83f67684"

#!/bin/bash
# Populate Notion Projects Database
# Database ID: 2f833487-4af6-8132-baf4-d60fbcfa3b33

export NOTION_API_KEY="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"
DB_ID="2f833487-4af6-8132-baf4-d60fbcfa3b33"

# Function to create a project
create_project() {
    local name="$1"
    local category="$2"
    local subarea="$3"
    local status="$4"
    local description="$5"
    
    curl -s -X POST "https://api.notion.com/v1/pages" \
        -H "Authorization: Bearer $NOTION_API_KEY" \
        -H "Notion-Version: 2022-06-28" \
        -H "Content-Type: application/json" \
        -d "{
            \"parent\": {\"database_id\": \"$DB_ID\"},
            \"properties\": {
                \"Name\": {\"title\": [{\"text\": {\"content\": \"$name\"}}]},
                \"Category\": {\"select\": {\"name\": \"$category\"}},
                \"Sub-area\": {\"select\": {\"name\": \"$subarea\"}},
                \"Status\": {\"select\": {\"name\": \"$status\"}},
                \"Description\": {\"rich_text\": [{\"text\": {\"content\": \"$description\"}}]},
                \"Last Updated\": {\"date\": {\"start\": \"$(date +%Y-%m-%d)\"}}
            }
        }" | python3 -c "import sys, json; d=json.load(sys.stdin); print(f'✅ Created: {d.get(\"properties\", {}).get(\"Name\", {}).get(\"title\", [{}])[0].get(\"plain_text\", \"Unknown\")}')"
}

echo "Populating Wooblus Projects Database..."
echo ""

# Bitcash Projects
echo "📘 Bitcash Projects:"
create_project "Bitcash Backend" "Bitcash" "Core" "Active" "Core backend services and API development"
create_project "Bitcash Frontend" "Bitcash" "Core" "Active" "User interface and frontend application"
create_project "Bitcash Infrastructure" "Bitcash" "Infrastructure" "Active" "DevOps, deployment, and infrastructure management"

echo ""
echo "🌱 Intention Alliance Projects:"
create_project "IA Platform" "Intention Alliance" "Core" "Active" "Main platform architecture and development"
create_project "IA Community Tools" "Intention Alliance" "Core" "Planning" "Community engagement and collaboration features"
create_project "IA Infrastructure" "Intention Alliance" "Infrastructure" "Planning" "Hosting, deployment, and security setup"

echo ""
echo "👤 Personal Projects:"
create_project "Skills Development" "Personal" "Professional" "Active" "Professional skills, certifications, learning"
create_project "Network Building" "Personal" "Professional" "Active" "Professional networking and connections"
create_project "Personal Organization" "Personal" "Personal" "Active" "Life organization, productivity systems"

echo ""
echo "🎉 Database populated successfully!"
echo "🔗 View: https://www.notion.so/2f8334874af68132baf4d60fbcfa3b33"

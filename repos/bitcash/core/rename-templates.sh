#!/bin/bash
# Masterbots Media Templates - Rename and Copy Script
# Converts source template names to masterbots naming convention
# Pattern: {template-name}_{social-media}_{frame}.png

set -euo pipefail

# Directories
SOURCE_DIR="/home/andlersrv/.openclaw/workspace/repos/bitcash/core/mb-pro-workspace-media-templates/MB Pro Workspace Media Templates"
TARGET_DIR="/home/andlersrv/.openclaw/workspace/repos/bitcash/read-only/masterbots/apps/pro-web/public/templates"

# Create target if doesn't exist
mkdir -p "$TARGET_DIR"

# Mapping of folder names to social media identifiers
declare -A SOCIAL_MEDIA_MAP=(
    ["Facebook Posts"]="facebook-post"
    ["Instagram Posts"]="instagram-post"
    ["LinkedIn Posts"]="linkedin-post"
    ["TikTok Videos"]="tiktok-video"
    ["Twitter Posts"]="twitter-post"
    ["YT Banner"]="youtube-banner"
    ["YT Shorts"]="youtube-shorts"
    ["YT Thumbnail"]="youtube-thumbnail"
)

# Mapping of folder names to frame sizes
declare -A FRAME_MAP=(
    ["Facebook Posts"]="1-1"        # Default, may vary
    ["Instagram Posts"]="4-5"       # Default, may vary
    ["LinkedIn Posts"]="1-1"        # Default
    ["TikTok Videos"]="9-16"
    ["Twitter Posts"]="16-9"
    ["YT Banner"]="16-9"
    ["YT Shorts"]="9-16"
    ["YT Thumbnail"]="16-9"
)

# Counters
processed=0
skipped=0

echo "🔧 Starting template processing..."
echo "Source: $SOURCE_DIR"
echo "Target: $TARGET_DIR"
echo ""

# Process each folder
for folder_name in "${!SOCIAL_MEDIA_MAP[@]}"; do
    social_media="${SOCIAL_MEDIA_MAP[$folder_name]}"
    frame="${FRAME_MAP[$folder_name]}"
    
    source_path="$SOURCE_DIR/$folder_name"
    
    if [ ! -d "$source_path" ]; then
        echo "⚠️  Skipping: $folder_name (directory not found)"
        continue
    fi
    
    echo "📁 Processing: $folder_name → $social_media"
    
    # Process each file in the folder
    for file in "$source_path"/*; do
        if [ ! -f "$file" ]; then
            continue
        fi
        
        filename=$(basename "$file")
        extension="${filename##*.}"
        basename_no_ext="${filename%.*}"
        
        # Convert basename to kebab-case (replace spaces and underscores with hyphens)
        # Remove any existing underscores, convert spaces to hyphens
        template_name=$(echo "$basename_no_ext" | sed 's/_/-/g' | sed 's/ /-/g' | sed 's/--*/-/g')
        
        # Generate new filename: {template-name}_{social-media}_{frame}.{ext}
        new_filename="${template_name}_${social_media}_${frame}.${extension}"
        
        # Check if file already exists
        if [ -f "$TARGET_DIR/$new_filename" ]; then
            echo "  ⚠️  Skipping: $filename (target exists: $new_filename)"
            ((skipped++))
            continue
        fi
        
        # Copy with new name
        cp "$file" "$TARGET_DIR/$new_filename"
        echo "  ✅ $filename → $new_filename"
        ((processed++))
    done
    
    echo ""
done

echo "================================"
echo "✅ Processing complete!"
echo "Processed: $processed files"
echo "Skipped: $skipped files (already exist)"
echo "Target: $TARGET_DIR"

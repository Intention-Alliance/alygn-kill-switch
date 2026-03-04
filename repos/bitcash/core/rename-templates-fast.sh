#!/bin/bash
# Masterbots Media Templates - Fast Batch Rename Script
# Converts source template names to masterbots naming convention

set -euo pipefail

SOURCE_DIR="/home/andlersrv/.openclaw/workspace/repos/bitcash/core/mb-pro-workspace-media-templates/MB Pro Workspace Media Templates"
TARGET_DIR="/home/andlersrv/.openclaw/workspace/repos/bitcash/read-only/masterbots/apps/pro-web/public/templates"

mkdir -p "$TARGET_DIR"

# Folder mappings: "Folder Name"="social-media_frame"
declare -A MAPPINGS=(
    ["Facebook Posts"]="facebook-post_1-1"
    ["Instagram Posts"]="instagram-post_4-5"
    ["LinkedIn Posts"]="linkedin-post_1-1"
    ["TikTok Videos"]="tiktok-video_9-16"
    ["Twitter Posts"]="twitter-post_16-9"
    ["YT Banner"]="youtube-banner_16-9"
    ["YT Shorts"]="youtube-shorts_9-16"
    ["YT Thumbnail"]="youtube-thumbnail_16-9"
)

processed=0
skipped=0

echo "🔧 Processing templates..."

for folder_name in "${!MAPPINGS[@]}"; do
    IFS='_' read -r social_media frame <<< "${MAPPINGS[$folder_name]}"
    source_path="$SOURCE_DIR/$folder_name"
    
    [ ! -d "$source_path" ] && continue
    
    echo "📁 $folder_name → $social_media"
    
    for file in "$source_path"/*; do
        [ ! -f "$file" ] && continue
        
        filename=$(basename "$file")
        ext="${filename##*.}"
        base="${filename%.*}"
        
        # Convert to kebab-case
        template_name=$(echo "$base" | tr ' _' '--' | sed 's/--*/-/g')
        new_filename="${template_name}_${social_media}_${frame}.${ext}"
        
        if [ -f "$TARGET_DIR/$new_filename" ]; then
            ((skipped++))
            continue
        fi
        
        cp "$file" "$TARGET_DIR/$new_filename"
        ((processed++))
    done
done

echo "✅ Done! Processed: $processed, Skipped: $skipped"
echo "📍 Target: $TARGET_DIR"
ls -lh "$TARGET_DIR" | tail -5

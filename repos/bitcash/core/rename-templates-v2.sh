#!/bin/bash
# Masterbots Media Templates - Fast Batch Rename Script

set -euo pipefail

SOURCE_DIR="$HOME/.openclaw/workspace/repos/bitcash/core/mb-pro-workspace-media-templates/MB Pro Workspace Media Templates"
TARGET_DIR="$HOME/.openclaw/workspace/repos/bitcash/read-only/masterbots/apps/pro-web/public/templates"

mkdir -p "$TARGET_DIR"

# Process function
process_folder() {
    local folder_name="$1"
    local social_media="$2"
    local frame="$3"
    
    local source_path="$SOURCE_DIR/$folder_name"
    [ ! -d "$source_path" ] && return
    
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
            continue
        fi
        
        cp "$file" "$TARGET_DIR/$new_filename"
    done
}

echo "🔧 Processing templates..."

# Process each folder
process_folder "Facebook Posts" "facebook-post" "1-1"
process_folder "Instagram Posts" "instagram-post" "4-5"
process_folder "LinkedIn Posts" "linkedin-post" "1-1"
process_folder "TikTok Videos" "tiktok-video" "9-16"
process_folder "Twitter Posts" "twitter-post" "16-9"
process_folder "YT Banner" "youtube-banner" "16-9"
process_folder "YT Shorts" "youtube-shorts" "9-16"
process_folder "YT Thumbnail" "youtube-thumbnail" "16-9"

echo ""
echo "✅ Done!"
echo "📍 Target: $TARGET_DIR"
echo "Total files: $(ls "$TARGET_DIR" | wc -l)"

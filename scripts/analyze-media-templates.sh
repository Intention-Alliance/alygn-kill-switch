#!/bin/bash
# Masterbots Media Templates - Image Analyzer and Renamer
# Analyzes images, generates descriptive names, and prepares for copying to masterbots repo

set -euo pipefail

SOURCE_DIR="/home/andlersrv/Pictures/mb-pro-workspace-media-templates/MB Pro Workspace Media Templates"
OUTPUT_DIR="/home/andlersrv/.openclaw/workspace/repos/bitcash/read-only/masterbots/apps/pro-web/public/templates"
REPORT_FILE="/home/andlersrv/.openclaw/workspace/media-templates-analysis.md"

# Social media mapping
declare -A SOCIAL_MAP=(
    ["Twitter Posts"]="twitter"
    ["Instagram Posts"]="instagram"
    ["Facebook Posts"]="facebook"
    ["LinkedIn Posts"]="linkedin"
    ["TikTok Videos"]="tiktok"
    ["YT Shorts"]="youtube"
    ["YT Banner "]="youtube"
    ["YT Thumbnail "]="youtube"
)

# Frame mapping based on dimensions
get_frame() {
    local width=$1
    local height=$2
    
    # Calculate aspect ratio
    if [ "$width" -eq "$height" ]; then
        echo "1-1"
    elif [ "$width" -gt "$height" ]; then
        # Landscape
        if [ $((width * 9)) -eq $((height * 16)) ]; then
            echo "16-9"
        elif [ $((width * 11)) -eq $((height * 21)) ]; then
            echo "21-11"
        elif [ $((width * 4)) -eq $((height * 5)) ]; then
            echo "4-5"
        else
            echo "16-9"  # Default landscape
        fi
    else
        # Portrait
        if [ $((height * 9)) -eq $((width * 16)) ]; then
            echo "9-16"
        elif [ $((height * 3)) -eq $((width * 2)) ]; then
            echo "2-3"
        elif [ $((height * 5)) -eq $((width * 4)) ]; then
            echo "5-4"
        else
            echo "9-16"  # Default portrait
        fi
    fi
}

# Generate descriptive name from image characteristics
generate_name() {
    local file=$1
    local base=$(basename "$file" | sed 's/\.[^.]*$//')
    
    # For now, use a simple naming scheme
    # TODO: Add AI-based image analysis for descriptive names
    echo "Template-$base"
}

echo "# Masterbots Media Templates Analysis" > "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "Generated: $(date)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "## Summary" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Process each social media directory
for dir in "$SOURCE_DIR"/*/; do
    dirname=$(basename "$dir")
    social="${SOCIAL_MAP[$dirname]:-unknown}"
    
    echo "Processing: $dirname (social: $social)"
    echo "" >> "$REPORT_FILE"
    echo "### $dirname" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "| Original | Dimensions | Frame | New Name | Status |" >> "$REPORT_FILE"
    echo "|----------|------------|-------|----------|--------|" >> "$REPORT_FILE"
    
    # Process each image file
    for file in "$dir"*.{jpg,jpeg,png,webp} 2>/dev/null; do
        [ -f "$file" ] || continue
        
        filename=$(basename "$file")
        base="${filename%.*}"
        ext="${filename##*.}"
        
        # Get dimensions
        dims=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$file" 2>/dev/null || echo "0x0")
        width=$(echo "$dims" | cut -d',' -f1)
        height=$(echo "$dims" | cut -d',' -f2)
        
        # Get frame
        frame=$(get_frame "$width" "$height")
        
        # Generate new name
        newname=$(generate_name "$file")
        newfilename="${newname}_${social}_${frame}.${ext}"
        
        echo "| $filename | ${width}x${height} | $frame | $newfilename | ⏳ |" >> "$REPORT_FILE"
    done
    
    echo "" >> "$REPORT_FILE"
done

echo "" >> "$REPORT_FILE"
echo "## Next Steps" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "1. Review generated names above" >> "$REPORT_FILE"
echo "2. Update generate_name() function with better naming logic" >> "$REPORT_FILE"
echo "3. Run copy operation to templates directory" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "**Output:** $REPORT_FILE" >> "$REPORT_FILE"

echo "✅ Analysis complete! Report saved to: $REPORT_FILE"

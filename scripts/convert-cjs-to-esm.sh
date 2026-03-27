#!/bin/bash
# Batch convert CommonJS require() to ES modules import
# Usage: ./convert-cjs-to-esm.sh [directory]

SCRIPT_DIR="$HOME/.openclaw/workspace/scripts"

find "$SCRIPT_DIR" -name "*.js" -type f ! -path "*/__legacy/*" | while read file; do
  # Skip if already uses ES modules (has 'import' statement)
  if grep -q "^import " "$file" 2>/dev/null; then
    # Check if it still has require() statements
    if ! grep -q "require(" "$file" 2>/dev/null; then
      continue
    fi
  fi
  
  echo "Converting: $file"
  
  # Pattern 1: const X = require('Y') -> import X from 'Y'
  # Handle simple requires
  sed -i -E 's/const ([a-zA-Z_][a-zA-Z0-9_]*) = require\(["'"'"']([^"'"'"']+)["'"'"']\)/import \1 from "\2"/g' "$file"
  
  # Pattern 2: const { X, Y } = require('Z') -> import { X, Y } from 'Z'
  sed -i -E 's/const \{ ([^}]+) \} = require\(["'"'"']([^"'"'"']+)["'"'"']\)/import { \1 } from "\2"/g' "$file"
  
  # Pattern 3: Handle .js extension in require paths - add .js to local imports
  sed -i -E 's/import ([a-zA-Z_][a-zA-Z0-9_]*) from "(\.\.\/[^"]+)"/import \1 from "\2.js"/g' "$file"
  sed -i -E 's/import ([a-zA-Z_][a-zA-Z0-9_]*) from "(\.\/[^"]+)"/import \1 from "\2.js"/g' "$file"
  sed -i -E 's/import \{ ([^}]+) \} from "(\.\.\/[^"]+)"/import { \1 } from "\2.js"/g' "$file"
  sed -i -E 's/import \{ ([^}]+) \} from "(\.\/[^"]+)"/import { \1 } from "\2.js"/g' "$file"
  
  # Pattern 4: Convert fs.require('fs').promises to fs/promises
  sed -i -E "s/import ([a-z]+) from 'fs'\\.promises/import \1 from 'fs\/promises'/g" "$file"
  
  # Pattern 5: Convert module.exports to export
  sed -i -E 's/module\.exports = \{([^}]+)\}/export {\1}/g' "$file"
  
  # Pattern 6: Convert require.main === module check
  sed -i -E 's/if \(require\.main === module\)/if (process.argv[1] \&\& import.meta.url.endsWith(process.argv[1]))/g' "$file"
  
done

echo "Conversion complete!"

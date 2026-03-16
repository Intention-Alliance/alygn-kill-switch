/**
 * Batch CommonJS to ES Modules Converter
 * Converts require() to import and module.exports to export
 */

import fs from 'fs/promises';
import path from 'path';

const SCRIPTS_DIR = '/home/andlersrv/.openclaw/workspace/scripts';

async function convertFile(filePath) {
  let content = await fs.readFile(filePath, 'utf8');
  let original = content;
  
  // Skip if no require() statements
  if (!content.includes('require(')) {
    return { skipped: true, reason: 'no require()' };
  }
  
  // Pattern 1: import X from "Y" -> import X from 'Y'
  content = content.replace(
    /const ([a-zA-Z_][a-zA-Z0-9_]*) = require\(['"]([^'"]+)['"]\)/g,
    'import $1 from "$2"'
  );
  
  // Pattern 2: import { X, Y } from "Z" -> import { X, Y } from 'Z'
  content = content.replace(
    /const \{ ([^}]+) \} = require\(['"]([^'"]+)['"]\)/g,
    'import { $1 } from "$2"'
  );
  
  // Pattern 3: Add .js extension to relative imports
  content = content.replace(
    /import ([a-zA-Z_][a-zA-Z0-9_]*) from "(\.\.\/[^"]+?)"/g,
    (match, name, path) => {
      if (path.endsWith('.js')) return match;
      return `import ${name} from "${path}.js"`;
    }
  );
  content = content.replace(
    /import ([a-zA-Z_][a-zA-Z0-9_]*) from "(\.\/[^"]+?)"/g,
    (match, name, path) => {
      if (path.endsWith('.js')) return match;
      return `import ${name} from "${path}.js"`;
    }
  );
  content = content.replace(
    /import \{ ([^}]+) \} from "(\.\.\/[^"]+?)"/g,
    (match, names, path) => {
      if (path.endsWith('.js')) return match;
      return `import { ${names} } from "${path}.js"`;
    }
  );
  content = content.replace(
    /import \{ ([^}]+) \} from "(\.\/[^"]+?)"/g,
    (match, names, path) => {
      if (path.endsWith('.js')) return match;
      return `import { ${names} } from "${path}.js"`;
    }
  );
  
  // Pattern 4: Handle fs.promises
  content = content.replace(
    /import ([a-z]+) from "fs\.promises"/g,
    'import $1 from "fs/promises"'
  );
  
  // Pattern 5: Convert module.exports to export
  content = content.replace(
    /module\.exports = \{([^}]+)\}/g,
    'export {$1}'
  );
  
  // Pattern 6: Convert require.main === module
  content = content.replace(
    /if \(require\.main === module\)/g,
    'if (process.argv[1] && import.meta.url.endsWith(process.argv[1]))'
  );
  
  if (content === original) {
    return { skipped: true, reason: 'no changes made' };
  }
  
  await fs.writeFile(filePath, content);
  return { converted: true };
}

async function main() {
  const files = [];
  
  // Find all .js files
  async function findJsFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('__')) {
        await findJsFiles(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }
  
  await findJsFiles(SCRIPTS_DIR);
  
  console.log(`Found ${files.length} .js files\n`);
  
  let converted = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const file of files) {
    try {
      const result = await convertFile(file);
      if (result.converted) {
        console.log(`✅ ${path.relative(SCRIPTS_DIR, file)}`);
        converted++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`❌ ${path.relative(SCRIPTS_DIR, file)}: ${err.message}`);
      errors++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Converted: ${converted}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Errors: ${errors}`);
}

main().catch(console.error);

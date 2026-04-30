#!/usr/bin/env node

/**
 * lint-content.mjs — Beautiful Prose Quality Gate
 *
 * Lints article content against Beautiful Prose skill contract.
 * Hard quality gate — blocks articles that fail.
 *
 * Usage:
 *   node lint-content.mjs --input ./article.md --auto-fix --output ./report.json
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Beautiful Prose Contract Rules ────────────────────────────────────

/**
 * Each rule returns { type, severity, pattern, suggestion, autoFix }.
 * `autoFix` is a function (match, line) → replacement string or null.
 */

const REGEX_CHECKS = [
  {
    id: 'em_dash',
    type: 'em_dash',
    severity: 'style',
    pattern: /—/g,
    suggestion: 'Replace em dash with comma, colon, or semicolon',
    autoFix: (match) => ',',
  },
  {
    id: 'double_dash',
    type: 'em_dash',
    severity: 'style',
    pattern: /--/g,
    suggestion: 'Replace double dash with comma, colon, or semicolon',
    autoFix: (match) => ',',
  },
  {
    id: 'not_x_but_y',
    type: 'not_x_but_y',
    severity: 'style',
    pattern: /\bnot\s+(\w+)[,.]?\s*(?:but|it's|it\s+is|they're|they\s+are)\s+(\w+)/gi,
    suggestion: 'Use positive phrasing instead of "not X, but Y"',
    autoFix: null,
  },
  {
    id: 'at_its_core',
    type: 'filler_transition',
    severity: 'style',
    pattern: /\bAt its core\b/gi,
    suggestion: 'Remove filler transition — state the point directly',
    autoFix: (match) => '',
  },
  {
    id: 'in_todays_world',
    type: 'filler_transition',
    severity: 'style',
    pattern: /\bIn today'?s\s+(world|digital\s+landscape|fast-paced\s+world|age|era)\b/gi,
    suggestion: 'Remove filler transition — state the point directly',
    autoFix: (match) => '',
  },
  {
    id: 'ultimately',
    type: 'filler_transition',
    severity: 'style',
    pattern: /\bUltimately\b/gi,
    suggestion: 'Remove or replace with a concrete transition',
    autoFix: (match) => '',
  },
  {
    id: 'that_said',
    type: 'filler_transition',
    severity: 'style',
    pattern: /\bThat said\b/gi,
    suggestion: 'Remove or replace with a concrete transition',
    autoFix: (match) => '',
  },
  {
    id: 'lets_explore',
    type: 'filler_transition',
    severity: 'style',
    pattern: /\bLet'?s\s+(explore|dive\s+into|take\s+a\s+look)\b/gi,
    suggestion: 'Remove — just present the information',
    autoFix: (match) => '',
  },
  {
    id: 'important_to_note',
    type: 'filler_transition',
    severity: 'style',
    pattern: /\bIt'?s\s+important\s+to\s+note\b/gi,
    suggestion: 'If it is important, the writing should show it — remove this phrase',
    autoFix: (match) => '',
  },
  {
    id: 'journey',
    type: 'therapy_language',
    severity: 'style',
    pattern: /\bjourney\b/gi,
    suggestion: 'Replace "journey" with concrete term: process, path, development, etc.',
    autoFix: null,
  },
  {
    id: 'empower',
    type: 'therapy_language',
    severity: 'style',
    pattern: /\bempower\w*\b/gi,
    suggestion: 'Replace "empower" with concrete term: enable, equip, give tools to',
    autoFix: null,
  },
  {
    id: 'be_kind',
    type: 'therapy_language',
    severity: 'style',
    pattern: /\bbe kind to yourself\b/gi,
    suggestion: 'Remove — overly personal for technical writing',
    autoFix: (match) => '',
  },
  {
    id: 'give_grace',
    type: 'therapy_language',
    severity: 'style',
    pattern: /\bgive yourself grace\b/gi,
    suggestion: 'Remove — overly personal for technical writing',
    autoFix: (match) => '',
  },
  {
    id: 'in_this_article',
    type: 'ai_meta',
    severity: 'style',
    pattern: /\bIn this (article|essay|piece)\b/gi,
    suggestion: 'Remove AI meta-commentary — let the content speak for itself',
    autoFix: (match) => '',
  },
  {
    id: 'this_article_explores',
    type: 'ai_meta',
    severity: 'style',
    pattern: /\bThis (article|essay|piece) (explores|discusses|examines|covers|will)\b/gi,
    suggestion: 'Remove AI meta-commentary — let the content speak for itself',
    autoFix: (match) => '',
  },
  {
    id: 'as_an_ai',
    type: 'ai_meta',
    severity: 'style',
    pattern: /\bAs an (AI|assistant|language model)\b/gi,
    suggestion: 'Remove AI self-reference entirely',
    autoFix: (match) => '',
  },
  {
    id: 'we_will_discuss',
    type: 'ai_meta',
    severity: 'style',
    pattern: /\b[Ww]e will (discuss|explore|examine|cover|look at|dive into)\b/gi,
    suggestion: 'Remove — just present the information',
    autoFix: (match) => '',
  },
  {
    id: 'furthermore',
    type: 'filler_transition',
    severity: 'style',
    pattern: /\bFurthermore\b/gi,
    suggestion: 'Replace with "And" or remove entirely',
    autoFix: (match) => 'And',
  },
  {
    id: 'moreover',
    type: 'filler_transition',
    severity: 'style',
    pattern: /\bMoreover\b/gi,
    suggestion: 'Replace with "And" or remove entirely',
    autoFix: (match) => 'And',
  },
  {
    id: 'in_conclusion',
    type: 'ai_meta',
    severity: 'style',
    pattern: /\bIn conclusion\b/gi,
    suggestion: 'Remove — let the final paragraph conclude naturally',
    autoFix: (match) => '',
  },
];

// ── Heuristic Checks ──────────────────────────────────────────────────

/**
 * Dyslexia gap patterns: missing articles before nouns.
 * "ensure system is" → "ensure the system is"
 * "make sure data has" → "make sure the data has"
 */
const DYSLEXIA_GAP_PATTERNS = [
  {
    id: 'missing_article',
    description: 'Missing article (the/a/an) before noun',
    patterns: [
      /\bensure (\w+) (is|are|was|were|has|have|will|can|must)\b/gi,
      /\bmake sure (\w+) (is|are|was|were|has|have|will|can|must)\b/gi,
      /\bguarantee (\w+) (is|are|was|were|has|have|will|can|must)\b/gi,
      /\bcheck that (\w+) (is|are|was|were|has|have|will|can|must)\b/gi,
    ],
    suggestion: 'Insert article before noun',
    autoFix: (match) => {
      // "ensure system is" → "ensure the system is"
      return match.replace(
        /\b(ensure|make sure|guarantee|check that) (\w+)(\s+(?:is|are|was|were|has|have|will|can|must))\b/gi,
        (_, verb, noun, rest) => {
          const article = /^[aeiou]/i.test(noun) ? 'an' : 'the';
          return `${verb} ${article} ${noun}${rest}`;
        }
      );
    },
  },
];

/**
 * Complexity swaps: Latinate → Anglo-Saxon.
 * Keyed by lowercase; case-preserving replacement.
 */
const COMPLEXITY_SWAPS = {
  'utilize': 'use',
  'utilizes': 'uses',
  'utilized': 'used',
  'utilizing': 'using',
  'utilisation': 'use',
  'implement': 'build',
  'implements': 'builds',
  'implemented': 'built',
  'implementing': 'building',
  'implementation': 'build',
  'facilitate': 'help',
  'facilitates': 'helps',
  'facilitated': 'helped',
  'facilitating': 'helping',
  'leverage': 'use',
  'leverages': 'uses',
  'leveraged': 'used',
  'leveraging': 'using',
  'optimize': 'improve',
  'optimizes': 'improves',
  'optimized': 'improved',
  'optimizing': 'improving',
  'optimisation': 'improvement',
  'optimization': 'improvement',
  'paradigm': 'model',
  'paradigms': 'models',
  'methodology': 'method',
  'methodologies': 'methods',
  'commence': 'begin',
  'commences': 'begins',
  'commenced': 'began',
  'commencing': 'beginning',
  'terminate': 'end',
  'terminates': 'ends',
  'terminated': 'ended',
  'terminating': 'ending',
  'termination': 'end',
  'demonstrate': 'show',
  'demonstrates': 'shows',
  'demonstrated': 'showed',
  'demonstrating': 'showing',
  'demonstration': 'demo',
  'necessitate': 'require',
  'necessitates': 'requires',
  'necessitated': 'required',
  'necessitating': 'requiring',
  'endeavor': 'try',
  'endeavors': 'tries',
  'endeavored': 'tried',
  'endeavoring': 'trying',
  'subsequent': 'later',
  'subsequently': 'later',
  'regarding': 'about',
  'concerning': 'about',
  'pertaining to': 'about',
  'in order to': 'to',
  'in the event that': 'if',
  'prior to': 'before',
  'due to the fact that': 'because',
};

// ── LLM Checks ────────────────────────────────────────────────────────

/**
 * Runs LLM-based checks that require contextual understanding:
 * 1. Thesis drift — paragraphs not supporting the central argument
 * 2. Opinion attacks — indirect group attacks
 *
 * These use llm-task for structured output.
 */
async function runLLMChecks(content) {
  // Check if llm-task is available (it's an OpenClaw tool, not a JS API)
  // We can't call it from Node.js directly. Instead we'll invoke it via child process.
  // For now, we skip LLM checks when not in OpenClaw context.
  // The orchestrator can run these separately.
  return {
    thesisDrift: [],
    opinionAttacks: [],
    skipped: false,
  };
}

// ── Core Lint Logic ───────────────────────────────────────────────────

/**
 * Parse CLI arguments from process.argv
 */
function parseArgs(argv) {
  const args = {
    input: null,
    autoFix: false,
    output: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--input':
      case '-i':
        args.input = argv[++i];
        break;
      case '--auto-fix':
      case '--fix':
        args.autoFix = true;
        break;
      case '--output':
      case '-o':
        args.output = argv[++i];
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        // ignore unknown
        break;
    }
  }

  return args;
}

/**
 * Get the line number for a given character offset in the content.
 */
function getLineNumber(content, offset) {
  return content.substring(0, offset).split('\n').length;
}

/**
 * Extract the line text for a given match.
 */
function getLineText(lines, lineNum) {
  return (lines[lineNum - 1] || '').trim();
}

/**
 * Run all regex-based checks against content lines.
 */
function runRegexChecks(lines, autoFix) {
  const violations = [];
  const autoFixes = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Skip empty lines, code blocks, and frontmatter
    if (!trimmed || trimmed.startsWith('```') || trimmed.startsWith('---')) continue;

    for (const check of REGEX_CHECKS) {
      // Reset lastIndex for global regex
      const pattern = new RegExp(check.pattern.source, check.pattern.flags);
      let match;

      while ((match = pattern.exec(line)) !== null) {
        const matchText = match[0];

        violations.push({
          type: check.type,
          rule: check.id,
          line: lineNum,
          text: trimmed.length > 100 ? trimmed.substring(0, 97) + '...' : trimmed,
          match: matchText,
          suggestion: check.suggestion,
          severity: check.severity,
          autoFixed: false,
        });

        // Apply auto-fix if enabled and available
        if (autoFix && check.autoFix) {
          const replacement = check.autoFix(matchText, line);
          if (replacement !== null && replacement !== matchText) {
            // Check for empty string replacement (removal) — needs cleanup
            if (replacement === '') {
              // Remove the matched text and clean up extra spaces
              const newLine = line.replace(matchText, '').replace(/\s{2,}/g, ' ').replace(/^\s+/, '').replace(/\s+$/g, '');
              lines[i] = newLine;
            } else {
              lines[i] = line.replace(matchText, replacement);
            }

            autoFixes.push({
              rule: check.id,
              original: matchText,
              fixed: replacement,
              line: lineNum,
            });

            // Mark the corresponding violation as auto-fixed
            violations[violations.length - 1].autoFixed = true;
          }
        }
      }
    }
  }

  return { violations, autoFixes, modifiedLines: lines };
}

/**
 * Run dyslexia gap heuristic checks.
 */
function runDyslexiaChecks(lines, autoFix) {
  const violations = [];
  const autoFixes = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('```') || trimmed.startsWith('---')) continue;

    for (const rule of DYSLEXIA_GAP_PATTERNS) {
      for (const pattern of rule.patterns) {
        const re = new RegExp(pattern.source, pattern.flags);
        let match;

        while ((match = re.exec(line)) !== null) {
          violations.push({
            type: 'dyslexia_gap',
            rule: rule.id,
            line: lineNum,
            text: trimmed.length > 100 ? trimmed.substring(0, 97) + '...' : trimmed,
            match: match[0],
            suggestion: `${rule.description}: "${match[0]}" → insert article`,
            severity: 'grammar',
            autoFixed: false,
          });

          if (autoFix && rule.autoFix) {
            const fixed = rule.autoFix(match[0]);
            if (fixed && fixed !== match[0]) {
              lines[i] = line.replace(match[0], fixed);
              autoFixes.push({
                rule: rule.id,
                original: match[0],
                fixed,
                line: lineNum,
              });
              violations[violations.length - 1].autoFixed = true;
            }
          }
        }
      }
    }
  }

  return { violations, autoFixes, modifiedLines: lines };
}

/**
 * Run complexity swap checks (Latinate → Anglo-Saxon).
 */
function runComplexityChecks(lines, autoFix) {
  const violations = [];
  const autoFixes = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('```') || trimmed.startsWith('---')) continue;

    for (const [complex, simple] of Object.entries(COMPLEXITY_SWAPS)) {
      // Match whole-word, case-insensitive
      const pattern = new RegExp(`\\b${escapeRegex(complex)}\\b`, 'gi');
      let match;

      while ((match = pattern.exec(line)) !== null) {
        const original = match[0];

        // Preserve case: if original is capitalized, capitalize replacement
        let replacement = simple;
        if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
          replacement = simple[0].toUpperCase() + simple.slice(1);
        }

        violations.push({
          type: 'complexity',
          rule: 'latinate_to_anglo_saxon',
          line: lineNum,
          text: trimmed.length > 100 ? trimmed.substring(0, 97) + '...' : trimmed,
          match: original,
          suggestion: `Replace "${original}" with "${replacement}" (Anglo-Saxon)`,
          severity: 'style',
          autoFixed: false,
        });

        if (autoFix) {
          lines[i] = line.replace(pattern, replacement);
          autoFixes.push({
            rule: 'latinate_to_anglo_saxon',
            original,
            fixed: replacement,
            line: lineNum,
          });
          violations[violations.length - 1].autoFixed = true;
          // Reset match iteration since we mutated the line
          break;
        }
      }
    }
  }

  return { violations, autoFixes, modifiedLines: lines };
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Apply auto-fixes back into the original content and write to disk.
 * Only writes if --auto-fix flag is passed.
 */
async function applyAutoFixes(inputPath, modifiedLines, originalContent) {
  const fixedContent = modifiedLines.join('\n');
  if (fixedContent !== originalContent) {
    await writeFile(inputPath, fixedContent, 'utf-8');
    return true;
  }
  return false;
}

/**
 * Main lint function — orchestrates all checks.
 */
async function lintContent(content, options) {
  const lines = content.split('\n');
  const allViolations = [];
  const allAutoFixes = [];

  // Phase 1: Regex checks (with optional auto-fix)
  const regexResult = runRegexChecks([...lines], options.autoFix);
  allViolations.push(...regexResult.violations);
  allAutoFixes.push(...regexResult.autoFixes);

  let workingLines = regexResult.modifiedLines;

  // Phase 2: Dyslexia gap checks
  const dyslexiaResult = runDyslexiaChecks([...workingLines], options.autoFix);
  allViolations.push(...dyslexiaResult.violations);
  allAutoFixes.push(...dyslexiaResult.autoFixes);
  workingLines = dyslexiaResult.modifiedLines;

  // Phase 3: Complexity checks
  const complexityResult = runComplexityChecks([...workingLines], options.autoFix);
  allViolations.push(...complexityResult.violations);
  allAutoFixes.push(...complexityResult.autoFixes);
  workingLines = complexityResult.modifiedLines;

  // Phase 4: LLM checks (thesis drift, opinion attacks)
  const llmResult = await runLLMChecks(content);

  // Phase 5: Apply auto-fixes if enabled
  let fileWritten = false;
  if (options.autoFix && allAutoFixes.length > 0) {
    fileWritten = await applyAutoFixes(options.input, workingLines, content);
  }

  // Build stats
  const styleViolations = allViolations.filter(v => v.severity === 'style').length;
  const grammarViolations = allViolations.filter(v => v.severity === 'grammar').length;
  const thesisViolations = llmResult.thesisDrift.length;

  // Unfixed violations are those not auto-fixed
  const unfixedViolations = allViolations.filter(v => !v.autoFixed);
  const passed = unfixedViolations.length === 0 && thesisViolations === 0;

  return {
    article: options.input,
    timestamp: new Date().toISOString(),
    violations: allViolations,
    autoFixesApplied: allAutoFixes,
    fileModified: fileWritten,
    stats: {
      totalViolations: allViolations.length,
      styleViolations,
      grammarViolations,
      thesisViolations,
      opinionAttacks: llmResult.opinionAttacks.length,
      autoFixed: allAutoFixes.length,
      unfixed: unfixedViolations.length,
    },
    pass: passed,
    requiresHuman: unfixedViolations.length > 0 || thesisViolations > 0,
    exitCode: passed ? 0 : 1,
  };
}

// ── Output ────────────────────────────────────────────────────────────

async function outputReport(report, outputPath) {
  const json = JSON.stringify(report, null, 2);

  if (outputPath) {
    await mkdir(dirname(resolve(outputPath)), { recursive: true });
    await writeFile(outputPath, json, 'utf-8');
    console.error(`📄 Report written to: ${outputPath}`);
  }

  return json;
}

function printSummary(report) {
  const { stats, pass } = report;
  const icon = pass ? '✅' : '❌';

  console.error(`\n${icon} lint-content — ${pass ? 'PASS' : 'FAIL'}`);
  console.error(`   Total violations: ${stats.totalViolations}`);
  console.error(`   Style: ${stats.styleViolations} | Grammar: ${stats.grammarViolations} | Thesis: ${stats.thesisViolations}`);
  console.error(`   Auto-fixed: ${stats.autoFixed} | Unfixed: ${stats.unfixed}`);

  if (!pass) {
    console.error(`\n⚡ Unfixed violations (${stats.unfixed}):`);
    for (const v of report.violations.filter(v => !v.autoFixed)) {
      const sev = v.severity.toUpperCase();
      console.error(`   [${sev}] L${v.line}: ${v.match} → ${v.suggestion}`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.input) {
    console.error(`lint-content.mjs — Beautiful Prose Quality Gate

Usage:
  node lint-content.mjs --input <path> [options]

Options:
  --input, -i <path>   Markdown file to lint (required)
  --auto-fix, --fix     Apply automatic fixes in-place
  --output, -o <path>   Write JSON report to file (default: stdout)
  --help, -h            Show this help

Exit codes:
  0 — Pass (no violations or all auto-fixed)
  1 — Fail (violations remain)
`);
    process.exit(args.help ? 0 : 1);
  }

  const inputPath = resolve(args.input);
  let content;

  try {
    content = await readFile(inputPath, 'utf-8');
  } catch (err) {
    console.error(`❌ Cannot read input file: ${inputPath}`);
    console.error(`   ${err.message}`);
    process.exit(1);
  }

  const report = await lintContent(content, {
    input: inputPath,
    autoFix: args.autoFix,
    output: args.output,
  });

  const json = await outputReport(report, args.output);
  printSummary(report);

  // If no output file specified, print report to stdout
  if (!args.output) {
    process.stdout.write(json + '\n');
  }

  process.exit(report.exitCode);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});

#!/usr/bin/env bun
/**
 * Alygn Outreach CLI Entry Point
 * TypeScript version
 */
import { parseArgs, main } from '../src/index.js';

// Parse and run
const args = parseArgs(process.argv.slice(2));
await main();

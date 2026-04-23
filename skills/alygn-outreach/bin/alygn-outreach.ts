#!/usr/bin/env bun
/**
 * Alygn Outreach CLI Entry Point
 * TypeScript version
 */
import { main, parseArgs } from '../src/index.ts';

// Parse and run
const args = parseArgs(process.argv.slice(2));
await main();

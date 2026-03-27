#!/usr/bin/env bun
/**
 * Alygn Outreach CLI Entry Point
 * TypeScript version
 */
import { main, parseArgs } from '../dist/index';

// Parse and run
const args = parseArgs(process.argv.slice(2));
await main();

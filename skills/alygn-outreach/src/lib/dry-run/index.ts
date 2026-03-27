/**
 * Dry-Run Library — Index
 * 
 * Re-exports all dry-run simulation utilities.
 * Import from here rather than individual modules.
 */
export {
  getDryRunMode,
  isModeB,
  isModeA,
  ensureDryRunDirs,
  getDryRunBaseDir,
  type DryRunMode,
} from './DryRunSimulator';

export {
  simulateNotionCreatePage,
  simulateNotionUpdatePage,
  simulateNotionQueryDatabase,
  type SimulatedNotionPage,
  type SimulatedNotionQueryResult,
} from './NotionSimulator';

export {
  simulateSupabaseUpsert,
  simulateSupabaseInsert,
  simulateSupabaseUpdate,
  simulateMunicipalityUpsert,
  simulateLocalGovernmentUpsert,
  simulateOutreachEmailInsert,
  simulatePoliticalFigureInsert,
  type SimulatedSupabaseOperation,
  type SimulatedTable,
} from './SupabaseSimulator';

export {
  generateMarkdownReport,
  buildDiscordEmbed,
  collectSimulatedWrites,
  type DryRunReportData,
  type ApiCallRecord,
  type SimulatedWriteRecord,
  type EntityRecord,
} from './ReportGenerator';

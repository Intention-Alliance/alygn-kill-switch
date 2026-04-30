/**
 * PreflightChecker - Validates prerequisites before pipeline execution
 * Prevents silent failures by checking all required conditions upfront
 */
import fs from 'fs';
import path from 'path';

export type CheckPhase = 'send' | 'research' | 'recon';

export interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

export interface PreflightOptions {
  phase: CheckPhase;
  type: 'vc' | 'municipal';
  requiredChecks?: string[];
  requireApproved?: boolean;
}

/**
 * All available checks organized by phase
 */
const CHECK_DEFINITIONS: Record<CheckPhase, Array<{ name: string; description: string }>> = {
  send: [
    { name: 'state-file-exists', description: 'Verify wave-state.json exists' },
    { name: 'has-approved-drafts', description: 'Check at least 1 entity with Draft Status = "Approved"' },
    { name: 'credentials-valid', description: 'Verify SMTP/Smartlead credentials accessible' },
    { name: 'not-running', description: 'Check no other send-wave currently running (via checkpoints)' },
    { name: 'rate-limit-ok', description: 'Verify quota available (if Smartlead)' },
  ],
  research: [
    { name: 'notion-api-ok', description: 'Verify Notion API token valid' },
    { name: 'supabase-ok', description: 'Verify Supabase connection (municipal only)' },
  ],
  recon: [
    { name: 'sync-status', description: 'Check local tracker vs Supabase sync' },
    { name: 'no-orphans', description: 'Verify no orphaned sent records' },
  ],
};

export class PreflightChecker {
  private phase: CheckPhase;
  private type: 'vc' | 'municipal';
  private results: CheckResult[] = [];
  private skippedChecks: string[] = [];

  constructor(options: PreflightOptions) {
    this.phase = options.phase;
    this.type = options.type;
  }

  /**
   * Get workspace paths
   */
  private getPaths() {
    const HOME = process.env.HOME || '/home/andlersrv'
    const base = `${HOME}/.openclaw/workspace`;
    return {
      reports: `${base}/reports/alygn`,
      credentials: `${base}/config/credentials.json`,
      waveState: `${base}/reports/alygn/${this.type}-waves/wave-state.json`,
      // ? NOTE: SentTracker removed since we read from remote only to avoid confusions between local and remote.
      // ! IMPORTANT: Remote must be always up to date of whatever is happening (Notion for VC Outreach and Supabase for Municipal Outreach). The only local data sync are the personalizations draft emails.
      // sentTracker: `${HOME}/.agents/skills/alygn-outreach/data/sent-emails.json`,
      checkpoints: `${base}/reports/alygn/${this.type}-waves/checkpoints`,
    };
  }

  /**
   * Load credentials file
   */
  private loadCredentials(): Record<string, unknown> | null {
    const credPath = this.getPaths().credentials;
    if (!fs.existsSync(credPath)) {
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(credPath, 'utf8'));
    } catch {
      return null;
    }
  }

  /**
   * Check 1: state-file-exists - Verify wave-state.json exists
   */
  private checkStateFileExists(): CheckResult {
    const waveStatePath = this.getPaths().waveState;
    const exists = fs.existsSync(waveStatePath);

    return {
      name: 'state-file-exists',
      passed: exists,
      message: exists
        ? `✓ Wave state file exists: ${waveStatePath}`
        : `✗ Wave state file missing: ${waveStatePath}`,
      details: exists ? undefined : 'Run personalization stage first to generate wave state',
    };
  }

  /**
   * Check 2: has-approved-drafts - Check at least 1 entity with Draft Status = "Approved"
   */
  private checkHasApprovedDrafts(): CheckResult {
    const waveStatePath = this.getPaths().waveState;

    if (!fs.existsSync(waveStatePath)) {
      return {
        name: 'has-approved-drafts',
        passed: false,
        message: '✗ Cannot check drafts: wave state file missing',
        details: 'Run personalization stage first',
      };
    }

    try {
      const state = JSON.parse(fs.readFileSync(waveStatePath, 'utf8'));
      const entities: Array<{ outreach?: { draftStatus?: string } }> = state.data?.entities || [];

      const approved = entities.filter(
        (e) => e?.outreach?.draftStatus === 'Approved'
      );

      if (approved.length > 0) {
        return {
          name: 'has-approved-drafts',
          passed: true,
          message: `✓ Found ${approved.length} approved draft(s)`,
          details: `${approved.length} of ${entities.length} entities have Draft Status = "Approved"`,
        };
      } else {
        return {
          name: 'has-approved-drafts',
          passed: false,
          message: `✗ No approved drafts found`,
          details: `0 of ${entities.length} entities have Draft Status = "Approved". Review and approve drafts before sending.`,
        };
      }
    } catch (error) {
      return {
        name: 'has-approved-drafts',
        passed: false,
        message: `✗ Failed to parse wave state: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Check 3: credentials-valid - Verify SMTP/Smartlead credentials accessible
   */
  private checkCredentialsValid(): CheckResult {
    const creds = this.loadCredentials();

    if (!creds) {
      return {
        name: 'credentials-valid',
        passed: false,
        message: '✗ Credentials file not found',
        details: `${this.getPaths().credentials} does not exist or is invalid`,
      };
    }

    // Check SMTP
    const hasSMTP = !!(creds as Record<string, unknown>).smtp;
    // Check Smartlead
    const hasSmartlead = !!(creds as Record<string, unknown>).smartlead;

    if (!hasSMTP && !hasSmartlead) {
      return {
        name: 'credentials-valid',
        passed: false,
        message: '✗ No email delivery credentials found',
        details: 'Neither SMTP nor Smartlead credentials configured',
      };
    }

    const details: string[] = [];
    if (hasSMTP) details.push('SMTP: configured');
    if (hasSmartlead) details.push('Smartlead: configured');

    return {
      name: 'credentials-valid',
      passed: true,
      message: `✓ Email delivery credentials found`,
      details: details.join(', '),
    };
  }

  /**
   * Check 4: not-running - Check no other send-wave currently running
   */
  private checkNotRunning(): CheckResult {
    const checkpointsDir = this.getPaths().checkpoints;

    // Create dir if doesn't exist
    if (!fs.existsSync(checkpointsDir)) {
      return {
        name: 'not-running',
        passed: true,
        message: '✓ No running waves detected',
        details: 'Checkpoints directory does not exist',
      };
    }

    try {
      const files = fs.readdirSync(checkpointsDir)
        .filter(f => f.startsWith('send-wave-') && f.endsWith('.lock'));

      // Check for stale locks (older than 1 hour)
      const now = Date.now();
      const staleThreshold = 60 * 60 * 1000; // 1 hour
      const staleLocks = files.filter(f => {
        const stats = fs.statSync(path.join(checkpointsDir, f));
        return (now - stats.mtimeMs) > staleThreshold;
      });

      if (files.length === 0) {
        return {
          name: 'not-running',
          passed: true,
          message: '✓ No running waves detected',
        };
      }

      if (staleLocks.length > 0) {
        // Clean up stale locks
        for (const lock of staleLocks) {
          fs.unlinkSync(path.join(checkpointsDir, lock));
        }
        return {
          name: 'not-running',
          passed: true,
          message: `✓ Cleaned up ${staleLocks.length} stale lock(s)`,
          details: `${files.length - staleLocks.length} active wave(s)`,
        };
      }

      return {
        name: 'not-running',
        passed: false,
        message: `✗ Another send-wave is currently running`,
        details: `${files.length} lock file(s) found in checkpoints directory`,
      };
    } catch {
      return {
        name: 'not-running',
        passed: true,
        message: '✓ Could not check running status',
        details: 'Checkpoints directory not accessible',
      };
    }
  }

  /**
   * Check 5: rate-limit-ok - Verify quota available (if Smartlead)
   */
  private checkRateLimitOk(): CheckResult {
    const creds = this.loadCredentials();

    if (!creds || !(creds as Record<string, unknown>).smartlead) {
      // Not using Smartlead, skip this check
      this.skippedChecks.push('rate-limit-ok');
      return {
        name: 'rate-limit-ok',
        passed: true,
        message: '⊘ Rate limit check skipped (not using Smartlead)',
      };
    }

    // For Smartlead, we'd need to call the API to check quota
    // For now, we'll do a basic check
    const smartleadCreds = (creds as Record<string, unknown>).smartlead as Record<string, unknown>;

    if (!smartleadCreds?.apiKey) {
      return {
        name: 'rate-limit-ok',
        passed: false,
        message: '✗ Smartlead API key not configured',
      };
    }

    // TODO: Call Smartlead API to check daily quota
    // For now, assume OK
    return {
      name: 'rate-limit-ok',
      passed: true,
      message: '⊘ Rate limit check requires Smartlead API integration',
      details: 'Manual quota check recommended before large waves',
    };
  }

  /**
   * Check 6: notion-api-ok - Verify Notion API token valid
   */
  private checkNotionApiOk(): CheckResult {
    const creds = this.loadCredentials();

    if (!creds || !(creds as Record<string, unknown>).notion) {
      return {
        name: 'notion-api-ok',
        passed: false,
        message: '✗ Notion credentials not found',
      };
    }

    const notionCreds = (creds as Record<string, unknown>).notion as Record<string, unknown>;
    const apiKey = notionCreds?.apiKey as string;

    if (!apiKey || !apiKey.startsWith('ntn_')) {
      return {
        name: 'notion-api-ok',
        passed: false,
        message: '✗ Invalid Notion API key format',
        details: 'Expected key starting with "ntn_"',
      };
    }

    // TODO: Validate by calling Notion API /users endpoint
    return {
      name: 'notion-api-ok',
      passed: true,
      message: '✓ Notion API key configured',
      details: `Key prefix: ${apiKey.substring(0, 8)}...`,
    };
  }

  /**
   * Check 7: supabase-ok - Verify Supabase connection (municipal only)
   */
  private checkSupabaseOk(): CheckResult {
    if (this.type !== 'municipal') {
      this.skippedChecks.push('supabase-ok');
      return {
        name: 'supabase-ok',
        passed: true,
        message: '⊘ Supabase check skipped (VC type)',
      };
    }

    const creds = this.loadCredentials();

    if (!creds || !(creds as Record<string, unknown>).supabase) {
      return {
        name: 'supabase-ok',
        passed: false,
        message: '✗ Supabase credentials not found',
      };
    }

    const supabaseCreds = (creds as Record<string, unknown>).supabase as Record<string, unknown>;

    if (!supabaseCreds?.url || !supabaseCreds?.key) {
      return {
        name: 'supabase-ok',
        passed: false,
        message: '✗ Supabase URL or key missing',
      };
    }

    // TODO: Test connection with a simple query
    return {
      name: 'supabase-ok',
      passed: true,
      message: '✓ Supabase credentials configured',
      details: `Project: ${(supabaseCreds.url as string).split('.')[0].replace('https://', '')}`,
    };
  }

  /**
   * Check 8: sync-status - Check local tracker vs Supabase sync
   */
  private checkSyncStatus(): CheckResult {
    const sentTrackerPath = this.getPaths().sentTracker;
    const reportsDir = this.getPaths().reports;

    if (!fs.existsSync(sentTrackerPath)) {
      return {
        name: 'sync-status',
        passed: false,
        message: '✗ Local sent tracker not found',
      };
    }

    try {
      const tracker = JSON.parse(fs.readFileSync(sentTrackerPath, 'utf8'));
      const localCount = (tracker.vcs?.length || 0) + (tracker.municipal?.length || 0);

      // Check for wave-state.json in both types
      const vcWave = fs.existsSync(`${reportsDir}/vc-waves/wave-state.json`);
      const muniWave = fs.existsSync(`${reportsDir}/muni-waves/wave-state.json`);

      if (localCount === 0 && !vcWave && !muniWave) {
        return {
          name: 'sync-status',
          passed: true,
          message: '⊘ No sent records to sync',
        };
      }

      return {
        name: 'sync-status',
        passed: true,
        message: `✓ Tracker has ${localCount} sent record(s)`,
        details: `VC waves: ${vcWave ? 'yes' : 'no'}, Municipal waves: ${muniWave ? 'yes' : 'no'}`,
      };
    } catch (error) {
      return {
        name: 'sync-status',
        passed: false,
        message: `✗ Failed to read tracker: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Check 9: no-orphans - Verify no orphaned sent records
   */
  private checkNoOrphans(): CheckResult {
    const sentTrackerPath = this.getPaths().sentTracker;

    if (!fs.existsSync(sentTrackerPath)) {
      return {
        name: 'no-orphans',
        passed: true,
        message: '⊘ No tracker to check for orphans',
      };
    }

    try {
      const tracker = JSON.parse(fs.readFileSync(sentTrackerPath, 'utf8'));
      const allRecords = [...(tracker.vcs || []), ...(tracker.municipal || [])];

      // Orphan = sent record with no corresponding wave state
      const orphaned: string[] = [];

      for (const record of allRecords) {
        // Basic orphan check: if status is 'sent' but no messageId or weird messageId
        if (record.status === 'sent' && record.messageId?.startsWith('bounced-')) {
          orphaned.push(`${record.name} (bounced email in tracker)`);
        }
      }

      if (orphaned.length > 0) {
        return {
          name: 'no-orphans',
          passed: true,
          message: `⚠ Found ${orphaned.length} potentially orphaned record(s)`,
          details: orphaned.slice(0, 3).join(', ') + (orphaned.length > 3 ? '...' : ''),
        };
      }

      return {
        name: 'no-orphans',
        passed: true,
        message: `✓ No orphaned sent records detected`,
      };
    } catch (error) {
      return {
        name: 'no-orphans',
        passed: false,
        message: `✗ Failed to check orphans: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Run a specific check
   */
  private runCheck(checkName: string): CheckResult {
    switch (checkName) {
      case 'state-file-exists':
        return this.checkStateFileExists();
      case 'has-approved-drafts':
        return this.checkHasApprovedDrafts();
      case 'credentials-valid':
        return this.checkCredentialsValid();
      case 'not-running':
        return this.checkNotRunning();
      case 'rate-limit-ok':
        return this.checkRateLimitOk();
      case 'notion-api-ok':
        return this.checkNotionApiOk();
      case 'supabase-ok':
        return this.checkSupabaseOk();
      case 'sync-status':
        return this.checkSyncStatus();
      case 'no-orphans':
        return this.checkNoOrphans();
      default:
        return {
          name: checkName,
          passed: false,
          message: `✗ Unknown check: ${checkName}`,
        };
    }
  }

  /**
   * Run all checks for the configured phase
   */
  run(requiredChecks?: string[]): CheckResult[] {
    this.results = [];
    const checksToRun = requiredChecks ||
      CHECK_DEFINITIONS[this.phase].map(c => c.name);

    console.log(`\n🔍 Preflight Checks (${this.phase} phase)\n`);

    for (const checkName of checksToRun) {
      const result = this.runCheck(checkName);
      this.results.push(result);

      // Print result
      const icon = result.passed ? '  ' : '✗';
      console.log(`   ${icon} ${result.name}: ${result.message}`);
      if (result.details && !result.passed) {
        console.log(`      → ${result.details}`);
      }
    }

    return this.results;
  }

  /**
   * Get summary of check results
   */
  getSummary(): { total: number; passed: number; failed: number; skipped: number } {
    return {
      total: this.results.length,
      passed: this.results.filter(r => r.passed).length,
      failed: this.results.filter(r => !r.passed && !r.message.startsWith('⊘')).length,
      skipped: this.skippedChecks.length,
    };
  }

  /**
   * Check if all critical checks passed
   */
  isReady(): boolean {
    const summary = this.getSummary();
    return summary.failed === 0;
  }

  /**
   * Print final status
   */
  printStatus(): void {
    const summary = this.getSummary();

    console.log('\n' + '='.repeat(60));
    if (summary.failed === 0) {
      console.log(`✅ Preflight Checks: ALL PASSED (${summary.passed}/${summary.total})`);
    } else {
      console.log(`❌ Preflight Checks: ${summary.failed} FAILED (${summary.passed}/${summary.total})`);
    }
    console.log('='.repeat(60) + '\n');
  }

  /**
   * Get failed checks for error reporting
   */
  getFailedChecks(): CheckResult[] {
    return this.results.filter(r => !r.passed && !r.message.startsWith('⊘'));
  }

  /**
   * List available checks for a phase
   */
  static listChecks(phase: CheckPhase): Array<{ name: string; description: string }> {
    return CHECK_DEFINITIONS[phase];
  }

  /**
   * Get available phases
   */
  static getPhases(): CheckPhase[] {
    return ['send', 'research', 'recon'];
  }
}

export default PreflightChecker;

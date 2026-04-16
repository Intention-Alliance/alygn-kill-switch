/**
 * TemplateTester — F-082
 * Test templates against expected outputs without sending email.
 *
 * Provides assertion-style methods for template testing:
 *   assertRender    — render and compare exact output
 *   assertContains   — check output contains substring
 *   assertNotContains — check output doesn't contain substring
 *   assertNoErrors   — render without throwing
 *
 * All operations are synchronous pure functions.
 * No external dependencies.
 */

import { TemplateEngine } from './TemplateEngine';
import type { TemplateData } from './TemplateEngine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TestStatus = 'pass' | 'fail';

export interface TestAssertion {
  name: string;
  status: TestStatus;
  message: string;
  detail?: string;
}

export interface TestReport {
  template: string;
  total: number;
  passed: number;
  failed: number;
  assertions: TestAssertion[];
  /** Elapsed time in ms for all assertions combined. */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// TemplateTester class
// ---------------------------------------------------------------------------

export class TemplateTester {
  private engine: TemplateEngine;

  constructor(engine?: TemplateEngine) {
    this.engine = engine ?? new TemplateEngine();
  }

  /**
   * Render a template with data and compare against expected output.
   * Passes if the rendered string exactly equals `expected`.
   */
  assertRender(
    template: string,
    data: TemplateData,
    expected: string,
    name?: string,
  ): TestAssertion {
    const label = name ?? `assertRender`;
    try {
      const rendered = this.engine.render(template, data);
      if (rendered === expected) {
        return { name: label, status: 'pass', message: 'Rendered output matches expected' };
      }
      return {
        name: label,
        status: 'fail',
        message: 'Rendered output does not match expected',
        detail: `Expected:\n${expected}\n\nGot:\n${rendered}`,
      };
    } catch (err) {
      return {
        name: label,
        status: 'fail',
        message: `Render threw: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Render a template with data and check that the output contains `substring`.
   */
  assertContains(
    template: string,
    data: TemplateData,
    substring: string,
    name?: string,
  ): TestAssertion {
    const label = name ?? `assertContains("${substring}")`;
    try {
      const rendered = this.engine.render(template, data);
      if (rendered.includes(substring)) {
        return { name: label, status: 'pass', message: `Output contains "${substring}"` };
      }
      return {
        name: label,
        status: 'fail',
        message: `Output does not contain "${substring}"`,
        detail: `Rendered:\n${rendered.substring(0, 500)}`,
      };
    } catch (err) {
      return {
        name: label,
        status: 'fail',
        message: `Render threw: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Render a template with data and check that the output does NOT contain `substring`.
   */
  assertNotContains(
    template: string,
    data: TemplateData,
    substring: string,
    name?: string,
  ): TestAssertion {
    const label = name ?? `assertNotContains("${substring}")`;
    try {
      const rendered = this.engine.render(template, data);
      if (!rendered.includes(substring)) {
        return { name: label, status: 'pass', message: `Output does not contain "${substring}"` };
      }
      return {
        name: label,
        status: 'fail',
        message: `Output unexpectedly contains "${substring}"`,
        detail: `Rendered:\n${rendered.substring(0, 500)}`,
      };
    } catch (err) {
      return {
        name: label,
        status: 'fail',
        message: `Render threw: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Render a template with data and verify it doesn't throw.
   * Passes if rendering completes without error.
   */
  assertNoErrors(
    template: string,
    data: TemplateData,
    name?: string,
  ): TestAssertion {
    const label = name ?? `assertNoErrors`;
    try {
      this.engine.render(template, data);
      return { name: label, status: 'pass', message: 'Render completed without errors' };
    } catch (err) {
      return {
        name: label,
        status: 'fail',
        message: `Render threw: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Run multiple test cases against a template and produce a TestReport.
   * Each test case is a function that receives the tester and returns a TestAssertion.
   *
   * @example
   * ```ts
   * const report = tester.test('Hello {{name}}!', [
   *   (t) => t.assertRender('Hello {{name}}!', { name: 'World' }, 'Hello World!'),
   *   (t) => t.assertContains('Hello {{name}}!', { name: 'World' }, 'World'),
   * ]);
   * ```
   */
  test(
    template: string,
    testCases: Array<(tester: TemplateTester) => TestAssertion>,
  ): TestReport {
    const start = performance.now();
    const assertions: TestAssertion[] = [];

    for (const testCase of testCases) {
      const assertion = testCase(this);
      assertions.push(assertion);
    }

    const elapsed = performance.now() - start;
    const passed = assertions.filter((a) => a.status === 'pass').length;
    const failed = assertions.filter((a) => a.status === 'fail').length;

    return {
      template: template.substring(0, 100) + (template.length > 100 ? '...' : ''),
      total: assertions.length,
      passed,
      failed,
      assertions,
      durationMs: Math.round(elapsed * 100) / 100,
    };
  }

  /** Get the underlying TemplateEngine. */
  getEngine(): TemplateEngine {
    return this.engine;
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Format a TestReport into a readable string for logging. */
export function formatTestReport(report: TestReport): string {
  const lines: string[] = [];
  lines.push(`Template: "${report.template}"`);
  lines.push(`Results: ${report.passed}/${report.total} passed (${report.failed} failed)`);
  lines.push(`Duration: ${report.durationMs}ms`);
  lines.push('');

  for (const assertion of report.assertions) {
    const icon = assertion.status === 'pass' ? '✅' : '❌';
    lines.push(`${icon} ${assertion.name}: ${assertion.message}`);
    if (assertion.detail) {
      for (const line of assertion.detail.split('\n')) {
        lines.push(`   ${line}`);
      }
    }
  }

  return lines.join('\n');
}

export default TemplateTester;
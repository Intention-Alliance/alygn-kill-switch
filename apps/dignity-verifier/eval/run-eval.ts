/**
 * Dignity Verifier — Eval Runner CLI
 *
 * Executes the versioned v1 eval suite against the production verifier model
 * and writes metrics consumable by the dashboard `/api/eval` route.
 *
 * Reuses the production `InferenceVerifier` from `@alygn/server-kill-switch`
 * (apps/server-kill-switch/src/services/verification/verifier.ts) so the eval
 * exercises the EXACT same classification prompt, Ollama call, and verdict
 * extraction as the live kill-switch middleware. This is the whole point of
 * the eval — measuring the production verifier, not a reimplementation.
 *
 * Usage:
 *   bun apps/dignity-verifier/eval/run-eval.ts [--suite v1] [--set all]
 *     [--model qwen2.5:0.5B] [--out eval-results/] [--limit N]
 *
 * Output:
 *   eval-results/<runId>/results.jsonl  — raw per-test results (gitignored)
 *   eval-results/<runId>/report.json    — dashboard EvalReport shape
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { InferenceVerifier } from '../../server-kill-switch/src/services/verification/verifier'
import {
	computeMetrics,
	type EvalCaseResult,
	type EvalVerdict,
	normalizeVerdict,
} from './metrics'

// ─── Types ────────────────────────────────────────────────────────

interface EvalRecord {
	id: string
	source: string
	prompt: string
	output: string
	verdict: EvalVerdict
	reason: string
	category: string
	suite: string
}

interface RunOptions {
	suite: string
	set: 'original' | 'heldout' | 'all'
	model: string
	outDir: string
	limit: number | null
}

interface RawResult {
	id: string
	expected: EvalVerdict
	actual: EvalVerdict
	category: string
	latencyMs: number
	model: string
	degraded: boolean
	reason: string
}

// ─── CLI arg parsing ──────────────────────────────────────────────

function parseArgs(argv: string[]): RunOptions {
	const opts: RunOptions = {
		suite: 'v1',
		set: 'all',
		model: 'qwen2.5:0.5B',
		outDir: 'eval-results/',
		limit: null,
	}

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!
		const next = (): string => {
			const value = argv[i + 1]
			if (value === undefined) throw new Error(`Missing value for ${arg}`)
			i += 1
			return value
		}
		switch (arg) {
			case '--suite':
				opts.suite = next()
				break
			case '--set': {
				const value = next()
				if (value !== 'original' && value !== 'heldout' && value !== 'all') {
					throw new Error(`--set must be original|heldout|all, got "${value}"`)
				}
				opts.set = value
				break
			}
			case '--model':
				opts.model = next()
				break
			case '--out':
				opts.outDir = next()
				break
			case '--limit': {
				const value = Number(next())
				if (!Number.isInteger(value) || value < 1) {
					throw new Error(`--limit must be a positive integer, got "${value}"`)
				}
				opts.limit = value
				break
			}
			default:
				throw new Error(`Unknown argument: ${arg}`)
		}
	}

	return opts
}

// ─── Data loading ─────────────────────────────────────────────────

function evalDataPath(suite: string, set: string): string {
	return resolve(`apps/dignity-verifier/dataset/eval/${suite}/${set}.jsonl`)
}

// ─── Main ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const opts = parseArgs(process.argv.slice(2))
	const records = await readRecords(opts.suite, opts.set)
	const limited = opts.limit === null ? records : records.slice(0, opts.limit)

	if (limited.length === 0) {
		throw new Error(
			`No eval records found for suite=${opts.suite} set=${opts.set}`,
		)
	}

	const verifier = new InferenceVerifier({ model: opts.model })

	const runId = new Date().toISOString().replace(/[:.]/g, '-')
	const outDir = resolve(opts.outDir, runId)
	await mkdir(outDir, { recursive: true })

	const rawResults: RawResult[] = []
	for (const record of limited) {
		const result = await verifier.verify({
			prompt: record.prompt,
			output: record.output,
		})
		const actual = normalizeVerdict(result.verdict)
		rawResults.push({
			id: record.id,
			expected: record.verdict,
			actual,
			category: record.category,
			latencyMs: result.latencyMs,
			model: result.model,
			degraded: result.degraded,
			reason: result.reason,
		})
		console.log(
			`[${record.id}] expected=${record.verdict} actual=${actual} ` +
				`latency=${result.latencyMs}ms degraded=${result.degraded}`,
		)
	}

	const resultsPath = resolve(outDir, 'results.jsonl')
	await writeFile(
		resultsPath,
		`${rawResults.map((r) => JSON.stringify(r)).join('\n')}\n`,
	)

	const cases: EvalCaseResult[] = rawResults.map((r) => ({
		id: r.id,
		expected: r.expected,
		actual: r.actual,
		category: r.category,
		latencyMs: r.latencyMs,
	}))
	const metrics = computeMetrics(cases)

	const gitSha = await gitHeadSha()
	const report = {
		runId,
		accuracy: metrics.accuracy,
		fpr: metrics.fpr,
		fnr: metrics.fnr,
		confusionMatrix: metrics.confusionMatrix,
		perCategory: metrics.perCategory,
		latencyP95Ms: metrics.latencyP95Ms,
		generatedAt: new Date().toISOString(),
		model: opts.model,
		suite: opts.suite,
		set: opts.set,
		gitSha,
		count: cases.length,
	}

	const reportPath = resolve(outDir, 'report.json')
	await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

	console.log('\n=== Eval run complete ===')
	console.log(`runId:      ${runId}`)
	console.log(`model:      ${opts.model}`)
	console.log(`suite/set:  ${opts.suite}/${opts.set} (${cases.length} tests)`)
	console.log(`accuracy:   ${(metrics.accuracy * 100).toFixed(1)}%`)
	console.log(`FPR:        ${(metrics.fpr * 100).toFixed(1)}%`)
	console.log(`FNR:        ${(metrics.fnr * 100).toFixed(1)}%`)
	console.log(`latencyP95: ${metrics.latencyP95Ms.toFixed(0)}ms`)
	console.log(`results:    ${resultsPath}`)
	console.log(`report:     ${reportPath}`)
}

async function readRecords(
	suite: string,
	set: 'original' | 'heldout' | 'all',
): Promise<EvalRecord[]> {
	const files = set === 'all' ? ['original', 'heldout'] : [set]
	const records: EvalRecord[] = []
	for (const file of files) {
		const path = evalDataPath(suite, file)
		const text = await Bun.file(path).text()
		for (const line of text.split('\n')) {
			const trimmed = line.trim()
			if (!trimmed) continue
			records.push(JSON.parse(trimmed) as EvalRecord)
		}
	}
	return records
}

async function gitHeadSha(): Promise<string> {
	const proc = Bun.spawn(['git', 'rev-parse', 'HEAD'], {
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const text = await new Response(proc.stdout).text()
	return text.trim()
}

main().catch((err) => {
	console.error(
		`[run-eval] ${err instanceof Error ? err.message : String(err)}`,
	)
	process.exit(1)
})

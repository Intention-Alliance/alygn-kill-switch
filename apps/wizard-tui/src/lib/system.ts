/**
 * System detection + preflight report (WS-C wizard-tui lib).
 *
 * Pure logic — no clack imports. Detects OS, kernel, arch, systemd, bun,
 * redis, git, port usage and hardware, then produces a preflight report
 * with remediation hints for anything that would block an install.
 */

import { execFile } from 'node:child_process'
import { cpus, hostname, totalmem } from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type IssueSeverity = 'error' | 'warn'

export interface PreflightIssue {
	severity: IssueSeverity
	message: string
	remediation: string
}

export interface SystemReport {
	os: string
	kernel: string
	arch: string
	systemd: boolean
	bun: { installed: boolean; version: string | null } | null
	redis: { installed: boolean; running: boolean } | null
	git: { installed: boolean; version: string | null } | null
	ports: { 3000: 'free' | 'used'; 3001: 'free' | 'used' }
	hardware: { cpu: string; cores: number; memMb: number }
	issues: PreflightIssue[]
}

/** Run a command, returning trimmed stdout or null on any failure. */
async function tryCommand(cmd: string, args: string[]): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync(cmd, args, { timeout: 5_000 })
		return stdout.trim()
	} catch {
		return null
	}
}

/** Check whether a command exists on PATH. */
async function commandExists(cmd: string): Promise<boolean> {
	return (await tryCommand('sh', ['-c', `command -v ${cmd}`])) !== null
}

/** Check whether a TCP port is currently bound (listening). */
async function portInUse(port: number): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync('sh', [
			'-c',
			`ss -ltn 2>/dev/null | awk '{print $4}' | grep -E '[:.]${port}$' | grep -q .`,
		])
		return stdout.trim() !== ''
	} catch {
		// grep exits 1 when nothing matched — that means the port is free.
		return false
	}
}

/** Detect whether systemd (PID 1) is running. */
async function detectSystemd(): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync('sh', [
			'-c',
			'test -d /run/systemd/system && echo yes || echo no',
		])
		return stdout.trim() === 'yes'
	} catch {
		return false
	}
}

/** Detect whether a redis server is running on localhost:6379. */
async function detectRedisRunning(): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync('sh', [
			'-c',
			'redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null || true',
		])
		return stdout.trim() === 'PONG'
	} catch {
		return false
	}
}

/**
 * Full system detection. Never throws — every probe degrades to a
 * conservative value and the report carries remediation hints instead.
 */
export async function detectSystem(): Promise<SystemReport> {
	const [os, kernel, arch, bunVersion, gitVersion, redisInstalled, systemd] = await Promise.all([
		tryCommand('uname', ['-s']),
		tryCommand('uname', ['-r']),
		tryCommand('uname', ['-m']),
		tryCommand('bun', ['--version']),
		tryCommand('git', ['--version']),
		commandExists('redis-server'),
		detectSystemd(),
	])

	const [port3000, port3001, redisRunning] = await Promise.all([
		portInUse(3000),
		portInUse(3001),
		detectRedisRunning(),
	])

	const cores = cpus().length
	const memMb = Math.round(totalmem() / (1024 * 1024))
	const cpu = cpus()[0]?.model.trim() ?? 'unknown'

	const issues: PreflightIssue[] = []

	if (!systemd) {
		issues.push({
			severity: 'error',
			message: 'systemd is not running (PID 1).',
			remediation:
				'The wizard installs systemd units. Run on a systemd-based distro (or use --dry-run to validate config only).',
		})
	}

	if (bunVersion === null) {
		issues.push({
			severity: 'error',
			message: 'bun is not installed or not on PATH.',
			remediation: 'Install bun: curl -fsSL https://bun.sh/install | bash, then re-run the wizard.',
		})
	}

	if (!redisInstalled) {
		issues.push({
			severity: 'error',
			message: 'redis-server is not installed.',
			remediation:
				'Install redis (e.g. apt install redis-server / pacman -S redis), then start it.',
		})
	} else if (!redisRunning) {
		issues.push({
			severity: 'warn',
			message: 'redis-server is installed but not running on 127.0.0.1:6379.',
			remediation: 'Start redis (systemctl start redis / redis-server --daemonize yes).',
		})
	}

	if (gitVersion === null) {
		issues.push({
			severity: 'warn',
			message: 'git is not installed.',
			remediation: 'Install git — required for source installs and version checks.',
		})
	}

	if (port3000) {
		issues.push({
			severity: 'error',
			message: 'Port 3000 is already in use.',
			remediation:
				'Free port 3000 (the kill-switch server binds it) or stop the conflicting service.',
		})
	}

	if (port3001) {
		issues.push({
			severity: 'warn',
			message: 'Port 3001 is already in use.',
			remediation:
				'Port 3001 is the default web-regulator origin — free it or change WEBAUTHN_ORIGIN.',
		})
	}

	return {
		os: os ?? 'unknown',
		kernel: kernel ?? 'unknown',
		arch: arch ?? 'unknown',
		systemd,
		bun: { installed: bunVersion !== null, version: bunVersion },
		redis: { installed: redisInstalled, running: redisRunning },
		git: { installed: gitVersion !== null, version: gitVersion },
		ports: { 3000: port3000 ? 'used' : 'free', 3001: port3001 ? 'used' : 'free' },
		hardware: { cpu, cores, memMb },
		issues,
	}
}

/** True when the report contains at least one error-severity issue. */
export function hasBlockingIssues(report: SystemReport): boolean {
	return report.issues.some((issue) => issue.severity === 'error')
}

/** Convenience: current hostname (used by config defaults). */
export function currentHostname(): string {
	return hostname()
}

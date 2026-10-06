/**
 * Decision shadow log + training-readiness gate (KS-LAYA §B.5).
 *
 * While `decision.laya.ready` is false, Laya runs in shadow mode alongside the
 * live provider: it logs what it WOULD have decided but never serves traffic.
 * The readiness flip is proposable only at >=95% agreement over >=200 shadow
 * decisions — computed from this table. Only Andler flips the gate (not an
 * agent); this module only produces the evidence.
 *
 * Never throws: a shadow-log write failure must not affect the live decision.
 */

import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../db/index'
import { decisionShadowLog } from '../../db/schema'

/** Shadow agreement threshold before the readiness flip is even proposable. */
export const SHADOW_AGREEMENT_THRESHOLD = 0.95
/** Minimum shadow decisions before the readiness flip is even proposable. */
export const SHADOW_MIN_DECISIONS = 200

export interface ShadowRecord {
	machineId: string
	provider: string
	servedBy: string
	shadowLabel: string
	shadowAction: string
	shadowScore: number
	shadowConfidence: number
	shadowDegraded: boolean
	liveLabel: string
	reasons: string[]
}

export interface ShadowReadiness {
	provider: string
	total: number
	agreed: number
	/** agreed / total, or 0 when there are no decisions. */
	agreement: number
	/** True when total >= SHADOW_MIN_DECISIONS and agreement >= threshold. */
	thresholdMet: boolean
	requiredDecisions: number
	requiredAgreement: number
}

/** Append one shadow decision. Never throws. */
export async function recordShadowDecision(rec: ShadowRecord): Promise<void> {
	try {
		await db.insert(decisionShadowLog).values({
			id: crypto.randomUUID(),
			machineId: rec.machineId,
			provider: rec.provider,
			servedBy: rec.servedBy,
			shadowLabel: rec.shadowLabel,
			shadowAction: rec.shadowAction,
			shadowScore: rec.shadowScore,
			shadowConfidence: rec.shadowConfidence,
			shadowDegraded: rec.shadowDegraded,
			liveLabel: rec.liveLabel,
			agreed: rec.shadowLabel === rec.liveLabel,
			reasons: JSON.stringify(rec.reasons),
		})
	} catch (err: any) {
		console.warn(
			`[decision-shadow] failed to record shadow decision: ${err?.message ?? err}`,
		)
	}
}

/**
 * Compute shadow agreement for a provider. Never throws — returns a
 * zeroed, non-proposable readiness on any read failure.
 */
export async function getShadowReadiness(
	provider = 'laya',
): Promise<ShadowReadiness> {
	const empty: ShadowReadiness = {
		provider,
		total: 0,
		agreed: 0,
		agreement: 0,
		thresholdMet: false,
		requiredDecisions: SHADOW_MIN_DECISIONS,
		requiredAgreement: SHADOW_AGREEMENT_THRESHOLD,
	}
	try {
		const rows = await db
			.select({
				total: sql<number>`count(*)`,
				agreed: sql<number>`sum(case when ${decisionShadowLog.agreed} then 1 else 0 end)`,
			})
			.from(decisionShadowLog)
			.where(eq(decisionShadowLog.provider, provider))
			.get()

		const total = Number(rows?.total ?? 0)
		const agreed = Number(rows?.agreed ?? 0)
		const agreement = total > 0 ? agreed / total : 0
		return {
			provider,
			total,
			agreed,
			agreement,
			thresholdMet:
				total >= SHADOW_MIN_DECISIONS &&
				agreement >= SHADOW_AGREEMENT_THRESHOLD,
			requiredDecisions: SHADOW_MIN_DECISIONS,
			requiredAgreement: SHADOW_AGREEMENT_THRESHOLD,
		}
	} catch (err: any) {
		console.warn(
			`[decision-shadow] readiness read failed: ${err?.message ?? err}`,
		)
		return empty
	}
}

/** Count shadow decisions for a machine (diagnostics). Never throws. */
export async function countShadowDecisions(
	machineId: string,
	provider = 'laya',
): Promise<number> {
	try {
		const row = await db
			.select({ total: sql<number>`count(*)` })
			.from(decisionShadowLog)
			.where(
				and(
					eq(decisionShadowLog.provider, provider),
					eq(decisionShadowLog.machineId, machineId),
				),
			)
			.get()
		return Number(row?.total ?? 0)
	} catch {
		return 0
	}
}

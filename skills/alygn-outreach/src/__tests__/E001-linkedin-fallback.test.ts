/**
 * E-001 LinkedIn Fallback E2E tests (andler-ops#160)
 *
 * Validates the 5-tier fallback chain end-to-end:
 *   1. direct email → email
 *   2. generic email + contact form → form
 *   3. generic email + LinkedIn → linkedin
 *   4. no email + LinkedIn → linkedin
 *   5. no email, no website → manual
 *
 * Also validates the curated 25-note LinkedIn library:
 *   - notes are ≤300 chars (LinkedIn connection-request limit)
 *   - curated note lookup by partner name
 *   - generic generator fallback for unknown partners
 */
import { describe, it, expect } from 'vitest'
import {
	determineOutreachMethod,
	generateLinkedInNote,
	handleContactFallback,
	isGenericEmail,
} from '../strategies/sending/ContactFallbackStrategy'
import {
	LINKEDIN_CONNECTION_NOTES,
	findConnectionNote,
	validateNoteLengths,
} from '../strategies/sending/linkedin-notes'
import { VCEntity } from '../entities/VCEntity'

function makeEntity(overrides: {
	email?: string | null
	website?: string | null
	contactFormUrl?: string | null
	linkedInUrl?: string | null
	partnerName?: string
	partnerLinkedInUrl?: string
}): VCEntity {
	return new VCEntity({
		id: 'vc_test_1',
		name: 'Test VC Fund',
		email: overrides.email ?? null,
		website: overrides.website ?? 'https://testvc.example',
		typeData: {
			contactFormUrl: overrides.contactFormUrl ?? null,
			linkedInUrl: overrides.linkedInUrl ?? null,
			partners: overrides.partnerName
				? [
						{
							name: overrides.partnerName,
							title: 'Partner',
							linkedInUrl: overrides.partnerLinkedInUrl ?? null,
						},
					]
				: [],
		},
	})
}

describe('E-001: determineOutreachMethod — 5-tier fallback chain', () => {
	it('tier 1: direct partner email → email', () => {
		const entity = makeEntity({ email: 'jane@testvc.example' })
		expect(determineOutreachMethod(entity)).toEqual({
			method: 'email',
			reason: 'Direct partner email available',
		})
	})

	it('tier 2: generic email + contact form → form', () => {
		const entity = makeEntity({
			email: 'info@testvc.example',
			contactFormUrl: 'https://testvc.example/contact',
		})
		expect(determineOutreachMethod(entity).method).toBe('form')
	})

	it('tier 3: generic email + LinkedIn → linkedin', () => {
		const entity = makeEntity({
			email: 'contact@testvc.example',
			partnerName: 'Jane Partner',
			partnerLinkedInUrl: 'https://linkedin.com/in/janepartner',
		})
		expect(determineOutreachMethod(entity).method).toBe('linkedin')
	})

	it('tier 4: no email + LinkedIn → linkedin', () => {
		const entity = makeEntity({
			email: null,
			partnerName: 'Jane Partner',
			partnerLinkedInUrl: 'https://linkedin.com/in/janepartner',
		})
		expect(determineOutreachMethod(entity).method).toBe('linkedin')
	})

	it('tier 5: no email, no website → manual', () => {
		const entity = makeEntity({ email: null, website: null })
		expect(determineOutreachMethod(entity).method).toBe('manual')
	})

	it('isGenericEmail detects info@/contact@/hello@ prefixes', () => {
		expect(isGenericEmail('info@testvc.example')).toBe(true)
		expect(isGenericEmail('contact@testvc.example')).toBe(true)
		expect(isGenericEmail('jane@testvc.example')).toBe(false)
	})
})

describe('E-001: handleContactFallback — end-to-end', () => {
	it('linkedin fallback returns note + message templates', async () => {
		const entity = makeEntity({
			email: null,
			partnerName: 'Jane Partner',
			partnerLinkedInUrl: 'https://linkedin.com/in/janepartner',
		})
		const result = await handleContactFallback(entity)
		expect(result.method).toBe('linkedin')
		expect(result.success).toBe(true)
		expect(result.details?.linkedInUrl).toBe(
			'https://linkedin.com/in/janepartner',
		)
		expect(result.details?.linkedInNote).toBeTruthy()
		expect(result.details?.linkedInMessage).toContain('ALYGN')
		expect(result.details?.linkedInNote!.length).toBeLessThanOrEqual(300)
	})

	it('manual fallback includes step-by-step instructions', async () => {
		const entity = makeEntity({ email: null, website: null })
		const result = await handleContactFallback(entity)
		expect(result.method).toBe('manual')
		expect(result.details?.manualInstructions).toContain('MANUAL OUTREACH NEEDED')
	})
})

describe('E-001: curated LinkedIn connection notes (25-note library)', () => {
	it('library has 25 curated notes', () => {
		expect(LINKEDIN_CONNECTION_NOTES).toHaveLength(25)
	})

	it('all notes respect the 300-char LinkedIn limit', () => {
		expect(validateNoteLengths()).toEqual([])
	})

	it('findConnectionNote matches by full name', () => {
		const note = findConnectionNote('Jared Kaplan')
		expect(note).not.toBeNull()
		expect(note!.organization).toBe('Anthropic')
		expect(note!.note.length).toBeLessThanOrEqual(300)
	})

	it('findConnectionNote is case/whitespace tolerant', () => {
		expect(findConnectionNote('  jared kaplan ')).not.toBeNull()
	})

	it('findConnectionNote returns null for unknown names', () => {
		expect(findConnectionNote('Nobody Known')).toBeNull()
	})

	it('generateLinkedInNote uses curated note for known partner', () => {
		const entity = makeEntity({
			email: null,
			partnerName: 'Jared Kaplan',
			partnerLinkedInUrl: 'https://linkedin.com/in/jaredkaplan',
		})
		const note = generateLinkedInNote(entity)
		expect(note).toContain('Anthropic')
		expect(note.length).toBeLessThanOrEqual(300)
	})

	it('generateLinkedInNote falls back to generic for unknown partner', () => {
		const entity = makeEntity({
			email: null,
			partnerName: 'Someone Else',
		})
		const note = generateLinkedInNote(entity)
		expect(note).toContain('ALYGN')
		expect(note.length).toBeLessThanOrEqual(300)
	})
})

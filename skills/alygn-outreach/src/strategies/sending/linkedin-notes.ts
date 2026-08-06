/**
 * LinkedIn Connection Notes — curated 25-note library (andler-ops#160)
 *
 * Governance-first positioning per docs/alygn/linkedin-connection-notes-review.md.
 * Each note is ≤300 chars (LinkedIn connection-request limit) and
 * personalized for the target person. Keyed by person name so the
 * fallback pipeline can look up a curated note before falling back
 * to the generic generator.
 *
 * Source: docs/alygn/linkedin-connection-notes-review.md (2026-04 review,
 * rewritten to Alygn's governance-institution positioning).
 */
export interface LinkedInConnectionNote {
  person: string
  organization: string
  title: string
  note: string
}

export const LINKEDIN_CONNECTION_NOTES: LinkedInConnectionNote[] = [
  {
    person: 'Jared Kaplan',
    organization: 'Anthropic',
    title: 'Chief Science Officer',
    note: "Alygn is building governance infrastructure for AI coordination between labs, operators, and regulators. There's direct overlap with Anthropic's responsible scaling work. Would value a brief conversation.",
  },
  {
    person: 'Jack Clark',
    organization: 'Anthropic',
    title: 'Co-founder, Frontier Red Team',
    note: 'Alygn is an independent AI governance institution building coordination infrastructure. We need adversarial perspectives to stress-test our oversight frameworks. Your frontier red team work is exactly the lens we need. Would love to connect.',
  },
  {
    person: 'Chris Olah',
    organization: 'Anthropic',
    title: 'Interpretability Research Lead',
    note: 'Alygn builds governance infrastructure for AI oversight. Interpretability is key to anticipatory governance, not just reactive monitoring. Your work is directly relevant to making accountability mechanisms credible. Would value your perspective.',
  },
  {
    person: 'Sandhini Agarwal',
    organization: 'OpenAI',
    title: 'Chair, Safety Advisory Group',
    note: "Alygn is an independent AI governance institution producing third-party validated readiness assessments. Given your role at the Safety Advisory Group, I'd welcome a conversation about what credible external oversight requires.",
  },
  {
    person: 'Matt Knight',
    organization: 'OpenAI',
    title: 'Head of Security',
    note: 'Alygn builds governance infrastructure for AI oversight and is selecting security partners for our institutional readiness program. There\'s real overlap between security verification and governance accountability. Worth a conversation?',
  },
  {
    person: 'Jakub Pachocki',
    organization: 'OpenAI',
    title: 'Chief Scientist',
    note: 'Alygn is building governance infrastructure for AI coordination. We\'d value your perspective on where governance mechanisms need to be stronger than voluntary commitments. Running a structured program with select lab partners.',
  },
  {
    person: 'Anca Dragan',
    organization: 'Google DeepMind',
    title: 'Head, AGI Safety and Alignment',
    note: "Alygn is an independent AI governance institution building coordination infrastructure for frontier labs. Given your AGI safety work, I'd welcome your perspective on what makes governance mechanisms credible rather than performative.",
  },
  {
    person: 'Rohin Shah',
    organization: 'Google DeepMind',
    title: 'AGI Safety and Alignment Lead',
    note: 'Alygn builds governance infrastructure. The alignment problem and the coordination problem are more connected than the literature acknowledges — alignment without institutional coordination isn\'t sufficient. Would value your perspective.',
  },
  {
    person: 'Pushmeet Kohli',
    organization: 'Google DeepMind',
    title: 'VP Research, Science and Strategic Initiatives',
    note: "You founded DeepMind's Safe and Reliable AI team. Alygn is an independent governance institution facing the same verification challenge from the oversight side. Running a structured program — would love to connect.",
  },
  {
    person: 'Igor Babuschkin',
    organization: 'xAI',
    title: 'Chief Engineer',
    note: 'Alygn builds governance infrastructure for AI oversight. Your engineering depth across DeepMind, OpenAI, and xAI is exactly the perspective we need on what makes governance technically credible vs. aspirational. Worth a call?',
  },
  {
    person: 'Dan Hendrycks',
    organization: 'Center for AI Safety',
    title: 'Safety Adviser / Director',
    note: 'Alygn is an independent governance institution building oversight frameworks evaluated against serious threat models, not optimistic ones. Your work at CAIS is the right frame. Would welcome your involvement.',
  },
  {
    person: 'Greg Yang',
    organization: 'xAI',
    title: 'Research Lead',
    note: 'Alygn builds governance infrastructure. The behavioral signature problem — what reliably signals conditions warranting intervention — is partly theoretical. Would value your perspective on making governance anticipatory, not reactive.',
  },
  {
    person: 'Yann LeCun',
    organization: 'Meta AI',
    title: 'Chief AI Scientist',
    note: 'Setting aside the safety debate — governance mechanisms are an operational and regulatory reality regardless. Where do you see the hard problems in making oversight credible without stifling innovation? I\'d value that conversation.',
  },
  {
    person: 'Ahmad Al-Dahle',
    organization: 'Meta AI',
    title: 'VP Generative AI',
    note: 'Alygn runs a governance readiness program. The operational question matters: can oversight mechanisms be reliable without disrupting normal development? Worth discussing how governance and operational velocity coexist.',
  },
  {
    person: 'Manohar Paluri',
    organization: 'Meta AI',
    title: 'VP, Llama Development',
    note: "The governance problem is structurally different for open-weight models. Centralized oversight isn't feasible — institutional coordination at the infrastructure layer may be. Alygn is building toward that. Would value your perspective.",
  },
  {
    person: 'Jensen Huang',
    organization: 'NVIDIA',
    title: 'CEO and Co-founder',
    note: 'Frontier AI runs on NVIDIA hardware. Governance infrastructure needs hardware-level validation to be credible. Alygn runs a governance readiness program and would welcome a conversation about institutional partnership.',
  },
  {
    person: 'Bill Dally',
    organization: 'NVIDIA',
    title: 'Chief Scientist',
    note: 'Alygn builds governance infrastructure that requires hardware-level verification — TEEs, DPU-level attestation. Would value your perspective on what\'s achievable on Blackwell for credible oversight, and exploring a partnership.',
  },
  {
    person: 'Ian Buck',
    organization: 'NVIDIA',
    title: 'VP Accelerated Computing',
    note: 'Alygn develops governance verification mechanisms that operate at the accelerated computing layer. Validating oversight requires real hardware under real workloads. Would welcome a conversation about institutional partnership.',
  },
  {
    person: 'Rev Lebaredian',
    organization: 'NVIDIA',
    title: 'VP Omniverse and Simulation',
    note: 'Validating governance infrastructure requires simulating the failure conditions that would trigger intervention without running them in production. Your simulation work is directly relevant. Worth connecting.',
  },
  {
    person: 'Manuvir Das',
    organization: 'NVIDIA',
    title: 'VP Enterprise Computing',
    note: 'Enterprise AI deployments need validated governance infrastructure for regulatory and liability reasons. Alygn is building that institutional readiness program and NVIDIA partnership makes sense. Would welcome a conversation.',
  },
  {
    person: 'Yoshua Bengio',
    organization: 'Mila',
    title: 'Scientific Director',
    note: 'Alygn is an independent AI governance institution. Your leadership on AI safety and your calls for institutional coordination align with the governance infrastructure we are building. Would value a conversation.',
  },
  {
    person: 'Dario Amodei',
    organization: 'Anthropic',
    title: 'CEO',
    note: 'Alygn is building governance infrastructure for AI coordination between labs, operators, and regulators. There\'s direct overlap with Anthropic\'s responsible scaling work. Would value a brief conversation.',
  },
  {
    person: 'Sam Altman',
    organization: 'OpenAI',
    title: 'CEO',
    note: 'Alygn is an independent AI governance institution producing third-party validated readiness assessments. Given OpenAI\'s leadership position, I\'d welcome a conversation about what credible external oversight requires.',
  },
  {
    person: 'Demis Hassabis',
    organization: 'Google DeepMind',
    title: 'CEO',
    note: 'Alygn is an independent AI governance institution building coordination infrastructure for frontier labs. Given DeepMind\'s AGI safety leadership, I\'d welcome your perspective on credible governance mechanisms.',
  },
  {
    person: 'Elon Musk',
    organization: 'xAI',
    title: 'CEO',
    note: 'Alygn builds governance infrastructure for AI oversight. Given xAI\'s focus on truth-seeking AI, I\'d welcome a conversation about what makes governance technically credible vs. aspirational.',
  },
]

/**
 * Look up a curated connection note for a person by name.
 * Falls back to null so callers can use the generic generator.
 */
export function findConnectionNote(personName: string): LinkedInConnectionNote | null {
  if (!personName) return null
  const normalized = personName.trim().toLowerCase()
  return (
    LINKEDIN_CONNECTION_NOTES.find(
      (n) => n.person.toLowerCase() === normalized,
    ) ?? null
  )
}

/**
 * All curated notes must respect LinkedIn's 300-char connection limit.
 */
export function validateNoteLengths(): string[] {
  return LINKEDIN_CONNECTION_NOTES.filter((n) => n.note.length > 300).map(
    (n) => `${n.person}: ${n.note.length}/300`,
  )
}

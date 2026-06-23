/**
 * Job Filter Engine — Tiered Stack Match Scoring
 *
 * Two-tier scoring reflecting Andler's real stack:
 *   Primary:   JS/TS ecosystem (professional) — MUST_HAVE at least one
 *   Secondary: Blockchain/Solidity/Rust (AI-assisted reading)
 *
 * Scoring (0-100):
 *   Base   = 55 pts (passing MUST_HAVE)
 *   Each primary keyword        = +8  (capped at 25 bonus)
 *   Each primaryBonus keyword   = +5  (capped at 25 bonus)
 *   Each secondary keyword      = +4  (capped at 16 bonus)
 *   Min score to pass = 60
 *
 * Region filtering (added 2026-06-23 by Andler's request, Discord thread):
 *   - The original `isRemote(location)` only checked the title-level `location`
 *     field. Listings on arc.dev, web3.career, and wellfound routinely say
 *     "Remote" or "Worldwide" in the title, then bury "US/EU/UK only" or
 *     "Relocation to San Francisco" in the body description. The morning's
 *     22-job shortlist had 0 rejected for "notRemote" because the filter
 *     never read the description.
 *   - Now: `regionStrictMode` (default ON) reads BOTH location AND description
 *     for a deny-list of regional clauses. Jobs that pass the location check
 *     but trip the body-text deny list get a `region: excluded` reason and
 *     are moved into the `excludedRegion` list (not the main reject counters)
 *     so Andler can audit what got cut.
 *   - Override: pass `--no-region-strict` to `job-automation.js` to restore
 *     the old "title only" behavior. There is no plan to remove this option.
 */

import { loadConfig, log } from "./scrapers/scraper-base.js";

// ─── region deny-list (case-insensitive substring match) ────────────────────

const REGION_DENY_PATTERNS = [
  // US-only
  /\bus[\s-]?based\b/i,
  /\b(us|u\.s\.|usa|u\.s\.a\.?)\s*only\b/i,
  /\bunited\s+states\s+only\b/i,
  /\bmust\s+(be\s+)?(located|reside|live|work)\s+in\s+(the\s+)?(us|u\.s\.|usa|united\s+states)\b/i,
  /\b(us|u\.s\.|usa)[\s/]+(eu|europe|uk|canada|latam|emea)\s+only\b/i,
  /\b(united\s+states|us)[\s/]+(europe|eu|uk|canada)\b/i,

  // Specific US states / cities used as requirement (not just HQ)
  /\brelocation\s+to\s+(san\s+francisco|new\s+york|seattle|austin|boston|los\s+angeles)\b/i,
  /\b(onsite|on[\s-]?site)\s+(in|at)\s+(san\s+francisco|new\s+york|seattle|austin|boston)\b/i,
  /\bsan\s+francisco\s+(or|and)\s+(relocation|remote)\b/i,

  // PST / EST overlap as a hard requirement (not just preference)
  /\b(overlap|must\s+overlap)\s+(with\s+)?(pst|pacific|pdt|est|eastern|edt)\b/i,
  /\b(pst|pdt|pacific)\s+(overlap|hours)\s+(required|mandatory)\b/i,

  // Hybrid/onsite (description often says "hybrid" only in body)
  /\b(hybrid\s+in|hybrid\s+role|in[\s-]?office\s+(role|position)|onsite\s+role|onsite\s+position)\b/i,
  /\b(office[\s-]?based|in[\s-]?person)\s+(role|position|only)\b/i,

  // Generic regional restrictions
  /\b(latam|emea|apac|na[\s-]?only|north\s+america\s+only)\b/i,
  /\b(costa\s+rica\s+is\s+not|outside\s+of\s+(us|usa|europe|eu))\b/i,
  // Title-encoded region markers (arc.dev pattern: "(FT-LATAM/CANADA)", "FT - US")
  // These appear in the title with no body text describing the constraint.
  // The allow-override list below rescues "FT-WW" / "Worldwide" listings.
  /\(\s*ft\s*[-/]\s*(latam|latin\s+america|emea|na|us|usa|uk|eu|europe|canada|apac)\b/i,
  /\(\s*(latam|latin\s+america|emea|na|us|usa|uk|eu|europe|canada|apac)\s*[-/]\s*(latam|latin\s+america|emea|na|us|usa|uk|eu|europe|canada|apac)\s*\)/i,
  /\bft\s*[-/]\s*(latam|latin\s+america|emea|na|us|usa|uk|eu|europe|canada|apac|us[\s-]?based)\b/i,
  /\bpt\s*[-/]\s*(latam|latin\s+america|emea|na|us|usa|uk|eu|europe|canada|apac|us[\s-]?based)\b/i,
];

/**
 * Soft positive overrides — patterns that, if matched, indicate the job
 * is genuinely remote-from-anywhere even if a deny pattern also fired
 * (e.g. "(FT-LATAM/CANADA or WW)" is a worldwide-remote role that also lists
 * one acceptable region). Be conservative: only unambiguous "worldwide
 * anywhere" signals belong on this list.
 */
const REGION_ALLOW_OVERRIDE_PATTERNS = [
  /\b(ft[\s-]?ww|pt[\s-]?ww|worldwide|anywhere|global\s+remote|work\s+from\s+anywhere)\b/i,
  /\b(open\s+to\s+(?:candidates|applicants)\s+(?:in|across|from)\s+(?:anywhere|all\s+countries|any\s+country))\b/i,
];

/**
 * Title+body region classifier.
 * Returns { ok: true } if the job looks like real remote-from-anywhere,
 * or { ok: false, reason: string, pattern: string } if a deny pattern matched.
 *
 * In b2b_mode (default false), deny patterns don't reject — they FLAG the job
 * as B2B-viable (ok:true, b2b_viable:true, reason:...). B2B-viable means:
 *   - The company is in a specific region (US, EU, etc.) that excludes W-2
 *     direct hire
 *   - BUT it can be served via Andler's CR S.A. as a B2B contractor
 *     (W-8BEN-E invoicing) or via an EOR (Deel, Remote.com, Oyster)
 *   - So it's a real lead, just needs a different application framing
 *
 * The downstream filter (filterJobs) emits a `b2b_viable: true` flag on the
 * passed job and routes the same record to the audit log under
 * `excludedRegion` (so Andler can still see what was originally flagged) but
 * ALSO appends it to `filtered` (so it shows up in the shortlist).
 *
 * @param {string} title       listing title (arc.dev encodes region in title)
 * @param {string} location    title-level location (e.g. "Remote (US, EU, UK)")
 * @param {string} description body text from the listing or detail page
 * @param {object} options     { strict, b2b_mode, denyPatterns, allowOverrides }
 */
function passesRegionCheck(title, location, description, options = {}) {
  const strict = options.strict !== false; // default ON
  if (!strict) return { ok: true, reason: "strict-mode-disabled" };

  const b2bMode = options.b2b_mode === true; // default OFF (safer)
  const denyPatterns = options.denyPatterns || REGION_DENY_PATTERNS;
  const allowPatterns = options.allowOverrides || REGION_ALLOW_OVERRIDE_PATTERNS;
  const text = `${title || ""} ${location || ""} ${description || ""}`.toLowerCase();

  // Allow-overrides win immediately — clear "FT-WW" / "Worldwide" signals
  // indicate the job is genuinely remote-from-anywhere regardless of the
  // title tag that listed acceptable regions. B2B-viable is false here.
  for (const pat of allowPatterns) {
    if (pat.test(text)) {
      return { ok: true, b2b_viable: false, reason: `region-allow: ${pat.source}` };
    }
  }

  for (const pat of denyPatterns) {
    if (pat.test(text)) {
      // In b2b_mode, deny patterns become FLAGS, not failures. The job is
      // a real lead under B2B-via-S.A. strategy; just needs different framing.
      if (b2bMode) {
        return {
          ok: true,
          b2b_viable: true,
          reason: `region-flag-b2b: ${pat.source}`,
          pattern: pat.source,
        };
      }
      return { ok: false, b2b_viable: false, reason: `region-deny: ${pat.source}`, pattern: pat.source };
    }
  }
  return { ok: true, b2b_viable: false };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function isRemote(location) {
  if (!location) return true;
  const loc = String(location).toLowerCase();

  // Explicit remote keywords — instant pass
  const cfg = loadConfig();
  const keywords = cfg.filters.locations || ["remote", "worldwide", "anywhere", "global", "distributed"];
  if (keywords.some((k) => loc.includes(k))) return true;

  // Explicit on-site office address signals — reject
  const officeSignals = /\b(ave|avenue|st\.?|street|blvd|boulevard|drive|rd\.?|road|suite|floor|fl\.?)\b/i;
  if (officeSignals.test(loc)) return false;

  // Explicit on-site / hybrid keywords — reject
  const onSiteSignals = /\b(on.site|in.office|hybrid|in.person)\b/i;
  if (onSiteSignals.test(loc)) return false;

  // Everything else ("United States", "San Francisco, CA", "New York", etc.)
  // → treat as remote. LinkedIn f_WT=2 already filters by remote-only.
  // City/State is just the company's HQ — not a requirement.
  return true;
}

function isRecent(postedDate, maxAgeDays) {
  if (!postedDate) return true;
  const d = new Date(postedDate);
  if (isNaN(d.getTime())) return true;
  return (Date.now() - d.getTime()) <= maxAgeDays * 86400000;
}

function meetsSalary(salary, minHourly, minYearly) {
  // Unknown salary → lenient (let stack scoring decide)
  if (!salary) return true;
  // Midpoint (now computed by normalizeSalary for ranges)
  if (salary.hourly != null && salary.hourly >= minHourly) return true;
  if (salary.yearly != null && salary.yearly >= minYearly) return true;
  // Also check max bounds: if upper end of range exceeds threshold, pass
  if (salary.hourlyMax != null && salary.hourlyMax >= minHourly) return true;
  if (salary.yearlyMax != null && salary.yearlyMax >= minYearly) return true;
  // Explicit but unparseable salary → lenient
  if (salary.hourly == null && salary.yearly == null) return true;
  return false;
}

// ─── keyword matching ──────────────────────────────────────────────────────

function matchInText(text, keywords) {
  const hits = [];
  for (const kw of keywords) {
    if (text.includes(kw)) hits.push(kw);
  }
  return hits;
}

// ─── tiered stack scoring ──────────────────────────────────────────────────

function calculateMatchScore(title, description) {
  const cfg = loadConfig();
  const s = cfg.stack;
  const text = `${title || ""} ${description || ""}`.toLowerCase();

  // 1. MUST_HAVE gate
  const requireList = s.matching?.requireAtLeastOneOf ?? s.primary;
  const hasRequired = requireList.some((kw) => text.includes(kw.toLowerCase()));

  if (s.matching?.requirePrimary && !hasRequired) {
    return {
      score: 0,
      matchedKeywords: [],
      primaryHits: [],
      primaryBonusHits: [],
      secondaryHits: [],
      passed: false,
      tier: "rejected",
      reason: "No JS/TS ecosystem keyword — role doesn't use primary stack",
    };
  }

  // 2. Count keyword hits per tier
  const primaryHits     = matchInText(text, s.primary);
  const primaryBonusHits = matchInText(text, s.primaryBonus);
  const secondaryHits   = matchInText(text, s.secondary);

  // 3. Compute weighted score (0-100)
  const caps = s.matching || {};
  const base = caps.baseScore ?? 55;
  const ptsPri    = caps.points?.primary      ?? 8;
  const ptsBonus  = caps.points?.primaryBonus ?? 5;
  const ptsSec    = caps.points?.secondary    ?? 4;
  const capPri    = caps.maxPrimaryBonusPoints ?? 25;
  const capSec    = caps.maxSecondaryPoints    ?? 16;

  let score = base;
  score += Math.min(primaryHits.length * ptsPri, capPri);
  score += Math.min(primaryBonusHits.length * ptsBonus, capPri);
  score += Math.min(secondaryHits.length * ptsSec, capSec);
  score = Math.min(score, 100);

  // 4. Determine tier
  const minScore = caps.minScore ?? 60;
  const passed = score >= minScore;

  let tier = "low";
  if (score >= 85) tier = "high";
  else if (score >= 70) tier = "medium";

  const matchedKeywords = [
    ...primaryHits,
    ...primaryBonusHits,
    ...secondaryHits,
  ];

  return {
    score,
    matchedKeywords,
    primaryHits,
    primaryBonusHits,
    secondaryHits,
    passed,
    tier,
    reason: passed
      ? null
      : `score ${score} < minimum ${minScore} — ${matchedKeywords.length ? "weak keyword match" : "no relevant keywords"}`,
  };
}

// ─── main filter function ──────────────────────────────────────────────────

export function filterJobs(rawJobs, tracker, options = {}) {
  const cfg = loadConfig();
  const { minHourly, minYearly } = cfg.salary;
  const { maxAgeDays, remoteOnly } = cfg.filters;
  const regionStrict = options.regionStrict !== false; // default ON
  const b2bMode = options.b2bMode === true; // default OFF (safer)

  log("info", `Filtering ${rawJobs.length} raw jobs (regionStrict=${regionStrict}, b2bMode=${b2bMode})`);

  const filtered = [];
  const excludedRegion = [];
  const b2bFlagged = []; // jobs that would be excluded in strict mode but pass in b2b mode
  let rejected = { noPrimary: 0, lowScore: 0, notRemote: 0, tooOld: 0, lowSalary: 0, duplicate: 0, regionDeny: 0 };

  for (const job of rawJobs) {
    // Duplicate check
    if (tracker?.isSeen(job.id)) { rejected.duplicate++; continue; }

    // Remote check
    if (remoteOnly && !isRemote(job.location)) { rejected.notRemote++; continue; }

    // Recency check
    if (!isRecent(job.postedDate, maxAgeDays)) { rejected.tooOld++; continue; }

    // Salary check
    if (!meetsSalary(job.salary, minHourly, minYearly)) { rejected.lowSalary++; continue; }

    // Region body-text deny list — runs after the cheap title-level
    // isRemote() check has passed, so we don't burn regexes on the obvious
    // rejects. A job that says "US-based" in the body but "Remote" in the
    // title (the worst offender pattern) lands here.
    //
    // In b2bMode, deny patterns FLIP the result: the job is allowed through
    // with `b2b_viable: true` and a record of which pattern flagged it. The
    // shortlist still gets the lead, but Andler sees the flag and applies
    // with a B2B/S.A. framing instead of an employee framing.
    const regionCheck = passesRegionCheck(job.title, job.location, job.description, {
      strict: regionStrict,
      b2b_mode: b2bMode,
    });
    if (!regionCheck.ok) {
      rejected.regionDeny++;
      excludedRegion.push({
        id: job.id,
        title: job.title,
        company: job.company,
        platform: job.platform,
        location: job.location,
        url: job.url,
        reason: regionCheck.reason,
        descriptionExcerpt: String(job.description || "").slice(0, 300),
      });
      continue;
    }

    // b2b_viable=true means the deny pattern fired but we let it through
    // (b2bMode is on). Record it in the b2bFlagged audit list so Andler
    // can see exactly which listings need a contractor pitch instead of
    // an employee pitch, and so the count is visible in the run log.
    if (regionCheck.b2b_viable) {
      b2bFlagged.push({
        id: job.id,
        title: job.title,
        company: job.company,
        platform: job.platform,
        location: job.location,
        url: job.url,
        reason: regionCheck.reason,
        descriptionExcerpt: String(job.description || "").slice(0, 300),
      });
    }

    // Tiered stack match
    const match = calculateMatchScore(job.title, job.description);
    if (!match.passed) {
      if (match.reason?.includes("JS/TS")) rejected.noPrimary++;
      else rejected.lowScore++;
      continue;
    }

    filtered.push({
      ...job,
      matchScore: match.score,
      matchTier: match.tier,
      matchedKeywords: match.matchedKeywords,
      primaryHits: match.primaryHits,
      primaryBonusHits: match.primaryBonusHits,
      secondaryHits: match.secondaryHits,
      b2b_viable: regionCheck.b2b_viable === true,
      b2b_reason: regionCheck.b2b_viable ? regionCheck.reason : null,
    });
  }

  // Sort: tier (high → medium → low) → score desc → date desc
  // Within a tier, B2B-viable jobs sort LAST (lower priority than clean WW
  // listings) but still ahead of the reject pile. The b2b_viable flag is
  // also surfaced so the topJobs JSON output can carry it.
  const tierRank = { high: 0, medium: 1, low: 2 };
  filtered.sort((a, b) => {
    const tDiff = (tierRank[a.matchTier] ?? 3) - (tierRank[b.matchTier] ?? 3);
    if (tDiff) return tDiff;
    // B2B-viable goes after clean listings within the same tier.
    if (!!a.b2b_viable !== !!b.b2b_viable) return a.b2b_viable ? 1 : -1;
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return new Date(b.postedDate || 0) - new Date(a.postedDate || 0);
  });

  log("info", `Filtered: ${filtered.length} passed (${filtered.filter(j=>j.matchTier==='high').length} high, ${filtered.filter(j=>j.matchTier==='medium').length} medium, ${filtered.filter(j=>j.matchTier==='low').length} low)`);
  log("info", `B2B-viable: ${filtered.filter(j => j.b2b_viable).length} of ${filtered.length} (need contractor pitch)`);
  log("info", `Rejected: ${JSON.stringify(rejected)}`);
  if (excludedRegion.length > 0) {
    log("info", `Region-excluded: ${excludedRegion.length} jobs (audit log: data/jobs/excluded-region.json)`);
  }

  return { filtered, excludedRegion, b2bFlagged, rejected };
}

export default filterJobs;

// ─── direct execution (pipe mode) ─────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  let data = "";
  process.stdin.on("data", (c) => (data += c));
  process.stdin.on("end", () => {
    const jobs = JSON.parse(data || "[]");
    const result = filterJobs(jobs, null);
    console.log(JSON.stringify(result, null, 2));
  });
}

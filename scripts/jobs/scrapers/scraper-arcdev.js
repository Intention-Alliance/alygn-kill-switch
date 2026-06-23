/**
 * Arc.dev Job Scraper
 * 
 * Scrapes the Arc.dev remote jobs listing page directly.
 * Arc.dev is a Next.js SSR app — all job data is embedded in __NEXT_DATA__ JSON.
 * The listing page at /remote-jobs?page=N returns jobs sorted by recency.
 * 
 * No need to scrape individual job pages — title, company, salary, tags, and
 * posted date are all in the listing page payload under props.pageProps.arcJobs.
 */

import { loadConfig, log, sleep, generateJobId, normalizeSalary, filterFreshOnly } from "./scraper-base.js";

const PLATFORM = "arcdev";
const LISTING_URL = "https://arc.dev/remote-jobs";
const MAX_PAGES = 3;

function extractNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

async function fetchListingPage(pageNum = 1) {
  try {
    const url = `${LISTING_URL}?page=${pageNum}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      log("warn", `[${PLATFORM}] Page ${pageNum}: HTTP ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    log("error", `[${PLATFORM}] Page ${pageNum} fetch failed`, { error: err.message });
    return null;
  }
}

function transformArcJob(arcJob) {
  try {
    if (!arcJob?.title || !arcJob?.urlString) return null;

    const title = arcJob.title;
    // Arc.dev obfuscates company names in __NEXT_DATA__ using {randomKey: <key>} pattern.
    // The actual company name is loaded client-side via a separate API call keyed by randomKey.
    // Without browser automation, we cannot resolve these keys to real company names.
    // Detail pages also redirect back to the listing page, so HTML scraping isn't possible.
    // Set companyUnknown: true so the pipeline knows this is expected.
    const company = null;
    const companyUnknown = true;
    // The detail-page URL pattern is /remote-jobs/details/{slug}-{id}
    // where {slug} = arcJob.urlString and {id} = arcJob.randomKey.
    // The old code emitted /remote-jobs/j/{slug} (no -id suffix), which
    // 302-redirects to the listing page — so the link was effectively a
    // dead-end to a job picker, not the job itself. Fixed 2026-06-23.
    const slug = arcJob.urlString;
    const id = arcJob.randomKey || "";
    const url = id
      ? `https://arc.dev/remote-jobs/details/${slug}-${id}`
      : `https://arc.dev/remote-jobs/details/${slug}`;

    // Salary — use hourly rate as primary since most Arc jobs list hourly
    let salaryRaw = null;
    const minH = arcJob.minHourlyRate, maxH = arcJob.maxHourlyRate;
    const minA = arcJob.minAnnualSalary, maxA = arcJob.maxAnnualSalary;
    if (minH && maxH) {
      salaryRaw = `$${minH}-$${maxH}/hr`;
    } else if (minA && maxA) {
      salaryRaw = `$${Math.round(minA / 1000)}K-$${Math.round(maxA / 1000)}K/yr`;
    } else if (minH) {
      salaryRaw = `From $${minH}/hr`;
    }

    // Location from required countries
    let location = "Remote";
    const countries = arcJob.requiredCountries;
    if (countries && countries.length > 0 && countries.length < 8) {
      location = `Remote (${countries.join(", ")})`;
    } else if (arcJob.timeZone && arcJob.timeZone !== "no-preference") {
      location = `Remote (${arcJob.timeZone})`;
    }

    // Posted date from unix timestamp
    let postedDate = null, postedRaw = null;
    if (arcJob.postedAt) {
      postedDate = new Date(arcJob.postedAt * 1000).toISOString();
      const days = Math.floor((Date.now() - arcJob.postedAt * 1000) / 86400000);
      postedRaw = days <= 0 ? "Today" : days === 1 ? "1 day ago" : `${days} days ago`;
    }

    // Tech tags from categories
    const tags = (arcJob.categories || []).map(c => c.name).slice(0, 10);

    // Description (limited from listing page — we'll get more if needed)
    const description = arcJob.description || arcJob.shortDescription || "";

    return {
      id: generateJobId(PLATFORM, url),
      platform: PLATFORM,
      title,
      company,
      salary: normalizeSalary(salaryRaw),
      postedDate,
      postedRaw,
      location,
      description: String(description).slice(0, 1500),
      tags,
      url,
      companyUnknown,
      scrapedAt: new Date().toISOString(),
      source: "listing-page",
    };
  } catch (err) {
    log("error", `[${PLATFORM}] Transform failed`, { error: err.message });
    return null;
  }
}

export default async function run() {
  const cfg = loadConfig();
  const pc = cfg.platforms[PLATFORM];
  if (!pc?.enabled) { log("info", `[${PLATFORM}] Disabled`); return []; }

  log("info", `[${PLATFORM}] Fetching listing pages (up to ${MAX_PAGES})...`);
  const seenIds = new Set();
  const jobs = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    await sleep(page > 1 ? 3000 : 0); // Rate limit between pages
    const html = await fetchListingPage(page);
    if (!html) continue;

    const nextData = extractNextData(html);
    if (!nextData) { log("warn", `[${PLATFORM}] Page ${page}: No __NEXT_DATA__ found`); continue; }

    // Jobs are under props.pageProps.arcJobs
    const arcJobs = nextData?.props?.pageProps?.arcJobs;
    if (!Array.isArray(arcJobs) || arcJobs.length === 0) {
      log("warn", `[${PLATFORM}] Page ${page}: No jobs in arcJobs array — trying alternate paths`);
      // Try alternate paths
      const altJobs = nextData?.props?.pageProps?.jobs
        || nextData?.props?.pageProps?.data?.jobs
        || nextData?.props?.pageProps?.jobList;
      if (altJobs && Array.isArray(altJobs)) {
        for (const j of altJobs) {
          const job = transformArcJob(j);
          if (job && !seenIds.has(job.id)) {
            seenIds.add(job.id);
            jobs.push(job);
          }
        }
        log("info", `[${PLATFORM}] Page ${page}: ${altJobs.length} jobs (alternate path)`);
        continue;
      }
      log("info", `[${PLATFORM}] Page ${page}: Empty — stop pagination`);
      break;
    }

    log("info", `[${PLATFORM}] Page ${page}: ${arcJobs.length} jobs`);
    for (const arcJob of arcJobs) {
      const job = transformArcJob(arcJob);
      if (job && !seenIds.has(job.id)) {
        seenIds.add(job.id);
        jobs.push(job);
        log("info", `[${PLATFORM}] ${job.title} @ ${job.company || "?"} — ${job.salary?.raw || "no salary"}`);
      }
    }
  }

  // Apply freshness filter
  const fresh = filterFreshOnly(jobs, cfg.filters?.maxAgeDays || 14);

  log("info", `[${PLATFORM}] Total: ${fresh.length} fresh jobs (from ${jobs.length} total)`);
  return fresh;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(j => console.log(JSON.stringify(j, null, 2))).catch(console.error);
}

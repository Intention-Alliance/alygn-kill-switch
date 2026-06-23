#!/usr/bin/env node
/**
 * Arc.dev Browser Scraper
 * Connects to the already-running Chrome browser (profile "local", CDP port 18802)
 * which is authenticated with arc.dev cookies. Extracts jobs + applied status.
 *
 * Architecture:
 *   Browser (Chrome, already running with auth) ⟵ puppeteer-core.connect() ⟵ this script
 *
 * This avoids the Cloudflare/obfuscation issues of the script scraper because
 * we're using the real browser with real auth cookies.
 */

import puppeteer from "puppeteer-core";
import { loadConfig, log, generateJobId, normalizeSalary, filterFreshOnly } from "./scraper-base.js";

const PLATFORM = "arcdev";
const _scraperCfg = loadConfig();
const CDP_HOST = _scraperCfg.browser?.host || "127.0.0.1";
const CDP_PORT = parseInt(process.env.CHROME_DEBUG_PORT || _scraperCfg.browser?.debugPort || 18801, 10);
const CDP_URL = `http://${CDP_HOST}:${CDP_PORT}`;
const BROWSE_URL = "https://arc.dev/dashboard/d/freelance-jobs/browse";
const APPLIED_URL = "https://arc.dev/dashboard/d/freelance-jobs/applied";

// Jobs Andler already applied to (from manual browser check)
const KNOWN_APPLIED_IDS = new Set(["omzig07q84", "oqhs5kjmqm", "os5tmc8v45", "osgar3q3n7"]);

async function getAppliedJobIds(page) {
  try {
    await page.goto(APPLIED_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForSelector('a[href*="verified-jobs"]', { timeout: 10000 });
    
    const applied = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="verified-jobs"]');
      return [...links]
        .map(a => {
          const href = a.getAttribute("href") || "";
          const match = href.match(/verified-jobs\/(\w+)/);
          return match ? match[1] : null;
        })
        .filter(Boolean);
    });
    
    log("info", `[${PLATFORM}] Found ${applied.length} applied jobs`);
    return new Set(applied);
  } catch (err) {
    log("warn", `[${PLATFORM}] Could not fetch applied jobs`, { error: err.message });
    return KNOWN_APPLIED_IDS; // Fall back to known list
  }
}

async function scrapeJobs(page, appliedIds) {
  await page.goto(BROWSE_URL, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForSelector('a[href*="verified-jobs"]', { timeout: 10000 });

  const jobs = await page.evaluate((appliedArr) => {
    const appliedSet = new Set(appliedArr);
    const results = [];
    
    // Arc.dev renders job cards with company logos (img alt=company name) and links
    const cards = document.querySelectorAll('[class*="job-card"], [class*="JobCard"], li a[href*="verified-jobs"]');
    
    // Better approach: find all job links and their surrounding context
    const jobLinks = document.querySelectorAll('a[href*="verified-jobs"][href*="tab=browse"]');
    
    for (const link of jobLinks) {
      const href = link.getAttribute("href") || "";
      const jobIdMatch = href.match(/verified-jobs\/(\w+)/);
      if (!jobIdMatch) continue;
      
      const jobId = jobIdMatch[1];
      const title = link.textContent.trim();
      if (!title || title.length < 5) continue;
      
      // Find the closest container with company/salary/seniority info
      const container = link.closest('li, div, [class*="card"]');
      const containerText = container ? container.textContent : "";
      
      // Extract seniority
      let seniority = "Mid-level";
      if (/\bSenior\b/i.test(containerText)) seniority = "Senior";
      else if (/\bMid-level\b/i.test(containerText)) seniority = "Mid-level";
      else if (/\bJunior\b/i.test(containerText)) seniority = "Junior";
      
      // Extract company from img alt text (Arc Exclusive = no company name)
      let company = null;
      const imgs = container ? container.querySelectorAll("img") : [];
      for (const img of imgs) {
        const alt = (img.getAttribute("alt") || "").trim();
        if (alt && alt !== "Arc Exclusive" && !alt.includes("logo") && alt.length > 2) {
          company = alt;
          break;
        }
      }
      
      // Extract salary: US$30 - 55/hr
      let salaryMin = null, salaryMax = null;
      const salaryMatch = containerText.match(/US\$(\d+)\s*-\s*(\d+)\s*\/\s*hr/);
      if (salaryMatch) {
        salaryMin = parseInt(salaryMatch[1]);
        salaryMax = parseInt(salaryMatch[2]);
      }
      
      // Extract timezone requirements
      let timezone = "";
      const tzMatch = containerText.match(/(?:Min\.\s*\d+\s*hr.*?(?:overlap|working).*?(?:Time|timezone)[^.]*)/i);
      if (tzMatch) timezone = tzMatch[0].trim();
      
      // Extract skills/tags
      const tags = [];
      // Look for skill badges in the card
      const badges = container ? container.querySelectorAll('[class*="badge"], [class*="tag"], [class*="skill"]') : [];
      for (const badge of badges) {
        const t = badge.textContent.trim();
        if (t && t.length < 30 && !t.includes("$") && !t.match(/^\d/)) tags.push(t);
      }
      
      // Also extract from full text for known skills
      const knownSkills = ["JavaScript", "TypeScript", "React", "Node.js", "Python", "AWS", "PostgreSQL", 
        "Next.js", "Rust", "Solidity", "Go", "Golang", "Docker", "Kubernetes", "GraphQL", "REST", "SQL",
        "MongoDB", "Redis", "Express", "Tailwind", "CSS", "HTML", "Vue", "Angular", "Svelte"];
      for (const s of knownSkills) {
        if (containerText.includes(s) && !tags.includes(s)) tags.push(s);
      }
      
      results.push({
        id: jobId,
        title,
        company,
        seniority,
        salaryMin,
        salaryMax,
        timezone,
        tags: tags.slice(0, 10),
        url: `https://arc.dev/dashboard/d/verified-jobs/${jobId}`,
        applied: appliedSet.has(jobId),
      });
    }
    
    return results;
  }, [...appliedIds]);

  return jobs;
}

export default async function run() {
  const cfg = loadConfig();
  const pc = cfg.platforms[PLATFORM];
  if (!pc?.enabled) { log("info", `[${PLATFORM}] Disabled`); return []; }

  log("info", `[${PLATFORM}] Connecting to browser at ${CDP_URL}...`);

  let browser;
  try {
    browser = await puppeteer.connect({ browserURL: CDP_URL, defaultViewport: null });
    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();
    
    // Step 1: Get applied job IDs
    const appliedIds = await getAppliedJobIds(page);
    
    // Step 2: Scrape jobs from browse page
    const rawJobs = await scrapeJobs(page, appliedIds);
    log("info", `[${PLATFORM}] Scraped ${rawJobs.length} jobs (${rawJobs.filter(j => j.applied).length} already applied)`);

    // Step 3: Convert to standard format
    const jobs = rawJobs
      .filter(j => !j.applied) // Don't re-suggest already-applied jobs
      .map(j => ({
        id: generateJobId(PLATFORM, j.url),
        platform: PLATFORM,
        title: j.title,
        company: j.company,
        salary: normalizeSalary(j.salaryMin && j.salaryMax 
          ? `$${j.salaryMin}-$${j.salaryMax}/hr` 
          : null),
        postedDate: null,
        location: j.timezone || "Remote",
        description: "",
        tags: j.tags,
        url: j.url,
        scrapedAt: new Date().toISOString(),
        source: "browser",
        seniority: j.seniority,
      }));

    const fresh = filterFreshOnly(jobs, cfg.filters?.maxAgeDays || 14);
    log("info", `[${PLATFORM}] Total: ${fresh.length} fresh (${rawJobs.filter(j => j.applied).length} skipped as applied, ${rawJobs.filter(j => !j.applied).length} new)`);
    
    await browser.disconnect();
    return fresh;

  } catch (err) {
    log("error", `[${PLATFORM}] Browser scraper failed`, { error: err.message });
    // Fall back to script scraper if browser unavailable
    log("info", `[${PLATFORM}] Falling back to script scraper`);
    try { await browser?.disconnect(); } catch {}
    const { default: scriptScraper } = await import("./scraper-arcdev.js");
    return scriptScraper();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(j => console.log(JSON.stringify(j, null, 2))).catch(console.error);
}

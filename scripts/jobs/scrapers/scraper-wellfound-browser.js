#!/usr/bin/env node
/**
 * Wellfound (AngelList) Browser Scraper
 * Uses authenticated Chrome browser to bypass Cloudflare. Extracts job listings
 * and applied status from the live authenticated session.
 */

import puppeteer from "puppeteer-core";
import { loadConfig, log, generateJobId, normalizeSalary, parsePostedDate, filterFreshOnly } from "./scraper-base.js";

const PLATFORM = "wellfound";
const _scraperCfg = loadConfig();
const CDP_HOST = _scraperCfg.browser?.host || "127.0.0.1";
const CDP_PORT = parseInt(process.env.CHROME_DEBUG_PORT || _scraperCfg.browser?.debugPort || 18801, 10);
const CDP_URL = `http://${CDP_HOST}:${CDP_PORT}`;
const JOBS_URL = "https://wellfound.com/jobs";
const APPLIED_URL = "https://wellfound.com/jobs/applications";

async function getAppliedJobs(page) {
  try {
    await page.goto(APPLIED_URL, { waitUntil: "networkidle2", timeout: 20000 });
    
    const applied = await page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll('a[href*="/jobs/applications/"]');
      for (const link of links) {
        const href = link.getAttribute("href") || "";
        const match = href.match(/applications\/(\d+)-(\d+)/);
        if (match) {
          const heading = link.querySelector('h3');
          const company = heading ? heading.textContent.trim() : "";
          const fullText = link.textContent.trim();
          results.push({ id: match[1] + "-" + match[2], company, title: fullText });
        }
      }
      return results;
    });
    
    log("info", `[${PLATFORM}] Found ${applied.length} applied jobs`);
    return applied;
  } catch (err) {
    log("warn", `[${PLATFORM}] Could not fetch applied jobs`, { error: err.message });
    return [];
  }
}

async function scrapeJobs(page) {
  await page.goto(JOBS_URL, { waitUntil: "networkidle2", timeout: 30000 });

  const jobs = await page.evaluate(() => {
    const results = [];
    
    // Wellfound renders job cards with company links and job links
    const jobLinks = document.querySelectorAll('a[href*="/jobs/"][href*="-"]');
    const seen = new Set();
    
    for (const link of jobLinks) {
      const href = link.getAttribute("href") || "";
      // Skip company links, only get job posting links
      if (!/\/jobs\/\d+/.test(href)) continue;
      if (href.includes("company")) continue;
      
      const jobIdMatch = href.match(/\/jobs\/(\d+)/);
      if (!jobIdMatch || seen.has(jobIdMatch[1])) continue;
      seen.add(jobIdMatch[1]);
      
      const fullText = link.textContent.trim();
      if (!fullText || fullText.length < 10) continue;
      
      // Parse the text which contains: "Title Remote only • Salary • Equity Posted X"
      const titleMatch = fullText.match(/^([^•]+?)(?:Remote|Onsite)/);
      const title = titleMatch ? titleMatch[1].trim() : fullText.split("•")[0].trim();
      
      // Salary
      const salaryMatch = fullText.match(/\$[\d,]+k?\s*[–-]\s*\$[\d,]+k?/i);
      const salary = salaryMatch ? salaryMatch[0] : null;
      
      // Equity
      const equityMatch = fullText.match(/([\d.]+\s*%?\s*[–-]\s*[\d.]+\s*%?\s*equity|No equity)/i);
      const equity = equityMatch ? equityMatch[0] : null;
      
      // Location
      const locationMatch = fullText.match(/(Remote only|Onsite or remote|Remote)\s*(?:•\s*Everywhere)?/i);
      const location = locationMatch ? locationMatch[0].trim() : "Remote";
      
      // Posted
      const postedMatch = fullText.match(/Posted\s+(.+?)(?:\s+icn_repost|\s*$)/i);
      const posted = postedMatch ? postedMatch[1].trim() : null;
      
      results.push({
        id: jobIdMatch[1],
        title,
        salary,
        equity,
        location,
        posted,
        url: `https://wellfound.com${href}`,
      });
    }
    
    return results;
  });

  // Enrich with company names from company links on same page
  const companyData = await page.evaluate(() => {
    const companies = {};
    const companyLinks = document.querySelectorAll('a[href*="/company/"]');
    for (const link of companyLinks) {
      const heading = link.querySelector('h2, h3, [class*="name"]');
      const name = heading ? heading.textContent.trim() : link.textContent.split("\n")[0].trim();
      if (name && name.length > 1 && name.length < 50) {
        const slug = (link.getAttribute("href") || "").split("/company/")[1]?.split("?")[0];
        if (slug) companies[slug] = name;
      }
    }
    return companies;
  });

  // Attach company names by finding the nearest company link in DOM order
  // Simplified: company name is often in the preceding company link card
  return jobs.map((j, i) => {
    const companyValues = Object.values(companyData);
    const company = companyValues[i] || null;
    return { ...j, company };
  });
}

export default async function run() {
  const cfg = loadConfig();
  const pc = cfg.platforms[PLATFORM];
  // Browser mode bypasses Cloudflare block — always attempt scraping
  // The config "enabled: false" was for script mode which is blocked by Cloudflare
  log("info", `[${PLATFORM}] Browser scraper — ignoring config enabled flag (auth bypasses Cloudflare)`);

  log("info", `[${PLATFORM}] Connecting to browser...`);

  let browser;
  try {
    browser = await puppeteer.connect({ browserURL: CDP_URL, defaultViewport: null });
    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    // Get applied jobs
    const applied = await getAppliedJobs(page);
    const appliedIds = new Set(applied.map(a => a.id));

    // Scrape
    const rawJobs = await scrapeJobs(page);
    
    const jobs = rawJobs
      .filter(j => !appliedIds.has(j.id))
      .map(j => ({
        id: generateJobId(PLATFORM, j.url),
        platform: PLATFORM,
        title: j.title,
        company: j.company,
        salary: normalizeSalary(j.salary),
        postedDate: parsePostedDate(j.posted)?.toISOString() || null,
        postedRaw: j.posted,
        location: j.location,
        description: "",
        tags: [],
        url: j.url,
        equity: j.equity,
        scrapedAt: new Date().toISOString(),
        source: "browser",
      }));

    log("info", `[${PLATFORM}] ${jobs.length} new jobs (${applied.length} applied skipped)`);
    await browser.disconnect();
    return jobs;

  } catch (err) {
    log("error", `[${PLATFORM}] Browser scraper failed`, { error: err.message });
    try { await browser?.disconnect(); } catch {}
    return [];
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(j => console.log(JSON.stringify(j, null, 2))).catch(console.error);
}

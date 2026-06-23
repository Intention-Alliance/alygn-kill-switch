#!/usr/bin/env node
/**
 * Gun.io Browser Scraper
 * Gun.io has a "Jobs" tab with matched opportunities visible to authenticated freelancers.
 * Extracts jobs + applied status via the authenticated Chrome session.
 */

import puppeteer from "puppeteer-core";
import { loadConfig, log, generateJobId, filterFreshOnly } from "./scraper-base.js";

const PLATFORM = "gunio";
const _scraperCfg = loadConfig();
const CDP_HOST = _scraperCfg.browser?.host || "127.0.0.1";
const CDP_PORT = parseInt(process.env.CHROME_DEBUG_PORT || _scraperCfg.browser?.debugPort || 18801, 10);
const CDP_URL = `http://${CDP_HOST}:${CDP_PORT}`;
const JOBS_URL = "https://app.gun.io/app/jobs/";
const APPLIED_URL = "https://app.gun.io/app/freelancer/applications/";

async function getAppliedJobs(page) {
  try {
    await page.goto(APPLIED_URL, { waitUntil: "networkidle2", timeout: 15000 });
    const text = await page.evaluate(() => document.body.textContent || "");
    // Gun.io says "You haven't applied to any jobs yet" when empty
    if (text.includes("haven't applied")) return [];
    
    // Otherwise extract job links
    const applied = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/app/jobs/"]');
      return [...links].map(a => {
        const href = a.getAttribute("href") || "";
        const match = href.match(/\/app\/jobs\/([\w-]+)/);
        return match ? match[1] : null;
      }).filter(Boolean);
    });
    return [...new Set(applied)];
  } catch {
    return [];
  }
}

async function scrapeJobs(page) {
  await page.goto(JOBS_URL, { waitUntil: "networkidle2", timeout: 30000 });

  const jobs = await page.evaluate(() => {
    const results = [];
    
    // Gun.io renders job cards with headings and links
    const jobLinks = document.querySelectorAll('a[href*="/app/jobs/"]');
    const seen = new Set();
    
    for (const link of jobLinks) {
      const href = link.getAttribute("href") || "";
      const jobIdMatch = href.match(/\/app\/jobs\/([\w-]+)/);
      if (!jobIdMatch || seen.has(jobIdMatch[1])) continue;
      seen.add(jobIdMatch[1]);
      
      const heading = link.querySelector('h2, h3, [class*="title"]');
      const title = heading ? heading.textContent.trim() : link.textContent.trim();
      if (!title || title.length < 3) continue;
      
      // Find parent container for additional info
      const container = link.closest('[class*="card"], [class*="job"], li, div');
      const containerText = container ? container.textContent : "";
      
      // Skills
      const skillsMatch = containerText.match(/Required\s*(.+?)(?:Hire Type|$)/is);
      let skills = [];
      if (skillsMatch) {
        skills = skillsMatch[1].split(/[,\n•]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 40);
      } else {
        // Try list items after "Required" heading
        const listItems = container ? container.querySelectorAll('li') : [];
        skills = [...listItems].map(li => li.textContent.trim()).filter(s => s && s.length < 40);
      }
      
      // Hire type
      const hireTypeMatch = containerText.match(/Hire Type\s*(Hourly Contract|Monthly Contract|Salary)\s*/i);
      const hireType = hireTypeMatch ? hireTypeMatch[1] : null;
      
      // Location restriction
      const fromMatch = containerText.match(/Freelancers from\s*(.+?)(?:\d+\s*hrs|\d+\s*hours|Posted)/i);
      const from = fromMatch ? fromMatch[1].trim() : null;
      
      // Time commitment
      const commitmentMatch = containerText.match(/(\d+\s*hrs?\s*\/\s*wk|Long-term Full-time)/i);
      const commitment = commitmentMatch ? commitmentMatch[0] : null;
      
      // Posted time
      const postedMatch = containerText.match(/Posted\s+(.+?)(?:\s*$)/i);
      const posted = postedMatch ? postedMatch[1].trim() : null;
      
      results.push({
        id: jobIdMatch[1],
        title,
        skills,
        hireType,
        from,
        commitment,
        posted,
        url: `https://app.gun.io/app/jobs/${jobIdMatch[1]}/`,
      });
    }
    
    return results;
  });

  return jobs;
}

export default async function run() {
  const cfg = loadConfig();
  const pc = cfg.platforms[PLATFORM];
  // Gun.io has 6 remote jobs visible when authenticated — always try scraping
  log("info", `[${PLATFORM}] Browser scraper — config enabled: ${pc?.enabled} — attempting anyway (has auth)`);

  log("info", `[${PLATFORM}] Connecting to browser...`);

  let browser;
  try {
    browser = await puppeteer.connect({ browserURL: CDP_URL, defaultViewport: null });
    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    const appliedIds = new Set(await getAppliedJobs(page) || []);
    const rawJobs = await scrapeJobs(page);

    const jobs = rawJobs
      .filter(j => !appliedIds.has(j.id))
      .map(j => ({
        id: generateJobId(PLATFORM, j.url),
        platform: PLATFORM,
        title: j.title,
        company: null, // Gun.io hides company until matched
        salary: null,
        postedDate: null,
        postedRaw: j.posted,
        location: j.from || "Remote",
        description: "",
        tags: j.skills,
        hireType: j.hireType,
        commitment: j.commitment,
        url: j.url,
        scrapedAt: new Date().toISOString(),
        source: "browser",
      }));

    log("info", `[${PLATFORM}] ${jobs.length} jobs (${rawJobs.length} total, ${appliedIds.size} applied)`);
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

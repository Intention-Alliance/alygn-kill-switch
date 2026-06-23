#!/usr/bin/env node
/**
 * Web3.Career Browser Scraper
 * Uses authenticated Chrome browser. The table has company names, salaries, locations, tags.
 * We filter for developer roles client-side to avoid non-dev jobs wasting pipeline time.
 */

import puppeteer from "puppeteer-core";
import { loadConfig, log, generateJobId, normalizeSalary, parsePostedDate, filterFreshOnly } from "./scraper-base.js";

const PLATFORM = "web3career";
const _scraperCfg = loadConfig();
const CDP_HOST = _scraperCfg.browser?.host || "127.0.0.1";
const CDP_PORT = parseInt(process.env.CHROME_DEBUG_PORT || _scraperCfg.browser?.debugPort || 18801, 10);
const CDP_URL = `http://${CDP_HOST}:${CDP_PORT}`;
const SEARCH_URL = "https://web3.career/?search=typescript&remote=true&sort=latest";

// Developer-relevant job tag categories
const DEV_TAGS = new Set([
  "typescript", "javascript", "react", "solidity", "rust", "engineer", "developer",
  "devops", "frontend", "front end", "backend", "back end", "full stack", "full-stack",
  "blockchain", "defi", "smart contract", "nft", "dao", "web3", "crypto",
  "infrastructure", "mobile", "software", "architect", "cto", "protocol",
  "data", "ai", "ml", "node", "ethereum", "solana", "evm",
]);

// Non-dev title patterns to skip (case-insensitive)
const SKIP_PATTERNS = [
  "legal counsel", "legal ", "general counsel",
  "sales representative", "sales manager", "sales executive", "sales lead", "institutional sales",
  "marketing manager", "marketing lead", "growth marketing", "marketing director",
  "recruiter", "talent sourcer", "talent acquisition", "hr ", "people ops", "people operations",
  "accountant", "accounting manager", "senior accountant", "bookkeeper", "auditor",
  "treasury manager", "treasury analyst", "treasury ",
  "community manager", "social media", "content writer", "copywriter", "technical writer",
  "customer support", "customer success", "customer service", "support engineer",
  "business development", "partnerships manager", "account executive",
  "compliance", "regulatory", "tax ",
  "trader", "trading", "quantitative",
  "admin", "assistant", "receptionist", "office manager",
  "product marketing", "product manager", "project manager", "program manager",
];

async function scrapeTable(page) {
  await page.goto(SEARCH_URL, { waitUntil: "networkidle2", timeout: 30000 });

  const jobs = await page.evaluate((skipPatterns, devTagsArr) => {
    const devTags = new Set(devTagsArr);
    const results = [];
    
    function shouldSkip(title) {
      const t = title.toLowerCase();
      return skipPatterns.some(p => t.includes(p));
    }
    
    // web3.career renders a table with rows
    const rows = document.querySelectorAll('table tbody tr, [class*="table"] [class*="row"], [role="row"]');
    
    for (const row of rows) {
      // Each row: [letter] [title link] [company link] [time] [location] [salary] [tags]
      const cells = row.querySelectorAll('td, [role="cell"]');
      if (cells.length < 4) continue;
      
      // Get title from first link with a heading
      const titleLink = row.querySelector('a h2, a h3, a[href*="/"][href*="-"]');
      const link = titleLink ? titleLink.closest('a') : row.querySelector('a[href*="/"][href*="-"]');
      if (!link) continue;
      
      const href = link.getAttribute("href") || "";
      const title = (titleLink || link).textContent.trim();
      if (!title || title.length < 5) continue;
      
      // Skip non-dev roles
      if (shouldSkip(title)) continue;
      
      // Get company: second link with company class or heading
      let company = null;
      const allLinks = row.querySelectorAll('a');
      for (const a of allLinks) {
        if (a === link) continue;
        const txt = a.textContent.trim();
        // Company names are typically not the job title and are short
        if (txt && txt !== title && txt.length < 60 && !txt.startsWith("$")) {
          company = txt;
          break;
        }
      }
      
      // Full row text for parsing
      const rowText = row.textContent || "";
      
      // Time posted
      const timeMatch = rowText.match(/(\d+[hmd]\s*ago|\d+\s*(?:hour|min|day|week|month)s?\s*ago)/i);
      const posted = timeMatch ? timeMatch[0] : null;
      
      // Location
      const locationCell = cells[cells.length - 3] || cells[Math.floor(cells.length / 2)];
      let location = locationCell ? locationCell.textContent.trim() : "";
      if (location.includes("$") || location.length > 60) location = "Remote";
      
      // Salary  
      const salaryMatch = rowText.match(/\$[\d,]+k?\s*[-–]\s*\$[\d,]+k?\s*\*?/i);
      const salary = salaryMatch ? salaryMatch[0] : null;
      
      // Tags from last cell
      let tags = [];
      const tagCell = cells[cells.length - 1];
      if (tagCell) {
        const tagLinks = tagCell.querySelectorAll('a');
        tags = [...tagLinks].map(a => a.textContent.trim().toLowerCase())
          .filter(t => t.length > 1 && t.length < 30);
      }
      
      // Filter by dev-relevant tags
      if (tags.length > 0 && !tags.some(t => devTags.has(t))) {
        // Check if title itself suggests dev role
        const titleLower = title.toLowerCase();
        const devTitleWords = ["engineer", "developer", "architect", "devops", "cto", "programmer"];
        if (!devTitleWords.some(w => titleLower.includes(w))) continue;
      }
      
      results.push({
        title,
        company,
        location: location || "Remote",
        salary,
        posted,
        tags,
        url: href.startsWith("http") ? href : `https://web3.career${href}`,
      });
    }
    
    return results;
  }, SKIP_PATTERNS, [...DEV_TAGS]);

  return jobs;
}

export default async function run() {
  const cfg = loadConfig();
  const pc = cfg.platforms[PLATFORM];
  if (!pc?.enabled) { log("info", `[${PLATFORM}] Disabled`); return []; }

  log("info", `[${PLATFORM}] Connecting to browser...`);

  let browser;
  try {
    browser = await puppeteer.connect({ browserURL: CDP_URL, defaultViewport: null });
    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    const rawJobs = await scrapeTable(page);

    const jobs = rawJobs.map(j => ({
      id: generateJobId(PLATFORM, j.url),
      platform: PLATFORM,
      title: j.title,
      company: j.company,
      salary: normalizeSalary(j.salary),
      postedDate: parsePostedDate(j.posted)?.toISOString() || null,
      postedRaw: j.posted,
      location: j.location,
      description: "",
      tags: j.tags,
      url: j.url,
      scrapedAt: new Date().toISOString(),
      source: "browser",
    }));

    log("info", `[${PLATFORM}] ${jobs.length} dev-relevant jobs (non-dev filtered out)`);
    await browser.disconnect();
    return jobs;

  } catch (err) {
    log("error", `[${PLATFORM}] Browser scraper failed`, { error: err.message });
    try { await browser?.disconnect(); } catch {}
    // Fall back to script scraper
    const { default: scriptScraper } = await import("./scraper-web3career.js");
    return scriptScraper();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(j => console.log(JSON.stringify(j, null, 2))).catch(console.error);
}

#!/usr/bin/env node
/**
 * Master Job Automation Orchestrator
 * Runs all scrapers → filters → updates tracker → notifies.
 *
 * v2: Browser-first architecture. Tries puppeteer-core → authenticated Chrome
 * for arc.dev, wellfound, web3.career, gun.io. Falls back to script scrapers.
 * LinkedIn stays script-only (guest API works fine).
 *
 * Usage:
 *   node job-automation.js           # Browser mode (default)
 *   node job-automation.js --script  # Script-only mode (skip browser)
 */

import { loadConfig, log } from "./scrapers/scraper-base.js";
import filterJobs from "./job-filter.js";
import { JobTracker } from "./job-tracker.js";
import notify from "./job-notifier.js";
import { analyzeJobs } from "./job-analyzer.js";

// Script scrapers (always available)
import scraperLinkedIn from "./scrapers/scraper-linkedin.js";
import scraperWellfoundScript from "./scrapers/scraper-wellfound.js";
import scraperWeb3CareerScript from "./scrapers/scraper-web3career.js";
import scraperArcDevScript from "./scrapers/scraper-arcdev.js";
import scraperGunIoScript from "./scrapers/scraper-gunio.js";

// Browser scrapers (require puppeteer-core + running Chrome on port 18802)
let scraperArcDevBrowser = null;
let scraperWellfoundBrowser = null;
let scraperWeb3CareerBrowser = null;
let scraperGunIoBrowser = null;
let browserAvailable = false;

try {
  scraperArcDevBrowser = (await import("./scrapers/scraper-arcdev-browser.js")).default;
  scraperWellfoundBrowser = (await import("./scrapers/scraper-wellfound-browser.js")).default;
  scraperWeb3CareerBrowser = (await import("./scrapers/scraper-web3career-browser.js")).default;
  scraperGunIoBrowser = (await import("./scrapers/scraper-gunio-browser.js")).default;
  browserAvailable = true;
  log("info", "Browser scrapers loaded (puppeteer-core available)");
} catch (err) {
  log("warn", "Browser scrapers unavailable — puppeteer-core may not be installed", { error: err.message });
}

function buildScrapers(useBrowser) {
  return [
    {
      name: "web3career",
      fn: (useBrowser && scraperWeb3CareerBrowser) ? scraperWeb3CareerBrowser : scraperWeb3CareerScript,
      browser: useBrowser && !!scraperWeb3CareerBrowser,
    },
    {
      name: "arcdev",
      fn: (useBrowser && scraperArcDevBrowser) ? scraperArcDevBrowser : scraperArcDevScript,
      browser: useBrowser && !!scraperArcDevBrowser,
    },
    {
      name: "linkedin",
      fn: scraperLinkedIn,
      browser: false, // Guest API is fine, no auth needed
      skip: process.argv.includes("--skip-linkedin"),
    },
    {
      name: "wellfound",
      fn: (useBrowser && scraperWellfoundBrowser) ? scraperWellfoundBrowser : scraperWellfoundScript,
      browser: useBrowser && !!scraperWellfoundBrowser,
    },
    {
      name: "gunio",
      fn: (useBrowser && scraperGunIoBrowser) ? scraperGunIoBrowser : scraperGunIoScript,
      browser: useBrowser && !!scraperGunIoBrowser,
    },
  ];
}

async function runAllScrapers(useBrowser) {
  const scrapers = buildScrapers(useBrowser);
  const all = [];
  const errors = [];

  for (const { name, fn, browser, skip } of scrapers) {
    if (skip) { log("info", `Skipping scraper: ${name}`); continue; }
    try {
      const mode = browser ? "browser" : "script";
      log("info", `Running scraper: ${name} (${mode})`);
      const jobs = await fn();
      log("info", `  ${name}: ${jobs.length} jobs from ${mode}`);
      all.push(...jobs);
    } catch (err) {
      log("error", `Scraper ${name} failed`, { error: err.message });
      errors.push({ name, error: err.message });
    }
  }

  log("info", `All scrapers complete. Total raw: ${all.length}. Errors: ${errors.length}`);
  return { jobs: all, errors };
}

async function syncBrowserAppliedJobs(tracker) {
  /**
   * Sync jobs that Andler already applied to (from browser "Applied" pages).
   * This runs even in script mode — uses cached browser data.
   */
  const { readFileSync, existsSync } = await import("fs");
  const { join } = await import("path");

  const browserCacheDir = join(process.cwd(), "data/jobs/browser-cache");
  const platforms = ["arcdev", "wellfound", "gunio"];
  let synced = 0;

  for (const platform of platforms) {
    const cacheFile = join(browserCacheDir, `${platform}.json`);
    if (!existsSync(cacheFile)) continue;

    try {
      const cache = JSON.parse(readFileSync(cacheFile, "utf8"));
      if (!cache.appliedJobs?.length) continue;

      for (const applied of cache.appliedJobs) {
        const jobId = `${platform}_${applied.id}`;
        if (!tracker.isSeen(jobId) || tracker.getJob(jobId)?.status !== "applied") {
          tracker.markApplied(jobId, {
            title: applied.title,
            company: applied.company || null,
            platform,
            applicationMode: "manual",
            status: applied.status?.toLowerCase() || "applied",
            url: applied.url || null,
            appliedAt: new Date().toISOString(),
          });
          synced++;
        }
      }
    } catch (err) {
      log("warn", `Could not sync ${platform} applied jobs`, { error: err.message });
    }
  }

  if (synced > 0) {
    log("info", `Synced ${synced} applied jobs from browser cache into tracker`);
  }
}

async function main() {
  const start = Date.now();
  const useBrowser = !process.argv.includes("--script") && browserAvailable;
  const skipAnalyze = process.argv.includes("--no-analyze");
  const regionStrict = !process.argv.includes("--no-region-strict");
  const mode = [
    useBrowser ? "browser" : "script",
    skipAnalyze ? "no-analyze" : "",
    regionStrict ? "" : "no-region-strict",
  ].filter(Boolean).join(", ");
  log("info", `=== Job Automation Started (${mode || "default"} mode) ===`);

  try {
    const cfg = loadConfig();
    const tracker = new JobTracker();

    // 0. Sync applied jobs from browser cache into tracker
    await syncBrowserAppliedJobs(tracker);

    // 1. Scrape
    const { jobs: rawJobs, errors } = await runAllScrapers(useBrowser);
    if (errors.length > 0) {
      log("warn", `${errors.length} scraper(s) failed`, { errors });
    }

    // 2. Filter (region-strict by default; override with --no-region-strict)
    const regionStrict = !process.argv.includes("--no-region-strict");
    const filterResult = filterJobs(rawJobs, tracker, { regionStrict });
    const filtered = filterResult.filtered;
    const excludedRegion = filterResult.excludedRegion;

    // 2a. Persist region-excluded jobs for Andler's audit
    if (excludedRegion.length > 0) {
      const { writeFileSync, existsSync, mkdirSync } = await import("fs");
      const { join } = await import("path");
      const { fileURLToPath } = await import("url");
      const __dirname = join(fileURLToPath(import.meta.url), "..");
      const auditDir = join(__dirname, "../../data/jobs");
      if (!existsSync(auditDir)) mkdirSync(auditDir, { recursive: true });
      const auditPath = join(auditDir, "excluded-region.json");
      const stamp = new Date().toISOString();
      let existing = [];
      try { existing = JSON.parse(require ? require("fs").readFileSync(auditPath, "utf8") : "[]"); } catch {}
      const entry = { runAt: stamp, total: excludedRegion.length, jobs: excludedRegion };
      // overwrite the file each run with the latest run's list (avoids unbounded growth)
      writeFileSync(auditPath, JSON.stringify([entry, ...existing].slice(0, 30), null, 2));
      log("info", `Region-excluded audit log written: ${auditPath} (${excludedRegion.length} jobs from this run)`);
    }

    // 3. Analyze (deep position + company analysis)
    let enriched = filtered;
    if (filtered.length > 0 && !skipAnalyze) {
      log("info", `Analyzing ${filtered.length} filtered jobs...`);
      const analysisResult = await analyzeJobs(filtered, { concurrency: 1 });
      enriched = analysisResult.jobs;
      if (analysisResult.errors.length > 0) {
        log("warn", `${analysisResult.errors.length} analysis(s) failed`, { errors: analysisResult.errors });
      }
    } else if (skipAnalyze) {
      log("info", "Deep analysis skipped (--no-analyze flag)");
    }

    // 4. Update tracker (mark seen)
    for (const job of enriched) {
      tracker.markSeen(job.id, { url: job.url, title: job.title, company: job.company });
    }

    // 5. Notify
    if (enriched.length > 0) {
      await notify(enriched);
    } else {
      log("info", "No new jobs to notify about");
    }

    const stats = tracker.getStats();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log("info", "=== Job Automation Complete ===", { elapsedSeconds: elapsed, stats });

    // stdout JSON for callers
    console.log(JSON.stringify({
      success: true,
      mode,
      elapsedSeconds: parseFloat(elapsed),
      rawCount: rawJobs.length,
      filteredCount: filtered.length,
      regionExcludedCount: excludedRegion.length,
      scraperErrors: errors,
      stats,
      topJobs: enriched.slice(0, cfg.notification.topN).map((j) => ({
        id: j.id,
        title: j.title,
        company: j.company,
        salary: j.salary,
        matchScore: j.analysis?.match?.score ?? j.matchScore,
        analysisApproach: j.analysis?.strategy?.approach ?? "unknown",
        url: j.url,
      })),
    }, null, 2));

    return 0;
  } catch (err) {
    log("error", "Job automation fatal error", { error: err.message, stack: err.stack });
    console.error(JSON.stringify({ success: false, error: err.message }));
    return 1;
  }
}

main().then((code) => process.exit(code));

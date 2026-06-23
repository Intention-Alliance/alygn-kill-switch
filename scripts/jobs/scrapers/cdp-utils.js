/**
 * Shared CDP (Chrome DevTools Protocol) utilities for browser scrapers.
 * Handles WebSocket connections, navigation, and DOM evaluation.
 *
 * Usage:
 *   import { findTab, evaluate, navigate } from "./cdp-utils.js";
 *
 * Note: BROWSER_WS below is the WebSocket URL for a specific Chrome
 * instance and is NOT portable across Chrome restarts. Prefer the
 * per-scraper pattern of `puppeteer.connect({ browserURL: CDP_URL })`
 * which uses the HTTP endpoint to discover the current browser.
 * The HTTP endpoint is in scripts/jobs/config.json under `browser.debugPort`
 * (default 18801, the OpenClaw-managed Chrome).
 */

const BROWSER_WS = `ws://localhost:${process.env.CHROME_DEBUG_PORT || 18801}/devtools/browser`;

/**
 * Send a CDP command and get response. One-shot per connection.
 */
function cdpCommand(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let settled = false;

    ws.onmessage = (e) => {
      if (settled) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.id === 1 && msg.result !== undefined) {
          settled = true;
          ws.close();
          resolve(msg);
        }
      } catch {}
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method, params }));
    };

    ws.onclose = () => {
      // Node.js WebSocket onclose may fire spuriously before onmessage.
      // Only settle if we actually receive a message response.
    };

    ws.onerror = () => {};

    setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        resolve(null);
      }
    }, 15000);
  });
}

/**
 * Find a tab/page by URL pattern.
 * Returns { targetId, url, title } or null.
 */
export async function findTab(urlPattern) {
  try {
    const result = await cdpCommand(BROWSER_WS, "Target.getTargets");
    const targets = result.result?.targetInfos || [];
    const tab = targets.find(
      (t) => t.type === "page" && t.url && urlPattern.test(t.url)
    );
    if (!tab) return null;
    return { targetId: tab.targetId, url: tab.url, title: tab.title };
  } catch (err) {
    return null;
  }
}

/**
 * Evaluate an expression in a tab and return the result.
 * Connects fresh for each call.
 */
export function evaluate(targetId, expression) {
  return new Promise((resolve, reject) => {
    const url = targetId.includes("ws://")
      ? targetId
      : `ws://localhost:18802/devtools/page/${targetId}`;

    const ws = new WebSocket(url);
    let settled = false;

    ws.onmessage = (e) => {
      if (settled) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.id === 1 && msg.result !== undefined) {
          settled = true;
          ws.close();
          resolve(msg.result?.result?.value ?? null);
        }
      } catch {}
    };

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true },
        })
      );
    };

    ws.onclose = () => {};

    ws.onerror = () => {};

    setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        reject(new Error("CDP eval timeout"));
      }
    }, 20000);
  });
}

/**
 * Navigate a tab to a URL and wait for page load.
 * Uses Page.enable → Page.navigate → wait for Page.loadEventFired.
 * Returns true on success.
 */
export function navigate(targetId, url) {
  return new Promise((resolve) => {
    const tabUrl = targetId.includes("ws://")
      ? targetId
      : `ws://localhost:18802/devtools/page/${targetId}`;

    const ws = new WebSocket(tabUrl);
    let settled = false;
    let enableDone = false;

    ws.onmessage = (e) => {
      if (settled) return;
      try {
        const msg = JSON.parse(e.data);

        // Handle event notifications
        if (msg.method === "Page.loadEventFired") {
          settled = true;
          ws.close();
          resolve(true);
          return;
        }

        // Handle command responses
        if (msg.id === 1 && !enableDone) {
          // Page.enable done → now navigate
          enableDone = true;
          ws.send(
            JSON.stringify({
              id: 2,
              method: "Page.navigate",
              params: { url },
            })
          );
        }
      } catch {}
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: "Page.enable" }));
    };

    ws.onclose = () => {};

    ws.onerror = () => {};

    setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        resolve(true);
      }
    }, 10000);
  });
}

/**
 * X Client — @xdevplatform/xdk wrapper for @humano
 *
 * Handles posting, replying, threading, and timeline search.
 * Uses OAuth 1.0a User Context (required for write operations).
 *
 * Credentials loaded from: config/credentials.json
 *   { twitter: { consumerKey, consumerSecret, accessToken, accessTokenSecret } }
 *
 * Same pattern as scripts/shared/x-growth/x-api-executor.js
 */

import { Client, OAuth1 } from '@xdevplatform/xdk';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const CREDENTIALS_PATH = path.join(
  process.env.HOME,
  '.openclaw/workspace/config/credentials.json'
);

let _client = null;

/**
 * Returns (or creates) the @xdevplatform/xdk Client.
 * Credentials are read from .env (X_CONSUMER_KEY, X_CONSUMER_SECRET,
 * X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET).
 */
function getClient() {
  if (_client) return _client;

  const required = ['X_CONSUMER_KEY', 'X_CONSUMER_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing in .env: ${missing.join(', ')}`);

  const oauth1 = new OAuth1({
    apiKey: process.env.X_CONSUMER_KEY,
    apiSecret: process.env.X_CONSUMER_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });
  _client = new Client({ oauth1 });
  return _client;
}

/**
 * Upload a media file and return its media_id string.
 * @param {string} mediaPath — Absolute path to image/video file
 * @returns {Promise<string>} media_id
 */
async function uploadMedia(mediaPath) {
  if (!mediaPath || !fs.existsSync(mediaPath)) {
    throw new Error(`Media file not found: ${mediaPath}`);
  }
  const client = getClient();
  const mediaId = await client.media.uploadImage(mediaPath);
  if (!mediaId) throw new Error(`Media upload returned no ID for: ${mediaPath}`);
  return mediaId;
}

/**
 * Post a new tweet, optionally with media.
 * @param {string} text       — Tweet text (≤280 chars)
 * @param {boolean} dryRun    — If true, log but don't post
 * @param {string|null} mediaPath — Absolute path to image/video (optional)
 * @returns {Promise<{id: string, text: string, url: string}>}
 */
async function tweet(text, dryRun = false, mediaPath = null) {
  if (text.length > 280) {
    throw new Error(`Tweet exceeds 280 chars (${text.length}): "${text.slice(0, 60)}..."`);
  }

  if (dryRun) {
    console.log(`[dry-run] Would tweet (${text.length} chars${mediaPath ? ` + media: ${path.basename(mediaPath)}` : ''}):\n  "${text}"`);
    return { id: 'dry-run', text, url: null };
  }

  const client = getClient();
  const postData = { text };

  if (mediaPath && fs.existsSync(mediaPath)) {
    const mediaId = await uploadMedia(mediaPath);
    postData.media = { media_ids: [mediaId] };
  }

  const result = await client.posts.create(postData);
  const id = result.data?.id;
  const handle = process.env.X_ACCOUNT_HANDLE || 'humano';
  const url = `https://x.com/${handle}/status/${id}`;

  console.log(`✅ Tweeted: ${url}`);
  return { id, text, url };
}

/**
 * Reply to an existing tweet, optionally with media.
 * @param {string} text              — Reply text
 * @param {string} inReplyToTweetId  — Tweet ID to reply to
 * @param {boolean} dryRun
 * @param {string|null} mediaPath    — Absolute path to image/video (optional)
 */
async function reply(text, inReplyToTweetId, dryRun = false, mediaPath = null) {
  if (text.length > 280) {
    throw new Error(`Reply exceeds 280 chars (${text.length})`);
  }

  if (dryRun) {
    console.log(
      `[dry-run] Would reply to ${inReplyToTweetId} (${text.length} chars${mediaPath ? ` + media: ${path.basename(mediaPath)}` : ''}):\n  "${text}"`
    );
    return { id: 'dry-run', text, replyTo: inReplyToTweetId };
  }

  const client = getClient();
  const postData = {
    text,
    reply: { in_reply_to_tweet_id: inReplyToTweetId },
  };

  if (mediaPath && fs.existsSync(mediaPath)) {
    const mediaId = await uploadMedia(mediaPath);
    postData.media = { media_ids: [mediaId] };
  }

  const result = await client.posts.create(postData);
  const id = result.data?.id;
  const handle = process.env.X_ACCOUNT_HANDLE || 'humano';
  const url = `https://x.com/${handle}/status/${id}`;

  console.log(`✅ Replied to ${inReplyToTweetId}: ${url}`);
  return { id, text, url, replyTo: inReplyToTweetId };
}

/**
 * Post a thread (sequential tweets, each replying to the previous).
 * Accepts either plain strings or objects with { text, mediaPath }.
 * @param {Array<string|{text:string,mediaPath?:string}>} tweets
 * @param {boolean} dryRun
 */
async function thread(tweets, dryRun = false) {
  if (!Array.isArray(tweets) || tweets.length === 0) {
    throw new Error('Thread requires a non-empty array of tweet texts');
  }

  const results = [];
  let previousId = null;

  for (let i = 0; i < tweets.length; i++) {
    const entry = tweets[i];
    const text = typeof entry === 'string' ? entry : entry.text;
    const mediaPath = typeof entry === 'object' ? (entry.mediaPath ?? null) : null;
    let result;

    if (i === 0) {
      result = await tweet(text, dryRun, mediaPath);
    } else {
      result = await reply(text, previousId, dryRun, mediaPath);
    }

    results.push(result);
    previousId = result.id;

    // Small delay between thread posts to avoid rate limits
    if (!dryRun && i < tweets.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`✅ Thread posted: ${results.length} tweets`);
  return results;
}

/**
 * Get recent mentions via search API (xdk search.searchTweets).
 * @param {string} handle — Account handle without @, e.g. 'humano'
 * @param {number} sinceHours — How many hours back to look
 */
async function getMentions(handle, sinceHours = 3) {
  const client = getClient();
  const query = `@${handle} -is:retweet`;

  try {
    const result = await client.search.searchTweets({ query, max_results: 20 });
    return result.data ?? [];
  } catch (err) {
    console.warn(`[x-client] getMentions failed: ${err.message}`);
    return [];
  }
}

/**
 * Get recent tweets from a list of usernames (search-based).
 * @param {string[]} usernames — Array of handles (with or without @)
 * @param {number} sinceHours — Unused in xdk search (no start_time filter); kept for API compat
 */
async function getFollowingPosts(usernames, sinceHours = 3) {
  if (!usernames || usernames.length === 0) return [];

  const fromQuery = usernames
    .slice(0, 10)
    .map((u) => `from:${u.replace('@', '')}`)
    .join(' OR ');

  const client = getClient();
  try {
    const result = await client.search.searchTweets({
      query: `(${fromQuery}) -is:retweet`,
      max_results: 20,
    });
    return result.data ?? [];
  } catch (err) {
    console.warn(`[x-client] getFollowingPosts failed: ${err.message}`);
    return [];
  }
}

export { getClient, getFollowingPosts, getMentions, reply, thread, tweet, uploadMedia };

// ── CLI (on-demand posting, called directly by human after Grok Chat) ───────
//
// Usage:
//   node lib/x-client.js --text "Your tweet" [--hashtags "#A #B"] [--media=/path.png] [--dry-run]
//   node lib/x-client.js --reply-to 1234567890 --text "Reply text" [--media=/path.png]
//   node lib/x-client.js --thread '["Tweet 1","Tweet 2"]'
//   node lib/x-client.js --workflow /tmp/content.json [--option=2]
//
// This is the Fase 1 execution layer — human runs this after copying cliCommand from Grok Chat.

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const get = (flag) => { const a = args.find((x) => x.startsWith(`--${flag}=`)); return a ? a.split('=').slice(1).join('=') : null; };
  const has = (flag) => args.includes(`--${flag}`);

  const textArg = get('text');
  const hashtagsArg = get('hashtags');
  const replyToArg = get('reply-to');
  const mediaArg = get('media');
  const threadArg = get('thread');
  const workflowArg = get('workflow');
  const optionArg = parseInt(get('option') || '1', 10);
  const dryRun = has('dry-run');

  if (!textArg && !threadArg && !workflowArg) {
    console.error(
      'x-client.js — on-demand X posting\n\n' +
      'Usage:\n' +
      '  node lib/x-client.js --text "..." [--hashtags "#A"] [--media=/img.png] [--reply-to ID] [--dry-run]\n' +
      '  node lib/x-client.js --thread \'["Tweet 1","Tweet 2"]\' [--dry-run]\n' +
      '  node lib/x-client.js --workflow /tmp/content.json [--option=2] [--dry-run]'
    );
    process.exit(1);
  }

  async function run() {
    if (threadArg) {
      const tweets = JSON.parse(threadArg);
      return await thread(tweets, dryRun);
    }

    if (workflowArg) {
      const { default: fs2 } = await import('fs');
      const workflow = JSON.parse(fs2.readFileSync(workflowArg, 'utf8'));
      const posts = workflow.options ?? workflow.posts ?? [];
      const target = posts[optionArg - 1] ?? posts[0];
      if (!target) throw new Error(`Option ${optionArg} not found in workflow`);
      const text = target.mainPost?.text ?? target.content;
      const media = target.mainPost?.mediaPath ?? target.mediaPath ?? null;
      return await tweet(text, dryRun, media);
    }

    let fullText = textArg.trim();
    if (hashtagsArg) {
      const tags = hashtagsArg.trim();
      if (tags && !fullText.includes(tags.split(' ')[0])) fullText += `\n${tags}`;
    }
    if (replyToArg) return await reply(fullText, replyToArg, dryRun, mediaArg);
    return await tweet(fullText, dryRun, mediaArg);
  }

  run()
    .then((result) => {
      if (Array.isArray(result)) result.forEach((r) => console.log(`  ✅ ${r.url || r.id}`));
      else console.log(`  ✅ ${result.url || result.id}`);
    })
    .catch((err) => { console.error(`❌ ${err.message}`); process.exit(1); });
}


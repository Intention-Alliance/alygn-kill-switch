/**
 * Agent Chain — Runs the 3-agent pipeline against the Grok API
 *
 * Pipeline:
 *   Agent 1 (Research) → Agent 2 (Content Generation) → Agent 3 (Tone Validation)
 *
 * Used by:
 *   - content-generator.js  (Fase 2 cron, Fase 3 on-demand CLI)
 *   - cron.js               (automated polling cycle)
 *
 * For Fase 1 (Grok Chat website), this pipeline is executed by the Custom Agent
 * and does NOT run through this file.
 *
 * Usage:
 *   const { runAgentChain } = require('./lib/agent-chain');
 *   const result = await runAgentChain({ topic, mode, approvedTemplate });
 */

import { AGENT_PROMPTS } from './agent-prompts.js';

const GROK_ENDPOINT = process.env.GROK_ENDPOINT || 'https://api.x.ai/v1';
const GROK_MODEL = process.env.GROK_MODEL || 'grok-3';

/**
 * Calls Grok API chat completions with a system prompt + user message.
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {object} opts — { temperature, maxTokens }
 * @returns {Promise<string>} Raw text response
 */
async function callGrok(systemPrompt, userMessage, opts = {}) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error('XAI_API_KEY not set in environment. See .env-sample.');
  }

  const response = await fetch(`${GROK_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 2000,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Grok API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Extracts JSON from a Grok response that may contain markdown fences.
 * @param {string} rawText
 * @returns {object}
 */
function parseJSON(rawText) {
  const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1] : rawText;
  try {
    return JSON.parse(jsonStr.trim());
  } catch (err) {
    throw new Error(`Failed to parse Grok JSON response: ${err.message}\nRaw:\n${rawText}`);
  }
}

/**
 * Injects values into a prompt template by replacing {{key}} placeholders.
 * @param {string} template
 * @param {object} vars
 * @returns {string}
 */
function injectVars(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`;
  });
}

/**
 * Runs the full 3-agent pipeline.
 *
 * @param {object} params
 * @param {string} params.mode           — "first-time" | "automated" | "on-demand"
 * @param {string} [params.topic]        — Topic to research (first-time / on-demand)
 * @param {string} [params.humanRequest] — Free-text request from human (on-demand)
 * @param {string} [params.followingList]— Comma-separated @usernames for automated mode
 * @param {object} [params.approvedTemplate] — Loaded from config/humano-template.json
 * @param {boolean} [params.verbose]     — Log intermediate outputs
 *
 * @returns {Promise<{
 *   agent1: object,
 *   agent2: object,
 *   agent3: object,
 *   approved: object[],
 *   firstPassedOption: object|null
 * }>}
 */
async function runAgentChain(params) {
  const {
    mode = 'automated',
    topic = '',
    humanRequest = '',
    followingList = '',
    approvedTemplate = null,
    verbose = false,
  } = params;

  const governanceTopics =
    'AI governance, institutional coordination, municipal AI, legitimacy, accountability';

  // ── Agent 1: Research ─────────────────────────────────────────────────────
  console.log('[agent-chain] Running Agent 1 (Research)...');
  const agent1Prompt = injectVars(AGENT_PROMPTS.agent1, {
    mode,
    topic: topic || humanRequest,
    followingList: followingList || 'none provided',
    governanceTopics,
  });

  const agent1Raw = await callGrok(agent1Prompt, JSON.stringify({ topic, mode }));
  const agent1Result = parseJSON(agent1Raw);

  if (verbose) console.log('[agent-chain] Agent 1 output:', JSON.stringify(agent1Result, null, 2));

  // Check for no-action signal in automated mode
  if (
    mode === 'automated' &&
    agent1Result.xDiscovery?.mentions?.length === 0 &&
    agent1Result.xDiscovery?.followingPosts?.length === 0 &&
    agent1Result.handoffToAgent2?.contextSummary?.includes('no_action_needed')
  ) {
    console.log('[agent-chain] Agent 1: no relevant activity found. Skipping cycle.');
    return { agent1: agent1Result, agent2: null, agent3: null, approved: [], firstPassedOption: null };
  }

  // ── Agent 2: Content Generation ───────────────────────────────────────────
  console.log('[agent-chain] Running Agent 2 (Content Generation)...');
  const agent2Prompt = injectVars(AGENT_PROMPTS.agent2, {
    mode,
    researchContext: agent1Result.handoffToAgent2?.contextSummary || JSON.stringify(agent1Result),
    approvedTemplate: approvedTemplate ? JSON.stringify(approvedTemplate) : 'not set — use defaults',
    humanRequest: humanRequest || topic,
  });

  const agent2Raw = await callGrok(agent2Prompt, JSON.stringify({ agent1Output: agent1Result, mode }));
  const agent2Result = parseJSON(agent2Raw);

  if (verbose) console.log('[agent-chain] Agent 2 output:', JSON.stringify(agent2Result, null, 2));

  // ── Agent 3: Tone Validation ───────────────────────────────────────────────
  console.log('[agent-chain] Running Agent 3 (Tone Validation)...');
  const agent3Raw = await callGrok(
    AGENT_PROMPTS.agent3,
    JSON.stringify({ agent2Output: agent2Result, mode })
  );
  const agent3Result = parseJSON(agent3Raw);

  if (verbose) console.log('[agent-chain] Agent 3 output:', JSON.stringify(agent3Result, null, 2));

  // ── Collect approved options ───────────────────────────────────────────────
  const approved = (agent3Result.approvedOptions || [])
    .map((num) => agent2Result.options?.find((o) => o.optionNumber === num))
    .filter(Boolean);

  const firstPassedOption = approved[0] ?? null;

  if (agent3Result.handoffDecision === 'regenerate') {
    console.warn(
      `[agent-chain] Agent 3 flagged all options for regeneration: ${agent3Result.regenerateReason}`
    );
  }

  return {
    agent1: agent1Result,
    agent2: agent2Result,
    agent3: agent3Result,
    approved,
    firstPassedOption,
  };
}

export { callGrok, parseJSON, runAgentChain };


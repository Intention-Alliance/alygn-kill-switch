#!/usr/bin/env bun
// Documentation Synchronization Script
// Extracts JSDoc comments, generates OpenAPI spec, and syncs to Notion (if configured)

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';

const ROOT_DIR = join(import.meta.dir, '..');
const API_SRC = join(ROOT_DIR, 'apps/kill-switch-api/src');
const DOCS_DIR = join(ROOT_DIR, 'docs/api');

// Ensure output directories exist
mkdirSync(DOCS_DIR, { recursive: true });

// ─── JSDoc Extraction ─────────────────────────────────────────────

interface JSDocEntry {
  file: string;
  line: number;
  comment: string;
  context: string;
}

function extractJSDocFromFile(filePath: string): JSDocEntry[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const entries: JSDocEntry[] = [];

  let inComment = false;
  let commentLines: string[] = [];
  let commentStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('/**')) {
      inComment = true;
      commentStartLine = i + 1;
      commentLines = [line];
      if (line.endsWith('*/')) {
        inComment = false;
        const context = lines[i + 1]?.trim() || '';
        entries.push({
          file: filePath,
          line: commentStartLine,
          comment: commentLines.join('\n'),
          context,
        });
        commentLines = [];
      }
    } else if (inComment) {
      commentLines.push(line);
      if (line.endsWith('*/')) {
        inComment = false;
        const context = lines[i + 1]?.trim() || '';
        entries.push({
          file: filePath,
          line: commentStartLine,
          comment: commentLines.join('\n'),
          context,
        });
        commentLines = [];
      }
    }
  }

  return entries;
}

function extractAllJSDoc(srcDir: string): JSDocEntry[] {
  const entries: JSDocEntry[] = [];

  function walk(dir: string) {
    const files = readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = join(dir, file.name);
      if (file.isDirectory()) {
        walk(fullPath);
      } else if (file.name.endsWith('.ts') && !file.name.endsWith('.d.ts')) {
        entries.push(...extractJSDocFromFile(fullPath));
      }
    }
  }

  walk(srcDir);
  return entries;
}

// ─── OpenAPI Spec Generation ──────────────────────────────────────

function generateOpenAPISpec(): object {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Kill Switch API',
      version: '1.0.0',
      description: 'Phase 0 Kill Switch Service — BCP + Chaos Engineering',
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Development' },
      { url: 'https://kill-switch.staging.example.com', description: 'Staging' },
      { url: 'https://kill-switch.example.com', description: 'Production' },
    ],
    paths: {
      '/v1/kill-switch/status': {
        get: {
          summary: 'Get current kill switch state',
          operationId: 'getKillSwitchStatus',
          tags: ['Kill Switch'],
          responses: {
            '200': {
              description: 'Current kill switch status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      state: { type: 'string', enum: ['ARMED', 'RUNNING', 'STOPPING', 'STOPPED', 'LOCKED'] },
                      lastActivation: { type: 'string', format: 'date-time', nullable: true },
                      lastActivationBy: { type: 'string', nullable: true },
                      reason: { type: 'string', nullable: true },
                      recentTransitions: { type: 'array', items: { type: 'object' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/v1/kill-switch/chaos': {
        post: {
          summary: 'Transition kill switch state',
          operationId: 'transitionKillSwitch',
          tags: ['Kill Switch'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['state'],
                  properties: {
                    state: { type: 'string', enum: ['ARMED', 'RUNNING', 'STOPPING', 'STOPPED', 'LOCKED'] },
                    userId: { type: 'string' },
                    reason: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Transition successful' },
            '409': { description: 'Invalid transition' },
          },
        },
      },
      '/v1/kill-switch/health': {
        get: {
          summary: 'Health check (no auth required)',
          operationId: 'healthCheck',
          tags: ['Health'],
          responses: {
            '200': { description: 'Healthy' },
            '503': { description: 'Degraded' },
          },
        },
      },
      '/v1/kill-switch/activations': {
        get: {
          summary: 'Get audit log',
          operationId: 'getActivations',
          tags: ['Kill Switch'],
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          ],
          responses: {
            '200': { description: 'Audit log entries' },
          },
        },
      },
      '/v1/auth/login': {
        post: {
          summary: 'Login with email/password',
          operationId: 'login',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Login successful, cookie set' },
            '401': { description: 'Invalid credentials' },
          },
        },
      },
      '/v1/auth/logout': {
        post: {
          summary: 'Logout and clear cookie',
          operationId: 'logout',
          tags: ['Auth'],
          responses: {
            '200': { description: 'Logged out' },
          },
        },
      },
      '/v1/auth/me': {
        get: {
          summary: 'Check current session',
          operationId: 'checkSession',
          tags: ['Auth'],
          responses: {
            '200': { description: 'Session active' },
            '401': { description: 'Not authenticated' },
          },
        },
      },
      '/v1/auth/ip': {
        get: {
          summary: 'Get client IP address',
          operationId: 'getIp',
          tags: ['Auth'],
          responses: {
            '200': { description: 'IP address' },
          },
        },
      },
      '/health': {
        get: {
          summary: 'LB liveness probe',
          operationId: 'lbHealth',
          tags: ['Infrastructure'],
          responses: {
            '200': { description: 'Alive' },
          },
        },
      },
      '/ready': {
        get: {
          summary: 'LB readiness probe',
          operationId: 'lbReady',
          tags: ['Infrastructure'],
          responses: {
            '200': { description: 'Ready' },
            '503': { description: 'Not ready' },
          },
        },
      },
      '/metrics': {
        get: {
          summary: 'Prometheus metrics',
          operationId: 'getMetrics',
          tags: ['Infrastructure'],
          responses: {
            '200': { description: 'Prometheus text format', content: { 'text/plain': {} } },
          },
        },
      },
      '/admin/cost': {
        get: {
          summary: 'Cost tracking report (auth required)',
          operationId: 'getCostReport',
          tags: ['Admin'],
          responses: {
            '200': { description: 'Cost report' },
          },
        },
      },
      '/admin/resources': {
        get: {
          summary: 'Resource monitoring stats (auth required)',
          operationId: 'getResourceStats',
          tags: ['Admin'],
          responses: {
            '200': { description: 'Resource stats and alerts' },
          },
        },
      },
      '/admin/incidents': {
        get: {
          summary: 'Active incidents and blocked IPs (auth required)',
          operationId: 'getIncidents',
          tags: ['Admin'],
          responses: {
            '200': { description: 'Incident report' },
          },
        },
      },
      '/admin/runbooks': {
        get: {
          summary: 'Runbook status and procedures (auth required)',
          operationId: 'getRunbooks',
          tags: ['Admin'],
          responses: {
            '200': { description: 'Runbook information' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'admin_token' },
        bearerAuth: { type: 'http', scheme: 'bearer' },
        apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
      },
    },
  };
}

// ─── Markdown Generation ──────────────────────────────────────────

function generateApiReference(jsDocEntries: JSDocEntry[]): string {
  const sections: Record<string, JSDocEntry[]> = {};

  for (const entry of jsDocEntries) {
    const relPath = entry.file.replace(API_SRC + '/', '');
    const section = relPath.split('/')[0];
    if (!sections[section]) sections[section] = [];
    sections[section].push(entry);
  }

  let md = `# Kill Switch API Reference\n\n`;
  md += `> Auto-generated on ${new Date().toISOString()}\n\n`;
  md += `## Overview\n\n`;
  md += `The Kill Switch API provides BCP (Business Continuity Planning) and chaos engineering controls.\n\n`;
  md += `## Base URL\n\n`;
  md += `- Development: \`http://localhost:3000\`\n`;
  md += `- Staging: \`https://kill-switch.staging.example.com\`\n`;
  md += `- Production: \`https://kill-switch.example.com\`\n\n`;
  md += `## Authentication\n\n`;
  md += `Most endpoints require authentication via:\n`;
  md += `- Cookie: \`admin_token\` (set by login)\n`;
  md += `- Bearer token: \`Authorization: Bearer <token>\`\n`;
  md += `- API key: \`x-api-key: <key>\`\n\n`;
  md += `## Endpoints\n\n`;
  md += `| Method | Path | Auth | Description |\n`;
  md += `|--------|------|------|-------------|\n`;
  md += `| GET | /v1/kill-switch/status | Yes | Current state |\n`;
  md += `| POST | /v1/kill-switch/chaos | Yes | Transition state |\n`;
  md += `| GET | /v1/kill-switch/health | No | Health check |\n`;
  md += `| GET | /v1/kill-switch/activations | Yes | Audit log |\n`;
  md += `| POST | /v1/auth/login | No | Login |\n`;
  md += `| POST | /v1/auth/logout | No | Logout |\n`;
  md += `| GET | /v1/auth/me | No | Session check |\n`;
  md += `| GET | /v1/auth/ip | No | IP detection |\n`;
  md += `| GET | /health | No | LB liveness |\n`;
  md += `| GET | /ready | No | LB readiness |\n`;
  md += `| GET | /metrics | No | Prometheus metrics |\n`;
  md += `| GET | /admin/cost | Yes | Cost report |\n`;
  md += `| GET | /admin/resources | Yes | Resource stats |\n`;
  md += `| GET | /admin/incidents | Yes | Incident report |\n`;
  md += `| GET | /admin/runbooks | Yes | Runbook status |\n\n`;

  md += `## Source Documentation\n\n`;
  for (const [section, entries] of Object.entries(sections)) {
    md += `### ${section}\n\n`;
    for (const entry of entries) {
      const cleanComment = entry.comment
        .replace(/^\/\*\*\s*/gm, '')
        .replace(/^\s*\*\s?/gm, '')
        .replace(/\s*\*\/$/m, '')
        .trim();
      if (cleanComment) {
        md += `- **\`${entry.context.slice(0, 80)}\`**: ${cleanComment}\n`;
      }
    }
    md += `\n`;
  }

  return md;
}

function generateConfigurationDoc(): string {
  let md = `# Configuration Reference\n\n`;
  md += `> Auto-generated on ${new Date().toISOString()}\n\n`;
  md += `## Environment Detection\n\n`;
  md += `Configuration is loaded based on \`KILL_SWITCH_ENV\` or \`NODE_ENV\`:\n`;
  md += `- \`development\` — Permissive, debug-friendly\n`;
  md += `- \`staging\` — Mirrors production with debug access\n`;
  md += `- \`production\` — Hardened, strict limits\n\n`;
  md += `## Priority Order\n\n`;
  md += `1. Environment variables (highest priority)\n`;
  md += `2. Environment defaults (per environment)\n`;
  md += `3. Schema defaults (Zod .default())\n\n`;
  md += `## Environment Variables\n\n`;
  md += `| Variable | Description | Default |\n`;
  md += `|----------|-------------|---------|\n`;
  md += `| KILL_SWITCH_ENV | Environment name | development |\n`;
  md += `| KILL_SWITCH_PORT | Server port | 3000 |\n`;
  md += `| KILL_SWITCH_AUTH_TOKEN | Auth token | (required) |\n`;
  md += `| KILL_SWITCH_API_KEY | API key | (required) |\n`;
  md += `| ADMIN_EMAIL | Admin email | admin@alygn.com |\n`;
  md += `| REDIS_URLS | Comma-separated Redis URLs | redis://localhost:6379 |\n`;
  md += `| REDIS_PASSWORD | Redis password | (empty) |\n`;
  md += `| LOG_LEVEL | Logging level | debug/info |\n`;
  md += `| OTEL_EXPORTER_OTLP_ENDPOINT | OTLP endpoint | http://otel-collector:4317 |\n`;
  md += `| OTEL_SERVICE_NAME | Service name | kill-switch-api |\n`;
  md += `| IP_ALLOWLIST | Comma-separated IPs | (defaults) |\n`;
  md += `| IP_ALLOWLIST_CIDRS | CIDR ranges | (defaults) |\n\n`;

  md += `## Feature Flags\n\n`;
  md += `| Flag | Development | Staging | Production |\n`;
  md += `|------|-------------|---------|------------|\n`;
  md += `| enableChaosEngineering | true | true | false |\n`;
  md += `| enableOpenTelemetry | false | true | true |\n`;
  md += `| enableAuditLog | true | true | true |\n`;
  md += `| enableCostTracking | true | true | true |\n`;
  md += `| enableResourceMonitor | true | true | true |\n`;
  md += `| enableIncidentResponse | true | true | true |\n`;
  md += `| enableLbHealth | true | true | true |\n\n`;

  md += `## Resource Thresholds\n\n`;
  md += `| Metric | Warning | Critical |\n`;
  md += `|--------|---------|----------|\n`;
  md += `| CPU | 70% | 90% |\n`;
  md += `| Memory | 80% | 90% |\n`;
  md += `| Disk | 85% | 95% |\n\n`;

  md += `## Cost Tracking Rates\n\n`;
  md += `| Resource | Rate |\n`;
  md += `|----------|------|\n`;
  md += `| Redis reads | $0.0001 per 1K |\n`;
  md += `| Redis writes | $0.0002 per 1K |\n`;
  md += `| Redis pub/sub | $0.00015 per 1K |\n`;
  md += `| API requests | $0.00005 per 1K |\n`;
  md += `| Compute | $0.032/hour |\n\n`;

  return md;
}

function generateDeploymentDoc(): string {
  let md = `# Deployment Guide\n\n`;
  md += `> Auto-generated on ${new Date().toISOString()}\n\n`;
  md += `## Docker Compose (Local Development)\n\n`;
  md += `\`\`\`bash\n`;
  md += `# Start all services\n`;
  md += `docker compose up -d\n\n`;
  md += `# Check health\n`;
  md += `curl http://localhost:3000/health\n`;
  md += `curl http://localhost:3000/ready\n\`\`\`\n\n`;

  md += `## Environment Setup\n\n`;
  md += `\`\`\`bash\n`;
  md += `# Copy environment template\n`;
  md += `cp .env.example .env\n\n`;
  md += `# Generate auth tokens\n`;
  md += `openssl rand -hex 32  # KILL_SWITCH_AUTH_TOKEN\n`;
  md += `openssl rand -hex 32  # KILL_SWITCH_API_KEY\n\`\`\`\n\n`;

  md += `## Health Checks\n\n`;
  md += `| Endpoint | Purpose | Status Codes |\n`;
  md += `|----------|---------|-------------|\n`;
  md += `| /health | Liveness (is process alive?) | 200 |\n`;
  md += `| /ready | Readiness (are deps available?) | 200, 503 |\n`;
  md += `| /v1/kill-switch/health | App health (Redis + state) | 200, 503 |\n\n`;

  md += `## Monitoring\n\n`;
  md += `\`\`\`bash\n`;
  md += `# Prometheus metrics\n`;
  md += `curl http://localhost:3000/metrics\n\n`;
  md += `# Resource stats\n`;
  md += `curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/resources\n\n`;
  md += `# Cost report\n`;
  md += `curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/cost\n\`\`\`\n\n`;

  md += `## Incident Response\n\n`;
  md += `\`\`\`bash\n`;
  md += `# Check active incidents\n`;
  md += `curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/incidents\n\n`;
  md += `# View runbooks\n`;
  md += `curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/runbooks\n\n`;
  md += `# Trigger manual detection\n`;
  md += `curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/incidents/check\n\`\`\`\n\n`;

  md += `## Scaling\n\n`;
  md += `\`\`\`bash\n`;
  md += `# Scale API instances\n`;
  md += `docker compose up --scale kill-switch-api=3\n\`\`\`\n`;

  return md;
}

// ─── Notion Sync (optional) ──────────────────────────────────────

async function syncToNotion(content: string, title: string): Promise<boolean> {
  const notionKey = process.env.NOTION_API_KEY;
  if (!notionKey) {
    console.log(`[sync-docs] Notion sync skipped (NOTION_API_KEY not set)`);
    return false;
  }

  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { page_id: '2f933487-4af6-819f-a5c5-f32ae95088f1' },
        properties: {
          title: { title: [{ text: { content: title } }] },
        },
        children: [
          {
            object: 'block',
            type: 'code',
            code: {
              rich_text: [{ text: { content: content.slice(0, 2000) } }],
              language: 'markdown',
            },
          },
        ],
      }),
    });

    if (response.ok) {
      console.log(`[sync-docs] Synced "${title}" to Notion`);
      return true;
    }
    console.error(`[sync-docs] Notion sync failed: ${response.status}`);
    return false;
  } catch (err) {
    console.error(`[sync-docs] Notion sync error:`, err);
    return false;
  }
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log('[sync-docs] Starting documentation synchronization...\n');

  // 1. Extract JSDoc
  console.log('[sync-docs] Extracting JSDoc comments...');
  const jsDocEntries = extractAllJSDoc(API_SRC);
  console.log(`[sync-docs] Found ${jsDocEntries.length} JSDoc entries\n`);

  // 2. Generate OpenAPI spec
  console.log('[sync-docs] Generating OpenAPI spec...');
  const openApiSpec = generateOpenAPISpec();
  const specPath = join(DOCS_DIR, 'openapi.json');
  writeFileSync(specPath, JSON.stringify(openApiSpec, null, 2));
  console.log(`[sync-docs] Written: ${specPath}\n`);

  // 3. Generate API reference
  console.log('[sync-docs] Generating API reference...');
  const apiRef = generateApiReference(jsDocEntries);
  writeFileSync(join(DOCS_DIR, 'kill-switch-api.md'), apiRef);
  console.log(`[sync-docs] Written: ${DOCS_DIR}/kill-switch-api.md\n`);

  // 4. Generate configuration doc
  console.log('[sync-docs] Generating configuration reference...');
  const configDoc = generateConfigurationDoc();
  writeFileSync(join(DOCS_DIR, 'configuration.md'), configDoc);
  console.log(`[sync-docs] Written: ${DOCS_DIR}/configuration.md\n`);

  // 5. Generate deployment guide
  console.log('[sync-docs] Generating deployment guide...');
  const deployDoc = generateDeploymentDoc();
  writeFileSync(join(DOCS_DIR, 'deployment.md'), deployDoc);
  console.log(`[sync-docs] Written: ${DOCS_DIR}/deployment.md\n`);

  // 6. Sync to Notion (optional)
  console.log('[sync-docs] Attempting Notion sync...');
  await syncToNotion(apiRef, 'Kill Switch API Reference');
  await syncToNotion(configDoc, 'Configuration Reference');
  await syncToNotion(deployDoc, 'Deployment Guide');

  console.log('\n[sync-docs] ✅ Documentation synchronization complete!');
}

main().catch((err) => {
  console.error('[sync-docs] Failed:', err);
  process.exit(1);
});
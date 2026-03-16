/**
 * Load Project Configuration
 * Loads project-specific config from projects/[name].json
 *
 * Usage (module):
 *   import { loadProject } from './load-project.js';
 *   const config = loadProject('humano');
 *
 * Usage (CLI):
 *   node load-project.js --project=humano
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROJECTS_DIR = path.join(__dirname, 'projects');

/**
 * Loads and validates a project config.
 * @param {string} projectName
 * @returns {Object} config
 */
function loadProject(projectName) {
  const configFile = path.join(PROJECTS_DIR, `${projectName}.json`);

  if (!fs.existsSync(configFile)) {
    const available = getAvailableProjects();
    throw new Error(
      `Project config not found: ${configFile}\nAvailable: ${available.join(', ')}`
    );
  }

  const raw = fs.readFileSync(configFile, 'utf8');
  const config = JSON.parse(raw);

  // Resolve ${ENV_VAR} placeholders in twitter credentials
  ['consumerKey', 'consumerSecret', 'accessToken', 'accessSecret'].forEach((key) => {
    const val = config.twitter?.[key];
    if (val && val.startsWith('${') && val.endsWith('}')) {
      const envVar = val.slice(2, -1);
      config.twitter[key] = process.env[envVar] || val;
    }
  });

  const required = ['name', 'twitter'];
  for (const field of required) {
    if (!config[field]) throw new Error(`Missing required field: ${field}`);
  }
  if (!config.twitter.handle) throw new Error('Missing twitter.handle');

  console.log(`✅ Loaded project: ${config.name} (${config.twitter.handle})`);
  return config;
}

function getAvailableProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs
    .readdirSync(PROJECTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''));
}

// CLI
if (require.main === module) {
  const projectArg = process.argv.find((a) => a.startsWith('--project='));
  if (!projectArg) {
    console.log(`Available projects: ${getAvailableProjects().join(', ')}`);
    process.exit(0);
  }
  const config = loadProject(projectArg.split('=')[1]);
  console.log(JSON.stringify(config, null, 2));
}

export { getAvailableProjects, loadProject };


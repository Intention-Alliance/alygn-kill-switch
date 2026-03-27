/**
 * Load Project Configuration
 * Loads project-specific Twitter config from JSON file
 * 
 * Usage:
 *   node load-project.js --project=myproject
 *   node load-project.js --config=/path/to/config.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = path.join(__dirname, 'projects');

/**
 * Loads project configuration
 * @param {string} projectName - Project name (looks for projects/[name].json)
 * @returns {Object} Project configuration
 */
function loadProject(projectName) {
  const configFile = path.join(PROJECTS_DIR, `${projectName}.json`);
  
  if (!fs.existsSync(configFile)) {
    throw new Error(`Project config not found: ${configFile}\nAvailable projects: ${getAvailableProjects().join(', ')}`);
  }
  
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  
  // Validate required fields
  const required = ['name', 'twitter'];
  for (const field of required) {
    if (!config[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // Validate Twitter config
  const twitter = config.twitter;
  if (!twitter.handle) {
    throw new Error('Missing twitter.handle');
  }
  if (!twitter.consumerKey || !twitter.consumerSecret || !twitter.accessToken || !twitter.accessSecret) {
    console.warn('⚠️  Twitter API credentials not configured in config file. Will use environment variables.');
  }
  
  console.log(`✅ Loaded project: ${config.name}`);
  console.log(`   Twitter: ${twitter.handle}`);
  console.log(`   Voice: ${config.twitter.voice || 'default'}`);
  console.log(`   Topics: ${(config.twitter.topics || []).join(', ') || 'none'}`);
  
  return config;
}

/**
 * Gets list of available projects
 */
function getAvailableProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) {
    return [];
  }
  
  return fs.readdirSync(PROJECTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

/**
 * Saves project configuration
 */
function saveProject(config) {
  const configFile = path.join(PROJECTS_DIR, `${config.name}.json`);
  
  if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  }
  
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  console.log(`💾 Saved project config: ${configFile}`);
}

/**
 * Creates project from template
 */
function createFromTemplate(projectName, template = 'default') {
  const templateConfig = getTemplate(template);
  templateConfig.name = projectName;
  
  saveProject(templateConfig);
  return templateConfig;
}

/**
 * Gets template configuration
 */
function getTemplate(templateName) {
  const templates = {
    default: {
      name: 'project-name',
      twitter: {
        handle: '@projecthandle',
        voice: 'professional',
        topics: ['Technology', 'Innovation'],
        hashtags: ['#Tech', '#Innovation'],
        signature: 'more at @projecthandle',
        signaturePosition: 'end'
      },
      grok: {
        systemPrompt: 'You are a professional AI assistant...',
        temperature: 0.7,
        maxTokens: 1000
      },
      schedule: {
        postsPerDay: 3,
        repliesPerDay: 5,
        quotesPerDay: 2
      }
    },
    alygn: {
      name: 'alygn',
      twitter: {
        handle: '@aialygn',
        voice: 'institutional',
        topics: ['AI Governance', 'AI Safety', 'Coordination'],
        hashtags: ['#AIGovernance', '#AIAlignment', '#AISafety'],
        signature: 'more at @aialygn',
        signaturePosition: 'end'
      },
      grok: {
        systemPrompt: 'You are writing for Alygn, an independent AI governance institution...',
        temperature: 0.5,
        maxTokens: 1500
      },
      schedule: {
        postsPerDay: 1,
        repliesPerDay: 3,
        quotesPerDay: 2
      }
    },
    casual: {
      name: 'casual-brand',
      twitter: {
        handle: '@casualbrand',
        voice: 'casual',
        topics: ['Lifestyle', 'Community'],
        hashtags: ['#Community', '#Lifestyle'],
        signature: 'Join us! @casualbrand',
        signaturePosition: 'end'
      },
      grok: {
        systemPrompt: 'You are a friendly, casual brand voice...',
        temperature: 0.8,
        maxTokens: 800
      },
      schedule: {
        postsPerDay: 5,
        repliesPerDay: 10,
        quotesPerDay: 3
      }
    }
  };
  
  return templates[templateName] || templates.default;
}

// CLI usage
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  const projectArg = args.find(a => a.startsWith('--project='));
  const configArg = args.find(a => a.startsWith('--config='));
  const createArg = args.find(a => a.startsWith('--create='));
  const templateArg = args.find(a => a.startsWith('--template='));
  const listArg = args.includes('--list');
  
  if (listArg) {
    const projects = getAvailableProjects();
    console.log('Available projects:');
    projects.forEach(p => console.log(`  - ${p}`));
    if (projects.length === 0) {
      console.log('  (none)');
      console.log('\nCreate one with: node load-project.js --create=myproject --template=default');
    }
    process.exit(0);
  }
  
  if (createArg) {
    const projectName = createArg.split('=')[1];
    const template = templateArg ? templateArg.split('=')[1] : 'default';
    const config = createFromTemplate(projectName, template);
    console.log(`✅ Created project: ${projectName}`);
    console.log(`   Template: ${template}`);
    console.log(`   Config: ${PROJECTS_DIR}/${projectName}.json`);
    process.exit(0);
  }
  
  if (configArg) {
    const configPath = configArg.split('=')[1];
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('Loaded config:');
    console.log(JSON.stringify(config, null, 2));
    process.exit(0);
  }
  
  if (projectArg) {
    const projectName = projectArg.split('=')[1];
    try {
      const config = loadProject(projectName);
      console.log('\nConfiguration:');
      console.log(JSON.stringify(config, null, 2));
      process.exit(0);
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  }
  
  console.error('Usage:');
  console.error('  node load-project.js --project=name       Load project config');
  console.error('  node load-project.js --config=path.json   Load specific config file');
  console.error('  node load-project.js --create=name        Create new project');
  console.error('  node load-project.js --list               List available projects');
  console.error('\nOptions:');
  console.error('  --template=name   Use template (default, alygn, casual)');
  process.exit(1);
}

export {
  loadProject,
  saveProject,
  createFromTemplate,
  getAvailableProjects,
  getTemplate
};

/**
 * Checkpoint - Batch State Management
 * 
 * Saves and loads pipeline state for resumability.
 * Pure deterministic script (no LLM/sub-agent).
 * 
 * Usage:
 *   import checkpoint from "./checkpoint.js";
 *   
 *   // Save state
 *   checkpoint.save('cr', 1, { step: 'research', completed: 45 });
 *   
 *   // Load state
 *   const state = checkpoint.load('cr', 1);
 *   
 *   // Resume from checkpoint
 *   if (checkpoint.exists('cr', 1)) {
 *     const state = checkpoint.load('cr', 1);
 *     resumeFrom(state);
 *   }
 */

import fs from "fs";
import path from "path";

const CHECKPOINT_DIR = path.join(__dirname, '../../checkpoints');

// Ensure checkpoint directory exists
if (!fs.existsSync(CHECKPOINT_DIR)) {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
}

/**
 * Save checkpoint state
 * @param {string} region - Region code (e.g., 'cr', 'usa')
 * @param {number} wave - Wave number
 * @param {Object} state - State to save
 * @returns {string} Checkpoint file path
 */
function save(region, wave, state) {
  const file = path.join(CHECKPOINT_DIR, `${region}-wave${wave}.json`);
  
  const checkpointData = {
    region,
    wave,
    timestamp: new Date().toISOString(),
    state
  };
  
  fs.writeFileSync(file, JSON.stringify(checkpointData, null, 2));
  console.log(`💾 Checkpoint saved: ${file}`);
  
  return file;
}

/**
 * Load checkpoint state
 * @param {string} region - Region code
 * @param {number} wave - Wave number
 * @returns {Object|null} State or null if not found
 */
function load(region, wave) {
  const file = path.join(CHECKPOINT_DIR, `${region}-wave${wave}.json`);
  
  if (!fs.existsSync(file)) {
    console.log(`⚠️  No checkpoint found for ${region} Wave ${wave}`);
    return null;
  }
  
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`📖 Checkpoint loaded: ${file}`);
  console.log(`   Timestamp: ${data.timestamp}`);
  console.log(`   State: ${JSON.stringify(data.state)}`);
  
  return data.state;
}

/**
 * Check if checkpoint exists
 * @param {string} region - Region code
 * @param {number} wave - Wave number
 * @returns {boolean}
 */
function exists(region, wave) {
  const file = path.join(CHECKPOINT_DIR, `${region}-wave${wave}.json`);
  return fs.existsSync(file);
}

/**
 * Delete checkpoint
 * @param {string} region - Region code
 * @param {number} wave - Wave number
 * @returns {boolean} Success
 */
function remove(region, wave) {
  const file = path.join(CHECKPOINT_DIR, `${region}-wave${wave}.json`);
  
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`🗑️  Checkpoint deleted: ${file}`);
    return true;
  }
  
  return false;
}

/**
 * List all checkpoints
 * @returns {Array} List of checkpoint info
 */
function list() {
  if (!fs.existsSync(CHECKPOINT_DIR)) {
    return [];
  }
  
  const files = fs.readdirSync(CHECKPOINT_DIR);
  
  return files
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const filePath = path.join(CHECKPOINT_DIR, f);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        file: f,
        region: data.region,
        wave: data.wave,
        timestamp: data.timestamp,
        state: data.state
      };
    });
}

/**
 * Get checkpoint age in hours
 * @param {string} region - Region code
 * @param {number} wave - Wave number
 * @returns {number|null} Age in hours or null if not found
 */
function getAge(region, wave) {
  const checkpoint = load(region, wave);
  
  if (!checkpoint || !checkpoint.timestamp) {
    return null;
  }
  
  const now = new Date();
  const created = new Date(checkpoint.timestamp);
  const diffMs = now - created;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  return diffHours;
}

/**
 * Check if checkpoint is stale (older than threshold)
 * @param {string} region - Region code
 * @param {number} wave - Wave number
 * @param {number} thresholdHours - Stale threshold in hours
 * @returns {boolean}
 */
function isStale(region, wave, thresholdHours = 24) {
  const age = getAge(region, wave);
  
  if (age === null) {
    return false;
  }
  
  return age > thresholdHours;
}

/**
 * Auto-save state with timestamp
 * @param {string} region - Region code
 * @param {number} wave - Wave number
 * @param {Object} partialState - Partial state to merge
 * @returns {Object} Merged state
 */
function autoSave(region, wave, partialState) {
  const existing = load(region, wave) || {};
  const merged = { ...existing, ...partialState };
  
  save(region, wave, merged);
  
  return merged;
}

export {
  save,
  load,
  exists,
  remove,
  list,
  getAge,
  isStale,
  autoSave,
  CHECKPOINT_DIR
};

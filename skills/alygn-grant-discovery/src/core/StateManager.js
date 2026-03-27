// StateManager - Pipeline state persistence
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = process.env.STATE_DIR || '/tmp/alygn-grants-state';

export class StateManager {
  constructor(prefix = 'grants') {
    this.prefix = prefix;
    this._ensureStateDir();
  }

  _ensureStateDir() {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
  }

  _getFilename(phase) {
    const date = new Date().toISOString().split('T')[0];
    return path.join(STATE_DIR, `${this.prefix}-${phase}-${date}.json`);
  }

  async save(phase, data) {
    const state = {
      timestamp: new Date().toISOString(),
      phase,
      hostname: os.hostname(),
      data
    };
    const file = this._getFilename(phase);
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
    return state;
  }

  async load(phase) {
    const file = this._getFilename(phase);
    if (!fs.existsSync(file)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(file, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  async list(phase) {
    const pattern = `${this.prefix}-${phase}-`;
    const files = fs.readdirSync(STATE_DIR)
      .filter(f => f.startsWith(pattern) && f.endsWith('.json'))
      .map(f => ({
        file: path.join(STATE_DIR, f),
        date: f.replace(pattern, '').replace('.json', ''),
        modified: fs.statSync(path.join(STATE_DIR, f)).mtime
      }))
      .sort((a, b) => b.modified - a.modified);
    return files;
  }

  async clear(phase) {
    const files = await this.list(phase);
    for (const { file } of files) {
      fs.unlinkSync(file);
    }
    return { cleared: files.length };
  }
}

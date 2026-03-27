// Logger - Structured logging with rotation
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, '../../logs');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

const LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

class Logger {
  constructor() {
    this.level = LEVELS.DEBUG;
    this._ensureLogDir();
  }

  _ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  }

  _formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] ${message}${metaStr}\n`;
  }

  _write(msg) {
    const logFile = path.join(LOG_DIR, `grants-${this._getDateStr()}.log`);
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_LOG_SIZE) {
      const archiveFile = path.join(LOG_DIR, `grants-${this._getDateStr()}-${Date.now()}.log`);
      fs.renameSync(logFile, archiveFile);
    }
    fs.appendFileSync(logFile, msg);
    if (process.env.NODE_ENV !== 'test') {
      process.stdout.write(msg);
    }
  }

  _getDateStr() {
    return new Date().toISOString().split('T')[0];
  }

  debug(message, meta) { if (this.level <= LEVELS.DEBUG) this._write(this._formatMessage('DEBUG', message, meta)); }
  info(message, meta) { if (this.level <= LEVELS.INFO) this._write(this._formatMessage('INFO', message, meta)); }
  warn(message, meta) { if (this.level <= LEVELS.WARN) this._write(this._formatMessage('WARN', message, meta)); }
  error(message, meta) { if (this.level <= LEVELS.ERROR) this._write(this._formatMessage('ERROR', message, meta)); }
}

export const logger = new Logger();

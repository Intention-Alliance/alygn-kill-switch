/**
 * Signal Adapter for Outreach Listener
 * 
 * Listens for incoming Signal messages via dbus
 * Emits standardized messages to the WebSocket Pool
 * 
 * @module services/adapters/signal-adapter
 */

const EventEmitter = require('events');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Signal Adapter
 * Connects to signal-cli via dbus interface
 */
class SignalAdapter extends EventEmitter {
  /**
   * @param {Object} config - Configuration object
   * @param {string} config.number - Signal phone number
   * @param {string} config.dbus_service - D-Bus service name
   * @param {string} config.dbus_object - D-Bus object path
   * @param {boolean} config.enabled - Enable adapter
   */
  constructor(config = {}) {
    super();
    
    this.config = {
      number: config.number || process.env.SIGNAL_NUMBER || '+50662163355',
      dbus_service: config.dbus_service || 'org.asamk.Signal',
      dbus_object: config.dbus_object || '/org/asamk/Signal',
      enabled: config.enabled !== false,
      ...config
    };
    
    this.isConnected = false;
    this.dbusWatcher = null;
    this.seenMessageIds = new Set();
    this.stateFile = './state/signal-seen-ids.json';
    
    // Bind methods
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.sendMessage = this.sendMessage.bind(this);
  }

  /**
   * Connect to Signal via dbus
   * @returns {Promise<boolean>}
   */
  async connect() {
    if (!this.config.enabled) {
      console.log('[SignalAdapter] Adapter disabled, skipping connection');
      return false;
    }

    try {
      // Check if signal-cli is available
      await this._checkSignalCli();
      
      // Start dbus monitoring
      await this._startDbusWatcher();
      
      this.isConnected = true;
      console.log(`[SignalAdapter] Connected to Signal (${this.config.number})`);
      
      this.emit('connected');
      return true;
    } catch (error) {
      console.error('[SignalAdapter] Connection failed:', error.message);
      this.emit('error', error);
      
      // Fail-open: continue without Signal
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Disconnect from Signal
   * @returns {Promise<void>}
   */
  async disconnect() {
    this._stopDbusWatcher();
    
    if (this.dbusWatcher) {
      try {
        this.dbusWatcher.kill();
      } catch (error) {
        console.warn('[SignalAdapter] Error killing watcher:', error.message);
      }
      this.dbusWatcher = null;
    }
    
    this.isConnected = false;
    this.emit('disconnected');
  }

  /**
   * Check if signal-cli is available
   * @private
   * @returns {Promise<void>}
   */
  async _checkSignalCli() {
    try {
      await execAsync('which signal-cli');
    } catch (error) {
      throw new Error('signal-cli not found in PATH. Install with: apt install signal-cli');
    }
  }

  /**
   * Start D-Bus message watcher
   * @private
   * @returns {Promise<void>}
   */
  async _startDbusWatcher() {
    // Use dbus-monitor to watch for Signal messages
    const dbusCommand = `dbus-monitor --system "type='signal',interface='${this.config.dbus_service}'"`;
    
    this.dbusWatcher = exec(dbusCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('[SignalAdapter] D-Bus watcher error:', error.message);
        this.emit('error', error);
        this._scheduleReconnect();
        return;
      }
      
      if (stderr) {
        console.warn('[SignalAdapter] D-Bus stderr:', stderr);
      }
      
      // Parse stdout for incoming messages
      this._parseDbusOutput(stdout);
    });

    // Handle stdout data
    this.dbusWatcher.stdout.on('data', (data) => {
      this._handleDbusData(data.toString());
    });

    // Don't prevent process exit
    this.dbusWatcher.unref();
  }

  /**
   * Stop D-Bus watcher
   * @private
   */
  _stopDbusWatcher() {
    if (this.dbusWatcher) {
      this.dbusWatcher.kill();
      this.dbusWatcher = null;
    }
  }

  /**
   * Parse D-Bus output for messages
   * @private
   * @param {string} data - D-Bus output
   */
  _handleDbusData(data) {
    // Simple parsing for Signal messageReceived signals
    // Format: signal-cli emits: messageReceived timestamp sender message
    const lines = data.split('\n');
    
    for (const line of lines) {
      if (line.includes('messageReceived')) {
        this._parseSignalMessage(line);
      }
    }
  }

  /**
   * Parse a Signal message from dbus output
   * @private
   * @param {string} line - D-Bus line
   */
  _parseSignalMessage(line) {
    // Extract timestamp, sender, and message from dbus output
    // This is a simplified parser - adjust based on actual signal-cli output format
    const match = line.match(/messageReceived.*?(\d+)\s+(\+\d+)\s+(.+)/);
    
    if (!match) return;
    
    const [, timestamp, sender, message] = match;
    const messageId = `signal-${timestamp}-${sender}`;
    
    // Skip duplicates
    if (this.seenMessageIds.has(messageId)) {
      return;
    }
    
    this.seenMessageIds.add(messageId);
    
    // Emit to WebSocket Pool
    const signalData = {
      type: 'signal',
      data: {
        id: messageId,
        from: {
          number: sender,
          name: '' // Would need contact lookup
        },
        to: {
          number: this.config.number
        },
        body: {
          text: message.trim(),
          attachments: []
        },
        timestamp: new Date(parseInt(timestamp) * 1000).toISOString(),
        groupId: null,
        isGroup: false
      },
      timestamp: Date.now(),
      source: 'signal'
    };
    
    this.emit('message', signalData);
  }

  /**
   * Send a Signal message
   * @param {string} to - Recipient number
   * @param {string} message - Message text
   * @returns {Promise<boolean>}
   */
  async sendMessage(to, message) {
    if (!this.config.enabled) {
      console.warn('[SignalAdapter] Cannot send - adapter disabled');
      return false;
    }

    try {
      const command = `signal-cli -u ${this.config.number} send -m "${message}" "${to}"`;
      await execAsync(command);
      console.log(`[SignalAdapter] Message sent to ${to}`);
      return true;
    } catch (error) {
      console.error('[SignalAdapter] Send failed:', error.message);
      return false;
    }
  }

  /**
   * Schedule reconnection
   * @private
   */
  _scheduleReconnect() {
    if (this.isConnected) {
      this.isConnected = false;
      console.log('[SignalAdapter] Scheduling reconnect in 30s...');
      setTimeout(() => {
        this.connect();
      }, 30000);
    }
  }

  /**
   * Get adapter status
   * @returns {Object}
   */
  getStatus() {
    return {
      connected: this.isConnected,
      number: this.config.number,
      enabled: this.config.enabled,
      seenMessages: this.seenMessageIds.size
    };
  }
}

module.exports = { SignalAdapter };
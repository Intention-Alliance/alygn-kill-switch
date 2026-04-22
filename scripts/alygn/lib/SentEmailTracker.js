/**
 * SentEmailTracker
 * Tracks sent emails to prevent duplicates — backed by Supabase
 *
 * MIGRATED: Local JSON (sent-emails.json) → Supabase outreach_emails table
 * All reads/writes go through Supabase. No local file I/O.
 *
 * Updated: 2026-04-22 — Phase 1 critical fix (stale local data)
 */

import { getSupabaseClient } from './supabase-client.js';

export class SentEmailTracker {
  constructor() {
    this._cache = { vcs: [], municipalities: [], lastUpdated: null };
    this._cacheLoaded = false;
  }

  /**
   * Load sent emails from Supabase (lazy, cached per instance)
   */
  async _ensureCache() {
    if (this._cacheLoaded) return;

    const supabase = getSupabaseClient();

    try {
      const { data, error } = await supabase
        .from('outreach_emails')
        .select('*')
        .not('sent_at', 'is', null);

      if (error) {
        console.error('[SentEmailTracker] Supabase load error:', error.message);
        // Keep empty cache rather than crash
        this._cacheLoaded = true;
        return;
      }

      // Partition into vc / municipal buckets based on available fields
      const vcs = [];
      const municipalities = [];

      for (const row of data || []) {
        const entry = {
          email: row.recipient_email || row.contact_email,
          name: row.recipient_name || row.contact_name,
          partnerName: row.partner_name || null,
          vcName: row.vc_name || row.recipient_name || null,
          subject: row.subject,
          sentAt: row.sent_at,
          messageId: row.message_id,
        };

        if (row.type === 'vc' || row.vc_name) {
          vcs.push(entry);
        } else {
          municipalities.push(entry);
        }
      }

      this._cache = {
        vcs,
        municipalities,
        lastUpdated: data?.length ? data[data.length - 1].sent_at : null,
      };
      console.log(`[SentEmailTracker] Loaded ${vcs.length} VC + ${municipalities.length} muni records from Supabase`);
    } catch (err) {
      console.error('[SentEmailTracker] Failed to load from Supabase:', err.message);
    }

    this._cacheLoaded = true;
  }

  /**
   * Check if email was already sent
   * @param {string} email
   * @param {string} partnerName - (VC-level tracking)
   * @param {string} type - 'vc' or 'municipal'
   * @returns {Promise<boolean>}
   */
  async wasAlreadySent(email, partnerName, type) {
    await this._ensureCache();
    const key = type === 'vc' ? 'vcs' : 'municipalities';

    if (!email) return false;

    if (type === 'vc' && partnerName) {
      return this._cache[key].some(
        (e) => e.email?.toLowerCase() === email.toLowerCase() && e.partnerName === partnerName
      );
    }

    return this._cache[key].some(
      (e) => e.email?.toLowerCase() === email.toLowerCase()
    );
  }

  /**
   * Record sent email to Supabase
   * @param {Object} params
   */
  async recordSent(params) {
    const { email, name, partnerName, vcName, type, subject, sentAt, messageId } = params;

    if (!email) {
      console.warn('[SentEmailTracker] Cannot record: no email provided');
      return;
    }

    const supabase = getSupabaseClient();

    const row = {
      recipient_email: email,
      recipient_name: name || partnerName,
      partner_name: partnerName || null,
      vc_name: vcName || name || null,
      type: type || 'municipal',
      subject,
      sent_at: sentAt || new Date().toISOString(),
      message_id: messageId || `alygn-${Date.now()}`,
      status: 'sent',
    };

    try {
      const { error } = await supabase.from('outreach_emails').insert(row);

      if (error) {
        console.error(`[SentEmailTracker] Supabase insert error for ${email}:`, error.message);
        return;
      }

      console.log(`[SentEmailTracker] Recorded ${email}${partnerName ? ` (${partnerName})` : ''} in Supabase`);

      // Update local cache
      const key = type === 'vc' ? 'vcs' : 'municipalities';
      const entry = {
        email,
        name,
        partnerName: partnerName || null,
        vcName: vcName || name,
        subject,
        sentAt: row.sent_at,
        messageId: row.message_id,
      };

      const existingIdx = this._cache[key].findIndex(
        (e) => e.email?.toLowerCase() === email.toLowerCase()
      );
      if (existingIdx >= 0) {
        this._cache[key][existingIdx] = entry;
      } else {
        this._cache[key].push(entry);
      }
      this._cache.lastUpdated = row.sent_at;
    } catch (err) {
      console.error(`[SentEmailTracker] Failed to record ${email}:`, err.message);
    }
  }

  /**
   * Get sent emails list
   * @param {string} type - 'vc' or 'municipal'
   * @returns {Promise<Array>}
   */
  async getSent(type) {
    await this._ensureCache();
    const key = type === 'vc' ? 'vcs' : 'municipalities';
    return this._cache[key];
  }

  /**
   * Get count
   * @param {string} type
   * @returns {Promise<number>}
   */
  async getCount(type) {
    const list = await this.getSent(type);
    return list.length;
  }

  /**
   * Get full stats
   * @returns {Promise<Object>}
   */
  async getStats() {
    return {
      vcs: await this.getCount('vc'),
      municipalities: await this.getCount('municipal'),
      total: (await this.getCount('vc')) + (await this.getCount('municipal')),
      lastUpdated: this._cache.lastUpdated,
    };
  }

  /**
   * Get last sent entry for an email
   */
  async getSentEntry(email, partnerName, type) {
    await this._ensureCache();
    const key = type === 'vc' ? 'vcs' : 'municipalities';

    if (!email) return null;

    if (type === 'vc' && partnerName) {
      return (
        this._cache[key].find(
          (e) => e.email?.toLowerCase() === email.toLowerCase() && e.partnerName === partnerName
        ) || null
      );
    }

    return (
      this._cache[key].find((e) => e.email?.toLowerCase() === email.toLowerCase()) || null
    );
  }

  /**
   * Check if specific partner was already emailed at a VC
   */
  async wasPartnerEmailed(email, partnerName) {
    await this._ensureCache();
    if (!email || !partnerName) return false;
    return this._cache.vcs.some(
      (e) => e.email?.toLowerCase() === email.toLowerCase() && e.partnerName === partnerName
    );
  }

  /**
   * Get partners already emailed at a specific VC
   */
  async getEmailedPartners(email) {
    await this._ensureCache();
    if (!email) return [];
    return this._cache.vcs
      .filter((e) => e.email?.toLowerCase() === email.toLowerCase())
      .map((e) => e.partnerName)
      .filter(Boolean);
  }

  /**
   * Clear local cache (does NOT delete Supabase records)
   */
  clearCache() {
    this._cache = { vcs: [], municipalities: [], lastUpdated: null };
    this._cacheLoaded = false;
  }
}

export default SentEmailTracker;
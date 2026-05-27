/**
 * SentInboxCanonical — IMAP-based canonical ground truth for sent emails.
 * 
 * Rule: Gmail's Sent folder is canonical. sent-emails.json is a cache.
 * Before any dedup check, reconcile sent-emails.json against IMAP.
 * 
 * Used by: VCDiscoveryStrategy (Fix 2), VCResearchStrategy (Fix 3)
 */
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME || '/home/andlersrv';
const SENT_TRACKER_PATH = path.join(HOME, '.openclaw/workspace/scripts/alygn/lib/sent-emails.json');

export interface SentEntry {
  email: string;
  name: string;
  partnerName?: string | null;
  subject?: string;
  sentAt?: string;
  messageId?: string;
  source: 'smtp-tracker' | 'imap-sent-folder';
}

export interface CanonicalState {
  sentEmails: Set<string>;
  sentDomains: Set<string>;
  entries: SentEntry[];
  source: 'imap' | 'tracker-file' | 'unknown';
  reconciled: boolean;
  trackerCount: number;
  imapCount: number;
}

const IMAP_CONFIG = {
  user: 'alyyygn@gmail.com',
  password: 'pvjktbdzkgimrzlw',
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
};

/**
 * Connect to Gmail IMAP and scan Sent folder for Alygn outreach emails.
 * Returns canonical set of sent emails/domains.
 */
export async function getSentFromIMAP(): Promise<{ emails: string[]; count: number }> {
  return new Promise((resolve, reject) => {
    const imap = new Imap(IMAP_CONFIG);
    const sentEmails: string[] = [];

    imap.once('ready', () => {
      imap.openBox('[Gmail]/Sent Mail', false, (err, box) => {
        if (err) {
          // Try alternate Gmail sent folder names
          imap.openBox('Sent', false, (err2) => {
            if (err2) {
              imap.end();
              reject(new Error(`Cannot open Sent folder: ${err.message} / ${err2.message}`));
              return;
            }
            searchAndFetch(imap, sentEmails, resolve, reject);
          });
          return;
        }
        searchAndFetch(imap, sentEmails, resolve, reject);
      });
    });

    imap.once('error', (err) => reject(err));
    imap.connect();
  });
}

function searchAndFetch(
  imap: Imap,
  sentEmails: string[],
  resolve: (value: { emails: string[]; count: number }) => void,
  reject: (reason: Error) => void
) {
  // Search for Alygn emails: sent in last 90 days, from alyygn
  const since = new Date();
  since.setDate(since.getDate() - 90);

  imap.search([['FROM', 'alyygn@gmail.com'], ['SINCE', since]], (err, results) => {
    if (err || results.length === 0) {
      imap.end();
      if (err) reject(err);
      else resolve({ emails: [], count: 0 });
      return;
    }

    const fetch = imap.fetch(results, { bodies: 'HEADER.FIELDS (TO CC SUBJECT DATE MESSAGE-ID)', struct: true });
    let processed = 0;

    fetch.on('message', (msg) => {
      msg.on('body', (stream) => {
        let header = '';
        stream.on('data', (chunk) => header += chunk.toString('utf8'));
        stream.once('end', () => {
          // Extract To, CC, and Subject from headers
          const toMatch = header.match(/^To:\s*(.+)$/im);
          const ccMatch = header.match(/^Cc:\s*(.+)$/im);
          const subjectMatch = header.match(/^Subject:\s*(.+)$/im);

          if (toMatch) {
            // Extract email addresses from To field
            const toAddr = toMatch[1];
            const emails = toAddr.match(/[\w.+-]+@[\w.-]+\.\w+/g) || [];
            emails.forEach(e => sentEmails.push(e.toLowerCase()));
          }
          if (ccMatch) {
            const ccAddr = ccMatch[1];
            const emails = ccAddr.match(/[\w.+-]+@[\w.-]+\.\w+/g) || [];
            emails.forEach(e => {
              // Don't add CC emails (Tania) as "sent-to" VCs
              if (!e.toLowerCase().includes('tania')) {
                sentEmails.push(e.toLowerCase());
              }
            });
          }
          processed++;
        });
      });
    });

    fetch.once('error', (err) => { imap.end(); reject(err); });
    fetch.once('end', () => {
      imap.end();
      const unique = [...new Set(sentEmails)];
      resolve({ emails: unique, count: unique.length });
    });
  });
}

/**
 * Reconcile sent-emails.json against IMAP ground truth.
 * 
 * Strategy:
 * 1. Try IMAP first — if it connects, IMAP IS the truth
 * 2. Merge: any email in IMAP not in tracker → add to tracker
 * 3. Any email in tracker not in IMAP → keep (may be pre-IMAP history)
 * 4. If IMAP fails → fall back to tracker file + log warning
 */
export async function reconcileSentState(): Promise<CanonicalState> {
  // Load tracker file
  let trackerEntries: SentEntry[] = [];
  try {
    const raw = fs.readFileSync(SENT_TRACKER_PATH, 'utf8');
    const data = JSON.parse(raw);
    const vcs = data.vcs || [];
    trackerEntries = vcs.map((v: Record<string, unknown>) => ({
      email: (v.email as string || '').toLowerCase(),
      name: (v.name as string) || '',
      partnerName: (v.partnerName as string) || null,
      subject: v.subject as string,
      sentAt: v.sentAt as string,
      messageId: v.messageId as string,
      source: 'smtp-tracker' as const
    }));
  } catch {
    trackerEntries = [];
  }

  // Try IMAP
  try {
    const imapResult = await getSentFromIMAP();
    const imapEmails = new Set(imapResult.emails);

    console.log(`📬 IMAP reconciled: ${imapResult.count} sent emails, ${trackerEntries.length} tracker entries`);

    // Merge: add IMAP emails not in tracker
    const trackerEmailSet = new Set(trackerEntries.map(e => e.email));
    let newFromIMAP = 0;

    for (const email of imapEmails) {
      if (!trackerEmailSet.has(email)) {
        trackerEntries.push({
          email,
          name: email.split('@')[0],
          partnerName: null,
          source: 'imap-sent-folder'
        });
        newFromIMAP++;
      }
    }

    if (newFromIMAP > 0) {
      // Write updated tracker
      const updated = {
        vcs: trackerEntries,
        lastUpdated: new Date().toISOString(),
        lastIMAPSync: new Date().toISOString(),
        imapReconciled: true
      };
      const dir = path.dirname(SENT_TRACKER_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(SENT_TRACKER_PATH, JSON.stringify(updated, null, 2));
      console.log(`   ✅ Added ${newFromIMAP} new entries from IMAP to sent-tracker`);
    }

    // Build canonical sets
    const sentEmails = new Set(trackerEntries.map(e => e.email));
    const sentDomains = new Set(
      trackerEntries
        .map(e => e.email.split('@')[1])
        .filter(Boolean)
    );

    return {
      sentEmails,
      sentDomains,
      entries: trackerEntries,
      source: 'imap',
      reconciled: true,
      trackerCount: trackerEmailSet.size,
      imapCount: imapResult.count
    };

  } catch (imapError) {
    console.warn(`   ⚠️  IMAP unreachable: ${(imapError as Error).message}`);
    console.warn(`   📋 Falling back to sent-emails.json (file-only, may be stale)`);

    // Fallback: use tracker file only
    const sentEmails = new Set(trackerEntries.map(e => e.email));
    const sentDomains = new Set(
      trackerEntries
        .map(e => e.email.split('@')[1])
        .filter(Boolean)
    );

    return {
      sentEmails,
      sentDomains,
      entries: trackerEntries,
      source: 'tracker-file',
      reconciled: false,
      trackerCount: sentEmails.size,
      imapCount: 0
    };
  }
}

export default reconcileSentState;

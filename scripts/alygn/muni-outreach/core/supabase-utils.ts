#!/usr/bin/env bun

/**
 * Supabase Utilities for Municipal Outreach Tracking
 * TypeScript + Bun Runtime
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ============================================================
// Type Definitions
// ============================================================

export interface Municipality {
  id: string;
  name: string;
  country?: string;
  region?: string;
  population?: number;
  website_url?: string;
  mayor_name?: string;
  mayor_email?: string;
  council_emails?: string[];
  general_email?: string;
  x_handle?: string;
  status?: MunicipalityStatus;
  sent_date?: string;
  message_id?: string;
  verified_at?: string;
  verification_score?: number;
  verification_reason?: string;
  x_warmup_phase1_at?: string;
  x_warmup_phase2_at?: string;
  x_engagement_count?: number;
  pain_points?: string[];
  ai_governance_signals?: Record<string, unknown>;
  // Wave tracking fields
  wave_number?: number;
  wave_date?: string;
  last_outreach_at?: string;
  created_at?: string;
  updated_at?: string;
}

export type MunicipalityStatus = 
  | "pending"
  | "approved"
  | "rejected"
  | "sent"
  | "research_needed"
  | "validation_failed";

export interface VCContact {
  id: string;
  name?: string;
  firm?: string;
  email?: string;
  linkedin_url?: string;
  twitter_handle?: string;
  investment_focus?: string[];
  fund_size?: string;
  stage_preferences?: string[];
  status?: VCContactStatus;
  // Wave tracking fields
  wave_number?: number;
  wave_date?: string;
  last_outreach_at?: string;
  created_at?: string;
  updated_at?: string;
}

export type VCContactStatus = 
  | "discovered"
  | "validated"
  | "researched"
  | "personalized"
  | "approved"
  | "sent"
  | "replied"
  | "rejected";

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  score?: number;
}

export interface EmailData {
  subject: string;
  body: string;
  variant: "governance" | "institutional";
}

export interface OutreachUpdate {
  status?: MunicipalityStatus;
  sent_date?: string;
  message_id?: string;
  mayor_name?: string;
  verification_score?: number;
  verification_reason?: string;
  updated_at?: string;
}

export interface EmailLogEntry {
  muni_id: string;
  subject: string;
  body: string;
  variant: "governance" | "institutional";
  sent_at: string;
}

// ============================================================
// Client Management
// ============================================================

let supabaseClient: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (supabaseClient) return supabaseClient;

  const credentialsPath = join(process.env.HOME ?? "", ".openclaw", "workspace", "config", "credentials.json");
  
  if (!existsSync(credentialsPath)) {
    throw new Error("Credentials file not found");
  }

  const creds = JSON.parse(readFileSync(credentialsPath, "utf8")) as {
    supabase?: { url: string; key: string };
  };
  
  const { url, key } = creds.supabase ?? {};

  if (!url || !key) {
    throw new Error("Supabase credentials not found");
  }

  supabaseClient = createClient(url, key);
  return supabaseClient;
}

// ============================================================
// Core Database Operations
// ============================================================

/**
 * Update the sent status for a municipality outreach record
 * FIXED: Using municipalities table + outreach_emails instead of municipal_outreach
 */
export async function updateSentStatus(
  muniId: string,
  messageId: string,
  sentDate: Date
): Promise<void> {
  const supabase = getClient();

  // Update municipalities table
  const { error } = await supabase
    .from("municipalities")
    .update({
      outreach_sent_at: sentDate.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", muniId);

  if (error) throw error;
}

/**
 * Query municipalities pending outreach (not yet sent)
 * FIXED: Using municipalities table with outreach_sent_at IS NULL
 */
export async function queryPendingMunicipalities(
  limit: number = 10
): Promise<Municipality[]> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from("municipalities")
    .select("*")
    .is("outreach_sent_at", null)
    .not("mayor_email", "is", null)  // Must have email
    .order("priority_score", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as Municipality[]) ?? [];
}

/**
 * Update research status with mayor name
 */
export async function updateResearchStatus(
  muniId: string,
  mayorName: string
): Promise<void> {
  const supabase = getClient();

  const { error } = await supabase
    .from("municipal_outreach")
    .update({
      mayor_name: mayorName,
      updated_at: new Date().toISOString(),
    } satisfies OutreachUpdate)
    .eq("id", muniId);

  if (error) throw error;
}

/**
 * Check if a municipality has been sent outreach
 * FIXED: Using outreach_emails table to check sent status
 */
export async function checkSentTracker(muniId: string): Promise<boolean> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from("outreach_emails")
    .select("id, sent_at, status")
    .eq("municipality_id", muniId)
    .eq("status", "sent")
    .limit(1);

  if (error) throw error;

  return data && data.length > 0;
}

/**
 * Validate email format and quality
 */
export async function validateEmail(email: string): Promise<ValidationResult> {
  // Basic format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!email || !emailRegex.test(email)) {
    return {
      valid: false,
      reason: "Invalid email format",
      score: 0,
    };
  }

  // Check for common disposable email domains
  const disposableDomains = [
    "tempmail.com",
    "throwaway.email",
    "guerrillamail.com",
    "mailinator.com",
    "10minutemail.com",
    "temp-mail.org",
  ];
  
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  
  if (disposableDomains.some((d) => domain.includes(d))) {
    return {
      valid: false,
      reason: "Disposable email domain detected",
      score: 0,
    };
  }

  // Check for government/institutional indicators
  const institutionalIndicators = [
    ".gov",
    ".gob",
    ".mil",
    ".edu",
    "municipio",
    "municipal",
    "gobierno",
    "ayuntamiento",
    "concejo",
  ];
  
  let institutionalScore = 0;
  
  for (const indicator of institutionalIndicators) {
    if (domain.includes(indicator) || email.toLowerCase().includes(indicator)) {
      institutionalScore += 20;
    }
  }

  // Common valid government email patterns
  const validPatterns = [
    /^[a-z]+\.[a-z]+@/i,  // john.doe@ format
    /^[a-z]+@/i,           // firstname@ format
  ];
  
  let formatScore = 0;
  for (const pattern of validPatterns) {
    if (pattern.test(email)) {
      formatScore += 15;
    }
  }

  // Calculate total score (max 100)
  const totalScore = Math.min(100, institutionalScore + formatScore);
  const isValid = totalScore >= 20 && !disposableDomains.some((d) => domain.includes(d));

  return {
    valid: isValid,
    reason: isValid ? "Valid email format" : "Low quality email format",
    score: totalScore,
  };
}

/**
 * Update validation failure for a municipality
 */
export async function updateValidationFailure(
  muniId: string,
  reason: string
): Promise<void> {
  const supabase = getClient();

  const { error } = await supabase
    .from("municipal_outreach")
    .update({
      status: "validation_failed",
      verification_reason: reason,
      verification_score: 0,
      updated_at: new Date().toISOString(),
    } satisfies OutreachUpdate)
    .eq("id", muniId);

  if (error) throw error;
}

/**
 * Log outreach email to the database
 */
export async function logOutreachEmail(
  muniId: string,
  emailData: EmailData
): Promise<void> {
  const supabase = getClient();

  const logEntry: EmailLogEntry = {
    muni_id: muniId,
    subject: emailData.subject,
    body: emailData.body,
    variant: emailData.variant,
    sent_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("outreach_email_logs").insert(logEntry);

  if (error) throw error;
}

// ============================================================
// Wave Tracking Operations
// ============================================================

/**
 * Update wave tracking fields for a municipality
 */
export async function updateMunicipalityWave(
  muniId: string,
  waveNumber: number,
  waveDate: string
): Promise<void> {
  const supabase = getClient();

  const { error } = await supabase
    .from("municipalities")
    .update({
      wave_number: waveNumber,
      wave_date: waveDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", muniId);

  if (error) throw error;
}

/**
 * Update last outreach timestamp for a municipality
 */
export async function updateMunicipalityLastOutreach(muniId: string): Promise<void> {
  const supabase = getClient();

  const { error } = await supabase
    .from("municipalities")
    .update({
      last_outreach_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", muniId);

  if (error) throw error;
}

/**
 * Query municipalities pending outreach for a specific wave
 */
export async function queryPendingMunicipalitiesByWave(
  waveNumber: number,
  limit: number = 10
): Promise<Municipality[]> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from("municipalities")
    .select("*")
    .is("outreach_sent_at", null)
    .not("mayor_email", "is", null)
    .eq("wave_number", waveNumber)
    .order("priority_score", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as Municipality[]) ?? [];
}

/**
 * Update wave tracking fields for a VC contact
 */
export async function updateVCContactWave(
  contactId: string,
  waveNumber: number,
  waveDate: string
): Promise<void> {
  const supabase = getClient();

  const { error } = await supabase
    .from("vc_contacts")
    .update({
      wave_number: waveNumber,
      wave_date: waveDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId);

  if (error) throw error;
}

/**
 * Update last outreach timestamp for a VC contact
 */
export async function updateVCContactLastOutreach(contactId: string): Promise<void> {
  const supabase = getClient();

  const { error } = await supabase
    .from("vc_contacts")
    .update({
      last_outreach_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId);

  if (error) throw error;
}

/**
 * Query VC contacts pending outreach for a specific wave
 */
export async function queryPendingVCContactsByWave(
  waveNumber: number,
  limit: number = 10
): Promise<VCContact[]> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from("vc_contacts")
    .select("*")
    .is("email", false)
    .eq("wave_number", waveNumber)
    .not("status", "eq", "sent")
    .not("status", "eq", "replied")
    .limit(limit);

  if (error) throw error;
  return (data as VCContact[]) ?? [];
}

// ============================================================
// CLI Interface
// ============================================================

interface CliArgs {
  action?: string;
  muniId?: string;
  mayorName?: string;
  email?: string;
  messageId?: string;
  sentDate?: string;
  limit?: string;
}

function parseCliArgs(): CliArgs {
  const args: CliArgs = {};
  
  for (let i = 2; i < Bun.argv.length; i++) {
    const arg = Bun.argv[i];
    
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      
      switch (key) {
        case "action":
          args.action = value;
          break;
        case "muni-id":
          args.muniId = value;
          break;
        case "mayor-name":
          args.mayorName = value;
          break;
        case "email":
          args.email = value;
          break;
        case "message-id":
          args.messageId = value;
          break;
        case "sent-date":
          args.sentDate = value;
          break;
        case "limit":
          args.limit = value;
          break;
      }
    }
  }
  
  return args;
}

async function runCli() {
  const args = parseCliArgs();
  const { action } = args;

  if (!action) {
    console.log(`
Supabase Utilities CLI
Usage: bun supabase-utils.ts --action=<action> [options]

Actions:
  update-sent        Update sent status for a municipality
  query-pending      Query pending municipalities
  update-research     Update research status with mayor name
  check-sent         Check if municipality has been sent
  validate-email     Validate an email address
  update-validation  Update validation failure for a municipality
  log-email          Log outreach email

Options:
  --muni-id=<id>       Municipality ID
  --mayor-name=<name> Mayor name
  --email=<address>    Email to validate
  --message-id=<id>    Message ID
  --sent-date=<date>   Sent date (ISO format)
  --limit=<n>          Query limit (default: 10)

Examples:
  bun supabase-utils.ts --action=check-sent --muni-id=xxx
  bun supabase-utils.ts --action=validate-email --email=test@example.com
  bun supabase-utils.ts --action=query-pending --limit=5
    `);
    process.exit(0);
  }

  try {
    switch (action) {
      case "update-sent": {
        if (!args.muniId || !args.messageId) {
          throw new Error("muni-id and message-id are required");
        }
        const sentDate = args.sentDate ? new Date(args.sentDate) : new Date();
        await updateSentStatus(args.muniId, args.messageId, sentDate);
        console.log(`✅ Updated sent status for municipality ${args.muniId}`);
        break;
      }

      case "query-pending": {
        const limit = args.limit ? parseInt(args.limit, 10) : 10;
        const municipalities = await queryPendingMunicipalities(limit);
        console.log(`Found ${municipalities.length} pending municipalities:`);
        console.log(JSON.stringify(municipalities, null, 2));
        break;
      }

      case "update-research": {
        if (!args.muniId || !args.mayorName) {
          throw new Error("muni-id and mayor-name are required");
        }
        await updateResearchStatus(args.muniId, args.mayorName);
        console.log(`✅ Updated research status for municipality ${args.muniId}`);
        break;
      }

      case "check-sent": {
        if (!args.muniId) {
          throw new Error("muni-id is required");
        }
        const isSent = await checkSentTracker(args.muniId);
        console.log(`Municipality ${args.muniId} sent: ${isSent}`);
        break;
      }

      case "validate-email": {
        if (!args.email) {
          throw new Error("email is required");
        }
        const result = await validateEmail(args.email);
        console.log(`Email validation result:`);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "update-validation": {
        if (!args.muniId || !args.mayorName) {
          throw new Error("muni-id and reason (mayor-name) are required");
        }
        await updateValidationFailure(args.muniId, args.mayorName);
        console.log(`✅ Updated validation failure for municipality ${args.muniId}`);
        break;
      }

      case "log-email": {
        if (!args.muniId || !args.messageId) {
          throw new Error("muni-id and message-id are required");
        }
        // For logging, we need body and variant - in CLI mode these come from stdin or args
        await logOutreachEmail(args.muniId, {
          subject: args.messageId,
          body: "",
          variant: "governance",
        });
        console.log(`✅ Logged outreach email for municipality ${args.muniId}`);
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (err) {
    console.error(`❌ Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

// Run CLI if executed directly
if (import.meta.main) {
  runCli();
}

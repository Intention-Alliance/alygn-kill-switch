#!/usr/bin/env node

/**
 * Migration Script: Add Wave Tracking Fields
 * Adds wave_number, wave_date, and last_outreach_at columns to existing tables
 * 
 * Usage: node migrate-add-wave-fields.js [--dry-run] [--rollback]
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// ============================================================
// Configuration
// ============================================================

const CONFIG_PATH = path.join(process.env.HOME ?? "", ".openclaw", "workspace", "config", "credentials.json");

// ============================================================
// Helpers
// ============================================================

function loadCredentials() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error("Credentials file not found at: " + CONFIG_PATH);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function getSupabaseClient() {
  const creds = loadCredentials();
  const { url, key } = creds.supabase ?? {};
  
  if (!url || !key) {
    throw new Error("Supabase credentials not found");
  }
  
  return createClient(url, key);
}

// ============================================================
// Migration Definitions
// ============================================================

const MIGRATIONS = [
  {
    name: "add_wave_fields_to_municipalities",
    up: `
      ALTER TABLE municipalities 
      ADD COLUMN IF NOT EXISTS wave_number INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS wave_date DATE,
      ADD COLUMN IF NOT EXISTS last_outreach_at TIMESTAMP WITH TIME ZONE;
    `,
    down: `
      ALTER TABLE municipalities 
      DROP COLUMN IF EXISTS wave_number,
      DROP COLUMN IF EXISTS wave_date,
      DROP COLUMN IF EXISTS last_outreach_at;
    `,
  },
  {
    name: "add_wave_fields_to_vc_contacts",
    up: `
      ALTER TABLE vc_contacts 
      ADD COLUMN IF NOT EXISTS wave_number INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS wave_date DATE,
      ADD COLUMN IF NOT EXISTS last_outreach_at TIMESTAMP WITH TIME ZONE;
    `,
    down: `
      ALTER TABLE vc_contacts 
      DROP COLUMN IF EXISTS wave_number,
      DROP COLUMN IF EXISTS wave_date,
      DROP COLUMN IF EXISTS last_outreach_at;
    `,
  },
];

// ============================================================
// Migration Runner
// ============================================================

async function runMigrations(dryRun = false, rollback = false) {
  const supabase = getSupabaseClient();
  
  console.log("=".repeat(60));
  console.log("Wave Tracking Fields Migration");
  console.log("=".repeat(60));
  console.log(`Mode: ${rollback ? "ROLLBACK" : dryRun ? "DRY RUN" : "LIVE"}`);
  console.log("");

  // Create migrations tracking table if not exists
  if (!dryRun && !rollback) {
    const { error: tableError } = await supabase.rpc("execute_sql", {
      sql: `
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `,
    }).catch(() => {
      // RPC might not exist, try direct table creation
      return supabase.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
    });
  }

  for (const migration of MIGRATIONS) {
    console.log(`\nMigration: ${migration.name}`);
    console.log("-".repeat(40));

    // Check if already applied
    const { data: existing } = await supabase
      .from("schema_migrations")
      .select("id")
      .eq("name", migration.name)
      .single()
      .catch(() => ({ data: null }));

    if (existing && !rollback) {
      console.log("  ⏭️  Already applied, skipping");
      continue;
    }

    if (!existing && rollback) {
      console.log("  ⏭️  Not applied, nothing to rollback");
      continue;
    }

    const sql = rollback ? migration.down : migration.up;
    console.log(`  SQL: ${sql.trim().substring(0, 60)}...`);

    if (dryRun) {
      console.log("  🔍 [DRY RUN] Would execute SQL");
      continue;
    }

    try {
      // Execute the migration
      const { error } = await supabase.rpc("exec", { sql }).catch(async () => {
        // Fallback: try direct query for simpler setups
        return supabase.query(sql);
      });

      if (error) {
        // Some errors are expected (column already exists)
        if (error.message?.includes("already exists")) {
          console.log("  ⚠️  Column(s) already exist, continuing");
        } else {
          throw error;
        }
      }

      // Record migration
      if (!rollback) {
        await supabase.from("schema_migrations").insert({ name: migration.name });
      } else {
        await supabase.from("schema_migrations").delete().eq("name", migration.name);
      }

      console.log(`  ✅ ${rollback ? "Rolled back" : "Applied"} successfully`);
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
      throw err;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Migration complete!");
  console.log("=".repeat(60));
}

// ============================================================
// Verification
// ============================================================

async function verifyMigration() {
  const supabase = getSupabaseClient();
  
  console.log("\nVerifying migration...");
  
  // Check municipalities table
  const { data: muniColumns } = await supabase
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_name", "municipalities")
    .in("column_name", ["wave_number", "wave_date", "last_outreach_at"]);

  console.log("\n📊 Municipalities table:");
  console.log("  Expected columns:");
  console.log("    - wave_number:", muniColumns?.find(c => c.column_name === "wave_number") ? "✅" : "❌");
  console.log("    - wave_date:", muniColumns?.find(c => c.column_name === "wave_date") ? "✅" : "❌");
  console.log("    - last_outreach_at:", muniColumns?.find(c => c.column_name === "last_outreach_at") ? "✅" : "❌");

  // Check vc_contacts table
  const { data: vcColumns } = await supabase
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_name", "vc_contacts")
    .in("column_name", ["wave_number", "wave_date", "last_outreach_at"]);

  console.log("\n📊 VC Contacts table:");
  console.log("  Expected columns:");
  console.log("    - wave_number:", vcColumns?.find(c => c.column_name === "wave_number") ? "✅" : "❌");
  console.log("    - wave_date:", vcColumns?.find(c => c.column_name === "wave_date") ? "✅" : "❌");
  console.log("    - last_outreach_at:", vcColumns?.find(c => c.column_name === "last_outreach_at") ? "✅" : "❌");
}

// ============================================================
// CLI Interface
// ============================================================

function parseArgs() {
  const args = {
    dryRun: false,
    rollback: false,
    verify: false,
  };

  for (const arg of process.argv.slice(2)) {
    switch (arg) {
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--rollback":
        args.rollback = true;
        break;
      case "--verify":
        args.verify = true;
        break;
      case "--help":
        console.log(`
Migration: Add Wave Tracking Fields

Usage: node migrate-add-wave-fields.js [options]

Options:
  --dry-run    Show what would be executed without making changes
  --rollback   Reverse the migration
  --verify     Verify the migration after applying
  --help       Show this help message

Tables affected:
  - municipalities (wave_number, wave_date, last_outreach_at)
  - vc_contacts (wave_number, wave_date, last_outreach_at)
        `);
        process.exit(0);
    }
  }

  return args;
}

// ============================================================
// Main
// ============================================================

async function main() {
  const args = parseArgs();

  try {
    if (args.verify) {
      await verifyMigration();
      return;
    }

    await runMigrations(args.dryRun, args.rollback);

    if (!args.dryRun && !args.rollback) {
      await verifyMigration();
    }
  } catch (err) {
    console.error("\n❌ Migration failed:", err.message);
    process.exit(1);
  }
}

main();

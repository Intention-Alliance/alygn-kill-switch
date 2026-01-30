# ALYGN Ledger - Database Schema

Immutable audit log schema for the ALYGN Sovereign Compliance Infrastructure.

## Overview

This package contains the PostgreSQL/Supabase database schema for the `compliance_audit_log` table, which stores all DPU enforcement events with cryptographic attestation.

## Key Features

- **Immutable Audit Log**: UPDATE and DELETE operations are blocked by database triggers
- **Row-Level Security (RLS)**: Fine-grained access control for service role, authenticated users, and public
- **Zero-Knowledge Proof Storage**: JSONB column for flexible proof data
- **High-Performance Indexes**: Optimized for time-series queries and DPU lookups

## Schema Structure

```
compliance_audit_log
├── id (UUID) - Primary key
├── timestamp (TIMESTAMPTZ) - Server-generated, immutable
├── dpu_id (TEXT) - Data Processing Unit identifier
├── redline_violated (TEXT) - Policy violation (NULL if compliant)
├── intent_hash (TEXT) - SHA-256 hash of intent manifest
└── proof_data (JSONB) - ZKP proofs and attestations
```

## Usage

```bash
# Initialize Supabase locally
supabase init

# Run migrations
npm run db:push

# Generate TypeScript types
npm run db:generate-types
```

## RPC Functions

| Function | Description |
|----------|-------------|
| `log_enforcement_event()` | Log a single DPU event with validation |
| `batch_log_enforcement_events()` | Bulk insert for high-throughput scenarios |
| `verify_proof_integrity()` | Validate ZKP proof structure |
| `get_audit_statistics()` | Monitoring and analytics |

## Security

- Immutability enforced via `prevent_audit_log_modification()` trigger
- Defense-in-depth with RLS deny policies
- Intent hash must be valid SHA-256 (64 hex characters)

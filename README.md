# ALIGN Core Infrastructure

**Sovereign Compliance Infrastructure for AI Safety**

A comprehensive monorepo for the ALIGN (Artificial Ledger for Intelligence Governance Networks) system, implementing hardware-enforced AI safety compliance with cryptoeconomic incentives on the Bitcoin blockchain.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ALIGN Core Infrastructure                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐      │
│  │   Layer 5:      │    │   Layer 4:      │    │   Layer 3:      │      │
│  │  Presentation   │◄───│  Enforcement    │◄───│   Storage       │      │
│  │  (Dashboard)    │    │  (Slashing)     │    │   (Supabase)    │      │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘      │
│           ▲                     ▲                     ▲                  │
│           │                     │                     │                  │
│           └─────────────────────┴─────────────────────┘                  │
│                                 │                                        │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐      │
│  │   Layer 2:      │    │   Layer 1:      │    │   Foundation:   │      │
│  │  Data Collection│◄───│  Infrastructure │    │  Smart Contracts│      │
│  │  (Telemetry)    │    │  (BlueField-3)  │    │  (Taproot)      │      │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Monorepo Structure

| Package/App | Type | Description |
|-------------|------|-------------|
| [`apps/web-regulator`](./apps/web-regulator) | Next.js | Real-time compliance dashboard |
| [`apps/server-slashing-engine`](./apps/server-slashing-engine) | Express.js | Cryptoeconomic enforcement |
| [`apps/server-telemetry-handler`](./apps/server-telemetry-handler) | C++ | ZKP telemetry logging |
| [`apps/server-rdma-monitor`](./apps/server-rdma-monitor) | C++ | BlueField-3 DPU security |
| [`apps/smart-contracts`](./apps/smart-contracts) | Bitcoin | ALIGN token (Taproot) |
| [`packages/db-schema`](./packages/db-schema) | SQL | Supabase migrations |
| [`packages/shared-types`](./packages/shared-types) | TypeScript | Shared type definitions |

---

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/) 1.0+ or [Node.js](https://nodejs.org/) 18+
- [Docker](https://www.docker.com/) (for C++ services)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/align-core-infra.git
cd align-core-infra

# Install dependencies
bun install

# Build all packages
bun run build
```

### Development

```bash
# Start all services in development mode
bun run dev

# Or use Docker Compose
bun run docker:up
```

### Environment Setup

Copy the example environment files:

```bash
cp apps/server-slashing-engine/.env.example apps/server-slashing-engine/.env
cp apps/server-telemetry-handler/.env.example apps/server-telemetry-handler/.env
```

---

## 🔧 Component Details

### Web Regulator (Dashboard)

Real-time compliance monitoring dashboard.

```bash
cd apps/web-regulator
bun install
bun run dev
# Open http://localhost:3000
```

**Features:**
- GPU cluster status monitoring
- Live ledger feed with violations
- Compliance report export
- Supabase Realtime subscriptions

---

### Slashing Engine

Cryptoeconomic enforcement service.

```bash
cd apps/server-slashing-engine
bun install
bun run dev
# Server starts on http://localhost:3001
```

**Endpoints:**
- `POST /api/slashing/webhook` - Supabase webhook receiver
- `GET /api/slashing/violations` - Recent violations
- `GET /api/slashing/rules` - Slashing rules

---

### Telemetry Handler (C++)

Async telemetry logging with Zero-Knowledge Proofs.

```bash
cd apps/server-telemetry-handler
docker build -t align-telemetry-handler .
docker run --env-file .env align-telemetry-handler
```

**Requirements:**
- libpqxx, OpenSSL, libsodium
- C++17 compiler

---

### RDMA Monitor (C++)

Hardware-level security for BlueField-3 DPUs.

```bash
cd apps/server-rdma-monitor
# Requires NVIDIA DOCA SDK
docker build -f Dockerfile.dpu -t align-rdma-monitor .
```

**Features:**
- RDMA OpCode classification
- Malformed packet detection (10 pkts/1ms)
- Intent Manifest validation
- Grid Threat detection (380 Gbps)
- Hardware kill-switch (~3.4ms)

---

## 📊 Database Schema

The compliance audit log is stored in Supabase with immutability enforcement:

```sql
compliance_audit_log
├── id (UUID) - Primary key
├── timestamp (TIMESTAMPTZ) - Server-generated
├── dpu_id (TEXT) - DPU identifier
├── redline_violated (TEXT) - Policy violation
├── intent_hash (TEXT) - SHA-256 hash
└── proof_data (JSONB) - ZKP proofs
```

Run migrations:

```bash
cd packages/db-schema
supabase db push
```

---

## 🚢 Deployment

### Recommended Hosting

| Component | Platform | Notes |
|-----------|----------|-------|
| Web Regulator | Vercel | Zero-config Next.js |
| Slashing Engine | Cloud Run / Elest.io | Containerized |
| Telemetry Handler | Cloud Run / Kubernetes | High availability |
| RDMA Monitor | BlueField-3 DPU | Hardware deployment |
| Database | Supabase | Managed PostgreSQL |

### Production Build

```bash
# Build all apps
bun run build

# Build Docker images
docker-compose -f docker-compose.prod.yml build
```

### Cloud Run Deployment

```bash
# Slashing Engine
gcloud run deploy align-slashing-engine \
  --source ./apps/server-slashing-engine \
  --region us-central1 \
  --set-env-vars "SUPABASE_URL=..." \
  --allow-unauthenticated
```

---

## 🧪 Testing

### Run All Tests

```bash
bun run test
```

### System Challenge Tests

```bash
bun run test:challenges
```

**Challenge Scenarios:**
1. **Simulated DPU Violation** - Full enforcement flow
2. **Immutability Enforcement** - Verify UPDATE/DELETE blocks
3. **Kill-Switch Latency** - Measure end-to-end response (<4s)

---

## 📝 Git Commit Conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(component): add new feature
fix(component): fix bug
docs: update documentation
chore: maintenance tasks
test: add/update tests
```

Examples:
- `feat(server-slashing-engine): add ZKP verification`
- `fix(web-regulator): resolve realtime subscription leak`
- `docs: update deployment guide`

---

## 📚 Additional Resources

- [ALIGN Core Infrastructure Guide](./align-core-infrastructure-guide.md)
- [Data Center Onboarding Guide](./guide/Data%20Center%20Onboarding%20Guide.md)
- [NVIDIA DOCA SDK](https://docs.nvidia.com/doca/)
- [Supabase Documentation](https://supabase.com/docs)

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit changes: `git commit -m 'feat: add my feature'`
4. Push to branch: `git push origin feat/my-feature`
5. Open a Pull Request

---

## 📄 License

Private - All Rights Reserved

---

<p align="center">
  <strong>ALIGN</strong> - Sovereign Compliance for the AI Era
</p>

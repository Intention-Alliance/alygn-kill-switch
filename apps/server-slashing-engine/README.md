# ALIGN Slashing Engine

**Cryptoeconomic Enforcement Service for AI Safety**

The Slashing Engine is the enforcement arm of the ALIGN infrastructure. It listens for compliance violations from the audit log, verifies Zero-Knowledge Proofs (ZKPs), and executes on-chain slashing penalties against non-compliant Data Processing Units (DPUs).

---

## 🏗️ Architecture

The service operates as a webhook listener and background processor:

```mermaid
graph LR
    A[Supabase Audit Log] -->|Webhook (INSERT)| B(Slashing Engine)
    B -->|1. Verify ZKP| C{Proof Valid?}
    C -->|No| D[Log Security Warning]
    C -->|Yes| E[Match Slashing Rule]
    E -->|Critical| F[Burn Stake]
    E -->|Major| G[Redistribute Stake]
    E -->|Minor| H[Issue Warning]
    F & G -->|Execute| I[Bitcoin/Taproot Contract]
```

### Key Features

- **ZKP Verification**: Validates cryptographic proofs attached to violation reports.
- **Policy Enforcement**: Applies slashing rules based on violation severity (WARN, REDISTRIBUTE, BURN).
- **On-Chain Execution**: Interfaces with Bitcoin Taproot contracts (via ethers.js/Bitcoin libraries) to finalize penalties.
- **Idempotency**: Ensures penalties are applied exactly once per violation event.

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Supabase Project (PostgreSQL)
- Bitcoin/Ethereum RPC URL (for on-chain settlement)

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

### Configuration

Create a `.env` file based on `.env.example`:

```env
# Server
PORT=3001
NODE_ENV=development

# Database (Supabase)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Security
SECRET_KEY=your-jwt-secret-key

# Blockchain
ETHEREUM_RPC_URL=https://...
SLASHER_PRIVATE_KEY=0x...
ALIGN_TOKEN_ADDRESS=0x...
```

---

## 📡 API Endpoints

### Webhook Listener

- **`POST /api/v1/slashing/webhook`**
  - Receives `INSERT` triggers from Supabase `compliance_audit_log`.
  -Payload: Supabase database webhook format.

### REST API

- **`GET /api/v1/slashing/rules`**
  - Returns active enforcement policies and slashing percentages.
  
- **`GET /api/v1/slashing/violations`**
  - Returns recent processed violations and their status.

- **`POST /api/v1/auth/signup`**
  - Register a new admin/operator.

- **`POST /api/v1/auth/login`**
  - Authenticate to access protected endpoints.

---

## 🛠️ Development

### Scripts

| Command          | Description                      |
| ---------------- | -------------------------------- |
| `npm run dev`    | Start dev server with hot-reload |
| `npm run build`  | Build TypeScript to `dist/`      |
| `npm start`      | Run production server            |
| `npm run lint`   | Run Biome linter                 |
| `npm run format` | Format code with Biome           |

### Docker

```bash
# Build development image
docker build -t align-slashing-engine:dev -f Dockerfile.dev .

# Run container
docker run -p 3001:3001 --env-file .env align-slashing-engine:dev
```

---

## ⚖️ Slashing Policies

The engine enforces the following default rules (configurable):

| Policy ID                  | Violation Type  | Action           | Penalty        |
| -------------------------- | --------------- | ---------------- | -------------- |
| `policy_harmful_content`   | Safety Redline  | **BURN**         | 100% Stake     |
| `policy_data_exfiltration` | Privacy Breach  | **BURN**         | 100% Stake     |
| `policy_model_tampering`   | Integrity Check | **REDISTRIBUTE** | 75% Stake      |
| `policy_rate_limit`        | QoS Violation   | **REDISTRIBUTE** | 25% Stake      |
| `policy_heartbeat`         | Liveness Check  | **WARN**         | 5% (Probation) |

---

## 🔒 Security

- **Attestation**: All actions requires a valid ZKP signature from the reporting DPU.
- **Role-Based Access**: API endpoints are protected via JWT.
- **Audit Trail**: Every slashing verification attempt is logged back to the database.

---

## 📄 License

Private - ALIGN Core Infrastructure

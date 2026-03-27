# BitcashOrg Repositories - Architecture & Documentation

This directory contains all BitcashOrg-related repository documentation, design documents, and architecture overviews.

⚠️ **CRITICAL:** These are READ-ONLY reference materials. Do NOT edit code in cloned repos. All automation scripts go in `scripts/bitcash/`.

---

## 📁 Directory Structure

```
bitcash/
├── core/                # Core product documentation
├── infrastructure/      # Infrastructure and deployment docs
└── read-only/           # Cloned repos (NO EDITS ALLOWED)
    └── bitcash/         # Main BitcashOrg monorepo
```

---

## 🎯 Project Overview

**Organization:** BitcashOrg  
**Mission:** Decentralized payment and cryptocurrency infrastructure  
**Focus:** RAG systems, AI-powered chatbots, cryptocurrency tooling

### Key Projects

1. **masterbots** — RAG-powered AI chatbot infrastructure
2. **smartsale** — Smart contract-based token sales
3. **bitcash** — Core Bitcash protocol and applications

---

## 📂 Subdirectories

### `core/` — Product Design & Documentation

**Purpose:** Core product architecture, design philosophy, and protocol documentation

**Status:** ⏳ Documentation in progress

**Planned Contents:**
- Architecture diagrams
- Protocol specifications
- API documentation
- Integration guides

---

### `infrastructure/` — Deployment & DevOps

**Purpose:** Infrastructure documentation, deployment guides, CI/CD pipelines

**Status:** ⏳ Documentation in progress

**Planned Contents:**
- Deployment architecture
- CI/CD pipelines
- Monitoring and observability
- Scaling strategies

---

### `read-only/bitcash/` — Cloned Monorepo (NO EDITS)

**Purpose:** Reference copy of the BitcashOrg monorepo

**⚠️ CRITICAL RULES:**
- ❌ **NO editing code** in this directory
- ✅ **ONLY read** for reference and documentation
- ✅ Clone with `--depth 1` (shallow, faster)
- ❌ **NO commits or pushes** from this directory
- ✅ All automation scripts go in `scripts/bitcash/`

**Repository Structure:**
```
bitcash/
├── apps/
│   ├── bitcash-apollo/     # GraphQL API
│   ├── bitcash-auth/       # Authentication service
│   ├── bitcash-hasura/     # Hasura GraphQL engine
│   ├── bitcash-indexer/    # Blockchain indexer
│   ├── bitcash-p2p/        # P2P network layer
│   └── bitcash.org/        # Main website
├── dev/
│   ├── bitcash-ui/         # UI component library
│   ├── bitcash-worker/     # Background workers
│   └── web2-worker/        # Web2 integration workers
└── docker/                 # Docker configurations
```

**Cloning Best Practice:**
```bash
cd repos/bitcash/read-only/
git clone --depth 1 https://github.com/bitcashorg/bitcash.git
```

---

## 🏗️ Architecture Overview

### Masterbots (RAG System)

**Purpose:** AI-powered chatbot with Retrieval-Augmented Generation

**Key Components:**
1. **Embedding Pipeline** — OpenAI embeddings (1536 dimensions)
2. **Vector Search** — PostgreSQL + pgvector
3. **Query Layer** — Drizzle ORM + Vercel AI SDK
4. **Context Management** — Token budget optimization

**Recent Work:**
- Fixed double token budget enforcement (Issue #604)
- Improved cosine similarity threshold sensitivity
- Optimized vector search performance

**Tech Stack:**
- Next.js 15
- PostgreSQL + pgvector
- OpenAI embeddings
- Drizzle ORM

---

### Bitcash Protocol

**Purpose:** Decentralized cryptocurrency infrastructure

**Key Features:**
- Peer-to-peer transactions
- Smart contract integration
- Token sales (Smartsale)
- GraphQL API (Apollo)
- Blockchain indexing

**Tech Stack:**
- Node.js backend
- Hasura GraphQL
- Docker containerization
- Ethereum/Solidity smart contracts

---

## 📊 GitHub Repositories

**Organization:** `bitcashorg`

**Key Repos:**
- **masterbots** — RAG chatbot system (active development)
- **smartsale** — Token sale platform
- **bitcash** — Core protocol (monorepo)
- **bitcash-app** — Mobile application

**Daily Tracking:**
- Script: `scripts/bitcash/daily-tracker.js`
- Schedule: 3:45 AM daily
- Tracks: Commits, PRs, issues (last 24h)

**Recent Activity (Feb 2026):**
- masterbots: 2 commits, 2 PRs, 2 issues
- Focus: RAG pipeline optimization
- Last update: Feb 6, 2026

---

## 🔒 Security & Confidentiality

**Public Project:** BitcashOrg repositories are open-source

**However:**
- ✅ Automation strategies are proprietary
- ⚠️ API keys and credentials in `config/credentials.json` (NOT in git)
- ✅ Context isolation maintained (Bitcash ≠ Alygn ≠ Personal)

**See:** `SECURITY.md` for credential management and OpSec guidelines

---

## 🚀 Getting Started (For Development)

**If you need to work on BitcashOrg code:**

1. **Clone repo externally** (outside workspace):
   ```bash
   cd $HOME/projects/
   git clone https://github.com/bitcashorg/bitcash.git
   cd bitcash/
   ```

2. **Set up development environment:**
   ```bash
   # Install dependencies
   npm install
   # or
   yarn install
   
   # Set up local database
   docker-compose up -d
   
   # Run migrations
   npm run migrate
   ```

3. **Reference workspace docs:**
   - Check `docs/bitcashorg/` for integration guidelines
   - Use `scripts/bitcash/` for automation
   - Review `repos/bitcash/core/` for architecture docs

4. **Never edit repos in `read-only/`** — always work in external clone

---

## 🔧 Technical Deep Dives

### RAG Pipeline Architecture

**Embedding Retrieval:**
```typescript
// Token budget: 8000 tokens total
// Issue: Was enforcing twice (4000 + 4000)
// Fix: Single enforcement at retrieval layer

const embeddings = await retrieveEmbeddings({
  query: userMessage,
  tokenBudget: 8000,  // Applied once, not twice
  threshold: 0.7       // Improved from 0.8
});
```

**Vector Search:**
```sql
-- PostgreSQL + pgvector
SELECT id, content, 
       1 - (embedding <=> query_embedding) as similarity
FROM embeddings
WHERE 1 - (embedding <=> query_embedding) > 0.7
ORDER BY similarity DESC
LIMIT 10;
```

**Optimization Wins:**
- Reduced token waste by 50%
- Improved cosine threshold sensitivity
- Better context retrieval for RAG responses

---

### Monorepo Structure

**Apps Directory:**
- Independent deployable applications
- Shared dependencies via workspace
- Dockerized for production

**Dev Directory:**
- UI component library (shared across apps)
- Background workers (async processing)
- Web2 integration workers

**Docker:**
- Multi-stage builds for optimization
- docker-compose for local development
- Production-ready images

---

## 📚 Related Documentation

- **[docs/bitcashorg/](../../docs/bitcashorg/)** — BitcashOrg-specific docs
- **[scripts/bitcash/](../../scripts/bitcash/)** — Automation scripts
- **[SECURITY.md](../../SECURITY.md)** — Security policies
- **[GitHub: bitcashorg/masterbots](https://github.com/bitcashorg/masterbots)** — RAG system repo

---

## 🛠️ Contribution Guidelines

**For BitcashOrg development:**

1. Work in external repo clone (not in workspace)
2. Follow monorepo conventions (workspace structure)
3. Test locally with Docker before pushing
4. Create feature branches for new work
5. Submit PRs with clear descriptions and context

**For workspace documentation:**

1. Update `core/README.md` for architecture changes
2. Add design docs to `infrastructure/`
3. Keep automation scripts in `scripts/bitcash/`
4. Document integration points in `docs/bitcashorg/`

---

## 🐛 Known Issues & Fixes

**masterbots RAG Pipeline (Feb 2026):**
- ✅ Fixed: Double token budget enforcement
- ✅ Fixed: Aggressive cosine similarity threshold
- ⏳ TODO: Add retry logic for failed vector searches
- ⏳ TODO: Implement cache layer for frequent queries

**See:** GitHub Issues for full tracking

---

_Last updated: 2026-02-10_  
_Organization: BitcashOrg_  
_Status: Active development (masterbots focus)_

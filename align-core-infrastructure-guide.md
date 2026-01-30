# ALYGN Core Infrastructure Guide

## Overview

The **align-core-infra/guide** folder contains 9 files, which outline the architecture and implementation details for a cutting-edge AI Safety compliance platform centered on NVIDIA BlueField-3 DPUs, Zero-Knowledge Proofs (ZKPs), and a blockchain-style immutable audit ledger managed by Supabase. Every system file has instructions on how to build and deploy it and/or key features that contains (ts, tsx, sql and cc files).

The folder documents a comprehensive, multi-layer **Sovereign Compliance Infrastructure** designed to enforce AI Safety Redlines in high-performance GPU clusters, specifically targeting the NVIDIA Blackwell Corridor. The core of the system involves a low-latency hardware monitor (the **Advanced RDMA Security Monitor**) running on the BlueField-3 DPU, which integrates with an asynchronous, attestable logging mechanism (the **SOS-Hook Telemetry Handler**) that records all events and violations to an immutable **ALYGN Ledger**, and finally, an automated **Slashing Engine** for cryptoeconomic enforcement.

## Key Components and Functionality

The architecture is structured into five distinct layers, detailed across the documents:

| Layer               | Key Component                  | Technology / Language              | Primary Function                                                                                                                                                                             |
| :------------------ | :----------------------------- | :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Infrastructure**  | Advanced RDMA Security Monitor | C / DOCA (BlueField-3)             | Real-time packet inspection (RDMA Read/Write), Malformed packet detection, Memory Intent Manifest validation, 380Gbps Grid Threat detection.                                                 |
| **Data Collection** | C++ SOS-Hook Telemetry Handler | C++ / libpqxx, OpenSSL, libsodium  | Collects DPU events, generates Zero-Knowledge Proofs (ZKP) and cryptographic attestations, and asynchronously batches/flushes events to the Ledger.                                          |
| **Storage**         | ALYGN Ledger (Supabase)        | SQL / PostgreSQL, JSONB            | Immutable audit log (`compliance_audit_log` table) to store enforcement events and ZKPs. Enforces immutability via database triggers and manages Row-Level Security (RLS).                   |
| **Enforcement**     | Slashing Engine                | Node.js / ethers.js                | Webhook listener for Ledger violations. Verifies ZKPs and timestamps, calculates token slash amounts based on `SLASHING_RULES`, and executes on-chain $ALYGN token burns or redistributions. |
| **Presentation**    | Regulatory Portal (React)      | React / JavaScript (Mock Supabase) | Real-time dashboard for monitoring system status, GPU clusters (Blackwell Corridor), live ledger feeds, and exporting cryptographically signed Proofs of Alignment (compliance reports).     |

## In-Depth Review of Content

### 1\. Hardware-Level Monitoring and Enforcement

The **"Advanced RDMA Security Monitor for BlueField-3 DPU"** provides the foundation for real-time safety.

* **Target Hardware:** NVIDIA BlueField-3 DPU.
* **Methodology:** Uses the DOCA (Data Center Infrastructure on a Chip Architecture) Flow API to create hardware-accelerated pipelines for RDMA (Remote Direct Memory Access) traffic inspection.
* **Safety Features:** Includes checks for:
  * RDMA OpCode classification (Read/Write).
  * Malformed packet rate limiting (10 packets in 1ms window triggers REDLINE).
  * Memory Intent Manifest validation (ensuring RDMA operations stay within approved memory boundaries for AI agents).
  * Hardware throughput metering for Grid Threat detection (380 Gbps threshold in a 500 $\\mu$s window).

### 2\. Cryptographic and Attestation Layer

The **"SOS-Hook Telemetry Handler"** and the database schema work together to ensure data integrity and verifiability.

* The C++ Handler is responsible for generating the ZKPs (Zero-Knowledge Proofs) and HMAC attestations for every telemetry event before logging. The ZKP structure is designed to prove that the "model weights produce behavior matching intent" without revealing the actual model weights.
* The **"Storage: ALYGN Ledger (Supabase)"** document shows the SQL migration for the `compliance_audit_log` table, which is strictly *append-only* (updates and deletes are prevented by a trigger). It stores the `intent_hash`, `redline_violated`, and the ZKP/attestation data in a `JSONB` column.

### 3\. Compliance and Onboarding Process

The **"Data Center Onboarding Guide"** outlines the formal process for a facility to join the network (the "Blackwell Corridor"):

* **Prerequisites:** NVIDIA Blackwell/BlueField-3 hardware, a signed **Sovereign Circle Member Agreement (SCMA)**, and initial **ALYGN staking deposit**.
* **Integration Steps:**
    1. **SOS-Hook Flash:** Flashing the Sovereign Kernel micro-code to the DPU.
    2. **Judicial Connectivity:** Initializing the encrypted telemetry stream and synchronizing the latest Safety Redlines into the DPU's fast-path memory (SRAM).
    3. **Site Acceptance Test (SAT):** A final "Proof of Alignment" is required, often involving a simulated breach.

### 4\. Enforcement Logic

The **"Slashing Engine"** details the Node.js backend responsible for executing the cryptoeconomic penalty.

* It listens for violation webhooks from the Supabase Ledger.
* It validates the event, including the proof timestamp and the full Zero-Knowledge Proof integrity check (`ProofVerifier.verifyZKProof`).
* **Slashing Rules** are defined based on the `redline_violated` policy (e.g., `policy_harmful_content` is a **CRITICAL** severity with a 100% slash).
* Critical violations result in a token **burn**, while others result in redistribution to active validators, all executed via Ethereum smart contract calls (`ethers.js`).

-----

## Monorepo Architecture

A monorepo is ideal for managing the shared data structures (like the event payload schemas) and ensuring consistent build and dependency management. Restructuring this intricate system—which spans low-level hardware, cryptographic proofs, a database, and user interfaces—into a cohesive monorepo and microservices architecture is the correct approach for scalability and maintainability. I recommend a workspace-based structure using Bun workspaces, which logically groups the different services.

| Folder Path              | Component Name                   | Technology/Files Mapped                                                                                                                           | Deployment Target            |
| :----------------------- | :------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------- |
| `apps/web-regulator`          | Regulatory Portal                | **`Frontend: Regulatory Portal (React)...`** (React/Next.js code), Next.js configuration, UI components.                                  | Vercel / Next.js Server      |
| `apps/server-slashing-engine`   | ALYGN Slashing Engine            | **`Slashing Engine`** (Node.js/Express.js code), configuration (Supabase keys), business logic for token slashing and proof verification. | Express.js Server / Elest.io |
| `apps/server-telemetry-handler` | SOS-Hook Telemetry Handler (C++) | **`SOS-Hook Telemetry Handler`** (C++ code), configuration files, Dockerfile (for deployment).                                            | Cloud Run / Kubernetes       |
| `apps/server-rdma-monitor`      | RDMA Security Monitor (C++)      | **`Advanced RDMA Security Monitor...`** (C++ DPU micro-code).                                                                             | Hardware DPU (NVIDIA)        |
| `apps/smart-contracts`   | $ALYGN Token Contract (Bitcoin)  | Bitcoin Smart Contract (Script or Simplicity) code, testing utilities.                                                                            | Bitcoin Ecosystem/Node       |
| `packages/db-schema`     | ALYGN Ledger Schema              | **`Storage: ALYGN Ledger (Supabase)`** (SQL migration files), a single source of truth for the `compliance_audit_log` table.              | Supabase / PostgreSQL        |
| `packages/shared-types`  | Shared Data Types                | TypeScript interfaces for the Web app, Node.js process (servers), and C++ (e.g., event structures, violation payloads).                                    | N/A (Code Library)           |

### Deployment Strategy for C++ Services

The C++ services, especially the **SOS-Hook Telemetry Handler**, are performance-critical, which is why C++ was chosen. The best way to deploy modern C++ backend services is through **containerization** (Docker) on a managed service. This abstracts away the host operating system and complex dependencies, making deployment manageable and scalable.

#### Step-by-Step C++ Deployment Plan

**1. Containerize the C++ Application (Docker)**

The first step is to create a `Dockerfile` for the `apps/telemetry-handler`.

* **Multi-Stage Build:** You should use a multi-stage Docker build. This involves:
  * **Stage 1 (Builder):** Start with a heavy base image that contains all the compilers and development libraries (e.g., GCC, `libpqxx-dev`, `libsodium-dev`). You will compile the C++ code here. The search results show this is standard practice for Cloud Run deployments.
  * **Stage 2 (Runtime):** Start from a minimal, secure, and small base image (e.g., Alpine or Distroless). This final image only copies the compiled C++ executable and the necessary shared runtime libraries. This greatly reduces image size and attack surface.
* **Dependencies:** Ensure the `Dockerfile` handles the installation of external C++ dependencies like `libpqxx` (for PostgreSQL/Supabase connectivity), `OpenSSL`, and `libsodium` (for cryptographic utilities).

**2. Choose the Deployment Platform**

* **Recommendation: Google Cloud Run:** Cloud Run is an excellent target as it provides a managed, serverless container platform. It handles scaling, load balancing, and is optimized for web services. You simply give it the container image, and it handles the rest. This simplifies deployment greatly.
* **Alternative (for lower latency): Dedicated VMs:** If the Telemetry Handler needs guaranteed near-hardware performance, deploy the Docker image to a managed Kubernetes cluster or a dedicated VM.

**3. Implement CI/CD**

* **Automation is Key:** For every push to your main branch, an automated process (CI/CD) should:
    1. **Build:** Run the CMake build and unit tests for the C++ code.
    2. **Containerize:** Execute the multi-stage Docker build to create the final image.
    3. **Publish:** Push the new image to a Container Registry (e.g., Artifact Registry or Docker Hub).
    4. **Deploy:** Update the running service on Cloud Run or your server using the new image.

**4. DPU-Resident Code (RDMA Security Monitor)**

The **`Advanced RDMA Security Monitor...`** is described as DPU micro-code running the DOCA SDK. This component is essentially firmware and is decoupled from your main backend application services.

* **Deployment:** This C++ code is deployed directly to the NVIDIA BlueField-3 DPU, likely through the **NVIDIA DOCA SDK** and the facility's own update processes (as detailed in the **Data Center Onboarding Guide**). This is an "edge" deployment, separate from your cloud/server deployment.
* **Integration:** Its job is to detect violations and log them, and it integrates by passing the telemetry data to the **SOS-Hook Telemetry Handler** (the C++ service you are containerizing).

By leveraging Docker for the C++ backend, you avoid the complexities of compiling and linking on the target machine, which is a major headache for C++ developers. This allows you, as a Senior Architect, to focus on the overall system integrity while treating the C++ services like any other containerized microservice.

-----

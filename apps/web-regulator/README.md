# ALIGN Regulator Dashboard
### Sovereign Compliance Infrastructure for AI Safety

The **ALIGN Regulator Dashboard** is the central command center for managing the Sovereign Operating System (SOS) network. It provides real-time oversight of Data Processing Unit (DPU) clusters, ensuring that all AI workloads comply with safety redlines and intent manifests.

## Platform Intention

This platform serves as the "Regulator" node in the ALIGN network architecture. Its primary goals are:
1.  **Hardware Registry**: Authenticate and track physical GPU resources (DPU Nodes) via cryptographic attestation.
2.  **Compliance Oversight**: Visualize immutable audit logs for every AI inference and training job.
3.  **Real-Time Telemetry**: Monitor the health, latency, and operational status of the distributed compute grid.
4.  **Enforcement**: Provide tools to "slash" (penalize) or revoke access for non-compliant nodes.

## Key Features

### 🛡️ Secure Cluster Management
- **Onboarding**: Register new GPU clusters with detailed hardware specifications (H100, A100, etc.).
- **Granular Inventory**: Track individual GPU units down to the serial/row level.
- **Identity Resolution**: Automatically map human-readable slugs (e.g., `austin-hub`) to cryptographic UUIDs.

### 📊 Live Telemetry & Audits
- **Zero-Knowledge Proofs**: Verify that workloads matched their intent without inspecting the private model weights.
- **Redline Monitoring**: Instant alerts for safety violations (e.g., self-replication attempts, chemical weapon synthesis).
- **Immutable Ledger**: All events are logged to a tamper-proof Supabase/PostgreSQL backend.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS + Shadcn/UI (Premium "Glassmorphism" Design)
- **Database**: Supabase (PostgreSQL + Real-time subscriptions)
- **Language**: TypeScript

## Getting Started

1.  **Install Dependencies**:
    ```bash
    bun install
    ```

2.  **Environment Setup**:
    Ensure `.env.local` is configured with your Supabase credentials:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=...
    NEXT_PUBLIC_SUPABASE_ANON_KEY=...
    ```

3.  **Run Development Server**:
    ```bash
    bun dev
    ```

4.  **Access Dashboard**:
    Open [http://localhost:3000](http://localhost:3000) to view the regulator interface.

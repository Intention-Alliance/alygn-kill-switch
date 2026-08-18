# DPU-Native Kill Switch OS — Architecture Diagram

**Status:** Proposed (Phase 6, hardware-funded) — ADR-142
**Date:** 2026-08-17

## Target Architecture (post-cutover, Phase 10)

```
                        ┌──────────────────────────────────────────────────────┐
                        │                    EXTERNAL NETWORK                 │
                        └───────────────────────────┬──────────────────────────┘
                                                    │  all traffic inline
                                                    ▼
        ┌───────────────────────────────────────────────────────────────────────┐
        │                    NVIDIA BlueField DPU (per host)                    │
        │                                                                       │
        │  ┌─────────────────────────────┐        ┌───────────────────────────┐  │
        │  │   HARDWARE DATA PATH        │        │   EMBEDDED ARM CONTROL   │  │
        │  │   (enforcement, line-rate)  │        │   PLANE (DOCA runtime)    │  │
        │  │                             │        │                           │  │
        │  │  ┌───────────────────────┐  │        │  ┌─────────────────────┐  │  │
        │  │  │  eBPF / ASAP2 offload │  │        │  │ server-kill-switch  │  │  │
        │  │  │  (drop rules)         │  │        │  │  control plane      │  │  │
        │  │  └───────────────────────┘  │        │  │  (state machine,    │  │  │
        │  │  ┌───────────────────────┐  │        │  │   flags, registry)  │  │  │
        │  │  │  Flow table (drop)   │  │        │  └─────────────────────┘  │  │
        │  │  └───────────────────────┘  │        │  ┌─────────────────────┐  │  │
        │  │                             │        │  │ WebAuthn (ADR-136)  │  │  │
        │  │  ┌───────────────────────┐  │        │  │  human auth         │  │  │
        │  │  │  Inline filter        │  │        │  └─────────────────────┘  │  │
        │  │  │  (all ingress)        │  │        │  ┌─────────────────────┐  │  │
        │  │  └───────────────────────┘  │        │  │ Immutable audit log │  │  │
        │  │                             │        │  │  (ADR-139/140)      │  │  │
        │  └─────────────────────────────┘        │  └─────────────────────┘  │  │
        │                                          │  ┌─────────────────────┐  │  │
        │                                          │  │ DPU-local NVMe      │  │  │
        │                                          │  │  (state + audit)    │  │  │
        │                                          │  └─────────────────────┘  │  │
        └──────────────────────────────────────────┬──────────────────────────┘
                                                   │  only allowed traffic
                                                   ▼
        ┌───────────────────────────────────────────────────────────────────────┐
        │                    HOST x86 (now a TENANT)                            │
        │   nginx / Next.js / server-kill-switch (management + observability)  │
        │   CANNOT reach the enforcement path                                   │
        └───────────────────────────────────────────────────────────────────────┘
```

## Control Flow: A Kill

```
Human (WebAuthn, ADR-136)
        │  assertion token
        ▼
DPU Arm control plane ──► verify human signature ──► update state machine
        │
        ▼
Compile kill decision ──► eBPF program / flow-table drop rule
        │
        ▼
Offload to hardware data path (ASAP2) ──► enforced at line rate in NIC
        │
        ▼
Blocked traffic is dropped in hardware — host never receives it
```

## Migration Phases (from ADR-142 §4)

| Phase | Mode | Enforcement authority | Rollback |
|-------|------|----------------------|----------|
| 6 (this) | Planning | x86 (unchanged) | n/a |
| 7 | Hardware procurement | x86 | n/a |
| 8 | Shadow (DPU observes) | x86 | x86 authoritative |
| 9 | Dual (both enforce) | x86 + DPU (fail-closed) | x86 authoritative |
| 10 | Cutover | DPU only | fail-closed (safe) |

## Key Properties

- **Inline:** DPU sees all traffic before the host.
- **Hardware enforcement:** drop rules live in the NIC data path, not userspace.
- **No software bypass:** host cannot reach the enforcement path.
- **Human-gated:** every pipeline update requires a WebAuthn signature (ADR-136).
- **Attestable:** DOCA secure boot + attestation provide a hardware root of trust.

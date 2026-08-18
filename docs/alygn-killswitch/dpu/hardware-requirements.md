# DPU-Native Kill Switch OS — Hardware Requirements

**Status:** Proposed (Phase 6, hardware-funded) — ADR-142
**Date:** 2026-08-17

## Overview

This document specifies the hardware needed to run the Kill Switch OS on NVIDIA
BlueField DPUs. It is a **planning artifact** — no hardware is procured in this
phase. It informs the hardware-funding checklist and the Phase 7 procurement.

## BlueField SKU Selection

| Requirement | BlueField-2 | BlueField-3 | Recommendation |
|-------------|-------------|-------------|----------------|
| Arm cores | 8× Arm Cortex-A72 | 16× Arm Cortex-A78 | **BlueField-3** for headroom |
| Control-plane memory | 16 GB DDR | 32 GB DDR | **BlueField-3** (32 GB) |
| NIC ports | 2× 25 GbE | 2× 100 GbE | BlueField-3 for future headroom |
| eBPF / ASAP2 offload | Supported | Supported (enhanced) | BlueField-3 preferred |
| DOCA support | DOCA 1.x | DOCA 2.x | BlueField-3 (current DOCA) |
| Attestation / secure boot | Yes | Yes (enhanced) | BlueField-3 |

**Recommended SKU:** NVIDIA BlueField-3 DPU, 32 GB DDR, 2× 100 GbE, with DOCA
SDK 2.x. For a lower-cost lab, BlueField-2 (16 GB, 2× 25 GbE) is acceptable for
Phase 7 validation.

## Memory Requirements

| Component | BlueField-2 | BlueField-3 |
|-----------|-------------|-------------|
| Control plane (server-kill-switch + DOCA runtime) | ~4 GB | ~4 GB |
| eBPF / ASAP2 program space | ~2 GB | ~4 GB |
| Flow table (drop rules) | ~2 GB | ~4 GB |
| DPU-local NVMe (state + audit log) | 256 GB | 512 GB |
| **Total recommended** | **16 GB DDR + 256 GB NVMe** | **32 GB DDR + 512 GB NVMe** |

## NIC Ports

- **2× 100 GbE (BlueField-3)** or **2× 25 GbE (BlueField-2)**.
- One port is the **inline enforcement path** (all ingress traffic).
- The second port is for **management / control-plane replication** across the
  DPU cluster (state + audit log sync).
- Both ports are on the DPU; the host connects via the DPU's PCIe interface.

## Host Integration

- The DPU installs in a **PCIe Gen4/Gen5 slot** on the host.
- The host's NIC is **replaced by the DPU** — the DPU is the host's network
  interface. All host traffic flows through the DPU.
- The host connects to the DPU via the **rshim** interface (see deployment
  playbook) for provisioning and management.

## Cluster Sizing (for a fleet)

| Fleet size | DPUs | Notes |
|------------|------|-------|
| Lab / validation | 1–2 | Phase 7–8 |
| Small fleet | 4–8 | One DPU per host |
| Production fleet | 8+ | One DPU per host + control-plane replication |

## Power & Cooling

- BlueField-3 DPU: ~25 W typical (passive/active heatsink).
- Requires a PCIe slot with adequate airflow; active cooling recommended in dense
  chassis.

## Firmware / Software Baseline

- **DOCA SDK 2.x** (BlueField-3) or **DOCA 1.x** (BlueField-2).
- **eBPF offload** via ASAP2 (hardware data path).
- **Secure boot** enabled; signed OS images.
- **rshim** for host→DPU provisioning.

## References

- [ADR-142](./ADR-142-dpu-native-os.md) — DPU port plan
- [architecture.md](./architecture.md) — Target architecture diagram
- [deployment-playbook.md](./deployment-playbook.md) — Ansible deployment skeleton
- [hardware-funding-checklist.md](./hardware-funding-checklist.md) — What to buy + budget

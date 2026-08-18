# Kill Switch OS — DPU Port (Phase 6)

**Status:** Proposed (hardware-funded) — [ADR-142](../../architecture/ADR-142-dpu-native-os.md)
**Date:** 2026-08-17

This directory contains the planning + architecture artifacts for porting the
Kill Switch OS to NVIDIA BlueField DPUs. This phase is **hardware-funded** — no
DPU hardware is available yet, so these are **planning documents, not runtime
code**.

## Contents

| File | Purpose |
|------|---------|
| [architecture.md](./architecture.md) | Target architecture diagram (ASCII) + control flow |
| [hardware-requirements.md](./hardware-requirements.md) | BlueField-2/3 SKUs, memory, NIC ports |
| [deployment-playbook.md](./deployment-playbook.md) | Ansible roles skeleton (DPU OS image + rshim) |
| [hardware-funding-checklist.md](./hardware-funding-checklist.md) | What to buy + budget estimate |

## Summary

- **Control plane** runs on the BlueField embedded Arm CPU (DOCA runtime).
- **Enforcement** lives in the hardware data path (eBPF / ASAP2 offload) — no
  software bypass.
- **Human authorization** (ADR-136) and **immutable audit** (ADR-139/140) carry
  over unchanged.
- **Migration** is staged: shadow → dual → cutover (ADR-142 §4).

## References

- [ADR-142](../../architecture/ADR-142-dpu-native-os.md) — DPU port plan
- [KILL-SWITCH-SYSTEM-DESIGN.md](../../KILL-SWITCH-SYSTEM-DESIGN.md) — System design v2.0.0

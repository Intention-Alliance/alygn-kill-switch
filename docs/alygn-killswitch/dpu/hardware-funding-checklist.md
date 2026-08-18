# DPU-Native Kill Switch OS — Hardware Funding Checklist

**Status:** Proposed (Phase 6, hardware-funded) — ADR-142
**Date:** 2026-08-17

> This phase is **hardware-funded** — no DPU hardware is available yet. This
> checklist is the procurement plan for Phase 7. Budget figures are **planning
> estimates** and should be re-validated at purchase time.

## What to Buy

### 1. BlueField DPUs

| Item | Qty | Unit est. | Est. total | Notes |
|------|-----|-----------|------------|-------|
| BlueField-3 DPU, 32 GB DDR, 2× 100 GbE | 2 | ~$4,500 | ~$9,000 | Lab pair (validation + redundancy) |
| BlueField-2 DPU, 16 GB DDR, 2× 25 GbE (optional, lower-cost lab) | 2 | ~$2,000 | ~$4,000 | Alternative for Phase 7 validation |

**Recommendation:** Start with **2× BlueField-3** for the lab. Scale to one per
host for the production fleet.

### 2. Host Integration

| Item | Qty | Unit est. | Est. total | Notes |
|------|-----|-----------|------------|-------|
| PCIe Gen4/Gen5 host slots | 2 | included | $0 | Requires hosts with free slots |
| Active cooling for DPU | 2 | ~$50 | ~$100 | Dense chassis airflow |

### 3. Storage (DPU-local)

| Item | Qty | Unit est. | Est. total | Notes |
|------|-----|-----------|------------|-------|
| DPU-local NVMe (512 GB) | 2 | ~$150 | ~$300 | State + immutable audit log |

### 4. Software / Tooling

| Item | Cost | Notes |
|------|------|-------|
| DOCA SDK 2.x | Free | NVIDIA DOCA SDK |
| eBPF / ASAP2 toolchain | Free | Included with DOCA |
| rshim | Free | Open source |

### 5. Lab Infrastructure

| Item | Qty | Unit est. | Est. total | Notes |
|------|-----|-----------|------------|-------|
| Lab switch (100 GbE) | 1 | ~$1,500 | ~$1,500 | For inline traffic path |
| Cabling / optics | 1 set | ~$300 | ~$300 | 100 GbE optics + DAC |

## Budget Estimate

| Category | Est. total |
|----------|------------|
| BlueField-3 DPUs (2×) | ~$9,000 |
| Host integration + cooling | ~$100 |
| DPU-local NVMe (2×) | ~$300 |
| Lab switch + cabling | ~$1,800 |
| Software / tooling | $0 |
| **Total (BlueField-3 lab)** | **~$11,200** |

| Category | Est. total |
|----------|------------|
| BlueField-2 DPUs (2×, lower-cost lab) | ~$4,000 |
| Host integration + cooling | ~$100 |
| DPU-local NVMe (2×) | ~$300 |
| Lab switch (25 GbE) + cabling | ~$1,200 |
| Software / tooling | $0 |
| **Total (BlueField-2 lab)** | **~$5,600** |

## Funding Decision

- **Recommended:** ~$11,200 for a BlueField-3 lab pair (2× DPU, NVMe, switch,
  cabling). This is the production-representative path.
- **Budget-constrained alternative:** ~$5,600 for a BlueField-2 lab pair. Adequate
  for Phase 7–8 validation; upgrade to BlueField-3 for production.

## Procurement Checklist

- [ ] Confirm host PCIe slots (Gen4/Gen5) and airflow
- [ ] Select BlueField-3 (recommended) or BlueField-2 (budget) SKU
- [ ] Order 2× DPUs + NVMe + switch + cabling
- [ ] Register for NVIDIA DOCA SDK access
- [ ] Stand up lab environment (Phase 7)
- [ ] Validate DOCA toolchain + rshim provisioning
- [ ] Begin control-plane port (Phase 8, shadow mode)

## References

- [ADR-142](./ADR-142-dpu-native-os.md) — DPU port plan
- [hardware-requirements.md](./hardware-requirements.md) — SKUs, memory, ports
- [deployment-playbook.md](./deployment-playbook.md) — Ansible provisioning skeleton

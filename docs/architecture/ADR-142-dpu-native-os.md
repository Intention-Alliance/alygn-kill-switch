# ADR-142: DPU-Native Kill Switch OS (NVIDIA BlueField)

## Status

**Proposed** — 2026-08-17 (hardware-funded: planning + architecture + CI scaffolding; no runtime code)

## Context

The Kill Switch is ALYGN's safety-critical control for halting harmful LLM
inference at the request level. Today it runs as a **software control layer** on
x86 (`andlersrv`): nginx terminates TLS, Next.js proxies `/v1/` to
`server-kill-switch`, and enforcement is a software decision in the request path.

This architecture has a fundamental weakness: **enforcement is software, and
software can be bypassed.** A compromised host OS, a rootkit, a malicious
container, or a misconfigured proxy can skip the kill decision entirely. The
safety property "a kill stops all harmful traffic" is only as strong as the
integrity of the entire x86 software stack above the NIC.

The Kill Switch System Design (v2.0.0) already names **DPU clusters** as the
Phase 2 hardware security layer. This ADR is the concrete port plan: move the
Kill Switch control plane onto the **embedded Arm CPU of an NVIDIA BlueField
DPU**, and move enforcement into the **hardware data path** (eBPF / ASAP2
offload) so that a kill is enforced in silicon, not in a userspace process that
can be killed.

### Why a DPU and not just a hardened x86 host

| Property | Hardened x86 host | BlueField DPU |
|----------|-------------------|---------------|
| Enforcement location | Userspace process (killable) | Hardware data path (eBPF/ASAP2) |
| Control plane isolation | Same CPU as workloads | Dedicated Arm cores, separate from host |
| Host compromise impact | Full bypass possible | Host cannot reach enforcement path |
| Network position | Behind NIC, sees post-NIC traffic | Inline, sees all traffic before host |
| Attestation | Software TPM (weak) | DOCA attestation, secure boot chain |

The DPU sits **inline between the network and the host**. It sees every packet
before the host does. A kill decision made on the DPU's Arm cores and enforced
in the DPU's hardware pipelines **cannot be bypassed by anything running on the
host** — the host never even receives the blocked traffic.

## Decision

Port the Kill Switch OS to NVIDIA BlueField DPUs. The **control plane** runs on
the DPU's embedded Arm CPU; **enforcement** is compiled into hardware pipelines
(eBPF offloaded to the DPU, and ASAP2 for line-rate rules). The host x86 stack
becomes a **tenant** of the DPU, not the enforcement authority.

### §1 — Control plane on BlueField Arm cores

The existing `server-kill-switch` control plane (state machine, feature flags,
machine registry, WebAuthn human authorization, immutable audit log) is ported to
run on the DPU's embedded Arm cores under the **DOCA** runtime. The DPU runs a
minimal, purpose-built OS image (see `docs/alygn-killswitch/dpu/`).

- **No host dependency** — the control plane runs entirely on the DPU. The host
  x86 stack (nginx, Next.js) is removed from the enforcement path.
- **Human authorization stays** — WebAuthn (ADR-136) and immutable audit
  (ADR-139/140) run on the DPU control plane. A kill is still gated behind a
  human signature; the difference is that the signature now authorizes a
  **hardware pipeline update**, not a software flag flip.
- **State** — the kill-switch state machine and audit log live on DPU-local
  storage (NVMe on the DPU) and are replicated across the DPU cluster.

### §2 — Enforcement in hardware pipelines

A kill is enforced by updating the DPU's **hardware data path**, not by a
software flag:

1. **eBPF offload (ASAP2)** — the kill decision compiles to an eBPF program
   that is offloaded to the DPU's hardware. The program matches the target
   (machine, tenant, model, request signature) and drops/blocks matching
   traffic **at line rate, in the NIC hardware**.
2. **Flow tables** — blocked flows are installed as hardware flow entries
   (drop rules) in the DPU's flow table. These are enforced by the NIC's
   hardware, independent of any host or DPU software process.
3. **No software bypass** — because enforcement is in the hardware data path,
   there is no userspace process on the host or DPU that can be killed to
   re-enable traffic. The only way to lift a kill is a **new human-authorized
   pipeline update** that removes the drop rule.

### §3 — Threat model for software bypass

The DPU port eliminates the following bypass vectors:

| Bypass vector (x86 today) | DPU mitigation |
|---------------------------|----------------|
| Host rootkit / kernel compromise skips kill check | Host never sees blocked traffic; enforcement is in DPU hardware |
| Malicious container bypasses proxy | Container traffic is inline-filtered by the DPU before reaching the host |
| Misconfigured nginx forwards `/v1/` directly | No nginx in the path; DPU enforces at the NIC |
| Userspace kill-switch process killed / crashed | No userspace process in the enforcement path |
| Host OS reconfiguration disables the kill | Host cannot reconfigure the DPU's hardware pipelines |
| Compromised host network stack | DPU is a separate device with its own secure boot + attestation |

**Residual risks (accepted):**

- **DPU compromise** — a compromised DPU OS could, in principle, update its own
  pipelines. Mitigated by secure boot, signed OS images, DOCA attestation, and
  the human-authorized pipeline-update flow (ADR-136).
- **Physical access** — an attacker with physical access to the DPU could
  reflash it. Mitigated by secure boot + sealed keys; physical access is out of
  scope for this phase.
- **Supply chain** — a malicious DPU firmware image. Mitigated by signed images
  and a hardware root of trust.

### §4 — Migration path from current x86 deployment

The migration is staged so the system stays safe at every step:

1. **Phase 6 (this phase, hardware-funded):** planning + architecture + CI
   scaffolding. No runtime code, no hardware.
2. **Phase 7 (hardware procurement):** acquire BlueField-2/3 DPUs (see
   `docs/alygn-killswitch/dpu/hardware-requirements.md`), stand up a lab
   environment, validate DOCA toolchain.
3. **Phase 8 (control-plane port):** port `server-kill-switch` control plane to
   the DPU Arm cores under DOCA. Run in **shadow mode** — the DPU observes and
   logs but does not yet enforce; the x86 stack remains authoritative.
4. **Phase 9 (hardware enforcement):** enable eBPF/ASAP2 enforcement on the DPU.
   Run in **dual mode** — both x86 and DPU enforce; a kill requires both to
   agree (fail-closed).
5. **Phase 10 (cutover):** remove the x86 enforcement path. The DPU is the sole
   enforcement authority. x86 becomes a management/observability tenant.

**Rollback:** at any phase before cutover, the x86 stack remains authoritative,
so a DPU failure degrades to the current (safe) x86 behavior. After cutover, a
DPU failure is **fail-closed** (traffic blocked) by design — the safety property
is preserved at the cost of availability.

## Consequences

### Positive

1. **Hardware-enforced kills** — a kill is enforced in the NIC hardware data
   path, not a killable userspace process.
2. **No software bypass** — the host cannot bypass enforcement; it never sees
   blocked traffic.
3. **Control-plane isolation** — the kill-switch control plane runs on dedicated
   Arm cores, isolated from host workloads.
4. **Line-rate enforcement** — eBPF/ASAP2 offload enforces at NIC line rate,
   independent of host CPU load.
5. **Attestable** — DOCA secure boot + attestation provide a hardware root of
   trust for the enforcement path.

### Negative

1. **Hardware cost** — BlueField DPUs are expensive (see hardware-funding
   checklist); this phase is hardware-funded with no hardware yet.
2. **New toolchain** — DOCA, eBPF offload, and ASAP2 are a significant new
   skill/tooling surface.
3. **Operational complexity** — a DPU cluster adds a new device class to
   provision, monitor, and attest.
4. **Fail-closed availability** — after cutover, a DPU failure blocks traffic
   (safe but disruptive).

### Neutral

1. **Human authorization unchanged** — WebAuthn (ADR-136) and immutable audit
   (ADR-139/140) carry over; only the enforcement target changes.
2. **Migration is staged** — shadow → dual → cutover keeps the system safe and
   rollback-able at every step.

## Alternatives Considered

### Rejected: Harden the x86 host (SELinux, seccomp, minimal image)

**Why rejected:** A hardened host still runs enforcement in userspace. A kernel
or container escape can still bypass it. It reduces risk but does not eliminate
the software-bypass class.

### Rejected: TEE-only (SGX/SEV) enforcement

**Why rejected:** A TEE protects the *decision* but not the *network path*. The
host still receives traffic and could drop the TEE from the path. A DPU is
inline and cannot be removed from the path.

### Rejected: Separate hardware appliance (inline firewall)

**Why rejected:** A dedicated appliance is a single-purpose box with no
programmable control plane and no attestation. A BlueField DPU is programmable
(eBPF/ASAP2), attestable, and can host the control plane itself.

### Rejected: Keep software enforcement, add DPU as a passive monitor

**Why rejected:** A passive monitor can observe but not enforce. The whole point
is hardware enforcement; a passive DPU adds cost without removing the bypass
class.

## References

- [ADR-133](./ADR-133-kill-switch-protocol.md) — Kill Switch protocol (accepted, 2026-05-13)
- [ADR-136](./ADR-136-kill-switch-human-authorization.md) — Human-signature kill authorization (accepted, 2026-08-17)
- ADR-139/140 — Webhook keys & immutable audit (accepted, 2026-08-18, PR #53)
- `docs/KILL-SWITCH-SYSTEM-DESIGN.md` — Kill Switch System Design v2.0.0 (Phase 2: DPU clusters)
- `docs/alygn-killswitch/dpu/` — DPU port plan artifacts (this phase)
- NVIDIA DOCA SDK — BlueField DPU programming framework
- NVIDIA ASAP2 — hardware offload of eBPF programs to BlueField

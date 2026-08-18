# DPU-Native Kill Switch OS — Deployment Playbook (Skeleton)

**Status:** Proposed (Phase 6, hardware-funded) — ADR-142
**Date:** 2026-08-17

> **This is a planning skeleton.** No runtime code, no server config, no manual
> SQL. It documents the Ansible roles that will provision a BlueField DPU once
> hardware is available (Phase 7+). The playbook is **not** committed as
> executable automation in this phase — it is a design reference.

## Overview

A BlueField DPU is provisioned in two steps:

1. **DPU OS image** — flash the DPU's embedded Arm OS (DOCA runtime + minimal
   control-plane image) via the host's rshim interface.
2. **rshim provisioning** — use rshim to boot, configure, and manage the DPU
   from the host.

The Ansible roles below are the intended structure. They are **skeletons** —
role names, tasks, and variables — to be filled in during Phase 7/8 when
hardware and the DOCA toolchain are available.

## Ansible Role Layout

```
ansible/
└── roles/
    ├── dpu_os_image/          # Flash the DPU OS image
    │   ├── tasks/
    │   │   └── main.yml      # (skeleton) download + flash signed image
    │   ├── vars/
    │   │   └── main.yml      # image URL, checksum, version
    │   └── defaults/
    │       └── main.yml      # dpu_image_version, dpu_image_checksum
    │
    └── dpu_rshim/             # Provision + manage the DPU via rshim
        ├── tasks/
        │   └── main.yml      # (skeleton) install rshim, boot DPU, configure
        ├── vars/
        │   └── main.yml      # rshim device, DPU IP, control-plane config
        └── defaults/
            └── main.yml      # rshim_package, dpu_boot_timeout
```

## Role: `dpu_os_image`

**Purpose:** Flash the signed DPU OS image onto the BlueField's embedded storage.

Skeleton tasks (to be implemented in Phase 7):

```yaml
# tasks/main.yml (skeleton)
- name: Download signed DPU OS image
  get_url:
    url: "{{ dpu_image_url }}"
    dest: "/opt/dpu-images/{{ dpu_image_version }}.img"
    checksum: "sha256:{{ dpu_image_checksum }}"

- name: Verify image signature (hardware root of trust)
  # TODO(phase7): verify against the DPU's secure-boot key store

- name: Flash image to DPU embedded storage
  # TODO(phase7): use DOCA / rshim flash tooling
```

## Role: `dpu_rshim`

**Purpose:** Provision and manage the DPU from the host via the rshim interface.

Skeleton tasks (to be implemented in Phase 7):

```yaml
# tasks/main.yml (skeleton)
- name: Install rshim package
  package:
    name: "{{ rshim_package }}"
    state: present

- name: Boot the DPU via rshim
  # TODO(phase7): rshim boot command

- name: Wait for DPU control plane to come up
  wait_for:
    host: "{{ dpu_control_ip }}"
    port: 22
    timeout: "{{ dpu_boot_timeout }}"

- name: Configure DPU control plane (kill-switch OS)
  # TODO(phase7): deploy server-kill-switch control plane to Arm cores
```

## Variables (defaults)

```yaml
# defaults/main.yml — dpu_os_image
dpu_image_version: "0.0.0"          # placeholder until Phase 7
dpu_image_url: ""                   # placeholder
dpu_image_checksum: ""              # placeholder

# defaults/main.yml — dpu_rshim
rshim_package: "rshim"              # placeholder
dpu_control_ip: "192.168.100.2"     # placeholder
dpu_boot_timeout: 300
```

## Security Notes

- **Signed images only** — the DPU OS image must be signed and verified against
  the hardware root of trust (secure boot).
- **No secrets in the playbook** — credentials come from a vault/secret manager,
  never plaintext in the repo.
- **Fail-closed** — after cutover, a DPU failure blocks traffic by design
  (ADR-142 §4).

## References

- [ADR-142](./ADR-142-dpu-native-os.md) — DPU port plan
- [hardware-requirements.md](./hardware-requirements.md) — SKUs, memory, ports
- [architecture.md](./architecture.md) — Target architecture

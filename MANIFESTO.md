# The Alygn Kill Switch — Manifesto

**Version:** 1.0 · September 2026
**Status:** Closed publication (invited contributors)
**Companions:** Whitepaper v1.5 (in review) · Design System (internal)

---

## Why this system exists

Humanity is deploying autonomous systems that act in the world: software agents that execute transactions, and embodied machines that move objects and operate near people. The question of our era is not whether these systems will be powerful; it is who can stop them when they go wrong.

Current defenses fail by design. Content filters look at text, not intent. Certifications audit documentation, not behavior. And when an autonomous system goes off course, the only tool that usually exists is to shut everything down: a solution that punishes the innocent alongside the guilty, and that operators themselves avoid using precisely because of its cost.

What is missing is a layer of control that is progressive, governed, auditable, and agnostic. That is the Alygn Kill Switch.

## What it is

The Kill Switch is the technical layer that turns the Dignity Test — Alygn's evaluation standard — from a certificate into a verifiable control. A Dignity Test pass only means something if the system can be interrupted; the Kill Switch is that interruption, governed.

The system operates on a continuum of progressive intervention:

- **L0 Observe** — the system watches without intervening.
- **L1 Warn / Verify** — alerts and verification as signals rise.
- **L2 Require Human Intervention** — the human quorum is convened.
- **L3 Deny Action** — a specific action is blocked, in microseconds.
- **L4 Restrict / Quarantine** — the process is parked; the rest of the system continues.
- **L5 Pause / Safe Stop** — controlled stop of a service.
- **L6 Emergency Kill** — the last line: shut everything down, leaving only the Dignity Test analyzing.

Proportionality is the guiding principle: for minimal risk you park, you do not stop everything. A system that shuts down at every anomaly demands constant human intervention and stops being reliable. The kill is the last line, not the first response.

## What it is not

It is not a surveillance mechanism. It does not give one AI authority over another AI. It does not replace human judgment: it complements it, making it faster where speed matters and more traceable where deliberation matters. No AI can deactivate itself, no AI executes a major stop without human authority, and every system action is recorded in immutable evidence.

## The principles

1. **Technical capacity to stop is not authority to stop.** The system always can; only governed authority orders.
2. **Only humans authorize.** Through hardware signatures with mandatory user verification. No exceptions, no bypass, not even for the top administrator.
3. **Every action is auditable.** Immutable evidence: a hardware-signed hash chain, write-once storage, periodic anchoring to public chains.
4. **AI autonomy is earned, not assumed.** The Dignity Test proposes and verifies; the human quorum approves; progressive audit can evolve the principles themselves. Never a change without notification, audit, and record.
5. **Recovery is as critical as stopping.** Gradual re-activation, parallel post-mortem between AI and humans, and partial restoration labeled unsafe while the quorum decides.
6. **Human dignity includes physical integrity.** For embodied machines: safe positioning, inhibition hardware isolated from software, and a physical escalation that ends in a control that only a human can actuate.
7. **Isolation is not blindness.** Between organizations there is intelligent quarantine: an incident in one notifies suspicion to the related ones and places them under analysis, without stopping the healthy ones.

## For whom

For organizations that operate autonomous AI systems and need to demonstrate to governments, clients, insurers, and society that their systems operate within declared limits. For laboratories that want an independent, interoperable assurance layer without handing over source code or proprietary architecture: the entry point is behavior, declared authority, observable evidence, and reproducibility. For regulators who need verifiable controls, not documentary promises.

## The participation model

Alygn does not ask for submission to a standard; it proposes building an independent control layer together. Participation evolves in stages: independent evaluation first, institutional coordination second, runtime integration last, always at the participant's pace. Evaluation can begin without source code, without proprietary architecture, without chain-of-thought, and without runtime integration.

## The state

The system is fully designed: sixteen design sessions have covered the complete cycle, from detection to recovery, from quorum governance to embodied AI. The core components are specified at implementation level. The whitepaper v1.5, with the integrated architecture, is in review for closed publication to contributors.

What we seek now are contributors who want to build this layer with us: enforcement engineering, agent evaluation, evidence infrastructure, and the inhibition hardware for embodied AI.

---

*Alygn — the institution that makes human dignity verifiable in autonomous systems.*
*Andler Devs Studio — the founding technology team.*

**Contact:** via Alygn / Andler Devs Studio
**Reference documents (contributors):** Whitepaper v1.5 · Design System · ADRs 133-146

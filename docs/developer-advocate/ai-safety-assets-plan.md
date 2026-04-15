# AI Safety & Governance Content — Asset Integration Plan

**Created:** April 14, 2026  
**Content Batch:** AI Safety Hardware Evolution  
**Status:** Ready for integration

---

## Available Infographic Assets

All assets generated April 13, 2026. V2 versions are refined iterations of original assets.

| # | Filename | Description | Style |
|---|----------|-------------|-------|
| 1 | `2026-04-13-11-45-dpu-three-pillars-portrait.png` | DPU Three Pillars — portrait format | Infobae-style |
| 2 | `2026-04-13-11-48-architecture-types-comparison.png` | Architecture types comparison (CPU vs GPU vs DPU) | Technical diagram |
| 3 | `2026-04-13-11-48-third-pillar-section-overview.png` | Third pillar section overview | Technical diagram |
| 4 | `2026-04-13-11-55-aws-anthropic-architecture.png` | AWS + Anthropic hyperscaler architecture | Technical diagram |
| 5 | `2026-04-13-11-55-google-tpu-architecture.png` | Google TPU architecture | Technical diagram |
| 6 | `2026-04-13-11-55-microsoft-openai-architecture.png` | Microsoft + OpenAI architecture | Technical diagram |
| 7 | `2026-04-13-11-55-xai-colossus-architecture.png` | xAI Colossus architecture | Technical diagram |
| 8 | `2026-04-13-12-15-enterprise-datacenter-architecture.png` | Enterprise datacenter architecture | Technical diagram |
| 9 | `2026-04-13-15-32-ai-safety-kill-switches.png` | Hardware Kill Switches (v1) | Infobae-style |
| 10 | `2026-04-13-15-32-ai-safety-project-glasswing.png` | Project Glasswing (v1) | Infobae-style |
| 11 | `2026-04-13-15-32-ai-safety-sdlc-layers.png` | AI Safety SDLC Layers (v1) | Infobae-style |
| 12 | `2026-04-13-15-32-ai-safety-zero-trust.png` | Zero-Trust Telemetry (v1) | Infobae-style |
| 13 | `2026-04-13-15-42-ai-safety-kill-switches-v2.png` | Hardware Kill Switches (v2, refined) | Infobae-style |
| 14 | `2026-04-13-15-42-ai-safety-project-glasswing-v2.png` | Project Glasswing (v2, refined) | Infobae-style |
| 15 | `2026-04-13-15-42-ai-safety-sdlc-layers-v2.png` | AI Safety SDLC Layers (v2, refined) | Infobae-style |
| 16 | `2026-04-13-15-42-ai-safety-zero-trust-v2.png` | Zero-Trust Telemetry (v2, refined) | Infobae-style |
| 17 | `2026-04-13-18-10-market-implications-16x10.png` | Market implications (landscape) | Infobae-style |
| 18 | `2026-04-13-18-10-physical-constraints-16x10.png` | Physical constraints (landscape) | Infobae-style |

**Existing assets from zero-trust series:**

| # | Filename | Description |
|---|----------|-------------|
| A | `2026-04-13-cloud-vs-local-cost-comparison.png` | Cloud vs Local cost comparison |
| B | `2026-04-13-cloud-vs-local-infobae-style.png` | Cloud vs Local (Infobae style) |
| C | `2026-04-13-zero-trust-ai-infrastructure-portrait.png` | Zero-trust portrait (in portraits/) |
| D | `2026-04-13-zero-trust-architecture-diagram.png` | Architecture diagram (in diagrams/) |

---

## Asset Placement — Blog Tutorial

**File:** `docs/developer-advocate/blog/ai-safety-hardware-evolution.md`

| Position | Section | Asset | Placeholder | Notes |
|----------|---------|-------|-------------|-------|
| 1 | Hero/header | Portrait | `![AI Safety Hardware Evolution](../assets/infographics/2026-04-14-ai-safety-hardware-evolution-portrait.png)` | **NEEDS CREATION** — new portrait for this series |
| 2 | "Hardware Kill Switches" section | Kill switches infographic | `![Hardware Kill Switches](../assets/infographics/2026-04-13-15-42-ai-safety-kill-switches-v2.png)` | V2 (refined) |
| 3 | "The DPU Solution" section | Zero-trust telemetry | `![Zero-Trust Telemetry](../assets/infographics/2026-04-13-15-42-ai-safety-zero-trust-v2.png)` | V2 (refined) |
| 4 | "Project Glasswing" section | Glasswing infographic | `![Project Glasswing](../assets/infographics/2026-04-13-15-42-ai-safety-project-glasswing-v2.png)` | V2 (refined) |
| 5 | "Architecture" section | SDLC layers | `![AI Safety SDLC Layers](../assets/infographics/2026-04-13-15-42-ai-safety-sdlc-layers-v2.png)` | V2 (refined) |
| 6 | "Competitive Advantage" section | Market implications | `![Market Implications](../assets/infographics/2026-04-13-18-10-market-implications-16x10.png)` | Landscape format |
| 7 | "Path Forward" section | Physical constraints | `![Physical Constraints](../assets/infographics/2026-04-13-18-10-physical-constraints-16x10.png)` | Landscape format |

**Total blog assets:** 7 (1 new portrait + 6 existing)

---

## Asset Placement — LinkedIn

**File:** `docs/developer-advocate/social/ai-safety-governance-linkedin.md`

| Position | Section | Asset | Notes |
|----------|---------|-------|-------|
| 1 | Hero/header | Portrait | Same new portrait as blog |
| 2 | After "20% of DPU deployments" stat | Zero-trust telemetry (v2) | Key visual supporting the stat |

**Total LinkedIn assets:** 2

---

## Asset Placement — X Thread

**File:** `docs/developer-advocate/social/ai-safety-governance-x-thread.md`

| Position | Post | Asset | Notes |
|----------|------|-------|-------|
| 1 | Post 5 (DPU Solution) | Zero-trust telemetry (v2) | Core infographic |
| 2 | Post 8 (Competitive Advantage) | Market implications | Landscape format works for X |

**Total X assets:** 2

---

## Naming Convention

All blog assets follow the pattern:

```
assets/infographics/YYYY-MM-DD-[descriptive-name].png
assets/portraits/YYYY-MM-DD-[post-slug]-portrait.png
assets/diagrams/YYYY-MM-DD-[descriptive-name].png
```

For this batch, all assets use `2026-04-13` dates (creation date). The new portrait should use `2026-04-14` (publication date).

---

## Asset Creation Needed

| Asset | Status | Action |
|-------|--------|--------|
| `2026-04-14-ai-safety-hardware-evolution-portrait.png` | ❌ NEEDS CREATION | Generate new portrait for blog hero + LinkedIn header |

All other assets already exist in `/home/andlersrv/.openclaw/workspace/` and need to be copied to `docs/developer-advocate/assets/infographics/`.

---

## Copy Commands

```bash
# Copy existing infographics to proper asset directory
cp /home/andlersrv/.openclaw/workspace/2026-04-13-15-42-ai-safety-kill-switches-v2.png \
   /home/andlersrv/.openclaw/workspace/docs/developer-advocate/assets/infographics/

cp /home/andlersrv/.openclaw/workspace/2026-04-13-15-42-ai-safety-zero-trust-v2.png \
   /home/andlersrv/.openclaw/workspace/docs/developer-advocate/assets/infographics/

cp /home/andlersrv/.openclaw/workspace/2026-04-13-15-42-ai-safety-project-glasswing-v2.png \
   /home/andlersrv/.openclaw/workspace/docs/developer-advocate/assets/infographics/

cp /home/andlersrv/.openclaw/workspace/2026-04-13-15-42-ai-safety-sdlc-layers-v2.png \
   /home/andlersrv/.openclaw/workspace/docs/developer-advocate/assets/infographics/

cp /home/andlersrv/.openclaw/workspace/2026-04-13-18-10-market-implications-16x10.png \
   /home/andlersrv/.openclaw/workspace/docs/developer-advocate/assets/infographics/

cp /home/andlersrv/.openclaw/workspace/2026-04-13-18-10-physical-constraints-16x10.png \
   /home/andlersrv/.openclaw/workspace/docs/developer-advocate/assets/infographics/

# Hyperscaler architecture diagrams (for future deep-dive posts)
cp /home/andlersrv/.openclaw/workspace/2026-04-13-11-55-aws-anthropic-architecture.png \
   /home/andlersrv/.openclaw/workspace/docs/developer-advocate/assets/infographics/

cp /home/andlersrv/.openclaw/workspace/2026-04-13-11-55-google-tpu-architecture.png \
   /home/andlersrv/.openclaw/workspace/docs/developer-advocate/assets/infographics/

cp /home/andlersrv/.openclaw/workspace/2026-04-13-11-55-microsoft-openai-architecture.png \
   /home/andlersrv/.openclaw/workspace/docs/developer-advocate/assets/infographics/

cp /home/andlersrv/.openclaw/workspace/2026-04-13-11-55-xai-colossus-architecture.png \
   /home/andlersrv/.openclaw/workspace/docs/developer-advocate/assets/infographics/

cp /home/andlersrv/.openclaw/workspace/2026-04-13-12-15-enterprise-datacenter-architecture.png \
   /home/andlersrv/.openclaw/workspace/docs/developer-advocate/assets/infographics/

cp /home/andlersrv/.openclaw/workspace/2026-04-13-11-48-architecture-types-comparison.png \
   /home/andlersrv/.openclaw/workspace/docs/developer-advocate/assets/infographics/

cp /home/andlersrv/.openclaw/workspace/2026-04-13-11-48-third-pillar-section-overview.png \
   /home/andlersrv/.openclaw/workspace/docs/developer-advocate/assets/infographics/

cp /home/andlersrv/.openclaw/workspace/2026-04-13-11-45-dpu-three-pillars-portrait.png \
   /home/andlersrv/.openclaw/workspace/docs/developer-advocate/assets/infographics/
```

---

## Future Content Opportunities

Assets not used in this batch that can support future content:

| Asset | Future Use |
|-------|-----------|
| Hyperscaler architectures (4) | "How Hyperscalers Build AI Infrastructure" deep-dive |
| Architecture types comparison | "CPU vs GPU vs DPU: When to Use What" |
| Third pillar section overview | DPU infrastructure tutorial |
| Enterprise datacenter architecture | Enterprise deployment guide |
| Physical constraints (landscape) | "The Physics of AI Compute" explainer |
| DPU three pillars portrait | Standalone social content |

---

*This plan maps all 18 existing infographic assets to current and future content deliverables.*
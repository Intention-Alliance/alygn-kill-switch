# OpenClaw Workspace - Andler

**Owner:** Andler (contact@andler.dev)  
**Timezone:** America/Costa_Rica  
**Assistant:** Wobblus 🔧

## Overview
Workspace organizado para automatización multi-organización (ALYGN, BitcashOrg, AndlerRL) con scripts centralizados y credenciales seguras.

## Estructura

```
~/.openclaw/workspace/
├── config/               # Credenciales centralizadas
├── scripts/              # Scripts organizados por proyecto
├── repos-readonly/       # Repos clonados (SOLO LECTURA)
├── docs/                 # Documentación
├── memory/               # Memoria diaria
└── [archivos de configuración raíz]
```

## Quick Start

### Verificar Credenciales
\`\`\`bash
node scripts/shared/load-credentials.js check
\`\`\`

### Ejecutar Scripts Manualmente
\`\`\`bash
# ALYGN
node scripts/alygn/daily-tracker.js
node scripts/alygn/twitter-automation.js list
node scripts/alygn/vc-outreach.js list

# Sistema
node scripts/system/morning-briefing.js
node scripts/system/health-monitor.js

# BitcashOrg / Personal
node scripts/bitcash/daily-tracker.js
node scripts/personal/daily-tracker.js
\`\`\`

### Gestionar Cron Jobs
\`\`\`bash
# Crear todos los cron jobs
bash scripts/cron/create-all-crons.sh

# Listar cron jobs activos
openclaw cron list
\`\`\`

## Documentación
- [Automation System](./AUTOMATION.md) - Sistema de automatización completo
- [VC Tracking](./VC-TRACKING.md) - Tracking de VCs e inversores
- [Security Policies](./SECURITY.md) - Políticas de seguridad

## Archivos de Configuración Raíz
- **AGENTS.md** - Sistema y comportamiento de Wobblus
- **SOUL.md** - Personalidad y vibe
- **TOOLS.md** - Herramientas y configuración local
- **IDENTITY.md** - Identidad de Wobblus
- **USER.md** - Información de Andler
- **MEMORY.md** - Memoria long-term
- **TODO.md** - Tareas pendientes

## Seguridad
- ✅ Credenciales SOLO en \`config/credentials.json\`
- ✅ Repos clonados SOLO en \`repos-readonly/\` (sin edición)
- ✅ Scripts usan helper compartido para credenciales
- ✅ No hardcodear keys en scripts

---
**Última actualización:** 2026-02-03

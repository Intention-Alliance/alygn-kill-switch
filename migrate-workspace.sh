#!/bin/bash
#
# MIGRATION SCRIPT - Reorganización de Workspace
# Ejecuta la migración completa según MIGRATION-PLAN.md
#

set -e  # Exit on error

WORKSPACE="$HOME/.openclaw/workspace"
cd "$WORKSPACE"

echo "🔧 Iniciando migración de workspace..."
echo "===================================="
echo ""

# Paso 1: Crear estructura de directorios
echo "📁 Paso 1: Creando estructura de directorios..."
mkdir -p scripts/{shared,alygn,bitcash,personal,system,cron}
mkdir -p repos-readonly
mkdir -p docs
echo "   ✅ Directorios creados"
echo ""

# Paso 2: Mover scripts ALYGN
echo "📦 Paso 2: Migrando scripts ALYGN..."
if [ -d "alygn-automation/scripts" ]; then
  cp alygn-automation/scripts/daily-activity-tracker.js scripts/alygn/daily-tracker.js
  cp alygn-automation/scripts/twitter-automation.js scripts/alygn/twitter-automation.js
  cp alygn-automation/scripts/vc-outreach.js scripts/alygn/vc-outreach.js
  cp alygn-automation/scripts/setup-vc-tracker.js scripts/alygn/setup-vc-tracker.js
  cp alygn-automation/scripts/jacobo-tracking.js scripts/alygn/jacobo-tracking.js
  cp alygn-automation/scripts/github-digest.js scripts/alygn/github-digest.js
  cp alygn-automation/scripts/eod-summary.js scripts/alygn/eod-summary.js
  cp alygn-automation/scripts/weekly-reflection.js scripts/alygn/weekly-reflection.js
  cp alygn-automation/scripts/monthly-review.js scripts/alygn/monthly-review.js
  echo "   ✅ Scripts ALYGN migrados"
else
  echo "   ⚠️  alygn-automation/scripts no encontrado"
fi
echo ""

# Paso 3: Mover scripts del sistema
echo "🔧 Paso 3: Migrando scripts del sistema..."
if [ -d "alygn-automation/scripts" ]; then
  cp alygn-automation/scripts/morning-briefing.js scripts/system/morning-briefing.js
  cp alygn-automation/scripts/backup.js scripts/system/backup.js
  cp alygn-automation/scripts/health-monitor.js scripts/system/health-monitor.js
  cp alygn-automation/scripts/notion-sync.js scripts/system/notion-sync.js
  echo "   ✅ Scripts del sistema migrados"
fi
echo ""

# Paso 4: Migrar script de cron
echo "⏰ Paso 4: Migrando script de cron..."
if [ -f "alygn-automation/scripts/create-merged-crons.sh" ]; then
  cp alygn-automation/scripts/create-merged-crons.sh scripts/cron/create-all-crons.sh
  chmod +x scripts/cron/create-all-crons.sh
  echo "   ✅ Script de cron migrado"
fi
echo ""

# Paso 5: Crear scripts BitcashOrg
echo "💰 Paso 5: Creando script BitcashOrg..."
cat > scripts/bitcash/daily-tracker.js << 'EOFBITCASH'
#!/usr/bin/env node
/**
 * BitcashOrg Daily Activity Tracker
 * Tracks GitHub activity, sessions, and generates daily report in Notion
 */

const { getNotionKey, getNotionPage } = require('../shared/load-credentials');

// TODO: Implementar basado en alygn/daily-tracker.js
console.log('BitcashOrg Daily Tracker - En desarrollo');
console.log('Notion Key:', getNotionKey() ? '✅ Configurado' : '❌ Faltante');
EOFBITCASH

chmod +x scripts/bitcash/daily-tracker.js
echo "   ✅ Script BitcashOrg creado (placeholder)"
echo ""

# Paso 6: Crear scripts Personal
echo "🎨 Paso 6: Creando script Personal (AndlerRL)..."
cat > scripts/personal/daily-tracker.js << 'EOFPERSONAL'
#!/usr/bin/env node
/**
 * AndlerRL Personal Daily Activity Tracker
 * Tracks personal projects, GitHub activity, and generates daily report
 */

const { getNotionKey, getNotionPage } = require('../shared/load-credentials');

// TODO: Implementar basado en alygn/daily-tracker.js
console.log('AndlerRL Personal Tracker - En desarrollo');
console.log('Notion Key:', getNotionKey() ? '✅ Configurado' : '❌ Faltante');
EOFPERSONAL

chmod +x scripts/personal/daily-tracker.js
echo "   ✅ Script Personal creado (placeholder)"
echo ""

# Paso 7: Mover repo bitcash
echo "📚 Paso 7: Reorganizando repos..."
if [ -d "bitcash-readonly" ]; then
  mv bitcash-readonly repos-readonly/bitcash
  echo "   ✅ Repo bitcash movido a repos-readonly/"
fi
echo ""

# Paso 8: Consolidar documentación
echo "📄 Paso 8: Consolidando documentación..."

# docs/README.md
cat > docs/README.md << 'EOFDOCS'
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
EOFDOCS

echo "   ✅ docs/README.md creado"

# Mover documentación legacy
if [ -f "alygn-automation/VC-TRACKING-SCHEMA.md" ]; then
  cp alygn-automation/VC-TRACKING-SCHEMA.md docs/VC-TRACKING.md
  echo "   ✅ docs/VC-TRACKING.md creado"
fi

if [ -f "SECURITY-REFACTOR.md" ]; then
  mv SECURITY-REFACTOR.md docs/SECURITY.md
  echo "   ✅ docs/SECURITY.md creado"
fi

echo ""

# Paso 9: Crear .gitignore para config
echo "🔒 Paso 9: Protegiendo credenciales..."
cat > config/.gitignore << 'EOFGITIGNORE'
# Never commit credentials
credentials.json
*.key
*.secret
*.pem
EOFGITIGNORE
echo "   ✅ config/.gitignore creado"
echo ""

# Paso 10: Hacer scripts ejecutables
echo "🔧 Paso 10: Haciendo scripts ejecutables..."
chmod +x scripts/**/*.js 2>/dev/null || true
chmod +x scripts/**/*.sh 2>/dev/null || true
echo "   ✅ Permisos de ejecución aplicados"
echo ""

echo "=========================================="
echo "✅ Migración completada!"
echo ""
echo "📋 Próximos pasos:"
echo "1. Revisar estructura: ls -R scripts/"
echo "2. Verificar credenciales: node scripts/shared/load-credentials.js check"
echo "3. Probar scripts manualmente"
echo "4. Actualizar cron jobs: bash scripts/cron/create-all-crons.sh"
echo "5. Una vez verificado todo: rm -rf alygn-automation/"
echo ""
echo "📚 Documentación en: docs/"
echo ""

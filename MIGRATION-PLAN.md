# MIGRATION PLAN - Consolidación y Reorganización

**Fecha:** 2026-02-03  
**Objetivo:** Centralizar credenciales, reorganizar scripts por proyecto, consolidar documentación

---

## 📋 Estado Actual (Pre-Migración)

### Estructura Actual:
```
~/.openclaw/workspace/
├── alygn-automation/
│   ├── scripts/ (11 scripts mezclados)
│   ├── config/credentials.json (legacy)
│   └── [varios .md]
├── bitcash-readonly/ (repo clonado hoy)
├── config/ (nuevo - credenciales centralizadas) ✅
├── scripts/shared/ (nuevo - helper) ✅
├── memory/ (logs de memoria)
├── grok-conversations/ (contexto Grok)
└── [varios archivos .md dispersos]
```

### Archivos de Documentación Actuales:
- AGENTS.md
- SOUL.md  
- TOOLS.md
- IDENTITY.md
- USER.md
- HEARTBEAT.md
- BOOTSTRAP.md
- MEMORY.md
- TODO.md
- SECURITY-REFACTOR.md (nuevo)
- alygn-automation/README.md
- alygn-automation/VC-TRACKING-SCHEMA.md
- alygn-automation/COMPARISON.md
- alygn-automation/DAILY-BRIEFING.md

---

## 🎯 Estructura Final (Post-Migración)

```
~/.openclaw/workspace/
├── config/
│   ├── credentials.json          # ✅ Credenciales centralizadas
│   └── .gitignore
│
├── scripts/
│   ├── shared/
│   │   └── load-credentials.js   # ✅ Helper de credenciales
│   ├── alygn/                    # Scripts ALYGN/Intention Alliance
│   │   ├── daily-tracker.js
│   │   ├── twitter-automation.js
│   │   ├── vc-outreach.js
│   │   ├── setup-vc-tracker.js
│   │   ├── jacobo-tracking.js
│   │   ├── github-digest.js
│   │   ├── eod-summary.js
│   │   ├── weekly-reflection.js
│   │   └── monthly-review.js
│   ├── bitcash/                  # Scripts BitcashOrg
│   │   └── daily-tracker.js
│   ├── personal/                 # Scripts AndlerRL
│   │   └── daily-tracker.js
│   ├── system/                   # Scripts del sistema
│   │   ├── morning-briefing.js
│   │   ├── backup.js
│   │   ├── health-monitor.js
│   │   └── notion-sync.js
│   └── cron/
│       └── create-all-crons.sh   # Crear todos los cron jobs
│
├── repos-readonly/               # Repos clonados (SOLO LECTURA)
│   └── bitcash/                  # Movido de bitcash-readonly/
│
├── docs/                         # Documentación consolidada
│   ├── README.md                 # Overview general del workspace
│   ├── AUTOMATION.md             # Sistema de automatización
│   ├── VC-TRACKING.md            # Sistema de tracking de VCs
│   └── SECURITY.md               # Políticas de seguridad
│
├── memory/                       # Memoria diaria (sin cambios)
│   └── YYYY-MM-DD.md
│
├── grok-conversations/           # Contexto Grok (sin cambios)
│
├── AGENTS.md                     # Sistema Wobblus (sin cambios)
├── SOUL.md                       # Personalidad (sin cambios)
├── TOOLS.md                      # Herramientas (sin cambios)
├── IDENTITY.md                   # Identidad Wobblus (sin cambios)
├── USER.md                       # Info Andler (sin cambios)
├── HEARTBEAT.md                  # Heartbeat config (sin cambios)
├── MEMORY.md                     # Memoria long-term (sin cambios)
└── TODO.md                       # Tareas pendientes (sin cambios)
```

---

## 📝 Pasos de Migración

### ✅ Paso 1: Estructura Base Creada
- [x] `config/credentials.json` - Credenciales centralizadas
- [x] `scripts/shared/load-credentials.js` - Helper
- [ ] Crear directorios: scripts/{alygn,bitcash,personal,system,cron}
- [ ] Crear directorio: repos-readonly/
- [ ] Crear directorio: docs/

### 📦 Paso 2: Migrar Scripts por Proyecto

**ALYGN Scripts (de alygn-automation/scripts/):**
- [ ] daily-activity-tracker.js → scripts/alygn/daily-tracker.js
- [ ] twitter-automation.js → scripts/alygn/twitter-automation.js
- [ ] vc-outreach.js → scripts/alygn/vc-outreach.js
- [ ] setup-vc-tracker.js → scripts/alygn/setup-vc-tracker.js
- [ ] jacobo-tracking.js → scripts/alygn/jacobo-tracking.js
- [ ] github-digest.js → scripts/alygn/github-digest.js
- [ ] eod-summary.js → scripts/alygn/eod-summary.js
- [ ] weekly-reflection.js → scripts/alygn/weekly-reflection.js
- [ ] monthly-review.js → scripts/alygn/monthly-review.js

**Multi-Org Scripts:**
- [ ] morning-briefing.js → scripts/system/morning-briefing.js
- [ ] backup.js → scripts/system/backup.js
- [ ] health-monitor.js → scripts/system/health-monitor.js
- [ ] notion-sync.js → scripts/system/notion-sync.js

**BitcashOrg:**
- [ ] Crear scripts/bitcash/daily-tracker.js (basado en ALYGN)

**Personal:**
- [ ] Crear scripts/personal/daily-tracker.js (basado en ALYGN)

**Cron:**
- [ ] create-merged-crons.sh → scripts/cron/create-all-crons.sh

### 🔧 Paso 3: Actualizar Scripts para Usar Helper

Cada script migrado debe:
1. Importar helper: `const { getNotionKey, getGrokKey } = require('../shared/load-credentials');`
2. Eliminar require de config legacy
3. Usar getters en vez de acceso directo
4. Actualizar rutas de archivos

### 📚 Paso 4: Consolidar Documentación

**Crear docs/README.md:**
- Overview del workspace
- Estructura de directorios
- Cómo usar los scripts
- Políticas de seguridad

**Crear docs/AUTOMATION.md:**
- Fusionar: alygn-automation/README.md + DAILY-BRIEFING.md
- Sistema de cron jobs
- Scripts disponibles
- Cómo ejecutar manualmente

**Crear docs/VC-TRACKING.md:**
- Mover: alygn-automation/VC-TRACKING-SCHEMA.md
- Sistema de tracking de VCs
- Cómo usar vc-outreach.js

**Crear docs/SECURITY.md:**
- Fusionar: SECURITY-REFACTOR.md
- Políticas de seguridad
- Manejo de credenciales
- Read-only para repos

**Eliminar:**
- [ ] SECURITY-REFACTOR.md (consolidado en docs/SECURITY.md)
- [ ] alygn-automation/COMPARISON.md (legacy, ya no necesario)

### 🔄 Paso 5: Reorganizar Repos

- [ ] Mover bitcash-readonly/ → repos-readonly/bitcash/
- [ ] Documentar que repos clonados van en repos-readonly/

### 🎯 Paso 6: Actualizar Cron Jobs

El script `create-all-crons.sh` debe:
1. Usar nuevas rutas de scripts
2. Apuntar a scripts en estructura nueva
3. Mantener misma funcionalidad (20 cron jobs)

### ✅ Paso 7: Verificación Final

- [ ] Probar cada script manualmente
- [ ] Verificar helper de credenciales funciona
- [ ] Re-crear cron jobs con nuevas rutas
- [ ] Verificar que cron jobs ejecutan correctamente
- [ ] Backup de alygn-automation/ antes de eliminar
- [ ] Eliminar alygn-automation/ una vez confirmado todo funciona

---

## 🔒 Políticas de Seguridad (Aplicadas)

1. **Credenciales:** SOLO en `config/credentials.json`
2. **Repos clonados:** SOLO en `repos-readonly/` (sin edición)
3. **Scripts:** Organizados por proyecto, usan helper compartido
4. **Documentación:** Consolidada en `docs/` y archivos raíz

---

## 📊 Progreso

- ✅ Credenciales centralizadas
- ✅ Helper compartido creado
- ⏳ Estructura de directorios
- ⏳ Migración de scripts
- ⏳ Actualización de scripts
- ⏳ Consolidación de docs
- ⏳ Reorganización de repos
- ⏳ Actualización de cron jobs
- ⏳ Verificación final

---

**Próximo paso:** Crear estructura de directorios y comenzar migración de scripts.

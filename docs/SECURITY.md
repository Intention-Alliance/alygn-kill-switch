# Centralización de Credenciales y Seguridad

## 🔒 Cambios Implementados

### 1. Credenciales Centralizadas

**Ubicación:** `~/.openclaw/workspace/config/credentials.json`

**Consolidado:**

- ✅ Notion API + todos los page IDs
- ✅ Grok API (xAI)
- ✅ Twitter/X (placeholders para futuro)
- ✅ Email SMTP
- ✅ GitHub (tracking de repos)
- ✅ ElevenLabs TTS (Wobblus voice)
- ✅ Google APIs (Places, General)
- ✅ OpenAI, Binance
- ✅ Contactos importantes (Jacobo)
- ✅ Delivery (WhatsApp, Email)
- ✅ Identity (info personal)

### 2. Helper Compartido

**Script:** `~/. openclaw/workspace/scripts/shared/load-credentials.js`

**Funciones:**

```javascript
const { getNotionKey, getGrokKey, getJacoboPhone } = require('../shared/load-credentials');

// Cargar todo
const creds = loadCredentials();

// Getters específicos
const notionKey = getNotionKey();
const grokKey = getGrokKey();
const pageId = getNotionPage('automation_logs');

// Verificar si existe
if (hasCredential('twitter.apiKey')) { ... }

// Listar faltantes
const missing = getMissingCredentials();
```

**CLI:**

```bash
# Verificar estado
node scripts/shared/load-credentials.js check

# Obtener credencial específica
node scripts/shared/load-credentials.js get notion.apiKey
node scripts/shared/load-credentials.js get contacts.jacobo.phone
```

### 3. Estructura de Scripts Propuesta

```
~/.openclaw/workspace/
├── config/
│   ├── credentials.json          # ✅ Credenciales centralizadas
│   └── .gitignore               # Proteger credenciales
│
├── scripts/
│   ├── shared/
│   │   └── load-credentials.js  # ✅ Helper compartido
│   ├── alygn/                   # Scripts ALYGN/Intention Alliance
│   │   ├── x-twitter/           # Scripts relacionados con Twitter/X
│   │   ├── vc-outreach/         # Scripts de outreach a VCs
│   │   ├── lib/                 # Librerías específicas para scripts en Alygn.
│   │   └── *.(js|ts|sh)         # Otros scripts relacionados con Alygn.
│   ├── bitcash/                 # Scripts BitcashOrg
│   │   └── daily-tracker.js
│   ├── personal/                # Scripts AndlerRL
│   │   └── daily-tracker.js
│   ├── system/                  # Scripts del sistema
│   │   ├── morning-briefing.js
│   │   ├── backup.js
│   │   └── health-monitor.js
│   └── *.(js|sh|ts)             # Otros scripts generales
│
├── repos-readonly/              # Repos clonados (SOLO LECTURA)
│   ├── bitcash/
│   └── intention-alliance/
├── docs/                        # Documentacion de los sistemas y procesos (IMPORTANTE para seguridad y mantenimiento)
├── memory/                      # Memoria diaria
└── [archivos de configuración raíz]
```

### 4. Política de Seguridad

**Para Wobblus (yo):**

- ❌ **NO editar** código en repos clonados
- ✅ **SOLO lectura** para explorar código
- ✅ Scripts de automatización en carpetas controladas
- ✅ Todas las credenciales en `config/credentials.json`
- ✅ No hardcodear credenciales en scripts
- ✅ Usar helper compartido para acceso

**Para repos clonados:**

- Clone con `--depth 1` (shallow, más rápido)
- Carpeta separada `repos-readonly/`
- No hacer commits/push
- Solo para referencia y lectura

### 5. Migración Gradual

**Pasos siguientes:**
1` (shallow, más rápido)

- No hacer commits/push
- Solo para referencia y lectura

### 5. Migración Gradual

**Pasos siguientes:**

1. ✅ Credenciales centralizadas creadas
2. ✅ Helper compartido funcional
3. ⏳ Reorganizar scripts por proyecto (alygn/, bitcash/, personal/)
4. ⏳ Migrar scripts existentes para usar helper
5. ⏳ Mover bitcash-readonly a repos-readonly/
6. ⏳ Actualizar cron jobs con nuevas rutas

**Puedes hacerlo gradualmente** - scripts viejos siguen funcionando mientras migramos.

## 🎯 Beneficios

1. **Seguridad mejorada:**
   - Credenciales en un solo lugar
   - Fácil rotar keys si hay compromiso
   - No hardcoded en múltiples archivos

2. **Organización:**
   - Scripts por proyecto
   - Helper compartido (DRY)
   - Estructura clara

3. **Mantenibilidad:**
   - Fácil agregar nuevas credenciales
   - Cambiar una key = cambiar un archivo
   - Detectar credenciales faltantes

4. **Auditoría:**
   - Ver todas las credenciales en un lugar
   - Saber qué servicios usamos
   - Identificar credenciales obsoletas

## 🚀 Prueba

```bash
# Verificar credenciales
node ~/.openclaw/workspace/scripts/shared/load-credentials.js check

# Obtener una específica
node ~/.openclaw/workspace/scripts/shared/load-credentials.js get notion.apiKey
```

---

**¿Aprobamos este approach?** Si te parece bien, empiezo a migrar los scripts de alygn-automation/ a la nueva estructura. 🔧

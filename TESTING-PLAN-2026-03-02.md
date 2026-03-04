# 🧪 Municipal Outreach Testing Plan

**Fecha:** 2026-03-02 11:15 CST  
**Estado:** ✅ **LISTO PARA TESTING**

---

## 📋 Scripts Verificados

| Script | Estado | Bytes | Propósito |
|--------|--------|-------|-----------|
| `muni-discovery.js` | ✅ Existe | 6.8 KB | Descubrir 82 cantones de CR via Firecrawl |
| `muni-research.js` | ✅ Existe | ~12 KB | Research: emails, AI signals, pain points |
| `x-warmup-phase1.js` | ✅ Existe | 9.5 KB | X Warmup: Follow + Like (2-3 tweets) |
| `x-warmup-phase2.js` | ✅ Existe | 11.5 KB | X Warmup: Quote + Reply (value-add) |
| `muni-personalizer.js` | ✅ Existe | ~15 KB | Generar emails con lenguaje de propuesta |
| `verify-emails.js` | ⏳ Pending | - | Validar emails via ZeroBounce |
| `compliance-review.js` | ⏳ Pending | - | Aprobación humana requerida |
| `supabase-sync.js` | ⏳ Pending | - | Sync a database Supabase |
| `email-sender.js` | ⏳ Pending | - | Enviar emails (Smartlead/SMTP) |
| `x-continue.js` | ⏳ Pending | - | Continuar engagement post-email |
| `weekly-summary.js` | ⏳ Pending | - | Reporte semanal Discord |

---

## 🎯 Testing Plan (Orden Solicitado)

### **1. Prueba con Datos Mock** ✅

**Objetivo:** Validar que cada script funciona en modo mock sin APIs reales

**Comandos:**
```bash
# 1. Discovery (5 municipalidades mock)
node scripts/alygn/muni-outreach/discovery/muni-discovery.js --region=cr --limit=5 --mock

# 2. Research (con datos mock)
node scripts/alygn/muni-outreach/research/muni-research.js --input=/tmp/muni-cr-discovered.json --mock

# 3. X Warmup Phase 1
node scripts/alygn/muni-outreach/engagement/x-warmup-phase1.js --input=/tmp/muni-cr-researched.json --mock

# 4. X Warmup Phase 2
node scripts/alygn/muni-outreach/engagement/x-warmup-phase2.js --input=/tmp/muni-cr-phase1.json --mock

# 5. Personalization (emails con contexto de propuesta)
node scripts/alygn/muni-outreach/personalization/muni-personalizer.js --input=/tmp/muni-cr-verified.json --mock
```

**Resultados Esperados:**
- ✅ Scripts ejecutan sin errores
- ✅ Generan archivos JSON en `/tmp/`
- ✅ Logs muestran mensajes apropiados
- ✅ Mock data es realista (nombres CR, emails válidos, etc.)

---

### **2. Prueba Lobster Workflow X-First (CR Pilot)** ⏳

**Objetivo:** Ejecutar workflow completo de 11 fases con 82 cantones (mock mode)

**Workflow:** `.lobster/cr-pilot-x-first.lobster.json`

**Fases:**
1. **Discovery** - 82 cantones via Firecrawl (mock)
2. **Research** - Contacts, AI signals, pain points (mock)
3. **X Warmup P1** - Follow + Like (mock)
4. **Verify Emails** - ZeroBounce validation (mock)
5. **Personalize** - Emails con contexto propuesta (mock)
6. **X Warmup P2** - Quote + Reply (mock)
7. **Compliance Review** ⚠️ **APPROVAL GATE**
8. **Sync DB** - Supabase upsert (mock)
9. **Send Emails** - Smartlead/SMTP (mock)
10. **X Continue** - Post-email engagement (mock)
11. **Report** - Discord summary

**Comando:**
```bash
lobster run .lobster/cr-pilot-x-first.lobster.json
```

**Resultados Esperados:**
- ✅ Workflow inicia correctamente
- ✅ Cada fase se ejecuta en orden
- ✅ Approval gate en fase 7 (compliance review)
- ✅ Notificaciones a Discord
- ✅ Resume capability si falla

---

## 🔑 Credentials Status

| Credential | Estado | Usado Por |
|------------|--------|-----------|
| `FIRECRAWL_API_KEY` | ⏳ Desconocido | `muni-discovery.js`, `muni-research.js` |
| `PERPLEXITY_API_KEY` | ⏳ Desconocido | `muni-research.js` (fallback a Brave) |
| `ZEROBOUNCE_API_KEY` | ⏳ Desconocido | `verify-emails.js` |
| `GROK_API_KEY` | ⏳ Desconocido | `muni-personalizer.js` |
| `SUPABASE_URL` | ✅ Disponible | `supabase-sync.js` |
| `SUPABASE_KEY` | ✅ Disponible | `supabase-sync.js` |
| `X_API_*` | ⏳ Desconocido | `x-warmup-phase1.js`, `x-warmup-phase2.js` |
| `SMARTLEAD_API_KEY` | ⏳ Desconocido | `email-sender.js` (fallback a SMTP) |
| `EMAIL_SMTP_PASSWORD` | ⏳ Desconocido | `email-sender.js` (fallback) |

**Nota:** En modo **mock**, TODOS los scripts funcionan SIN credentials.

---

## 📊 Criterios de Éxito

### **Mock Testing (Paso 1)**
- [ ] Todos los scripts ejecutan sin errores de sintaxis
- [ ] Archivos JSON generados en `/tmp/`
- [ ] Logs muestran progreso claro
- [ ] Mock data es realista para Costa Rica

### **Lobster Workflow (Paso 2)**
- [ ] Workflow inicia correctamente
- [ ] Fases 1-6 completan sin errores
- [ ] Fase 7 (Compliance) pausa para aprobación humana
- [ ] Notificaciones llegan a Discord
- [ ] Resume functionality funciona si se detiene

---

## 🚀 Próximos Pasos

**Inmediato:**
1. ✅ Scripts verificados (syntax OK)
2. ⏳ Ejecutar discovery mock (5 cantones)
3. ⏳ Ejecutar research mock
4. ⏳ Ejecutar X warmup mock
5. ⏳ Ejecutar personalization mock

**Después:**
1. ⏳ Ejecutar Lobster workflow completo (82 cantones, mock)
2. ⏳ Validar outputs en cada fase
3. ⏳ Ajustar scripts si es necesario
4. ⏳ Preparar para producción (remover --mock)

---

## 📝 Notas

- **Todos los scripts tienen modo --mock** que no requiere APIs
- **Lobster workflow está configurado** para CR pilot (82 cantones)
- **Compliance review es obligatorio** antes de enviar emails
- **Resume capability** permite continuar si falla a mitad del workflow

---

**Estado:** ✅ **LISTO PARA INICIAR TESTING**  
**Siguiente:** Ejecutar `node scripts/alygn/muni-outreach/discovery/muni-discovery.js --region=cr --limit=5 --mock`

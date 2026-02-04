# TODO List - Andler

## 🔥 URGENT - Hoy (2026-02-03)

### ⚠️ MIGRACIÓN BASE DE DATOS BITCASH
**Deadline:** Antes de que termine el día  
**Razón:** Reducir costos de Cloud SQL inmediatamente

**Repo Clonado:** ✅ `/home/andlersrv/.openclaw/workspace/bitcash-readonly`  
**Carpeta Hasura:** `apps/bitcash-hasura/`

---

## 📋 Script de Backup/Export Encontrado

### Comando de pg_dump desde Hasura API:

```bash
curl --location --request POST 'https://bitcash-hasura-33esyy2kgq-uc.a.run.app/v1alpha1/pg_dump' \
  --header 'Content-Type: application/json' \
  --header 'X-Hasura-Role: admin' \
  --header 'Content-Type: text/plain' \
  --header 'x-hasura-admin-secret: {SECRET}' \
  --data-raw '{ "opts": ["-O", "-x","--inserts",  "--schema", "public"], "clean_output": true}' > hasura-db.sql
```

**⚠️ Necesitas reemplazar:**
- `{SECRET}` → Tu Hasura admin secret actual

**Resultado:**
- Exporta toda la base de datos a `hasura-db.sql`
- Opciones: `-O` (sin owner), `-x` (sin privilegios), `--inserts` (formato INSERT)

---

## 🎯 Plan de Migración Paso a Paso

### 1. Obtener Hasura Admin Secret
```bash
# Buscar en variables de entorno o Cloud Console
# Debería estar en: Google Cloud Run → bitcash-hasura → Variables de entorno
# O en: Cloud SQL → Conexiones
```

### 2. Hacer Backup de Base de Datos Actual
```bash
# Usando el comando de arriba
curl --location --request POST 'https://bitcash-hasura-33esyy2kgq-uc.a.run.app/v1alpha1/pg_dump' \
  --header 'Content-Type: application/json' \
  --header 'X-Hasura-Role: admin' \
  --header 'Content-Type: text/plain' \
  --header 'x-hasura-admin-secret: TU_SECRET_AQUI' \
  --data-raw '{ "opts": ["-O", "-x","--inserts",  "--schema", "public"], "clean_output": true}' > bitcash-backup-$(date +%Y%m%d).sql

# Verificar que se creó el archivo
ls -lh bitcash-backup-*.sql
```

### 3. Preparar Nueva Instancia Cloud SQL
**Opción A: Migrar a instancia más barata**
- Ir a: https://console.cloud.google.com/sql
- Crear nueva instancia PostgreSQL con tier más bajo
- Anotar: host, puerto, user, password, database name

**Opción B: Optimizar instancia actual**
- Reducir tier de la instancia actual
- Ajustar storage

### 4. Restaurar Backup en Nueva Instancia
```bash
# Si migraste a nueva instancia
psql -h NUEVO_HOST -U USUARIO -d NOMBRE_BD < bitcash-backup-FECHA.sql

# O vía Google Cloud Console:
# SQL → Import → Seleccionar archivo backup → Importar
```

### 5. Actualizar Configuración de Hasura
```bash
# Actualizar variables de entorno en Cloud Run
# HASURA_GRAPHQL_DATABASE_URL=postgresql://user:pass@NEW_HOST:5432/dbname
```

### 6. Verificar Migración
- ✅ App funciona con nueva BD
- ✅ Queries GraphQL responden
- ✅ No hay errores en logs
- ✅ Datos completos

### 7. Desactivar Instancia Vieja
- ⚠️ SOLO después de verificar TODO
- Cloud Console → SQL → Instancia vieja → Detener
- Esperar 24-48h por si hay problemas
- Luego eliminar permanentemente

---

## 📁 Archivos de Referencia (Read-Only)

**Ubicación:** `~/.openclaw/workspace/bitcash-readonly/apps/bitcash-hasura/`

**Archivos importantes:**
- `README.md` - Documentación y comando de backup
- `Taskfile.yml` - Comandos de migración con Hasura CLI
- `docker-compose.yml` - Configuración de BD local
- `.env-sample` - Variables de entorno necesarias
- `migrations/` - Migraciones de esquema
- `metadata/` - Metadata de Hasura

**Comando útil para ver estructura:**
```bash
tree ~/.openclaw/workspace/bitcash-readonly/apps/bitcash-hasura -L 2
```

---

## 🔑 Info Necesaria

Para ejecutar la migración necesitas:
1. ✅ Hasura Admin Secret
2. ✅ Credenciales Cloud SQL actual
3. ✅ Credenciales Cloud SQL nueva (o tier reducido)
4. ✅ Acceso a Google Cloud Console (proyecto Bitcash)

---

## ⚠️ Precauciones

1. **Hacer backup ANTES** de cualquier cambio
2. **No eliminar instancia vieja** hasta verificar TODO funciona
3. **Tener plan B** por si algo falla
4. **Documentar** nuevas credenciales para equipo

---

**Prioridad:** 🔴 CRÍTICA - Reducir costos HOY  
**Repo clonado:** ✅ Read-only en workspace  
**Script encontrado:** ✅ pg_dump via Hasura API  
**Status:** 🟢 Listo para ejecutar (solo falta admin secret)

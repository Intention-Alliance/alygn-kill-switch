# WS-F — Git History Security Scan: gitleaks + limpieza de refs con secret

**Claim:** El secret `sb_secret_FJpLu…` (Supabase service key en `tmp/update-bounce.js`) fue eliminado de todas las refs remotas alcanzables, y los archivos personales del workspace de OpenClaw (AGENTS.md, MEMORY.md, SOUL.md, muni-*.json, etc.) ya no son alcanzables desde ninguna ref remota.
**Status:** ✅ VERIFIED (con excepción documentada: `refs/pull/49/head` no es borrable vía git — mitigación = rotación del secret)
**Verifier:** Chanshuk (Dev Lead) — ejecución directa, sin subagentes
**Repo:** `Intention-Alliance/alygn-core-infra`
**Fecha:** 2026-09-09 03:10 CST
**Card:** WS-F (board alygn-activation, id `6228faf5-acff-4a16-95d2-c0a01da000ab`)

---

## 1. Hallazgo principal: las 4 refs eran historias HUÉRFANAS

Las 4 refs con el secret **no comparten ancestro con main**:

| Ref | Tip | Root | Merge-base con main |
|-----|-----|------|---------------------|
| `feat/alygn-outreach-linkedin-fallback` | `6c02f4f3` | `d5c8838d` | ❌ ninguno |
| `feat/alygn-outreach-linkedin-fallback-v2` | `ceff4d7f` | `d5c8838d` | ❌ ninguno |
| `feat/image-router-build` | `bd62df68` | `d5c8838d` | ❌ ninguno |
| `pr/49` (head) | `2570a9f0` | `d5c8838d` | ❌ ninguno |
| `main` | `4ec8cd7e` | `f4ec0480` | — |

**Conclusión:** son el workspace de OpenClaw (brain files, `twitter-outputs/`, `daily-reports/`, `reports/alygn/muni-*`, `tmp/update-bounce.js`) pusheado por accidente al repo equivocado. No son ramas de feature del proyecto. El secret vive en exactamente 2 commits por ref: `77bac31a` + `bc4e4916`.

**Corrección a la premisa de la card:** el PR #49 se mergeó el 2026-08-07 a su base `feat/image-router-build` (merge commit `bd62df68` = tip de esa rama), **NO a main**. El fix de SessionMonitor (`phase0/apps/admin-ui/src/App.tsx`) **no está en main** — `phase0/` no existe en main. La ref `pr/49` no es "inerte" en el sentido de que su contenido ya esté en main; es inerte en el sentido de que su contenido (fix de una app phase0 que no existe en main) es código muerto respecto a main, y la ref no es borrable vía git.

## 2. Acciones ejecutadas

### 2.1 Borrado de las 3 ramas feat/* (opción a — desechables)

Decisión: **borrar, no reescribir**. Evidencia:
- Cero ancestro común con main → pushes accidentales, no trabajo de proyecto
- Sin PRs abiertos que las referencien (único PR abierto: #83, base=main, head=`feat/wizard-tui` — no relacionado)
- Sin branch protection (404 en API de protección)
- Contenido recuperable: backup refs locales + `ContactFallbackStrategy.ts` existe en el skill vivo `~/.openclaw/skills/alygn-outreach/`
- Reescritura con filter-repo habría dejado igualmente una historia huérfana llena de archivos personales — sin valor preservar un historial que nunca perteneció al proyecto

```bash
git push origin --delete feat/alygn-outreach-linkedin-fallback \
                        feat/alygn-outreach-linkedin-fallback-v2 \
                        feat/image-router-build
# ✅ [deleted] × 3
```

**Backup refs locales creados** (por si se necesita recuperar contenido):
```
refs/backup/wsf/feat-linkedin-fallback      6c02f4f3
refs/backup/wsf/feat-linkedin-fallback-v2   ceff4d7f
refs/backup/wsf/feat-image-router-build     bd62df68
refs/backup/wsf/pr49-head                   2570a9f0
```

### 2.2 refs/pull/49/head — no borrable vía git (confirmado)

```bash
git push origin :refs/pull/49/head
# ! [remote rejected] refs/pull/49/head (deny updating a hidden ref)
```

GitHub no permite borrar hidden refs de PRs vía git ni API. La ref permanecerá mientras el PR exista. **Mitigación real: rotar el secret** (ver §4). El contenido del PR (fix SessionMonitor) es código muerto respecto a main; el backup local `refs/backup/wsf/pr49-head` conserva el diff por si se quisiera portar a main.

### 2.3 Verificación final (post-limpieza)

| Check | Resultado |
|-------|-----------|
| `git ls-remote origin` | 61 refs (eran 64; −3 ramas borradas) |
| Scan `sb_secret_FJpLu` en TODAS las refs remotas | ✅ solo `refs/pull/49/head` (2 commits) |
| Scan archivos personales en TODAS las refs remotas | ✅ solo `refs/pull/49/head` (81 hits) |
| `git log origin/main -S "sb_secret_FJpLu"` | ✅ 0 commits — main limpio |
| Webhook key `wk_kvlG…` en las 4 refs objetivo | ✅ 0 commits — nunca estuvo ahí |

**Nota sobre `wk_kvlG…`:** la key SÍ aparece en main y en ~40 refs, pero como `DEFAULT_SEED` **intencional y documentado** en `apps/server-kill-switch/scripts/create-admin-key.ts` (card 0e2f9fec §12 decisión 5, con instrucción de rotar vía `--force`). No es un leak de esta card; es un seed de bootstrap con rotación planificada. Fuera de alcance de WS-F.

## 3. Scan gitleaks completo (bonus)

`gitleaks git --log-opts="--all"` sobre el historial completo (495 commits, 217 MB):

- **264 findings totales**: 250 en commits huérfanos (ya no alcanzables desde ninguna ref remota tras el borrado) + **14 en commits alcanzables desde main** (regla `generic-api-key`).
- Los 14 de main están en: fixtures de tests (`api-keys.test.ts`, `server.test.ts`), artefactos `.next/` (ya eliminados del árbol actual — main tiene 0 archivos `.next/`), y `scripts/start-kill-switch-host.sh`.
- **Ninguno de los 14 es `sb_secret_FJpLu`** (ese secret solo existía en las ramas huérfanas). Son keys de prueba/fixtures y artefactos de build históricos.
- **Recomendación secundaria (no bloqueante):** revisar los 14 findings de main en una card separada si se quiere historial 100% libre de fixtures; requiere history rewrite de main (fuera de alcance de WS-F).

## 4. Recomendación BLOQUEANTE: rotar el secret de Supabase

**Un secret publicado no se puede des-exponer.** Aunque `refs/pull/49/head` es la única ref remota que aún lo contiene y no es borrable vía git, el secret fue visible en GitHub (ramas públicas del repo) desde el push accidental hasta hoy.

**Acción requerida (Andler/Supabase):**
1. Rotar la service key `sb_secret_FJpLu…` en el proyecto Supabase (Dashboard → Settings → API → regenerate service_role key).
2. Actualizar el entorno de despliegue (`.env` / secrets de Vercel / host) con la nueva key.
3. Verificar que `tmp/update-bounce.js` (o su reemplazo) use la nueva key.
4. Opcional: tras rotar, la ref `refs/pull/49/head` queda inofensiva y puede ignorarse hasta que GitHub la limpie.

## 5. Estado final

- ✅ 3 ramas huérfanas con secret: **borradas del remoto**
- ✅ `refs/pull/49/head`: **no borrable vía git** (documentado) — mitigación = rotación
- ✅ main: **limpio** (0 commits con el secret)
- ✅ Archivos personales: **cero** en cualquier ref remota excepto `refs/pull/49/head`
- ✅ Backup refs locales: `refs/backup/wsf/*` (4 refs)
- ⏳ **Pendiente de Andler: rotar la Supabase service key** (bloqueante para OSS launch)

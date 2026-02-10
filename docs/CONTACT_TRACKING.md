# Sistema de Tracking de Contactos

Sistema flexible para rastrear manualmente interacciones con contactos importantes.

## 🎯 Propósito

Dado que los mensajes directos de WhatsApp (user-to-user) no se logean automáticamente en OpenClaw, este sistema permite registrar manualmente cuándo tienes interacciones con contactos clave, y recibir alertas si pasa mucho tiempo sin contacto.

## 📋 Uso Rápido

### Registrar una interacción
```bash
./track log <contacto> [nota opcional]
```

**Ejemplos:**
```bash
./track log jacobo
./track log jacobo "Discutimos el roadmap Q1"
./track log maria "Llamada sobre presupuesto"
```

### Verificar última interacción
```bash
./track check <contacto> [días]
```

**Ejemplos:**
```bash
./track check jacobo           # Últimas 24h
./track check jacobo 7          # Última semana
```

### Ver historial
```bash
./track list                    # Últimas 10 interacciones
./track stats                   # Estadísticas por contacto
```

## 🤖 Integración con Wobblus

Puedes pedirme que registre interacciones:
- "Log contact with Jacobo"
- "/log jacobo discussed timeline"
- "Register interaction with Maria"

Yo ejecutaré el comando y confirmaré el registro.

## 📊 Cron Job Diario

Hay un cron job configurado que verifica diariamente (18:00 CST) si tuviste contacto con Jacobo:
- ✅ Si hubo contacto → Confirma con timestamp y nota
- ⚠️ Si NO hubo contacto → Te alerta

**Para que funcione:** Debes registrar manualmente tus interacciones con `./track log jacobo`

## 🔧 Archivos del Sistema

```
workspace/
├── track                           # Comando principal (wrapper)
├── log-contact.sh                 # Script para registrar
├── check-contact.sh               # Script para verificar
└── contact-tracking/
    └── interactions.jsonl         # Log de interacciones
```

## 📝 Formato del Log

Cada entrada en `interactions.jsonl`:
```json
{
  "contact": "jacobo",
  "timestamp": "2026-02-02T18:57:19-06:00",
  "unix_time": 1738548039,
  "note": "Discussed project timeline"
}
```

## 🚀 Agregar Más Contactos

El sistema es flexible. Para agregar tracking de nuevos contactos:

1. **Opción A: Crear un nuevo cron job**
   ```bash
   openclaw cron add --name "Daily [Contacto] Check" \
     --cron "0 18 * * *" \
     --tz "America/Costa_Rica" \
     --isolated \
     --agent-turn "Verifica contacto con [nombre] usando check-contact.sh"
   ```

2. **Opción B: Solo registrar manualmente**
   ```bash
   ./track log maria
   ./track check maria 7
   ```

## 💡 Tips

- **Consistencia:** Registra interacciones tan pronto como ocurran
- **Notas útiles:** Agrega contexto que te ayude después ("Confirmed meeting", "Sent proposal", etc.)
- **Verifica regularmente:** Usa `./track stats` para ver con quién interactúas más

## 🛠️ Mantenimiento

El archivo `interactions.jsonl` crece con el tiempo. Para archivarlo:
```bash
cd contact-tracking
mv interactions.jsonl interactions-2026-Q1.jsonl.bak
```

El sistema creará un nuevo archivo automáticamente.

---

**Creado:** 2026-02-02  
**Última actualización:** 2026-02-02

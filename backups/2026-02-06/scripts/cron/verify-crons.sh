#!/bin/bash
#
# CRON JOBS VERIFICATION SCRIPT
# Verifies that all 20 expected cron jobs were created correctly
#

echo "🔍 Verificando Cron Jobs"
echo "========================"
echo ""

# Expected jobs count
EXPECTED_JOBS=20

# Get current jobs
CURRENT_JOBS=$(openclaw cron list 2>/dev/null | grep -c "^│")

echo "📊 Resumen:"
echo "   Esperados: $EXPECTED_JOBS jobs"
echo "   Encontrados: $CURRENT_JOBS jobs"
echo ""

if [ "$CURRENT_JOBS" -eq "$EXPECTED_JOBS" ]; then
  echo "✅ Número correcto de jobs!"
else
  echo "⚠️  Diferencia detectada!"
fi

echo ""
echo "📋 Lista de Jobs Creados:"
echo "------------------------"
openclaw cron list 2>/dev/null

echo ""
echo "🔍 Verificando rutas de scripts en jobs..."
echo ""

# Check if any job still references old paths
OLD_PATH_COUNT=$(openclaw cron list 2>/dev/null | grep -c "alygn-automation/scripts")

if [ "$OLD_PATH_COUNT" -eq 0 ]; then
  echo "✅ No hay referencias a rutas viejas (alygn-automation/scripts/)"
else
  echo "⚠️  ATENCIÓN: $OLD_PATH_COUNT jobs todavía usan rutas viejas!"
  echo ""
  echo "Jobs con rutas viejas:"
  openclaw cron list 2>/dev/null | grep "alygn-automation/scripts"
fi

echo ""
echo "🎯 Verificando categorías de jobs..."
echo ""

# Expected job names
declare -a EXPECTED_NAMES=(
  "ALYGN Backup & Archive"
  "ALYGN Daily Activity Tracker"
  "Multi-Org Morning Briefing"
  "ALYGN: Daily Thread Ideas"
  "ALYGN: Trend Monitoring"
  "ALYGN: Auto Engagement"
  "ALYGN Jacobo Daily Summary"
  "ALYGN Notion Sync Check"
  "ALYGN Project Health Monitor"
  "ALYGN: Daily Analytics"
  "ALYGN End-of-Day Summary"
  "ALYGN GitHub Activity Digest"
  "ALYGN: Weekly Niche Posts"
  "ALYGN VC Outreach Weekly"
  "ALYGN: Weekly Review"
  "ALYGN Weekly Reflection"
  "ALYGN Monthly Project Review"
  "BitcashOrg Daily Activity Tracker"
  "AndlerRL Personal Daily Tracker"
  "Multi-Org Weekly Summary"
)

echo "Verificando nombres de jobs..."
FOUND_COUNT=0

for name in "${EXPECTED_NAMES[@]}"; do
  if openclaw cron list 2>/dev/null | grep -q "$name"; then
    echo "  ✅ $name"
    ((FOUND_COUNT++))
  else
    echo "  ❌ $name - NO ENCONTRADO"
  fi
done

echo ""
echo "========================"
echo "📊 Resultado Final:"
echo "   Jobs encontrados: $FOUND_COUNT / ${#EXPECTED_NAMES[@]}"

if [ "$FOUND_COUNT" -eq "${#EXPECTED_NAMES[@]}" ]; then
  echo "   ✅ TODOS LOS JOBS VERIFICADOS!"
else
  echo "   ⚠️  Faltan algunos jobs"
fi

echo ""

#!/usr/bin/env node
/**
 * AndlerRL Personal Daily Activity Tracker
 * Tracks personal projects, GitHub activity, and generates daily report
 */

const { getNotionKey, getNotionPage } = require('../shared/load-credentials');

// TODO: Implementar basado en alygn/daily-tracker.js
console.log('AndlerRL Personal Tracker - En desarrollo');
console.log('Notion Key:', getNotionKey() ? '✅ Configurado' : '❌ Faltante');

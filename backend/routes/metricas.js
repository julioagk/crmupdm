const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { auth } = require('../middleware/auth');
const { updateKPIsSheet } = require('../lib/kpiSync');
const crmSync = require('../lib/crmSync');

router.get('/', auth, async (req, res) => {
    try {
        const hoyInicio = new Date().toISOString().slice(0, 10) + ' 00:00:00';
        const rowLlamadasHoy = await db.prepare('SELECT COUNT(*) as c FROM actividades WHERE tipo = ? AND fecha >= ?').get('llamada', hoyInicio);
        const rowLlamadasTotales = await db.prepare('SELECT COUNT(*) as c FROM actividades WHERE tipo = ?').get('llamada');
        const rowClientesTotal = await db.prepare('SELECT COUNT(*) as c FROM clientes').get();

        res.json({
            llamadas: { hoy: rowLlamadasHoy.c, totales: rowLlamadasTotales.c },
            clientes: rowClientesTotal.c
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error del servidor' });
    }
});

/**
 * POST /api/metricas/sync-kpis
 * Fuerza la sincronización inmediata de KPIs hacia Google Sheets.
 * Solo usuarios autenticados (admin / gerentes).
 */
router.post('/sync-kpis', auth, async (req, res) => {
    try {
        await updateKPIsSheet();
        res.json({ ok: true, mensaje: 'Hoja KPIs actualizada correctamente', timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('❌ /sync-kpis error:', error.message);
        res.status(500).json({ ok: false, mensaje: 'Error al sincronizar KPIs', error: error.message });
    }
});

/**
 * POST /api/metricas/sync-crm
 * Fuerza la sincronización inmediata de la hoja CRM (Camila & Brenda) hacia Google Sheets.
 */
router.post('/sync-crm', auth, async (req, res) => {
    try {
        await crmSync.updateCRMFromDB();
        res.json({ ok: true, mensaje: 'Hoja CRM actualizada correctamente', timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('❌ /sync-crm error:', error.message);
        res.status(500).json({ ok: false, mensaje: 'Error al sincronizar CRM', error: error.message });
    }
});

module.exports = router;


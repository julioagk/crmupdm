const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { auth } = require('../middleware/auth');

const esCloserOAdmin = (req, res, next) => {
    if (req.usuario.rol !== 'closer') {
        return res.status(403).json({ msg: 'Acceso denegado. Solo closers.' });
    }
    next();
};

const calcularEstado = (llamadas, citas, periodo = 'diario') => {
    if (periodo === 'diario') {
        if (llamadas >= 12 && citas >= 1) return { estado: 'excelente', color: 'green' };
        if (llamadas >= 8 || citas >= 1) return { estado: 'bueno', color: 'yellow' };
        if (llamadas >= 4) return { estado: 'bajo', color: 'orange' };
        return { estado: 'critico', color: 'red' };
    } else if (periodo === 'semanal') {
        if (llamadas >= 60 && citas >= 8) return { estado: 'excelente', color: 'green' };
        if (llamadas >= 40 || citas >= 5) return { estado: 'bueno', color: 'yellow' };
        if (llamadas >= 20 || citas >= 2) return { estado: 'bajo', color: 'orange' };
        return { estado: 'critico', color: 'red' };
    } else if (periodo === 'mensual') {
        if (llamadas >= 240 && citas >= 32) return { estado: 'excelente', color: 'green' };
        if (llamadas >= 160 || citas >= 20) return { estado: 'bueno', color: 'yellow' };
        if (llamadas >= 80 || citas >= 8) return { estado: 'bajo', color: 'orange' };
        return { estado: 'critico', color: 'red' };
    }
    return { estado: 'sin_datos', color: 'gray' };
};

function getDescripcionEstado(estado) {
    const descripciones = {
        'excelente': 'Rendimiento excelente - Cumpliendo metas',
        'bueno': 'Buen rendimiento - En camino',
        'bajo': 'Rendimiento bajo - Necesita atención',
        'critico': 'Rendimiento crítico - Requiere intervención',
        'sin_datos': 'Sin datos suficientes'
    };
    return descripciones[estado] || 'Estado desconocido';
}

router.get('/monitoring', [auth, esCloserOAdmin], async (req, res) => {
    try {
        const { periodo = 'diario' } = req.query;
        const ahora = new Date();

        const hoy = new Date(ahora);
        hoy.setHours(0, 0, 0, 0);
        const hoyStr = hoy.toISOString();

        const semana = new Date(ahora);
        semana.setDate(ahora.getDate() - 7);
        semana.setHours(0, 0, 0, 0);
        const semanaStr = semana.toISOString();

        let fechaInicio = new Date();
        if (periodo === 'diario') {
            fechaInicio.setHours(0, 0, 0, 0);
        } else if (periodo === 'semanal') {
            fechaInicio.setDate(ahora.getDate() - 7);
            fechaInicio.setHours(0, 0, 0, 0);
        } else if (periodo === 'mensual') {
            fechaInicio.setDate(ahora.getDate() - 30);
            fechaInicio.setHours(0, 0, 0, 0);
        }
        const fechaInicioStr = fechaInicio.toISOString();
        const ahoraStr = ahora.toISOString();

        const prospectors = await db.prepare('SELECT id, nombre, email as correo FROM usuarios WHERE rol = ? AND activo = 1').all('prospector');
        const prospectorsConMetricas = await Promise.all(prospectors.map(async (prospector) => {
            const prospectorId = prospector.id;
            const row1 = await db.prepare('SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ?').get(prospectorId);
            const clientesTotales = row1.c;

            const row2 = await db.prepare('SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? AND fechaRegistro >= ?').get(prospectorId, fechaInicioStr);
            const clientesNuevos = row2.c;

            const actividades = await db.prepare('SELECT * FROM actividades WHERE vendedor = ? AND fecha >= ? AND fecha <= ?').all(prospectorId, fechaInicioStr, ahoraStr);

            const llamadas = actividades.filter(a => a.tipo === 'llamada');
            const llamadasExitosas = llamadas.filter(a => a.resultado === 'exitoso');
            const mensajes = actividades.filter(a => ['mensaje', 'correo', 'whatsapp'].includes(a.tipo));

            const row3 = await db.prepare('SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? AND etapaEmbudo = ? AND fechaUltimaEtapa >= ?').get(prospectorId, 'reunion_agendada', fechaInicioStr);
            const citasAgendadas = row3.c;

            const row4 = await db.prepare('SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? AND closerAsignado IS NOT NULL AND fechaTransferencia >= ?').get(prospectorId, fechaInicioStr);
            const transferencias = row4.c;

            const rendimiento = calcularEstado(llamadas.length, citasAgendadas, periodo);
            const tasaContacto = llamadas.length > 0 ? ((llamadasExitosas.length / llamadas.length) * 100).toFixed(1) : 0;
            const tasaAgendamiento = llamadasExitosas.length > 0 ? ((citasAgendadas / llamadasExitosas.length) * 100).toFixed(1) : 0;

            const row5 = await db.prepare('SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? AND etapaEmbudo = ?').get(prospectorId, 'prospecto_nuevo');
            const row6 = await db.prepare('SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? AND etapaEmbudo = ?').get(prospectorId, 'en_contacto');
            const row7 = await db.prepare('SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? AND etapaEmbudo = ?').get(prospectorId, 'reunion_agendada');
            const distribucion = {
                prospecto_nuevo: row5.c,
                en_contacto: row6.c,
                reunion_agendada: row7.c
            };

            // NEW DETAILED METRICS for Hoy
            const actsHoy = await db.prepare('SELECT * FROM actividades WHERE vendedor = ? AND fecha >= ? AND fecha <= ?').all(prospectorId, hoyStr, ahoraStr);
            const llamadasHoy = actsHoy.filter(a => a.tipo === 'llamada');
            const llamadasExitosasHoy = llamadasHoy.filter(a => a.resultado === 'exitoso');
            const mensajesHoy = actsHoy.filter(a => ['mensaje', 'correo', 'whatsapp'].includes(a.tipo));

            const row8 = await db.prepare('SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? AND etapaEmbudo = ? AND fechaUltimaEtapa >= ?').get(prospectorId, 'reunion_agendada', hoyStr);
            const citasHoy = row8.c;

            const row9 = await db.prepare('SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? AND fechaRegistro >= ?').get(prospectorId, hoyStr);
            const clientesNuevosHoy = row9.c;

            const rendimientoHoy = calcularEstado(llamadasHoy.length, citasHoy, 'diario');

            const detalleHoy = {
                llamadas: llamadasHoy.length,
                llamadasExitosas: llamadasExitosasHoy.length,
                mensajes: mensajesHoy.length,
                citasAgendadas: citasHoy,
                prospectosRegistrados: clientesNuevosHoy,
                estado: rendimientoHoy.estado,
                color: rendimientoHoy.color
            };

            // NEW DETAILED METRICS for Semana
            const actsSemana = await db.prepare('SELECT * FROM actividades WHERE vendedor = ? AND fecha >= ? AND fecha <= ?').all(prospectorId, semanaStr, ahoraStr);
            const llamadasSemana = actsSemana.filter(a => a.tipo === 'llamada');
            const llamadasExitosasSemana = llamadasSemana.filter(a => a.resultado === 'exitoso');
            const mensajesSemana = actsSemana.filter(a => ['mensaje', 'correo', 'whatsapp'].includes(a.tipo));

            const row10 = await db.prepare('SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? AND etapaEmbudo = ? AND fechaUltimaEtapa >= ?').get(prospectorId, 'reunion_agendada', semanaStr);
            const citasSemana = row10.c;

            const row11 = await db.prepare('SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? AND fechaRegistro >= ?').get(prospectorId, semanaStr);
            const clientesNuevosSemana = row11.c;

            const rendimientoSemana = calcularEstado(llamadasSemana.length, citasSemana, 'semanal');


            const detalleSemana = {
                llamadas: llamadasSemana.length,
                llamadasExitosas: llamadasExitosasSemana.length,
                mensajes: mensajesSemana.length,
                citasAgendadas: citasSemana,
                prospectosRegistrados: clientesNuevosSemana,
                estado: rendimientoSemana.estado,
                color: rendimientoSemana.color
            };

            return {
                prospector: { id: String(prospector.id), nombre: prospector.nombre, correo: prospector.correo || '' },
                metricas: {
                    llamadas: { total: llamadas.length, exitosas: llamadasExitosas.length },
                    mensajes: { total: mensajes.length },
                    citas: { agendadas: citasAgendadas, transferidas: transferencias },
                    prospectos: { total: clientesTotales, nuevos: clientesNuevos, revisados: llamadas.length },
                    tasas: { contacto: parseFloat(tasaContacto), agendamiento: parseFloat(tasaAgendamiento) }
                },
                distribucion,
                rendimiento: {
                    estado: rendimiento.estado,
                    color: rendimiento.color,
                    descripcion: getDescripcionEstado(rendimiento.estado)
                },
                periodo,
                detalleHoy,
                detalleSemana
            };
        }));

        const ordenEstado = { 'excelente': 0, 'bueno': 1, 'bajo': 2, 'critico': 3, 'sin_datos': 4 };
        prospectorsConMetricas.sort((a, b) => ordenEstado[a.rendimiento.estado] - ordenEstado[b.rendimiento.estado]);

        res.json({
            periodo,
            fechaInicio: fechaInicioStr,
            fechaFin: ahoraStr,
            totalProspectors: prospectorsConMetricas.length,
            prospectors: prospectorsConMetricas
        });
    } catch (error) {
        console.error('Error en monitoreo:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

module.exports = router;

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { db } = require('./config/database');
const googleSheets = require('./lib/googleSheetsService');

async function setup() {
    console.log('🛠️ Calculando métricas reales para el Dashboard...');

    try {
        const usuarios = await db.prepare('SELECT id, nombre, rol FROM usuarios WHERE activo = 1').all();
        const dashboardData = [];

        for (const u of usuarios) {
            const hoy = new Date().toISOString().split('T')[0];
            
            // --- MÉTRICAS DE PROSPECTOS ---
            const stock = await db.prepare("SELECT COUNT(*) as count FROM clientes WHERE (prospectorAsignado = ? OR vendedorAsignado = ?) AND estado = 'proceso'").get(u.id, u.id);
            const totalPros = await db.prepare("SELECT COUNT(*) as count FROM clientes WHERE (prospectorAsignado = ? OR vendedorAsignado = ?)").get(u.id, u.id);
            const nuevosHoy = await db.prepare("SELECT COUNT(*) as count FROM clientes WHERE (prospectorAsignado = ? OR vendedorAsignado = ?) AND (fechaRegistro LIKE ? OR fechaUltimaEtapa LIKE ?)").get(u.id, u.id, `%${hoy}%`, `%${hoy}%`);
            
            // --- MÉTRICAS DE ACTIVIDAD (HOY) ---
            const llamadasHoy = await db.prepare("SELECT COUNT(*) as count FROM actividades WHERE vendedor = ? AND tipo = 'llamada' AND fecha LIKE ?").get(u.id, `%${hoy}%`);
            const msgsHoy = await db.prepare("SELECT COUNT(*) as count FROM actividades WHERE vendedor = ? AND tipo IN ('whatsapp', 'mensaje', 'correo') AND fecha LIKE ?").get(u.id, `%${hoy}%`);
            const citasHoy = await db.prepare("SELECT COUNT(*) as count FROM actividades WHERE vendedor = ? AND tipo = 'cita' AND fecha LIKE ?").get(u.id, `%${hoy}%`);
            
            // --- MÉTRICAS HISTÓRICAS ---
            const totalActividad = await db.prepare("SELECT COUNT(*) as count FROM actividades WHERE vendedor = ?").get(u.id);
            const citasTotales = await db.prepare("SELECT COUNT(*) as count FROM actividades WHERE vendedor = ? AND tipo = 'cita'").get(u.id);
            const ventasGanadas = await db.prepare("SELECT COUNT(*) as count FROM clientes WHERE (prospectorAsignado = ? OR vendedorAsignado = ?) AND estado = 'ganado'").get(u.id, u.id);
            const ventasPerdidas = await db.prepare("SELECT COUNT(*) as count FROM clientes WHERE (prospectorAsignado = ? OR vendedorAsignado = ?) AND estado = 'perdido'").get(u.id, u.id);
            
            // --- MÉTRICAS DE DINERO ---
            const dinero = await db.prepare("SELECT SUM(monto) as total FROM ventas WHERE vendedor = ? AND estado = 'completada'").get(u.id);
            const montoTotal = dinero.total || 0;
            const ticketPromedio = ventasGanadas.count > 0 ? (montoTotal / ventasGanadas.count) : 0;

            // --- TASAS DE CONVERSIÓN ---
            const pctCita = totalPros.count > 0 ? ((citasTotales.count / totalPros.count) * 100).toFixed(1) : 0;
            const pctCierre = totalPros.count > 0 ? ((ventasGanadas.count / totalPros.count) * 100).toFixed(1) : 0;

            dashboardData.push({
                nombre: u.nombre,
                stock: stock.count,
                totalPros: totalPros.count,
                nuevosHoy: nuevosHoy.count,
                llamadasHoy: llamadasHoy.count,
                msgsHoy: msgsHoy.count,
                actividadHoy: llamadasHoy.count + msgsHoy.count + citasHoy.count,
                actividadTotal: totalActividad.count,
                citasHoy: citasHoy.count,
                citasTotales: citasTotales.count,
                ventasGanadas: ventasGanadas.count,
                ventasPerdidas: ventasPerdidas.count,
                montoTotal: montoTotal,
                ticketPromedio: ticketPromedio,
                pctCita: pctCita,
                pctCierre: pctCierre
            });
        }

        // Ordenar por Monto Total de mayor a menor
        dashboardData.sort((a, b) => b.montoTotal - a.montoTotal);

        await googleSheets.setupRealtimeDashboard(dashboardData);
        console.log('✅ Dashboard configurado con datos reales.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

setup();

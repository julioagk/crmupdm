const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { db } = require('./config/database');
const googleSheets = require('./lib/googleSheetsService');

async function updateKPIs() {
    console.log('📈 Calculando KPIs por usuario...');

    try {
        const usuarios = await db.prepare('SELECT id, nombre, rol FROM usuarios WHERE activo = 1').all();
        const kpiData = [];

        for (const u of usuarios) {
            // Prospectos creados
            const pros = await db.prepare('SELECT COUNT(*) as count FROM clientes WHERE prospectorAsignado = ? OR vendedorAsignado = ?').get(u.id, u.id);
            
            // Llamadas
            const calls = await db.prepare("SELECT COUNT(*) as count FROM actividades WHERE vendedor = ? AND tipo = 'llamada'").get(u.id);
            
            // Mensajes (WhatsApp/Correo)
            const msgs = await db.prepare("SELECT COUNT(*) as count FROM actividades WHERE vendedor = ? AND tipo IN ('whatsapp', 'correo', 'mensaje')").get(u.id);
            
            // Citas agendadas
            const citas = await db.prepare("SELECT COUNT(*) as count FROM actividades WHERE vendedor = ? AND tipo = 'cita'").get(u.id);
            
            // Ventas
            const ventas = await db.prepare('SELECT COUNT(*) as count, SUM(monto) as monto FROM ventas WHERE vendedor = ?').get(u.id);

            const tasaConv = pros.count > 0 ? ((citas.count / pros.count) * 100).toFixed(1) : 0;

            kpiData.push({
                nombre: u.nombre,
                rol: u.rol,
                prospectos: pros.count,
                llamadas: calls.count,
                mensajes: msgs.count,
                citas: citas.count,
                ventas: ventas.count,
                montoVentas: ventas.monto || 0,
                tasaConversion: tasaConv
            });
        }

        await googleSheets.updateKPIsSheet(kpiData);
        console.log('✅ KPIs actualizados en Google Sheets');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error actualizando KPIs:', error);
        process.exit(1);
    }
}

updateKPIs();

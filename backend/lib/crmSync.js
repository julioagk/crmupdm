const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { db } = require('../config/database');
const googleSheets = require('./googleSheetsService');

const TARGET_NAMES = ['camila', 'brenda'];
const CONTACT_TYPES = new Set(['llamada', 'mensaje', 'correo', 'whatsapp']);

const todayPrefix = new Date().toISOString().slice(0, 10);
const monthPrefix = new Date().toISOString().slice(0, 7);

const startsWithPrefix = (value, prefix) => typeof value === 'string' && value.startsWith(prefix);

const normalize = (value) => String(value || '').trim().toLowerCase();

const fullName = (row) => [row.nombres, row.apellidoPaterno, row.apellidoMaterno].filter(Boolean).join(' ').trim();

// Helper para obtener el Lunes de la semana de una fecha
function getWeekString(dateString) {
    if (!dateString) return null;
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return null;
    // Set to Monday of this week
    const day = d.getDay() || 7; 
    d.setHours(-24 * (day - 1));
    return d.toISOString().slice(0, 10);
}

async function loadTargetUsers() {
    const usuarios = await db.prepare('SELECT id, nombre, usuario, rol FROM usuarios WHERE activo = 1').all();
    return usuarios.filter(user => {
        const haystack = normalize(`${user.nombre} ${user.usuario}`);
        return TARGET_NAMES.some(target => haystack.includes(target));
    });
}

function assignRoleForUser(cliente, userId) {
    if (cliente.prospectorAsignado === userId) return 'prospector';
    if (cliente.vendedorAsignado === userId) return 'vendedor';
    if (cliente.closerAsignado === userId) return 'closer';
    return 'asignado';
}

async function buildCRMData() {
    const targetUsers = await loadTargetUsers();

    if (targetUsers.length === 0) {
        return { generatedAt: new Date().toLocaleString('es-MX'), usuarios: [], prospectos: [], historicoSemanal: [] };
    }

    const usuarios = [];
    const prospectos = [];
    const historicoSemanal = [];

    for (const user of targetUsers) {
        const clientes = await db.prepare(`
            SELECT id, nombres, apellidoPaterno, apellidoMaterno, empresa, telefono, correo, estado, etapaEmbudo,
                   fechaRegistro, fechaUltimaEtapa, notas, prospectorAsignado, vendedorAsignado, closerAsignado
            FROM clientes
            WHERE estado = 'proceso'
              AND (prospectorAsignado = ? OR vendedorAsignado = ? OR closerAsignado = ?)
            ORDER BY fechaUltimaEtapa DESC, fechaRegistro DESC, id DESC
        `).all(user.id, user.id, user.id);

        const actividades = await db.prepare(`
            SELECT tipo, fecha
            FROM actividades
            WHERE vendedor = ?
            ORDER BY fecha DESC, id DESC
        `).all(user.id);

        const todosLosClientes = await db.prepare(`
            SELECT fechaRegistro
            FROM clientes
            WHERE (prospectorAsignado = ? OR vendedorAsignado = ? OR closerAsignado = ?)
        `).all(user.id, user.id, user.id);

        const stockActual = clientes.length;
        const prospectosHoy = clientes.filter(c => startsWithPrefix(c.fechaRegistro, todayPrefix)).length;
        const prospectosMes = clientes.filter(c => startsWithPrefix(c.fechaRegistro, monthPrefix)).length;
        const contactosHoy = actividades.filter(a => CONTACT_TYPES.has(String(a.tipo).toLowerCase()) && startsWithPrefix(a.fecha, todayPrefix)).length;
        const contactosMes = actividades.filter(a => CONTACT_TYPES.has(String(a.tipo).toLowerCase()) && startsWithPrefix(a.fecha, monthPrefix)).length;
        const reunionesHoy = actividades.filter(a => String(a.tipo).toLowerCase() === 'cita' && startsWithPrefix(a.fecha, todayPrefix)).length;
        const reunionesMes = activitiesFilterSafe(actividades, monthPrefix);

        usuarios.push({
            nombre: user.nombre,
            stockActual,
            prospectosHoy,
            prospectosMes,
            contactosHoy,
            contactosMes,
            reunionesHoy,
            reunionesMes,
        });

        // ==========================
        // CALCULO DE HISTORICO SEMANAL
        // ==========================
        const weeklyStats = {}; // key: 'YYYY-MM-DD' (Lunes), value: { prospectos:0, contactos:0, reuniones:0 }
        
        for (const c of todosLosClientes) {
            const w = getWeekString(c.fechaRegistro);
            if (!w) continue;
            if (!weeklyStats[w]) weeklyStats[w] = { prospectos: 0, contactos: 0, reuniones: 0 };
            weeklyStats[w].prospectos++;
        }

        for (const a of actividades) {
            const w = getWeekString(a.fecha);
            if (!w) continue;
            if (!weeklyStats[w]) weeklyStats[w] = { prospectos: 0, contactos: 0, reuniones: 0 };
            
            const tipo = String(a.tipo).toLowerCase();
            if (CONTACT_TYPES.has(tipo)) {
                weeklyStats[w].contactos++;
            } else if (tipo === 'cita') {
                weeklyStats[w].reuniones++;
            }
        }

        // Convertir objeto a array
        for (const [semanaStr, stats] of Object.entries(weeklyStats)) {
            historicoSemanal.push({
                usuario: user.nombre,
                semanaStr: semanaStr, // Usado para ordenar
                semana: `Lunes ${semanaStr}`,
                prospectos: stats.prospectos,
                contactos: stats.contactos,
                reuniones: stats.reuniones
            });
        }

        for (const cliente of clientes) {
            prospectos.push({
                usuario: user.nombre,
                asignadoComo: assignRoleForUser(cliente, user.id),
                nombre: fullName(cliente),
                empresa: cliente.empresa || '',
                telefono: cliente.telefono || '',
                correo: cliente.correo || '',
                etapa: cliente.etapaEmbudo || 'prospecto_nuevo',
                estado: cliente.estado || 'proceso',
                fechaRegistro: cliente.fechaRegistro || '',
                ultimaEtapa: cliente.fechaUltimaEtapa || '',
                notas: cliente.notas || '',
            });
        }
    }

    // Ordenar historicoSemanal por semana (descendente) y luego usuario
    historicoSemanal.sort((a, b) => {
        if (a.semanaStr > b.semanaStr) return -1;
        if (a.semanaStr < b.semanaStr) return 1;
        return a.usuario.localeCompare(b.usuario);
    });

    return {
        generatedAt: new Date().toLocaleString('es-MX'),
        usuarios,
        prospectos,
        historicoSemanal
    };
}

function activitiesFilterSafe(actividades, monthPrefix) {
    try {
        return actividades.filter(a => String(a.tipo).toLowerCase() === 'cita' && typeof a.fecha === 'string' && a.fecha.startsWith(monthPrefix)).length;
    } catch (e) {
        return 0;
    }
}

async function updateCRMFromDB() {
    try {
        const crmData = await buildCRMData();
        await googleSheets.updateCRMDataSheet(crmData);
        return crmData;
    } catch (error) {
        console.error('❌ crmSync error:', error.message || error);
        throw error;
    }
}

module.exports = { updateCRMFromDB };

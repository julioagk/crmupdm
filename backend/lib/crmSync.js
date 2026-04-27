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
        return { generatedAt: new Date().toLocaleString('es-MX'), usuarios: [], prospectos: [] };
    }

    const usuarios = [];
    const prospectos = [];

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

    return {
        generatedAt: new Date().toLocaleString('es-MX'),
        usuarios,
        prospectos,
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

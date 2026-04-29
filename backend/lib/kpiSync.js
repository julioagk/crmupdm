/**
 * kpiSync.js
 * Servicio que calcula KPIs reales de prospeccion (Camila & Brenda)
 * y los escribe en la hoja "KPI_PROSPECCION" del Google Sheets del CRM.
 *
 * Estructura de la hoja KPI_PROSPECCION:
 *
 *  Fila 1  → KPI'S DE PROSPECCION
 *  Fila 5  → SEMANA <N>  | PROSPECTOS | PROSPECTOS AGREGADOS | CONTACTOS | REUNIONES AGENDADAS
 *  Fila 6  →             | Meta | Real | Meta | Real | Meta | Real | Meta | Real
 *  Fila 8  → CAMILA      | (datos semana)
 *  Fila 9  → BRENDA      | (datos semana)
 *  Fila 15 → <MES>       | (misma estructura)
 *  Fila 16 →             | Meta | Real | Meta | Real | Meta | Real | Meta | Real
 *  Fila 18 → CAMILA      | (datos mes)
 *  Fila 19 → BRENDA      | (datos mes)
 *  Fila 21 → Timestamp de última actualización
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { db } = require('../config/database');
const googleSheets = require('./googleSheetsService');

// Nombres objetivo (se buscan en nombre o usuario del usuario)
const TARGET_NAMES = ['camila', 'brenda'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normalize = (v) => String(v || '').trim().toLowerCase();

/** Obtiene el número de semana ISO del año */
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/** Devuelve el inicio de semana (lunes) como ISO string YYYY-MM-DD */
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0=dom
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // ajustar a lunes
    d.setDate(diff);
    return d.toISOString().slice(0, 10);
}

/** Devuelve el inicio de mes como ISO string YYYY-MM-DD */
function getMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

/** Nombre del mes en español */
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
               'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

// ─── Carga de usuarios objetivo ───────────────────────────────────────────────

async function loadTargetUsers() {
    const usuarios = await db.prepare(
        'SELECT id, nombre, usuario, rol FROM usuarios WHERE activo = 1'
    ).all();
    return usuarios.filter(u =>
        TARGET_NAMES.some(t => normalize(`${u.nombre} ${u.usuario}`).includes(t))
    );
}

// ─── Cálculo de métricas por usuario y período ───────────────────────────────

/**
 * Calcula las 4 métricas KPI de prospeccion para un usuario en un período dado.
 * @param {number} userId
 * @param {string} desde  - YYYY-MM-DD (inicio del período)
 * @param {string} hasta  - YYYY-MM-DD (fin del período, inclusive)
 * @returns {{ prospectos, prospectosAgregados, contactos, reunionesAgendadas }}
 */
async function calcularKPIs(userId, desde, hasta) {
    const desdeISO = `${desde}T00:00:00.000Z`;
    const hastaISO = `${hasta}T23:59:59.999Z`;

    // 1. PROSPECTOS (stock activo asignado al usuario que existe en el período)
    //    = clientes activos donde el usuario es prospector/vendedor
    const rowProspectos = await db.prepare(`
        SELECT COUNT(DISTINCT id) AS c
        FROM clientes
        WHERE (prospectorAsignado = ? OR vendedorAsignado = ?)
          AND etapaEmbudo NOT IN ('perdido', 'venta_ganada')
    `).get(userId, userId);
    const prospectos = rowProspectos?.c || 0;

    // 2. PROSPECTOS AGREGADOS en el período (nuevos registrados)
    const rowAgregados = await db.prepare(`
        SELECT COUNT(*) AS c
        FROM clientes
        WHERE (prospectorAsignado = ? OR vendedorAsignado = ?)
          AND (
            fechaRegistro >= ? AND fechaRegistro <= ?
            OR (fechaRegistro IS NULL AND fechaUltimaEtapa >= ? AND fechaUltimaEtapa <= ?)
          )
    `).get(userId, userId, desdeISO, hastaISO, desdeISO, hastaISO);
    const prospectosAgregados = rowAgregados?.c || 0;

    // 3. CONTACTOS = actividades de tipo llamada/whatsapp/correo/mensaje en el período
    const rowContactos = await db.prepare(`
        SELECT COUNT(*) AS c
        FROM actividades
        WHERE vendedor = ?
          AND tipo IN ('llamada', 'whatsapp', 'correo', 'mensaje')
          AND fecha >= ?
          AND fecha <= ?
    `).get(userId, desdeISO, hastaISO);
    const contactos = rowContactos?.c || 0;

    // 4. REUNIONES AGENDADAS = actividades tipo 'cita' en el período
    const rowReuniones = await db.prepare(`
        SELECT COUNT(*) AS c
        FROM actividades
        WHERE vendedor = ?
          AND tipo = 'cita'
          AND fecha >= ?
          AND fecha <= ?
    `).get(userId, desdeISO, hastaISO);
    const reunionesAgendadas = rowReuniones?.c || 0;

    return { prospectos, prospectosAgregados, contactos, reunionesAgendadas };
}

// ─── Escritura en Google Sheets ───────────────────────────────────────────────

/**
 * Actualiza la hoja "KPIs" con datos reales de Camila y Brenda.
 * Escribe valores en las celdas "Real" manteniendo las "Meta" intactas
 * (no sobreescribe columnas de Meta, solo actualiza las columnas Real).
 */
async function updateKPIsSheet() {
    if (!googleSheets.auth) {
        console.warn('⚠️ kpiSync: Sin autenticación Google Sheets');
        return;
    }

    const now = new Date();
    const weekNum = getWeekNumber(now);
    const weekStart = getWeekStart(now);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + (6 - (weekEnd.getDay() || 7) + 1));
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    const monthStart = getMonthStart(now);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const nombreMes = MESES[now.getMonth()];

    const targetUsers = await loadTargetUsers();

    if (targetUsers.length === 0) {
        console.warn('⚠️ kpiSync: No se encontraron usuarios objetivo (Camila/Brenda)');
        return;
    }

    // Calcular KPIs para semana actual y mes actual por usuario
    const dataSemana = {};
    const dataMes = {};

    for (const user of targetUsers) {
        dataSemana[normalize(user.nombre)] = await calcularKPIs(user.id, weekStart, weekEndStr);
        dataMes[normalize(user.nombre)] = await calcularKPIs(user.id, monthStart, monthEnd);
    }

    // Localizar usuarios objetivo y calcular sus KPIs
    const camila = targetUsers.find(u => normalize(u.nombre).includes('camila'));
    const brenda  = targetUsers.find(u => normalize(u.nombre).includes('brenda'));

    const EMPTY_KPI = { prospectos: 0, prospectosAgregados: 0, contactos: 0, reunionesAgendadas: 0 };

    const kpilaCamilaSemana = camila ? dataSemana[normalize(camila.nombre)] : EMPTY_KPI;
    const kpisBrendaSemana  = brenda  ? dataSemana[normalize(brenda.nombre)]  : EMPTY_KPI;
    const kpisCamilaMes     = camila ? dataMes[normalize(camila.nombre)]     : EMPTY_KPI;
    const kpisBrendaMes     = brenda  ? dataMes[normalize(brenda.nombre)]     : EMPTY_KPI;

    const CAMILA_LABEL = camila?.nombre?.toUpperCase() || 'CAMILA';
    const BRENDA_LABEL = brenda?.nombre?.toUpperCase()  || 'BRENDA';

    const { google } = require('googleapis');
    const sheets = google.sheets({ version: 'v4', auth: googleSheets.auth });
    const spreadsheetId = googleSheets.spreadsheetId;
    const SHEET_NAME = 'KPI_PROSPECCION';

    // ── Asegurar que la hoja existe ──────────────────────────────────────────
    try {
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetExists = spreadsheet.data.sheets.some(s => s.properties.title === SHEET_NAME);
        
        if (!sheetExists) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [{ addSheet: { properties: { title: SHEET_NAME } } }]
                }
            });
            console.log(`✅ kpiSync: Hoja "${SHEET_NAME}" creada`);
        }
    } catch (e) {
        console.warn(`⚠️ kpiSync: Error al verificar/crear hoja "${SHEET_NAME}":`, e.message);
    }

    // ── Leer valores actuales para preservar las Metas ────────────────────────
    let currentValues = [];
    try {
        const resp = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${SHEET_NAME}!A1:K30`,
        });
        currentValues = resp.data.values || [];
    } catch (e) {
        console.warn(`⚠️ kpiSync: No se pudo leer "${SHEET_NAME}":`, e.message);
    }

    /**
     * Extrae el valor de Meta de una celda ya existente o usa 0 como default.
     * Columna layout (0-indexed desde A=0):
     *   B=1 ProsMeta, D=3 AgrMeta, F=5 ContMeta, H=7 ReunMeta
     */
    const getMeta = (rowIndex, colIndex) => {
        try {
            const val = currentValues[rowIndex]?.[colIndex];
            return (val !== undefined && val !== null && val !== '') ? val : '';
        } catch { return ''; }
    };

    // ── Construir la tabla completa ──────────────────────────────────────────

    const buildDataRow = (label, kpis, rowIdx) => [
        label,
        getMeta(rowIdx, 1), kpis.prospectos,
        getMeta(rowIdx, 3), kpis.prospectosAgregados,
        getMeta(rowIdx, 5), kpis.contactos,
        getMeta(rowIdx, 7), kpis.reunionesAgendadas
    ];

    const newValues = [
        ["KPI'S DE PROSPECCION"], [], [], [],
        [`SEMANA ${weekNum}`, 'PROSPECTOS', '', 'PROSPECTOS AGREGADOS', '', 'CONTACTOS', '', 'REUNIONES AGENDADAS', ''],
        ['', 'Meta', 'Real', 'Meta', 'Real', 'Meta', 'Real', 'Meta', 'Real'],
        [],
        buildDataRow(CAMILA_LABEL, kpilaCamilaSemana, 7),
        buildDataRow(BRENDA_LABEL, kpisBrendaSemana, 8),
        [], [], [], [], [],
        [nombreMes, 'PROSPECTOS', '', 'PROSPECTOS AGREGADOS', '', 'CONTACTOS', '', 'REUNIONES AGENDADAS', ''],
        ['', 'Meta', 'Real', 'Meta', 'Real', 'Meta', 'Real', 'Meta', 'Real'],
        [],
        buildDataRow(CAMILA_LABEL, kpisCamilaMes, 17),
        buildDataRow(BRENDA_LABEL, kpisBrendaMes, 18),
        [],
        [`Actualizado: ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`],
    ];

    try {
        // 1. Actualizar los valores
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${SHEET_NAME}!A1`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: newValues },
        });

        // 2. Aplicar Formato "Premium" (batchUpdate)
        const sheetId = spreadsheet.data.sheets.find(s => s.properties.title === SHEET_NAME).properties.sheetId;
        
        const requests = [
            // Centrar todo el contenido
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: 25, startColumnIndex: 0, endColumnIndex: 10 },
                    cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', textFormat: { fontFamily: 'Roboto' } } },
                    fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)'
                }
            },
            // Formato para el Título Principal (Fila 1)
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 9 },
                    cell: { userEnteredFormat: { backgroundColor: { red: 0.17, green: 0.24, blue: 0.31 }, textFormat: { color: { red: 1, green: 1, blue: 1 }, fontSize: 14, bold: true } } },
                    fields: 'userEnteredFormat(backgroundColor,textFormat)'
                }
            },
            // Combinar celdas de categorías (Semana y Mes)
            ...[4, 14].flatMap(row => [
                { mergeCells: { range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 1, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } },
                { mergeCells: { range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 3, endColumnIndex: 5 }, mergeType: 'MERGE_ALL' } },
                { mergeCells: { range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 5, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } },
                { mergeCells: { range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 7, endColumnIndex: 9 }, mergeType: 'MERGE_ALL' } }
            ]),
            // Color para encabezados de categorías
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: 4, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 9 },
                    cell: { userEnteredFormat: { backgroundColor: { red: 0.18, green: 0.8, blue: 0.44 }, textFormat: { color: { red: 1, green: 1, blue: 1 }, bold: true } } },
                    fields: 'userEnteredFormat(backgroundColor,textFormat)'
                }
            },
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: 14, endRowIndex: 16, startColumnIndex: 0, endColumnIndex: 9 },
                    cell: { userEnteredFormat: { backgroundColor: { red: 0.18, green: 0.8, blue: 0.44 }, textFormat: { color: { red: 1, green: 1, blue: 1 }, bold: true } } },
                    fields: 'userEnteredFormat(backgroundColor,textFormat)'
                }
            },
            // Resaltar nombres de usuarios (Fila 8, 9, 18, 19)
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: 7, endRowIndex: 9, startColumnIndex: 0, endColumnIndex: 1 },
                    cell: { userEnteredFormat: { backgroundColor: { red: 0.9, green: 0.1, blue: 0.1 }, textFormat: { color: { red: 1, green: 1, blue: 1 }, bold: true } } },
                    fields: 'userEnteredFormat(backgroundColor,textFormat)'
                }
            },
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: 17, endRowIndex: 19, startColumnIndex: 0, endColumnIndex: 1 },
                    cell: { userEnteredFormat: { backgroundColor: { red: 0.9, green: 0.1, blue: 0.1 }, textFormat: { color: { red: 1, green: 1, blue: 1 }, bold: true } } },
                    fields: 'userEnteredFormat(backgroundColor,textFormat)'
                }
            }
        ];

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: { requests }
        });

        console.log(`🚀 kpiSync: Hoja "${SHEET_NAME}" actualizada y formateada exitosamente`);
    } catch (error) {
        console.error(`❌ kpiSync: Error al actualizar/formatear "${SHEET_NAME}":`, error.message);
        throw error;
    }
}

module.exports = { updateKPIsSheet };


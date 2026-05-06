const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

/**
 * Servicio para interactuar con Google Sheets usando una cuenta de servicio.
 */
class GoogleSheetsService {
    constructor() {
        this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
        this.auth = null;

        // 1. Intentar con la variable de entorno (Railway / producción)
        if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
            try {
                const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
                this.auth = new google.auth.GoogleAuth({
                    credentials,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });
                console.log('✅ GoogleSheetsService: Autenticado con variable de entorno GOOGLE_SERVICE_ACCOUNT_JSON');
            } catch (e) {
                console.error('❌ GoogleSheetsService: Error al parsear GOOGLE_SERVICE_ACCOUNT_JSON:', e.message);
            }
        }

        // 2. Fallback: archivo local (desarrollo)
        if (!this.auth) {
            const keyFilePath = path.join(__dirname, '../../crm-updm-37bbc16dc608.json');
            if (fs.existsSync(keyFilePath)) {
                this.auth = new google.auth.GoogleAuth({
                    keyFile: keyFilePath,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });
                console.log('✅ GoogleSheetsService: Autenticado con archivo de credenciales local');
            } else {
                console.error('❌ GoogleSheetsService: Sin credenciales. Define GOOGLE_SERVICE_ACCOUNT_JSON en Railway o coloca el archivo JSON localmente.');
            }
        }
    }

    /**
     * Añade una fila a una hoja específica.
     * @param {string} range - El nombre de la hoja o rango (ej: 'Actividades!A1')
     * @param {Array} values - Array de valores para la fila
     */
    async appendRow(range, values) {
        if (!this.auth) {
            console.warn('⚠️ GoogleSheetsService: No hay autenticación configurada. Ignorando append.');
            return;
        }
        if (!this.spreadsheetId) {
            console.warn('⚠️ GoogleSheetsService: No se ha definido GOOGLE_SHEET_ID en el .env');
            return;
        }

        try {
            const sheets = google.sheets({ version: 'v4', auth: this.auth });
            await sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [values],
                },
            });
            console.log(`✅ GoogleSheetsService: Fila añadida a ${range}`);
        } catch (error) {
            console.error('❌ GoogleSheetsService Error:', error.message);
        }
    }

    /**
     * Registra una actividad en la hoja.
     */
    async logActividad(data) {
        const { fecha, tipo, vendedor, prospecto, descripcion, resultado, notas } = data;
        await this.appendRow('Actividades!A1', [
            fecha || new Date().toLocaleString('es-MX'),
            tipo,
            vendedor,
            prospecto,
            descripcion,
            resultado,
            notas
        ]);
    }

    /**
     * Registra un nuevo prospecto.
     */
    async logNuevoProspecto(data) {
        const { fecha, nombre, empresa, telefono, correo, notas, vendedor } = data;
        await this.appendRow('Prospectos!A1', [
            fecha || new Date().toLocaleString('es-MX'),
            nombre,
            empresa,
            telefono,
            correo,
            notas,
            vendedor
        ]);
    }

    /**
     * Configura los encabezados de las hojas si están vacías.
     */
    async setupHeaders() {
        if (!this.auth) return;
        const headers = {
            'Prospectos!A1': [['Fecha Registro', 'Nombre', 'Empresa', 'Teléfono', 'Correo', 'Notas', 'Vendedor Asignado']],
            'Actividades!A1': [['Fecha', 'Tipo', 'Vendedor', 'Prospecto', 'Descripción', 'Resultado', 'Notas']],
            'Ventas!A1': [['Fecha', 'Cliente', 'Vendedor', 'Monto', 'Estado', 'Notas']]
        };

        try {
            const sheets = google.sheets({ version: 'v4', auth: this.auth });
            for (const [range, values] of Object.entries(headers)) {
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: this.spreadsheetId,
                    range: range,
                });
                if (!response.data.values || response.data.values.length === 0) {
                    await sheets.spreadsheets.values.update({
                        spreadsheetId: this.spreadsheetId,
                        range: range,
                        valueInputOption: 'USER_ENTERED',
                        resource: { values },
                    });
                    console.log(`📊 Encabezados creados en ${range}`);
                }
            }
        } catch (error) {
            console.error('❌ Error al configurar encabezados:', error.message);
        }
    }

    /**
     * Registra una venta.
     */
    async logVenta(data) {
        const { fecha, cliente, vendedor, monto, estado, notas } = data;
        await this.appendRow('Ventas!A1', [
            fecha || new Date().toLocaleString('es-MX'),
            cliente,
            vendedor,
            `$${Number(monto).toLocaleString('es-MX')}`,
            estado,
            notas
        ]);
    }

    /**
     * Actualiza la hoja de KPIs con métricas por usuario.
     */
    async updateKPIsSheet(kpiData) {
        if (!this.auth) return;
        const range = 'KPIs!A1';
        const headers = [['Usuario', 'Rol', 'Prospectos', 'Llamadas', 'Mensajes', 'Citas', 'Ventas', 'Monto Ventas', '% Conv (Cita/Pros)']];
        const values = kpiData.map(d => [
            d.nombre,
            d.rol,
            d.prospectos,
            d.llamadas,
            d.mensajes,
            d.citas,
            d.ventas,
            `$${Number(d.montoVentas).toLocaleString('es-MX')}`,
            `${d.tasaConversion}%`
        ]);

        try {
            const sheets = google.sheets({ version: 'v4', auth: this.auth });
            await sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [...headers, ...values],
                },
            });
            console.log('📈 Hoja de KPIs actualizada');
        } catch (error) {
            if (error.message.includes('not found') || error.message.includes('Unable to parse range')) {
                try {
                    const sheets = google.sheets({ version: 'v4', auth: this.auth });
                    await sheets.spreadsheets.batchUpdate({
                        spreadsheetId: this.spreadsheetId,
                        resource: {
                            requests: [{ addSheet: { properties: { title: 'KPIs' } } }]
                        }
                    });
                    console.log('✅ Hoja "KPIs" creada exitosamente');
                    await this.updateKPIsSheet(kpiData);
                } catch (e) {
                    if (!e.message.includes('already exists')) {
                        console.error('❌ Error creando hoja KPIs:', e.message);
                    }
                }
            }
        }
    }

    /**
     * Configura un Dashboard con datos reales.
     */
    async setupRealtimeDashboard(dashboardData) {
        if (!this.auth) return;
        const range = 'Dashboard!A1';
        const headers = [[
            'Usuario', 'Stock Activo', 'Pros. Totales', 'Pros. Hoy',
            'Llamadas Hoy', 'Msgs Hoy', 'Actividad Hoy', 'Actividad Total',
            'Citas Hoy', 'Citas Totales', 'Ventas Ganadas', 'Ventas Perdidas',
            'Monto Ganado', 'Ticket Promedio', '% Eficiencia (Cita)', '% Cierre (Venta)'
        ]];

        const rows = dashboardData.map(d => [
            d.nombre, d.stock, d.totalPros, d.nuevosHoy, d.llamadasHoy, d.msgsHoy,
            d.actividadHoy, d.actividadTotal, d.citasHoy, d.citasTotales,
            d.ventasGanadas, d.ventasPerdidas,
            `$${Number(d.montoTotal).toLocaleString('es-MX')}`,
            `$${Number(d.ticketPromedio).toLocaleString('es-MX')}`,
            `${d.pctCita}%`, `${d.pctCierre}%`
        ]);

        try {
            const sheets = google.sheets({ version: 'v4', auth: this.auth });
            try {
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: { requests: [{ addSheet: { properties: { title: 'Dashboard' } } }] }
                });
            } catch (e) { /* Ignorar si ya existe */ }

            await sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [...headers, ...rows] },
            });
            console.log('🚀 Dashboard actualizado con Stock Real');
        } catch (error) {
            console.error('❌ Error al configurar Dashboard:', error.message);
        }
    }

    /**
     * Escribe la hoja CRM con datos de Camila y Brenda, y actualiza HISTORICO_SEMANAL.
     */
    async updateCRMDataSheet(crmData) {
        if (!this.auth) return;
        if (!this.spreadsheetId) {
            console.warn('⚠️ GoogleSheetsService: No se ha definido GOOGLE_SHEET_ID en el .env');
            return;
        }

        const range = 'crm!A1';
        const headers = [
            ['Reporte CRM'],
            ['Actualizado', crmData.generatedAt || new Date().toLocaleString('es-MX')],
            [],
            ['Resumen por usuario'],
            ['Usuario', 'Stock Actual', 'Prospectos Hoy', 'Prospectos Mes', 'Contactos Hoy', 'Contactos Mes', 'Reuniones Hoy', 'Reuniones Mes'],
        ];

        const userRows = (crmData.usuarios || []).map(u => [
            u.nombre, u.stockActual, u.prospectosHoy, u.prospectosMes,
            u.contactosHoy, u.contactosMes, u.reunionesHoy, u.reunionesMes,
        ]);

        const prospectRows = (crmData.prospectos || []).map(p => [
            p.usuario, p.asignadoComo, p.nombre, p.empresa, p.telefono,
            p.correo, p.etapa, p.estado, p.fechaRegistro, p.ultimaEtapa, p.notas,
        ]);

        const values = [
            ...headers,
            ...userRows,
            [],
            ['Prospectos actuales'],
            ['Usuario', 'Asignado como', 'Nombre', 'Empresa', 'Telefono', 'Correo', 'Etapa', 'Estado', 'Fecha Registro', 'Ultima Etapa', 'Notas'],
            ...prospectRows,
        ];

        try {
            const sheets = google.sheets({ version: 'v4', auth: this.auth });

            try {
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: { requests: [{ addSheet: { properties: { title: 'crm' } } }] },
                });
            } catch (error) {
                if (!String(error.message || '').includes('already exists')) {
                    console.warn('⚠️ GoogleSheetsService: No se pudo crear la hoja crm:', error.message);
                }
            }

            await sheets.spreadsheets.values.clear({
                spreadsheetId: this.spreadsheetId,
                range: 'crm!A:Z',
            });

            await sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range,
                valueInputOption: 'USER_ENTERED',
                resource: { values },
            });

            console.log('🚀 Hoja "crm" actualizada con datos filtrados de Camila y Brenda');

            // =====================================================
            // HISTORICO_SEMANAL: un bloque por semana, las semanas
            // anteriores quedan congeladas con sus datos finales.
            // =====================================================
            await this._updateHistoricoSemanal(sheets, this.spreadsheetId, crmData.historicoSemanal || []);

            // =====================================================
            // REGISTRO_DIARIO: un registro por usuario por dia,
            // mas recientes arriba, actualiza el de hoy si existe.
            // =====================================================
            await this._updateRegistroDiario(sheets, this.spreadsheetId, crmData.usuarios || []);

        } catch (error) {
            console.error('❌ Error al configurar hoja crm:', error.message);
        }
    }

    // ─── Helpers de semana ────────────────────────────────────────────────────

    _getWeekNum(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    }

    _formatWeekHeader(semanaStr) {
        const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        // Parse 'YYYY-MM-DD' sin depender de timezone
        const [y, m, d] = semanaStr.split('-').map(Number);
        const monday = new Date(y, m - 1, d);
        const sunday = new Date(y, m - 1, d + 6);
        const weekNum = this._getWeekNum(monday);
        const monFmt = `${monday.getDate()} ${MESES[monday.getMonth()]}`;
        const sunFmt = `${sunday.getDate()} ${MESES[sunday.getMonth()]} ${sunday.getFullYear()}`;
        return { weekNum, label: `SEMANA ${weekNum}   |   ${monFmt} al ${sunFmt}` };
    }

    // ─── Actualiza HISTORICO_SEMANAL con un bloque por semana ─────────────────
    //
    // Estructura de cada bloque (5 filas):
    //   Fila 1: SEMANA N  |  DD Mes - DD Mes YYYY  (header azul oscuro, merged)
    //   Fila 2: VENDEDORA | PROSPECTOS | CONTACTOS | REUNIONES  (encabezados verde)
    //   Fila 3: CAMILA ... datos ...
    //   Fila 4: BRENDA ... datos ...
    //   Fila 5: (espacio)
    //
    // Comportamiento:
    //   - Si la semana actual ya tiene bloque: solo actualiza filas 3-4.
    //   - Si es semana nueva: inserta 5 filas al inicio y aplica formato.
    //   - Semanas anteriores NUNCA se modifican.

    async _updateHistoricoSemanal(sheets, spreadsheetId, historicoSemanal) {
        const SHEET = 'HISTORICO_SEMANAL';
        const BLOCK_SIZE = 5;

        // 1. Asegurar que la hoja existe y obtener su sheetId
        let sheetId;
        try {
            const meta = await sheets.spreadsheets.get({ spreadsheetId });
            const found = meta.data.sheets.find(s => s.properties.title === SHEET);
            if (found) {
                sheetId = found.properties.sheetId;
            } else {
                const res = await sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    resource: { requests: [{ addSheet: { properties: { title: SHEET } } }] },
                });
                sheetId = res.data.replies[0].addSheet.properties.sheetId;
                console.log(`✅ Hoja "${SHEET}" creada`);
            }
        } catch (e) {
            console.warn(`⚠️ Error verificando hoja "${SHEET}":`, e.message);
            return;
        }

        // 2. Semana actual: calcular el lunes en hora local
        const now = new Date();
        const dayOfWeek = now.getDay() || 7;
        const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dayOfWeek - 1));
        const yyyy = monday.getFullYear();
        const mm = String(monday.getMonth() + 1).padStart(2, '0');
        const dd = String(monday.getDate()).padStart(2, '0');
        const currentWeekStr = `${yyyy}-${mm}-${dd}`;

        // 3. Filtrar datos de la semana actual
        const currentData = historicoSemanal.filter(r => r.semanaStr === currentWeekStr);
        if (currentData.length === 0) {
            console.log(`ℹ️ Sin datos para semana ${currentWeekStr}, HISTORICO_SEMANAL sin cambios`);
            return;
        }

        const camila = currentData.find(r => r.usuario.toLowerCase().includes('camila'));
        const brenda = currentData.find(r => r.usuario.toLowerCase().includes('brenda'));
        const { weekNum, label } = this._formatWeekHeader(currentWeekStr);

        // Filas del bloque
        const BLOCK = [
            [label, '', '', ''],
            ['VENDEDORA', 'PROSPECTOS', 'CONTACTOS', 'REUNIONES'],
            [camila ? camila.usuario.toUpperCase() : 'CAMILA', camila ? camila.prospectos : 0, camila ? camila.contactos : 0, camila ? camila.reuniones : 0],
            [brenda ? brenda.usuario.toUpperCase() : 'BRENDA', brenda ? brenda.prospectos : 0, brenda ? brenda.contactos : 0, brenda ? brenda.reuniones : 0],
            ['', '', '', ''],
        ];

        // 4. Leer contenido actual del sheet
        let existingValues = [];
        try {
            const resp = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${SHEET}!A1:D300`,
            });
            existingValues = resp.data.values || [];
        } catch (_) { /* sheet vacio */ }

        // 5. Buscar si ya existe el bloque de esta semana (por "SEMANA N" en col A)
        let currentWeekRowIdx = -1;
        const weekTag = `SEMANA ${weekNum}`;
        for (let i = 0; i < existingValues.length; i++) {
            const cell = String(existingValues[i] ? existingValues[i][0] || '' : '');
            if (cell.startsWith(weekTag)) {
                currentWeekRowIdx = i;
                break;
            }
        }

        if (currentWeekRowIdx >= 0) {
            // ── Bloque ya existe: solo actualizar filas de datos (3 y 4 del bloque)
            const dataRow1 = currentWeekRowIdx + 3; // 1-indexed
            const dataRow2 = currentWeekRowIdx + 4;
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${SHEET}!A${dataRow1}:D${dataRow2}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [BLOCK[2], BLOCK[3]] },
            });
            console.log(`📊 HISTORICO_SEMANAL: Semana ${weekNum} actualizada (filas ${dataRow1}-${dataRow2})`);

        } else {
            // ── Semana nueva: insertar 5 filas al inicio del sheet
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [{
                        insertDimension: {
                            range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: BLOCK_SIZE },
                            inheritFromBefore: false,
                        },
                    }],
                },
            });

            // Escribir el bloque
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${SHEET}!A1:D${BLOCK_SIZE}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: BLOCK },
            });

            // Aplicar formato SOLO al nuevo bloque (filas índice 0-3)
            const fmtRequests = [
                // Merge fila 1 (header de semana) a lo ancho de las 4 columnas
                {
                    mergeCells: {
                        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
                        mergeType: 'MERGE_ALL',
                    },
                },
                // Fila 1: azul oscuro, texto blanco, negrita, centrado
                {
                    repeatCell: {
                        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
                        cell: {
                            userEnteredFormat: {
                                backgroundColor: { red: 0.13, green: 0.19, blue: 0.25 },
                                textFormat: {
                                    foregroundColor: { red: 1, green: 1, blue: 1 },
                                    bold: true,
                                    fontSize: 12,
                                    fontFamily: 'Roboto',
                                },
                                horizontalAlignment: 'CENTER',
                                verticalAlignment: 'MIDDLE',
                            },
                        },
                        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
                    },
                },
                // Fila 2: verde, texto blanco negrita (encabezados de columna)
                {
                    repeatCell: {
                        range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 4 },
                        cell: {
                            userEnteredFormat: {
                                backgroundColor: { red: 0.18, green: 0.72, blue: 0.42 },
                                textFormat: {
                                    foregroundColor: { red: 1, green: 1, blue: 1 },
                                    bold: true,
                                    fontFamily: 'Roboto',
                                },
                                horizontalAlignment: 'CENTER',
                                verticalAlignment: 'MIDDLE',
                            },
                        },
                        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
                    },
                },
                // Filas 3-4 col A (nombre vendedora): azul grisáceo, negrita, izquierda
                {
                    repeatCell: {
                        range: { sheetId, startRowIndex: 2, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 1 },
                        cell: {
                            userEnteredFormat: {
                                backgroundColor: { red: 0.84, green: 0.87, blue: 0.91 },
                                textFormat: { bold: true, fontFamily: 'Roboto', fontSize: 10 },
                                horizontalAlignment: 'LEFT',
                                verticalAlignment: 'MIDDLE',
                            },
                        },
                        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
                    },
                },
                // Filas 3-4 cols B-D (números): gris muy claro, negrita grande, centrado
                {
                    repeatCell: {
                        range: { sheetId, startRowIndex: 2, endRowIndex: 4, startColumnIndex: 1, endColumnIndex: 4 },
                        cell: {
                            userEnteredFormat: {
                                backgroundColor: { red: 0.95, green: 0.97, blue: 0.98 },
                                textFormat: { bold: true, fontFamily: 'Roboto', fontSize: 13 },
                                horizontalAlignment: 'CENTER',
                                verticalAlignment: 'MIDDLE',
                            },
                        },
                        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
                    },
                },
                // Bordes del bloque (filas 0-3)
                {
                    updateBorders: {
                        range: { sheetId, startRowIndex: 0, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 4 },
                        top: { style: 'SOLID_MEDIUM', color: { red: 0.13, green: 0.19, blue: 0.25 } },
                        bottom: { style: 'SOLID_MEDIUM', color: { red: 0.13, green: 0.19, blue: 0.25 } },
                        left: { style: 'SOLID_MEDIUM', color: { red: 0.13, green: 0.19, blue: 0.25 } },
                        right: { style: 'SOLID_MEDIUM', color: { red: 0.13, green: 0.19, blue: 0.25 } },
                        innerHorizontal: { style: 'SOLID', color: { red: 0.78, green: 0.78, blue: 0.78 } },
                        innerVertical: { style: 'SOLID', color: { red: 0.78, green: 0.78, blue: 0.78 } },
                    },
                },
                // Alturas de fila: header 40px, col-headers 26px, datos 34px
                {
                    updateDimensionProperties: {
                        range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
                        properties: { pixelSize: 40 },
                        fields: 'pixelSize',
                    },
                },
                {
                    updateDimensionProperties: {
                        range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 },
                        properties: { pixelSize: 26 },
                        fields: 'pixelSize',
                    },
                },
                {
                    updateDimensionProperties: {
                        range: { sheetId, dimension: 'ROWS', startIndex: 2, endIndex: 4 },
                        properties: { pixelSize: 34 },
                        fields: 'pixelSize',
                    },
                },
            ];

            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: { requests: fmtRequests },
            });

            console.log(`🚀 HISTORICO_SEMANAL: nuevo bloque SEMANA ${weekNum} insertado al inicio`);
        }
    }

    // ─── REGISTRO_DIARIO: log diario por usuario ──────────────────────────────
    //
    // Estructura de la hoja:
    //   Fila 1: Encabezados (congelada, estilo azul oscuro)
    //   Filas 2+: Un registro por usuario por dia, mas recientes arriba.
    //
    //   Columnas: Fecha | Hora | Vendedora | Pros. Nuevos | Pros. Totales | Contactos | Reuniones
    //
    // Comportamiento:
    //   - Si ya existe un registro para HOY + usuario: lo actualiza.
    //   - Si no: inserta una fila nueva debajo del encabezado (arriba de todo).

    async _updateRegistroDiario(sheets, spreadsheetId, usuarios) {
        const SHEET = 'REGISTRO_DIARIO';
        const COL_HEADERS = [
            'FECHA', 'HORA', 'VENDEDORA',
            'PROSPECTOS NUEVOS HOY',
            'CONTACTOS HOY', 'REUNIONES HOY',
        ];
        const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

        const now = new Date();
        const todayFmt = `${now.getDate()} ${MESES[now.getMonth()]} ${now.getFullYear()}`;
        const horaFmt = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' });

        // Solo Camila y Brenda
        const targets = usuarios.filter(u =>
            u.nombre.toLowerCase().includes('camila') ||
            u.nombre.toLowerCase().includes('brenda')
        );
        if (targets.length === 0) return;

        // 1. Asegurar que la hoja existe y obtener su sheetId
        let sheetId;
        let isNewSheet = false;
        try {
            const meta = await sheets.spreadsheets.get({ spreadsheetId });
            const found = meta.data.sheets.find(s => s.properties.title === SHEET);
            if (found) {
                sheetId = found.properties.sheetId;
            } else {
                const res = await sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    resource: { requests: [{ addSheet: { properties: { title: SHEET } } }] },
                });
                sheetId = res.data.replies[0].addSheet.properties.sheetId;
                isNewSheet = true;
                console.log(`✅ Hoja "${SHEET}" creada`);
            }
        } catch (e) {
            console.warn(`⚠️ Error verificando hoja "${SHEET}":`, e.message);
            return;
        }

        // 2. Si es hoja nueva, escribir encabezados y aplicar formato
        if (isNewSheet) {
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${SHEET}!A1:F1`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [COL_HEADERS] },
            });

            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [
                        {
                            repeatCell: {
                                range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 },
                                cell: {
                                    userEnteredFormat: {
                                        backgroundColor: { red: 0.13, green: 0.19, blue: 0.25 },
                                        textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontFamily: 'Roboto' },
                                        horizontalAlignment: 'CENTER',
                                        verticalAlignment: 'MIDDLE',
                                    },
                                },
                                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
                            },
                        },
                        {
                            updateSheetProperties: {
                                properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                                fields: 'gridProperties.frozenRowCount',
                            },
                        },
                        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 130 }, fields: 'pixelSize' } },
                        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },
                        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
                        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 6 }, properties: { pixelSize: 145 }, fields: 'pixelSize' } },
                        { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 32 }, fields: 'pixelSize' } },
                    ],
                },
            });
        }

        // 3. Para cada usuario: insertar evento si hay cambios
        for (const u of targets) {
            const nombre = u.nombre.toUpperCase();
            const primerNombre = nombre.split(' ')[0];

            const prospNuevos = u.prospectosHoy  || 0;
            const contactos    = u.contactosHoy  || 0;
            const reuniones    = u.reunionesHoy  || 0;

            let currentRows = [];
            try {
                const resp = await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: `${SHEET}!A2:F1000`,
                });
                currentRows = resp.data.values || [];
            } catch (_) { }

            let sumProspNuevos = 0;
            let sumContactos = 0;
            let sumReuniones = 0;

            const todayLower = todayFmt.toLowerCase().trim();

            for (const r of currentRows) {
                if (String(r[2] || '').toUpperCase().includes(primerNombre)) {
                    const cellDate = String(r[0] || '').toLowerCase().trim();
                    if (cellDate === todayLower) {
                        sumProspNuevos += Number(String(r[3] || '0').replace('+', '').replace("'", "")) || 0;
                        sumContactos   += Number(String(r[4] || '0').replace('+', '').replace("'", "")) || 0;
                        sumReuniones   += Number(String(r[5] || '0').replace('+', '').replace("'", "")) || 0;
                    }
                }
            }

            let deltaProspNuevos = prospNuevos - sumProspNuevos;
            let deltaContactos   = contactos - sumContactos;
            let deltaReuniones   = reuniones - sumReuniones;

            // Solo deltas positivos (el CRM a veces fluctúa, pero solo nos interesan los incrementos)
            if (deltaProspNuevos < 0) deltaProspNuevos = 0;
            if (deltaContactos < 0) deltaContactos = 0;
            if (deltaReuniones < 0) deltaReuniones = 0;

            const totalDelta = deltaProspNuevos + deltaContactos + deltaReuniones;
            if (totalDelta === 0) continue;

            const formatDelta = (val) => {
                if (val > 0) return `'+${val}`; // Forzar texto con ' para que Sheets no quite el +
                return '0';
            };

            // Desglosar en filas individuales de +1 si hay múltiples cambios
            // Esto cumple con el requisito de "solo debe ser +1 cada que agreguen 1 nuevo"
            const maxIter = Math.max(deltaProspNuevos, deltaContactos, deltaReuniones);

            for (let i = 0; i < maxIter; i++) {
                const dP = i < deltaProspNuevos ? 1 : 0;
                const dC = i < deltaContactos ? 1 : 0;
                const dR = i < deltaReuniones ? 1 : 0;

                const newRow = [
                    todayFmt,
                    horaFmt,
                    nombre,
                    formatDelta(dP),
                    formatDelta(dC),
                    formatDelta(dR),
                ];

                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    resource: {
                        requests: [{
                            insertRange: {
                                range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 6 },
                                shiftDimension: 'ROWS'
                            }
                        }],
                    },
                });

                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${SHEET}!A2:F2`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [newRow] },
                });

                // Estilo para la fila recién insertada
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    resource: {
                        requests: [
                            {
                                repeatCell: {
                                    range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 3 },
                                    cell: {
                                        userEnteredFormat: {
                                            backgroundColor: { red: 0.90, green: 0.93, blue: 0.96 },
                                            textFormat: { bold: true, fontFamily: 'Roboto', fontSize: 10 },
                                            horizontalAlignment: 'LEFT',
                                            verticalAlignment: 'MIDDLE',
                                        },
                                    },
                                    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
                                },
                            },
                            {
                                repeatCell: {
                                    range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 3, endColumnIndex: 6 },
                                    cell: {
                                        userEnteredFormat: {
                                            backgroundColor: { red: 0.95, green: 0.97, blue: 0.99 },
                                            textFormat: { bold: true, fontFamily: 'Roboto', fontSize: 12 },
                                            horizontalAlignment: 'CENTER',
                                            verticalAlignment: 'MIDDLE',
                                        },
                                    },
                                    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
                                },
                            },
                            {
                                updateDimensionProperties: {
                                    range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 },
                                    properties: { pixelSize: 30 },
                                    fields: 'pixelSize'
                                }
                            }
                        ]
                    }
                });
            }

            console.log(`📋 REGISTRO_DIARIO: ${totalDelta} eventos registrados para ${nombre}`);
        }

        // 4. Actualizar el contador aparte de PROSPECTOS TOTALES en las columnas H e I
        const stockData = [
            ['PROSPECTOS TOTALES', ''],
            ...targets.map(u => [u.nombre.toUpperCase(), u.stockActual || 0])
        ];

        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${SHEET}!H1:I${1 + targets.length}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: stockData },
        });

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
                requests: [
                    {
                        mergeCells: {
                            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 7, endColumnIndex: 9 },
                            mergeType: 'MERGE_ALL',
                        }
                    },
                    {
                        repeatCell: {
                            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 7, endColumnIndex: 9 },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.13, green: 0.19, blue: 0.25 },
                                    textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontFamily: 'Roboto' },
                                    horizontalAlignment: 'CENTER',
                                    verticalAlignment: 'MIDDLE',
                                },
                            },
                            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
                        }
                    },
                    {
                        repeatCell: {
                            range: { sheetId, startRowIndex: 1, endRowIndex: 1 + targets.length, startColumnIndex: 7, endColumnIndex: 9 },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.95, green: 0.97, blue: 0.99 },
                                    textFormat: { bold: true, fontFamily: 'Roboto', fontSize: 11 },
                                    horizontalAlignment: 'CENTER',
                                    verticalAlignment: 'MIDDLE',
                                },
                            },
                            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
                        }
                    },
                    {
                        updateBorders: {
                            range: { sheetId, startRowIndex: 0, endRowIndex: 1 + targets.length, startColumnIndex: 7, endColumnIndex: 9 },
                            top: { style: 'SOLID', color: { red: 0.13, green: 0.19, blue: 0.25 } },
                            bottom: { style: 'SOLID', color: { red: 0.13, green: 0.19, blue: 0.25 } },
                            left: { style: 'SOLID', color: { red: 0.13, green: 0.19, blue: 0.25 } },
                            right: { style: 'SOLID', color: { red: 0.13, green: 0.19, blue: 0.25 } },
                            innerHorizontal: { style: 'SOLID', color: { red: 0.78, green: 0.78, blue: 0.78 } },
                            innerVertical: { style: 'SOLID', color: { red: 0.78, green: 0.78, blue: 0.78 } },
                        }
                    }
                ]
            }
        });
    }
}

module.exports = new GoogleSheetsService();

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
        // Formato: [Fecha, Tipo, Vendedor, Prospecto, Descripción, Resultado, Notas]
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
        // Formato: [Fecha, Nombre, Empresa, Teléfono, Correo, Notas, Vendedor]
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
                // Verificar si la hoja tiene datos
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
        // Formato: [Fecha, Cliente, Vendedor, Monto, Estado, Notas]
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
            
            // Limpiar y escribir
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
            // Si la hoja no existe, intentar crearla
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
                    if (e.message.includes('already exists')) {
                         // Si ya existe por alguna razón, reintentar una última vez
                         console.log('La hoja ya existe, reintentando actualización...');
                         // Evitar loop infinito
                    } else {
                        console.error('❌ Error creando hoja KPIs:', e.message);
                    }
                }
            }
        }
    }

    /**
     * Configura un Dashboard en tiempo real usando fórmulas.
     */
    /**
     * Configura un Dashboard con datos reales.
     */
    async setupRealtimeDashboard(dashboardData) {
        if (!this.auth) return;
        const range = 'Dashboard!A1';
        const headers = [[
            'Usuario', 
            'Stock Activo', 
            'Pros. Totales', 
            'Pros. Hoy', 
            'Llamadas Hoy', 
            'Msgs Hoy', 
            'Actividad Hoy', 
            'Actividad Total',
            'Citas Hoy',
            'Citas Totales',
            'Ventas Ganadas',
            'Ventas Perdidas',
            'Monto Ganado',
            'Ticket Promedio',
            '% Eficiencia (Cita)',
            '% Cierre (Venta)'
        ]];
        
        const rows = dashboardData.map(d => [
            d.nombre,
            d.stock,
            d.totalPros,
            d.nuevosHoy,
            d.llamadasHoy,
            d.msgsHoy,
            d.actividadHoy,
            d.actividadTotal,
            d.citasHoy,
            d.citasTotales,
            d.ventasGanadas,
            d.ventasPerdidas,
            `$${Number(d.montoTotal).toLocaleString('es-MX')}`,
            `$${Number(d.ticketPromedio).toLocaleString('es-MX')}`,
            `${d.pctCita}%`,
            `${d.pctCierre}%`
        ]);

        try {
            const sheets = google.sheets({ version: 'v4', auth: this.auth });
            
            // Asegurar que la hoja existe
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
                resource: {
                    values: [...headers, ...rows],
                },
            });
            console.log('🚀 Dashboard actualizado con Stock Real');
        } catch (error) {
            console.error('❌ Error al configurar Dashboard:', error.message);
        }
    }

    /**
     * Escribe una sola hoja CRM con solo Camila y Brenda, stock actual y métricas diarias/mensuales.
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
            u.nombre,
            u.stockActual,
            u.prospectosHoy,
            u.prospectosMes,
            u.contactosHoy,
            u.contactosMes,
            u.reunionesHoy,
            u.reunionesMes,
        ]);

        const prospectRows = (crmData.prospectos || []).map(p => [
            p.usuario,
            p.asignadoComo,
            p.nombre,
            p.empresa,
            p.telefono,
            p.correo,
            p.etapa,
            p.estado,
            p.fechaRegistro,
            p.ultimaEtapa,
            p.notas,
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
                    resource: {
                        requests: [{ addSheet: { properties: { title: 'crm' } } }],
                    },
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
        } catch (error) {
            console.error('❌ Error al configurar hoja crm:', error.message);
        }
    }
}

module.exports = new GoogleSheetsService();

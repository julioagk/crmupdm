const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

/**
 * Servicio para interactuar con Google Sheets usando una cuenta de servicio.
 */
class GoogleSheetsService {
    constructor() {
        this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
        // El archivo JSON de la cuenta de servicio está en la raíz del proyecto
        this.keyFilePath = path.join(__dirname, '../../crm-updm-37bbc16dc608.json');
        
        if (!fs.existsSync(this.keyFilePath)) {
            console.error('❌ GoogleSheetsService: No se encontró el archivo de credenciales en:', this.keyFilePath);
            this.auth = null;
        } else {
            this.auth = new google.auth.GoogleAuth({
                keyFile: this.keyFilePath,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });
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
    async setupRealtimeDashboard(usuarios) {
        if (!this.auth) return;
        const range = 'Dashboard!A1';
        const headers = [['Usuario', 'Total Prospectos', 'Prospectos Hoy', 'Contactos Hoy (Llamadas/MSGs)', 'Reuniones Hoy', '% Conv Total']];
        
        const rows = usuarios.map((u, i) => {
            const rowIdx = i + 2; // +1 por header, +1 por 1-based index
            return [
                u.nombre,
                // Total Prospectos
                `=COUNTIF(Prospectos!G:G, A${rowIdx})`,
                // Prospectos Hoy (Asumiendo fecha en Columna A)
                `=COUNTIFS(Prospectos!G:G, A${rowIdx}, Prospectos!A:A, ">="&TODAY())`,
                // Contactos Hoy (Llamadas y Mensajes)
                `=SUM(COUNTIFS(Actividades!C:C, A${rowIdx}, Actividades!A:A, ">="&TODAY(), Actividades!B:B, {"llamada", "whatsapp", "mensaje", "correo"}))`,
                // Reuniones Hoy
                `=COUNTIFS(Actividades!C:C, A${rowIdx}, Actividades!A:A, ">="&TODAY(), Actividades!B:B, "cita")`,
                // % Conversión Total (Citas totales / Prospectos totales)
                `=IFERROR(COUNTIFS(Actividades!C:C, A${rowIdx}, Actividades!B:B, "cita") / COUNTIF(Prospectos!G:G, A${rowIdx}), 0)`
            ];
        });

        try {
            const sheets = google.sheets({ version: 'v4', auth: this.auth });
            
            // Verificar si la hoja existe
            try {
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: { requests: [{ addSheet: { properties: { title: 'Dashboard' } } }] }
                });
            } catch (e) { /* Ya existe */ }

            await sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [...headers, ...rows],
                },
            });
            console.log('🚀 Dashboard en tiempo real configurado');
        } catch (error) {
            console.error('❌ Error al configurar Dashboard:', error.message);
        }
    }
}

module.exports = new GoogleSheetsService();

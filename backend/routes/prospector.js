const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const { toMongoFormat, toMongoFormatMany } = require('../lib/helpers');

const esProspector = (req, res, next) => {
    const rol = String(req.usuario.rol).toLowerCase();
    if (rol !== 'prospector' && rol !== 'closer') {
        return res.status(403).json({ msg: 'Acceso denegado. Solo prospectores o closers.' });
    }
    next();
};

// Helper: calcula métricas para un período dado por filtro SQL en campo fecha (actividades) y fechaRegistro (clientes)
function calcularPeriodoActividades(db, prospectorId, filtroFecha) {
    const where = filtroFecha ? `AND ${filtroFecha}` : '';

    const llamadas = db.prepare(
        `SELECT COUNT(*) as c FROM actividades WHERE vendedor = ? AND tipo = 'llamada' ${where}`
    ).get(prospectorId)?.c || 0;

    const mensajes = db.prepare(
        `SELECT COUNT(*) as c FROM actividades WHERE vendedor = ? AND tipo IN ('whatsapp','correo','mensaje') ${where}`
    ).get(prospectorId)?.c || 0;

    return { llamadas, mensajes };
}

function calcularPeriodoClientes(db, prospectorId, filtroFechaRegistro) {
    const where = filtroFechaRegistro ? `AND ${filtroFechaRegistro}` : '';
    // Excluir prospectos perdidos y ventas ganadas del conteo de "prospectos nuevos"
    return db.prepare(
        `SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? AND etapaEmbudo NOT IN ('perdido', 'venta_ganada') ${where}`
    ).get(prospectorId)?.c || 0;
}

// Reuniones: filtrar por fechaUltimaEtapa (momento en que se agendó/cambió a esa etapa)
function calcularPeriodoReuniones(db, prospectorId, filtroFechaEtapa) {
    const where = filtroFechaEtapa ? `AND ${filtroFechaEtapa}` : '';
    return db.prepare(
        `SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? AND etapaEmbudo IN ('reunion_agendada','reunion_realizada','venta_ganada') ${where}`
    ).get(prospectorId)?.c || 0;
}

// GET /api/prospector/dashboard
router.get('/dashboard', [auth, esProspector], async (req, res) => {
    try {
        const prospectorId = parseInt(req.usuario.id);
        const clientes = db.prepare(
            'SELECT * FROM clientes WHERE prospectorAsignado = ?'
        ).all(prospectorId);

        // Filtrar solo prospectos activos (excluir perdidos y ventas ganadas)
        const clientesActivos = clientes.filter(c => 
            c.etapaEmbudo !== 'perdido' && c.etapaEmbudo !== 'venta_ganada'
        );

        // Embudo siempre sobre totales (Acumulativo)
        const embudo = {
            total: clientesActivos.length,
            prospecto_nuevo: 0,
            en_contacto: 0,
            reunion_agendada: 0,
            transferidos: 0
        };

        for (const c of clientesActivos) {
            embudo.prospecto_nuevo++; // Todos empiezan como prospecto

            let contactado = false;
            let agendado = false;
            let transferido = !!c.closerAsignado;

            // Etapas que implican contacto
            const etapasContacto = ['en_contacto', 'reunion_agendada', 'venta_ganada', 'en_negociacion', 'reunion_realizada', 'perdido'];
            // Etapas que implican reunión agendada
            const etapasAgendado = ['reunion_agendada', 'venta_ganada', 'en_negociacion', 'reunion_realizada'];

            if (c.etapaEmbudo !== 'prospecto_nuevo' && c.etapaEmbudo) contactado = true;
            if (etapasAgendado.includes(c.etapaEmbudo) || transferido) {
                contactado = true;
                agendado = true;
            }

            // Historial por si fue regresado a alguna etapa
            const hist = c.historialEmbudo ? JSON.parse(c.historialEmbudo) : [];
            const etapasHist = hist.map(h => h.etapa);
            if (etapasHist.some(e => etapasContacto.includes(e))) contactado = true;
            if (etapasHist.some(e => etapasAgendado.includes(e))) {
                contactado = true;
                agendado = true;
            }

            if (contactado) embudo.en_contacto++;
            if (agendado) embudo.reunion_agendada++;
            if (transferido) embudo.transferidos++;
        }

        const tasasConversion = {
            contacto: embudo.total > 0
                ? (embudo.en_contacto / embudo.total * 100).toFixed(1)
                : 0,
            agendamiento: embudo.en_contacto > 0
                ? (embudo.reunion_agendada / embudo.en_contacto * 100).toFixed(1)
                : 0
        };

        // Filtros por período
        // Actividades: campo 'fecha'
        const FILTROS_ACT = {
            dia: "DATE(fecha) = DATE('now','localtime')",
            semana: "DATE(fecha) >= DATE('now','localtime','-6 days')",
            mes: "DATE(fecha) >= DATE('now','localtime','start of month')",
            total: null
        };
        // Prospectos nuevos: campo 'fechaRegistro'
        const FILTROS_CLI = {
            dia: "(DATE(fechaRegistro) = DATE('now','localtime') OR (fechaRegistro IS NULL AND DATE(fechaUltimaEtapa) = DATE('now','localtime')))",
            semana: "(DATE(fechaRegistro) >= DATE('now','localtime','-6 days') OR (fechaRegistro IS NULL AND DATE(fechaUltimaEtapa) >= DATE('now','localtime','-6 days')))",
            mes: "(DATE(fechaRegistro) >= DATE('now','localtime','start of month') OR (fechaRegistro IS NULL AND DATE(fechaUltimaEtapa) >= DATE('now','localtime','start of month')))",
            total: null
        };
        // Reuniones agendadas: campo 'fechaUltimaEtapa' (momento en que se pasó a reunion_agendada)
        const FILTROS_REUNION = {
            dia: "DATE(fechaUltimaEtapa) = DATE('now','localtime')",
            semana: "DATE(fechaUltimaEtapa) >= DATE('now','localtime','-6 days')",
            mes: "DATE(fechaUltimaEtapa) >= DATE('now','localtime','start of month')",
            total: null
        };

        const periodos = {};
        for (const key of ['dia', 'semana', 'mes', 'total']) {
            const { llamadas, mensajes } = calcularPeriodoActividades(db, prospectorId, FILTROS_ACT[key]);
            const prospectos = calcularPeriodoClientes(db, prospectorId, FILTROS_CLI[key]);
            const reuniones = calcularPeriodoReuniones(db, prospectorId, FILTROS_REUNION[key]);
            periodos[key] = { llamadas, mensajes, prospectos, reuniones };
        }

        // Compatibilidad backward con metricas (por si hay otros consumidores)
        const metricas = {
            llamadas: { hoy: periodos.dia.llamadas, totales: periodos.total.llamadas },
            contactosExitosos: { hoy: 0, totales: 0 },
            reunionesAgendadas: { hoy: periodos.dia.reuniones, totales: periodos.total.reuniones, semana: periodos.semana.reuniones },
            prospectosHoy: periodos.dia.prospectos,
            correosEnviados: periodos.dia.mensajes
        };

        res.json({ embudo, metricas, tasasConversion, periodos });
    } catch (error) {
        console.error('Error en dashboard prospector:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

// GET /api/prospector/prospectos
router.get('/prospectos', [auth, esProspector], async (req, res) => {
    try {
        const prospectorId = parseInt(req.usuario.id);
        const { etapa, busqueda } = req.query;

        let sql = 'SELECT c.*, u.nombre as closerNombre FROM clientes c LEFT JOIN usuarios u ON c.closerAsignado = u.id WHERE c.prospectorAsignado = ? AND c.etapaEmbudo NOT IN (?, ?)';
        const params = [prospectorId, 'venta_ganada', 'perdido'];

        if (etapa && etapa !== 'todos') {
            sql += ' AND c.etapaEmbudo = ?';
            params.push(etapa);
        }
        if (busqueda) {
            sql += ' AND (c.nombres LIKE ? OR c.apellidoPaterno LIKE ? OR c.empresa LIKE ? OR c.telefono LIKE ?)';
            const like = '%' + busqueda + '%';
            params.push(like, like, like, like);
        }
        sql += ' ORDER BY c.fechaUltimaEtapa DESC';

        const rows = db.prepare(sql).all(...params);
        const prospectos = rows.map(r => {
            const { closerNombre, ...c } = r;
            const out = toMongoFormat(c);
            if (out && closerNombre) out.closerAsignado = { nombre: closerNombre };
            return out || c;
        });

        res.json(prospectos);
    } catch (error) {
        console.error('Error al obtener prospectos:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

// GET /api/prospector/clientes-ganados
router.get('/clientes-ganados', [auth, esProspector], async (req, res) => {
    try {
        const prospectorId = parseInt(req.usuario.id);
        const { busqueda } = req.query;

        let sql = 'SELECT c.*, u.nombre as closerNombre FROM clientes c LEFT JOIN usuarios u ON c.closerAsignado = u.id WHERE c.prospectorAsignado = ? AND c.etapaEmbudo = ?';
        const params = [prospectorId, 'venta_ganada'];

        if (busqueda) {
            sql += ' AND (c.nombres LIKE ? OR c.apellidoPaterno LIKE ? OR c.empresa LIKE ? OR c.telefono LIKE ?)';
            const like = '%' + busqueda + '%';
            params.push(like, like, like, like);
        }
        sql += ' ORDER BY c.fechaUltimaEtapa DESC';

        const rows = db.prepare(sql).all(...params);
        const clientes = rows.map(r => {
            const { closerNombre, ...c } = r;
            const out = toMongoFormat(c);
            if (out && closerNombre) out.closerAsignado = { nombre: closerNombre };
            return out || c;
        });

        res.json(clientes);
    } catch (error) {
        console.error('Error al obtener clientes ganados:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

// POST /api/prospector/crear-prospecto
router.post('/crear-prospecto', [auth, esProspector], async (req, res) => {
    try {
        const { nombres, apellidoPaterno, apellidoMaterno, telefono, correo, empresa, notas } = req.body;
        if (!nombres || !telefono) {
            return res.status(400).json({ msg: 'Nombres y teléfono son requeridos' });
        }

        const prospectorId = parseInt(req.usuario.id);
        const rol = String(req.usuario.rol).toLowerCase();
        const closerId = rol === 'closer' ? prospectorId : null;
        const now = new Date().toISOString();

        const stmt = db.prepare(`
            INSERT INTO clientes (nombres, apellidoPaterno, apellidoMaterno, telefono, correo, empresa, notas, vendedorAsignado, prospectorAsignado, closerAsignado, etapaEmbudo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'prospecto_nuevo')
        `);
        const result = stmt.run(
            nombres.trim(),
            (apellidoPaterno || '').trim(),
            (apellidoMaterno || '').trim(),
            String(telefono).trim(),
            String(correo || '').trim().toLowerCase(),
            (empresa || '').trim(),
            (notas || '').trim(),
            prospectorId,
            prospectorId,
            closerId
        );

        const row = db.prepare('SELECT * FROM clientes WHERE id = ?').get(result.lastInsertRowid);
        const cliente = toMongoFormat(row);
        if (cliente) cliente.prospectorAsignado = { nombre: req.usuario.nombre };

        res.status(201).json({ msg: 'Prospecto creado', cliente: cliente || row });
    } catch (error) {
        console.error('Error al crear prospecto:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

// POST /api/prospector/registrar-actividad
router.post('/registrar-actividad', [auth, esProspector], async (req, res) => {
    try {
        const { clienteId, tipo, resultado, descripcion, notas, fechaCita } = req.body;
        const tiposValidos = ['llamada', 'mensaje', 'correo', 'whatsapp', 'cita', 'prospecto'];
        const resultadosValidos = ['exitoso', 'pendiente', 'fallido'];

        if (!clienteId || !tipo) {
            return res.status(400).json({ msg: 'Cliente y tipo de actividad son requeridos' });
        }
        if (!tiposValidos.includes(tipo)) {
            return res.status(400).json({ msg: 'Tipo de actividad no válido' });
        }

        const cid = parseInt(clienteId);
        const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(cid);
        if (!cliente) {
            return res.status(404).json({ msg: 'Cliente no encontrado' });
        }
        const prospectorId = parseInt(req.usuario.id);

        // MEJORADO: Permitir que prospector registre actividades ANTES y DURANTE la transferencia
        // Si es prospector, debe estar asignado. Si es closer, puede registrar en clientes asignados a él
        const esProspectorAsignado = cliente.prospectorAsignado === prospectorId && String(req.usuario.rol).toLowerCase() === 'prospector';
        const esCloserDelCliente = cliente.closerAsignado === prospectorId && String(req.usuario.rol).toLowerCase() === 'closer';

        if (!esProspectorAsignado && !esCloserDelCliente) {
            return res.status(403).json({ msg: 'No tienes permiso para registrar actividades de este cliente' });
        }

        const resultadoFinal = resultado && resultadosValidos.includes(resultado) ? resultado : 'pendiente';
        const fechaActividad = tipo === 'cita' && fechaCita ? new Date(fechaCita).toISOString() : new Date().toISOString();

        const ins = db.prepare(`
            INSERT INTO actividades (tipo, vendedor, cliente, fecha, descripcion, resultado, notas)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(tipo, prospectorId, cid, fechaActividad, descripcion || `${tipo} registrada`, resultadoFinal, notas || '');

        const now = new Date().toISOString();
        db.prepare('UPDATE clientes SET ultimaInteraccion = ? WHERE id = ?').run(now, cid);

        if (tipo === 'llamada' && resultadoFinal === 'exitoso' && cliente.etapaEmbudo === 'prospecto_nuevo') {
            const hist = cliente.historialEmbudo ? JSON.parse(cliente.historialEmbudo) : [];
            hist.push({ etapa: 'en_contacto', fecha: now, vendedor: prospectorId });
            db.prepare('UPDATE clientes SET etapaEmbudo = ?, fechaUltimaEtapa = ?, historialEmbudo = ? WHERE id = ?')
                .run('en_contacto', now, JSON.stringify(hist), cid);
        }

        const actRow = db.prepare('SELECT * FROM actividades WHERE id = ?').get(ins.lastInsertRowid);
        const actividad = toMongoFormat(actRow);
        if (actividad) actividad.cliente = { nombres: cliente.nombres, apellidoPaterno: cliente.apellidoPaterno, empresa: cliente.empresa };

        res.status(201).json({ msg: 'Actividad registrada', actividad: actividad || actRow });
    } catch (error) {
        console.error('Error al registrar actividad:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

// GET /api/prospector/prospecto/:id/historial-completo
// NUEVO: Historial COMPLETO visible para prospector y closer
router.get('/prospecto/:id/historial-completo', [auth, esProspector], async (req, res) => {
    try {
        const prospectoId = parseInt(req.params.id);
        const usuarioId = parseInt(req.usuario.id);

        // Obtener cliente
        const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(prospectoId);
        if (!cliente) {
            return res.status(404).json({ msg: 'Prospecto no encontrado' });
        }

        // Validar permisos: el prospector o closer asignado pueden ver el historial
        const esProspectorAsignado = cliente.prospectorAsignado === usuarioId;
        const esCloserAsignado = cliente.closerAsignado === usuarioId;
        const esProspectorActual = String(req.usuario.rol).toLowerCase() === 'prospector';

        if (!esProspectorAsignado && !esCloserAsignado) {
            return res.status(403).json({ msg: 'No tienes permiso para ver este historial' });
        }

        // Obtener TODAS las actividades del cliente (de todos los vendedores que han trabajado en él)
        const actividades = db.prepare(`
            SELECT a.*, u.nombre as vendedorNombre, u.rol as vendedorRol
            FROM actividades a
            LEFT JOIN usuarios u ON a.vendedor = u.id
            WHERE a.cliente = ?
            ORDER BY a.fecha ASC
        `).all(prospectoId);

        // Obtener historial del embudo
        const historialEmbudo = cliente.historialEmbudo ? JSON.parse(cliente.historialEmbudo) : [];

        // Construir respuesta enriquecida
        const timeline = [];

        // Agregar cambios de etapa (FILTRAR los redundantes con actividades de cita)
        // Las etapas de reunion_agendada y reunion_realizada ya se muestran como actividades tipo 'cita'
        const etapasRelacionadasConCitas = ['reunion_agendada', 'reunion_realizada'];
        
        historialEmbudo.forEach(h => {
            // Solo agregar cambios de etapa que NO sean redundantes con actividades de cita
            const esRedundante = etapasRelacionadasConCitas.includes(h.etapa) && 
                                 actividades.some(a => a.tipo === 'cita' && 
                                                      Math.abs(new Date(a.fecha) - new Date(h.fecha)) < 60000); // 1 minuto tolerancia
            
            if (!esRedundante) {
                timeline.push({
                    tipo: 'cambio_etapa',
                    etapa: h.etapa,
                    fecha: h.fecha,
                    vendedorId: h.vendedor,
                    descripcion: h.descripcion || `Cambio a etapa: ${h.etapa}`,
                    resultado: h.resultado || null
                });
            }
        });

        // Agregar actividades
        actividades.forEach(a => {
            const mongoAct = toMongoFormat(a);
            timeline.push({
                tipo: 'actividad',
                id: mongoAct?.id || a.id,
                tipoActividad: a.tipo,
                fecha: a.fecha,
                vendedorId: a.vendedor,
                vendedorNombre: a.vendedorNombre || 'Desconocido',
                vendedorRol: a.vendedorRol || 'vendedor',
                descripcion: a.descripcion,
                resultado: a.resultado,
                notas: a.notas
            });
        });

        // Ordenar por fecha
        timeline.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

        res.json({
            cliente: toMongoFormat(cliente) || cliente,
            timeline,
            resumen: {
                totalActividades: actividades.length,
                etapaActual: cliente.etapaEmbudo,
                ultimaInteraccion: cliente.ultimaInteraccion,
                prospectorAsignado: cliente.prospectorAsignado,
                closerAsignado: cliente.closerAsignado
            }
        });
    } catch (error) {
        console.error('Error al obtener historial completo:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

// GET /api/prospector/actividades-hoy
router.get('/actividades-hoy', [auth, esProspector], async (req, res) => {
    try {
        const prospectorId = parseInt(req.usuario.id);
        const hoyInicio = new Date().toISOString().slice(0, 10) + ' 00:00:00';
        const hoyFin = new Date().toISOString().slice(0, 10) + ' 23:59:59';

        const rows = db.prepare(`
            SELECT a.*, c.nombres as c_nombres, c.apellidoPaterno as c_apellidoPaterno, c.empresa as c_empresa, c.telefono as c_telefono
            FROM actividades a
            JOIN clientes c ON a.cliente = c.id
            WHERE a.vendedor = ? AND a.fecha >= ? AND a.fecha <= ?
            ORDER BY a.fecha DESC
        `).all(prospectorId, hoyInicio, hoyFin);

        const actividades = rows.map(r => ({
            ...r,
            cliente: r.c_id ? {
                id: r.c_id,
                nombres: r.c_nombres,
                apellidoPaterno: r.c_apellidoPaterno,
                empresa: r.c_empresa
            } : null
        }));

        res.json(actividades);
    } catch (error) {
        console.error('Error al obtener actividades:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

// GET /api/prospector/prospectos/:id/actividades
router.get('/prospectos/:id/actividades', auth, async (req, res) => {
    try {
        const prospectoId = parseInt(req.params.id);
        const userId = parseInt(req.usuario.id);
        const rol = String(req.usuario.rol).toLowerCase();

        // Verificar acceso (solo comprobar que exista el prospecto)
        const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(prospectoId);
        if (!cliente) return res.status(404).json({ msg: 'Prospecto no encontrado' });

        const actividades = db.prepare(`
            SELECT a.*, u.nombre as vendedorNombre 
            FROM actividades a
            LEFT JOIN usuarios u ON a.vendedor = u.id
            WHERE a.cliente = ?
            ORDER BY a.fecha DESC
        `).all(prospectoId);

        res.json(actividades);
    } catch (error) {
        console.error('Error al obtener actividades de prospecto:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

// PUT /api/prospector/prospectos/:id
router.put('/prospectos/:id', auth, async (req, res) => {
    try {
        const prospectoId = parseInt(req.params.id);
        const { interes, proximaLlamada } = req.body;

        const updates = [];
        const params = [];

        if (interes !== undefined) { updates.push('interes = ?'); params.push(interes); }
        if (proximaLlamada !== undefined) { updates.push('proximaLlamada = ?'); params.push(proximaLlamada); }

        if (updates.length > 0) {
            params.push(prospectoId);
            db.prepare(`UPDATE clientes SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        }

        res.json({ msg: 'Prospecto actualizado' });
    } catch (error) {
        console.error('Error al actualizar prospecto:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

// PUT /api/prospector/prospectos/:id/editar
router.put('/prospectos/:id/editar', [auth, esProspector], async (req, res) => {
    try {
        const prospectoId = parseInt(req.params.id);
        const { nombres, apellidoPaterno, apellidoMaterno, telefono, correo, empresa, ubicacion, notas } = req.body;
        const prospectorId = parseInt(req.usuario.id);

        if (!nombres || !telefono) {
            return res.status(400).json({ msg: 'Nombres y teléfono son requeridos' });
        }

        const cliente = db.prepare('SELECT id, prospectorAsignado FROM clientes WHERE id = ?').get(prospectoId);
        if (!cliente) return res.status(404).json({ msg: 'Prospecto no encontrado' });
        if (cliente.prospectorAsignado !== prospectorId) return res.status(403).json({ msg: 'No tienes permiso para editar este prospecto' });

        db.prepare(`
            UPDATE clientes 
            SET nombres = ?, apellidoPaterno = ?, apellidoMaterno = ?, telefono = ?, correo = ?, empresa = ?, notas = ?, interes = ?, proximaLlamada = ?
            WHERE id = ?
        `).run(
            nombres.trim(),
            (apellidoPaterno || '').trim(),
            (apellidoMaterno || '').trim(),
            String(telefono).trim(),
            String(correo || '').trim().toLowerCase(),
            (empresa || '').trim(),
            (notas || '').trim(),
            req.body.interes !== undefined ? req.body.interes : 0,
            req.body.proximaLlamada || null,
            prospectoId
        );

        res.json({ msg: 'Prospecto actualizado exitosamente' });
    } catch (error) {
        console.error('Error al editar prospecto:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

// POST /api/prospector/agendar-reunion
router.post('/agendar-reunion', [auth, esProspector], async (req, res) => {
    try {
        const { clienteId, closerId, fechaReunion, notas } = req.body;
        if (!clienteId || !closerId || !fechaReunion) {
            return res.status(400).json({ msg: 'Faltan datos requeridos' });
        }

        const cid = parseInt(clienteId);
        const closerIdNum = parseInt(closerId);
        const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(cid);
        if (!cliente) {
            return res.status(404).json({ msg: 'Cliente no encontrado' });
        }

        const prospectorId = parseInt(req.usuario.id);
        if (cliente.prospectorAsignado !== prospectorId) {
            return res.status(403).json({ msg: 'No tienes permiso para agendar reunión con este cliente' });
        }

        const now = new Date().toISOString();
        const hist = cliente.historialEmbudo ? JSON.parse(cliente.historialEmbudo) : [];
        hist.push({ etapa: 'reunion_agendada', fecha: now, vendedor: prospectorId });

        db.prepare(`
            UPDATE clientes SET etapaEmbudo = ?, closerAsignado = ?, fechaTransferencia = ?, fechaUltimaEtapa = ?, ultimaInteraccion = ?, historialEmbudo = ?
            WHERE id = ?
        `).run('reunion_agendada', closerIdNum, now, now, now, JSON.stringify(hist), cid);

        const fechaReunionISO = new Date(fechaReunion).toISOString();
        const finReunionISO = new Date(new Date(fechaReunion).getTime() + 45 * 60000).toISOString();

        // ** GOOGLE CALENDAR INTEGRATION **
        let hangoutLink = null;
        try {
            const closerDetails = db.prepare('SELECT email, googleRefreshToken, googleAccessToken, googleTokenExpiry FROM usuarios WHERE id = ?').get(closerIdNum);

            if (closerDetails && (closerDetails.googleRefreshToken || closerDetails.googleAccessToken)) {
                const { OAuth2Client } = require('google-auth-library');
                const { google } = require('googleapis');

                const client = new OAuth2Client(
                    process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
                    process.env.GOOGLE_CLIENT_SECRET
                );

                client.setCredentials({
                    refresh_token: closerDetails.googleRefreshToken,
                    access_token: closerDetails.googleAccessToken,
                    expiry_date: closerDetails.googleTokenExpiry
                });

                client.on('tokens', (tokens) => {
                    let updateStr = [];
                    let params = [];
                    if (tokens.refresh_token) { updateStr.push('googleRefreshToken = ?'); params.push(tokens.refresh_token); }
                    if (tokens.access_token) { updateStr.push('googleAccessToken = ?'); params.push(tokens.access_token); }
                    if (tokens.expiry_date) { updateStr.push('googleTokenExpiry = ?'); params.push(tokens.expiry_date); }

                    if (updateStr.length > 0) {
                        params.push(closerIdNum);
                        db.prepare(`UPDATE usuarios SET ${updateStr.join(', ')} WHERE id = ?`).run(...params);
                    }
                });

                const calendar = google.calendar({ version: 'v3', auth: client });

                const attendeesList = [{ email: closerDetails.email }];
                if (cliente.correo && cliente.correo.trim() !== '') {
                    attendeesList.push({ email: cliente.correo });
                }

                const event = {
                    summary: `[CITA AGENDADA] - ${cliente.nombres} ${cliente.apellidoPaterno}`,
                    description: `Cliente: ${cliente.telefono} - ${cliente.empresa || 'Sin empresa'}\nNotas: ${notas || 'Sin notas'}\nAgendado por Prospecter ${req.usuario.nombre}.`,
                    start: { dateTime: fechaReunionISO, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                    end: { dateTime: finReunionISO, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                    attendees: attendeesList,
                    conferenceData: {
                        createRequest: { requestId: 'meeting-' + Date.now().toString() }
                    }
                };

                const createdEvent = await calendar.events.insert({
                    calendarId: 'primary',
                    conferenceDataVersion: 1,
                    requestBody: event
                });

                if (createdEvent.data && createdEvent.data.hangoutLink) {
                    hangoutLink = createdEvent.data.hangoutLink;
                }
            }
        } catch (calendarError) {
            console.error('Error al intentar crear cita en Google Calendar:', calendarError);
            // No detenemos el flujo del CRM si google falla, solo registramos log
        }
        // ** END GOOGLE CALENDAR INTEGRATION **


        db.prepare(`
            INSERT INTO actividades (tipo, vendedor, cliente, fecha, descripcion, resultado, notas, cambioEtapa, etapaAnterior, etapaNueva)
            VALUES (?, ?, ?, ?, ?, 'pendiente', ?, 1, 'en_contacto', 'reunion_agendada')
        `).run('cita', prospectorId, cid, fechaReunionISO, `Reunión agendada por prospector ${req.usuario.nombre} → Asignada a closer`, notas || '');

        const clienteActualizado = db.prepare('SELECT * FROM clientes WHERE id = ?').get(cid);
        const actividadRow = db.prepare('SELECT * FROM actividades WHERE cliente = ? ORDER BY id DESC LIMIT 1').get(cid);

        res.json({
            msg: 'Reunión agendada exitosamente',
            cliente: toMongoFormat(clienteActualizado),
            actividad: toMongoFormat(actividadRow),
            hangoutLink: hangoutLink // Link de Meet retornado al frontend
        });
    } catch (error) {
        console.error('Error al agendar reunión:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

// GET /api/prospector/estadisticas
router.get('/estadisticas', [auth, esProspector], async (req, res) => {
    try {
        const prospectorId = parseInt(req.usuario.id);
        const clientes = db.prepare('SELECT * FROM clientes WHERE prospectorAsignado = ?').all(prospectorId);
        const actividades = db.prepare('SELECT * FROM actividades WHERE vendedor = ?').all(prospectorId);

        // Filtrar solo clientes activos (excluir perdidos y ventas ganadas)
        const clientesActivos = clientes.filter(c => 
            c.etapaEmbudo !== 'perdido' && c.etapaEmbudo !== 'venta_ganada'
        );

        const llamadas = actividades.filter(a => a.tipo === 'llamada');
        const llamadasExitosas = llamadas.filter(a => a.resultado === 'exitoso');
        const reunionesAgendadas = clientesActivos.filter(c => c.etapaEmbudo === 'reunion_agendada' || c.closerAsignado);

        const tasaContacto = llamadas.length > 0 ? (llamadasExitosas.length / llamadas.length * 100).toFixed(1) : 0;
        const tasaAgendamiento = llamadasExitosas.length > 0 ? (reunionesAgendadas.length / llamadasExitosas.length * 100).toFixed(1) : 0;

        const distribucion = {
            prospecto_nuevo: clientesActivos.filter(c => c.etapaEmbudo === 'prospecto_nuevo').length,
            en_contacto: clientesActivos.filter(c => c.etapaEmbudo === 'en_contacto').length,
            reunion_agendada: clientesActivos.filter(c => c.etapaEmbudo === 'reunion_agendada').length,
            transferidos: reunionesAgendadas.length
        };

        res.json({
            totalClientes: clientesActivos.length,
            totalLlamadas: llamadas.length,
            llamadasExitosas: llamadasExitosas.length,
            reunionesAgendadas: reunionesAgendadas.length,
            tasaContacto: parseFloat(tasaContacto),
            tasaAgendamiento: parseFloat(tasaAgendamiento),
            distribucion
        });
    } catch (error) {
        console.error('Error en estadísticas prospector:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

// POST /api/prospector/pasar-a-cliente/:id
router.post('/pasar-a-cliente/:id', [auth, esProspector], async (req, res) => {
    try {
        const { notas } = req.body;
        const clienteId = parseInt(req.params.id);
        const prospectorId = parseInt(req.usuario.id);

        const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
        if (!cliente) {
            return res.status(404).json({ msg: 'Prospecto no encontrado' });
        }

        if (cliente.prospectorAsignado !== prospectorId) {
            return res.status(403).json({ msg: 'No tienes permiso para modificar este prospecto' });
        }

        const now = new Date().toISOString();

        // Registrar la actividad de conversión
        db.prepare(`
            INSERT INTO actividades (tipo, vendedor, cliente, fecha, descripcion, resultado, notas)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('prospecto', prospectorId, clienteId, now, 'Prospecto convertido a cliente', 'exitoso', notas || 'Convertido a cliente');

        // Actualizar etapa del prospecto
        const hist = cliente.historialEmbudo ? JSON.parse(cliente.historialEmbudo) : [];
        hist.push({ etapa: 'venta_ganada', fecha: now, vendedor: prospectorId });

        db.prepare('UPDATE clientes SET etapaEmbudo = ?, estado = ?, fechaUltimaEtapa = ?, ultimaInteraccion = ?, historialEmbudo = ? WHERE id = ?')
            .run('venta_ganada', 'ganado', now, now, JSON.stringify(hist), clienteId);

        res.json({ msg: '✓ Prospecto convertido a cliente' });
    } catch (error) {
        console.error('Error al pasar a cliente:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

// POST /api/prospector/descartar-prospecto/:id
router.post('/descartar-prospecto/:id', [auth, esProspector], async (req, res) => {
    try {
        const { notas } = req.body;
        const clienteId = parseInt(req.params.id);
        const prospectorId = parseInt(req.usuario.id);

        const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
        if (!cliente) {
            return res.status(404).json({ msg: 'Prospecto no encontrado' });
        }

        if (cliente.prospectorAsignado !== prospectorId) {
            return res.status(403).json({ msg: 'No tienes permiso para modificar este prospecto' });
        }

        const now = new Date().toISOString();

        // Registrar la actividad de descarte
        db.prepare(`
            INSERT INTO actividades (tipo, vendedor, cliente, fecha, descripcion, resultado, notas)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('prospecto', prospectorId, clienteId, now, 'Prospecto descartado', 'fallido', notas || 'Descartado');

        // Actualizar etapa del prospecto
        const hist = cliente.historialEmbudo ? JSON.parse(cliente.historialEmbudo) : [];
        hist.push({ etapa: 'perdido', fecha: now, vendedor: prospectorId });

        db.prepare('UPDATE clientes SET etapaEmbudo = ?, fechaUltimaEtapa = ?, ultimaInteraccion = ?, historialEmbudo = ? WHERE id = ?')
            .run('perdido', now, now, JSON.stringify(hist), clienteId);

        res.json({ msg: '✓ Prospecto descartado' });
    } catch (error) {
        console.error('Error al descartar prospecto:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

// GET /api/prospector/estadisticas - Estadísticas detalladas del prospector
router.get('/estadisticas', [auth, esProspector], async (req, res) => {
    try {
        const prospectorId = parseInt(req.usuario.id);
        const ahora = new Date();

        // Función auxiliar para obtener actividades en un período
        const getActividades = (inicio, fin) => {
            const actividades = db.prepare(`
                SELECT * FROM actividades WHERE vendedor = ? AND fecha >= ? AND fecha < ?
            `).all(prospectorId, inicio.toISOString(), fin.toISOString());
            return actividades || [];
        };

        // Períodos
        const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
        const inicioSemana = new Date(ahora);
        inicioSemana.setDate(ahora.getDate() - ahora.getDay());
        inicioSemana.setHours(0, 0, 0, 0);

        const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        const inicioMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
        const finMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59);

        // Clientes totales
        const ClientesTotales = db.prepare('SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ?').get(prospectorId).c || 0;
        const clientesHoy = db.prepare('SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? AND date(fechaRegistro) = date(?)')
            .get(prospectorId, hoy.toISOString()).c || 0;

        // Actividades hoy
        const actividadesHoy = getActividades(hoy, new Date(hoy.getTime() + 24 * 60 * 60 * 1000));
        const llamadasHoy = actividadesHoy.filter(a => a.tipo === 'llamada').length;
        const llamadasExitosasHoy = actividadesHoy.filter(a => a.tipo === 'llamada' && a.resultado === 'exitoso').length;

        // Actividades semana
        const inicioSemanaFin = new Date(inicioSemana.getTime() + 7 * 24 * 60 * 60 * 1000);
        const actividadesSemana = getActividades(inicioSemana, inicioSemanaFin);
        const llamadasSemana = actividadesSemana.filter(a => a.tipo === 'llamada').length;
        const llamadasExitosasSemana = actividadesSemana.filter(a => a.tipo === 'llamada' && a.resultado === 'exitoso').length;

        // Actividades mes
        const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59);
        const actividadesMes = getActividades(inicioMes, finMes);
        const llamadasMes = actividadesMes.filter(a => a.tipo === 'llamada').length;
        const llamadasExitosasMes = actividadesMes.filter(a => a.tipo === 'llamada' && a.resultado === 'exitoso').length;

        // Actividades mes anterior
        const actividadesMesAnterior = getActividades(inicioMesAnterior, finMesAnterior);
        const llamadasMesAnterior = actividadesMesAnterior.filter(a => a.tipo === 'llamada').length;

        // Citas agendadas
        const citasAgendadasMes = db.prepare(`
            SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? 
            AND etapaEmbudo = 'reunion_agendada' AND date(fechaUltimaEtapa) >= date(?) AND date(fechaUltimaEtapa) <= date(?)
        `).get(prospectorId, inicioMes.toISOString(), finMes.toISOString()).c || 0;

        const citasAgendadasMesAnterior = db.prepare(`
            SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? 
            AND etapaEmbudo = 'reunion_agendada' AND date(fechaUltimaEtapa) >= date(?) AND date(fechaUltimaEtapa) <= date(?)
        `).get(prospectorId, inicioMesAnterior.toISOString(), finMesAnterior.toISOString()).c || 0;

        // Transferencias
        const transferidosMes = db.prepare(`
            SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? 
            AND closerAsignado IS NOT NULL AND date(fechaTransferencia) >= date(?) AND date(fechaTransferencia) <= date(?)
        `).get(prospectorId, inicioMes.toISOString(), finMes.toISOString()).c || 0;

        // Distribución actual
        const distribucion = {
            prospecto_nuevo: db.prepare('SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? AND etapaEmbudo = ?').get(prospectorId, 'prospecto_nuevo').c || 0,
            en_contacto: db.prepare('SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? AND etapaEmbudo = ?').get(prospectorId, 'en_contacto').c || 0,
            reunion_agendada: db.prepare('SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? AND etapaEmbudo = ?').get(prospectorId, 'reunion_agendada').c || 0,
            transferidos: db.prepare('SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? AND closerAsignado IS NOT NULL').get(prospectorId).c || 0
        };

        // Tasas de conversión
        const tasaContactoMes = llamadasMes > 0 ? ((llamadasExitosasMes / llamadasMes) * 100).toFixed(1) : 0;
        const tasaAgendamiento = llamadasExitosasMes > 0 ? ((citasAgendadasMes / llamadasExitosasMes) * 100).toFixed(1) : 0;

        // Comparación con mes anterior
        const variacionLlamadas = llamadasMesAnterior > 0
            ? (((llamadasMes - llamadasMesAnterior) / llamadasMesAnterior) * 100).toFixed(1)
            : llamadasMes > 0 ? 100 : 0;
        const variacionCitas = citasAgendadasMesAnterior > 0
            ? (((citasAgendadasMes - citasAgendadasMesAnterior) / citasAgendadasMesAnterior) * 100).toFixed(1)
            : citasAgendadasMes > 0 ? 100 : 0;

        // Rendimiento semanal (últimas 4 semanas)
        const rendimientoSemanal = [];
        for (let i = 3; i >= 0; i--) {
            const inicioSemanaI = new Date(ahora);
            inicioSemanaI.setDate(ahora.getDate() - ahora.getDay() - (i * 7));
            inicioSemanaI.setHours(0, 0, 0, 0);

            const finSemanaI = new Date(inicioSemanaI);
            finSemanaI.setDate(inicioSemanaI.getDate() + 6);
            finSemanaI.setHours(23, 59, 59, 999);

            const actividadesSemanaI = getActividades(inicioSemanaI, finSemanaI);
            const llamadasSemanaI = actividadesSemanaI.filter(a => a.tipo === 'llamada').length;
            const contactosSemanaI = actividadesSemanaI.filter(a => a.tipo === 'llamada' && a.resultado === 'exitoso').length;
            const citasSemanaI = db.prepare(`
                SELECT COUNT(*) as c FROM clientes WHERE prospectorAsignado = ? 
                AND etapaEmbudo = 'reunion_agendada' AND fechaUltimaEtapa >= ? AND fechaUltimaEtapa <= ?
            `).get(prospectorId, inicioSemanaI.toISOString(), finSemanaI.toISOString()).c || 0;

            const semanaNum = i + 1;
            const fecha = new Date(inicioSemanaI);
            rendimientoSemanal.push({
                semana: `Sem ${semanaNum}`,
                fecha: fecha.toISOString().split('T')[0],
                llamadas: llamadasSemanaI,
                contactos: contactosSemanaI,
                agendadas: citasSemanaI,
                tasaContacto: llamadasSemanaI > 0 ? ((contactosSemanaI / llamadasSemanaI) * 100).toFixed(1) : 0
            });
        }

        res.json({
            resumen: {
                totalClientes: ClientesTotales,
                clientesNuevosHoy: clientesHoy,
                transferidosMes
            },
            metricas: {
                hoy: {
                    llamadas: llamadasHoy,
                    exitosas: llamadasExitosasHoy,
                    tasaContacto: llamadasHoy > 0 ? ((llamadasExitosasHoy / llamadasHoy) * 100).toFixed(1) : 0
                },
                semana: {
                    llamadas: llamadasSemana,
                    exitosas: llamadasExitosasSemana,
                    tasaContacto: llamadasSemana > 0 ? ((llamadasExitosasSemana / llamadasSemana) * 100).toFixed(1) : 0
                },
                mes: {
                    llamadas: llamadasMes,
                    exitosas: llamadasExitosasMes,
                    citas: citasAgendadasMes,
                    tasaContacto: parseFloat(tasaContactoMes),
                    tasaAgendamiento: parseFloat(tasaAgendamiento)
                }
            },
            distribucion,
            variacion: {
                llamadas: parseFloat(variacionLlamadas),
                citas: parseFloat(variacionCitas)
            },
            rendimientoSemanal
        });
    } catch (error) {
        console.error('Error en estadísticas prospector:', error);
        res.status(500).json({ msg: 'Error del servidor' });
    }
});

module.exports = router;

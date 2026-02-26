const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const { google } = require('googleapis');
const db = require('../config/database');
const { auth } = require('../middleware/auth');

const oAuth2Client = new OAuth2Client(
    process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'postmessage'
);

// @route   POST api/google/save-tokens
// @desc    Intercambia código por tokens y los guarda para el usuario autenticado
// @access  Private
router.post('/save-tokens', auth, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ msg: 'Código no proporcionado' });

        const { tokens } = await oAuth2Client.getToken(code);

        const userId = parseInt(req.usuario.id);
        const updates = [];
        const params = [];

        if (tokens.refresh_token) {
            updates.push('googleRefreshToken = ?');
            params.push(tokens.refresh_token);
        }
        if (tokens.access_token) {
            updates.push('googleAccessToken = ?');
            params.push(tokens.access_token);
        }
        if (tokens.expiry_date) {
            updates.push('googleTokenExpiry = ?');
            params.push(tokens.expiry_date);
        }

        if (updates.length > 0) {
            params.push(userId);
            db.prepare(`UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        }

        res.json({ msg: 'Tokens guardados con éxito' });
    } catch (error) {
        console.error('Error al guardar tokens:', error);
        res.status(500).json({ msg: 'Error al vincular cuenta de Google' });
    }
});

// @route   GET api/google/freebusy/:closerId
// @desc    Obtiene disponibilidad (freebusy) del closer
// @access  Private
router.get('/freebusy/:closerId', auth, async (req, res) => {
    try {
        const closerId = parseInt(req.params.closerId);
        const closer = db.prepare('SELECT email, googleRefreshToken, googleAccessToken, googleTokenExpiry FROM usuarios WHERE id = ?').get(closerId);

        if (!closer) return res.status(404).json({ msg: 'Closer no encontrado' });
        if (!closer.googleRefreshToken && !closer.googleAccessToken) {
            return res.status(400).json({ msg: 'Closer no ha vinculado Google Calendar', notLinked: true });
        }

        // Configurar cliente con credenciales actuales
        const client = new OAuth2Client(
            process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );

        client.setCredentials({
            refresh_token: closer.googleRefreshToken,
            access_token: closer.googleAccessToken,
            expiry_date: closer.googleTokenExpiry
        });

        // Verificar si necesita refresh (auth-library handlea auto-refresh si hay refresh_token)
        // Para estar seguros, forzamos el token si se renueva:
        client.on('tokens', (tokens) => {
            let updateStr = [];
            let params = [];
            if (tokens.refresh_token) { updateStr.push('googleRefreshToken = ?'); params.push(tokens.refresh_token); }
            if (tokens.access_token) { updateStr.push('googleAccessToken = ?'); params.push(tokens.access_token); }
            if (tokens.expiry_date) { updateStr.push('googleTokenExpiry = ?'); params.push(tokens.expiry_date); }

            if (updateStr.length > 0) {
                params.push(closerId);
                db.prepare(`UPDATE usuarios SET ${updateStr.join(', ')} WHERE id = ?`).run(...params);
            }
        });

        const { timeMin, timeMax } = req.query;
        if (!timeMin || !timeMax) return res.status(400).json({ msg: 'Faltan parámetros timeMin o timeMax' });

        const { google } = require('googleapis');
        const calendar = google.calendar({ version: 'v3', auth: client });

        const response = await calendar.freebusy.query({
            requestBody: {
                timeMin: timeMin,
                timeMax: timeMax,
                items: [{ id: 'primary' }]
            }
        });

        // Deshabilitar cache de manera explícita para asegurar que siempre traiga lo más reciente
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.json(response.data);

    } catch (error) {
        console.error('Error en freebusy:', error);
        res.status(500).json({ msg: 'Error consultando calendario de Google' });
    }
});

// @route   GET api/google/events
// @desc    Obtiene eventos del calendario del usuario autenticado
// @access  Private
router.get('/events', auth, async (req, res) => {
    try {
        const userId = parseInt(req.usuario.id);
        const user = db.prepare('SELECT googleRefreshToken, googleAccessToken, googleTokenExpiry FROM usuarios WHERE id = ?').get(userId);

        if (!user || (!user.googleRefreshToken && !user.googleAccessToken)) {
            return res.status(400).json({ msg: 'No se ha vinculado Google Calendar', notLinked: true });
        }

        const client = new OAuth2Client(
            process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );

        client.setCredentials({
            refresh_token: user.googleRefreshToken,
            access_token: user.googleAccessToken,
            expiry_date: user.googleTokenExpiry
        });

        client.on('tokens', (tokens) => {
            let updateStr = [];
            let params = [];
            if (tokens.refresh_token) { updateStr.push('googleRefreshToken = ?'); params.push(tokens.refresh_token); }
            if (tokens.access_token) { updateStr.push('googleAccessToken = ?'); params.push(tokens.access_token); }
            if (tokens.expiry_date) { updateStr.push('googleTokenExpiry = ?'); params.push(tokens.expiry_date); }

            if (updateStr.length > 0) {
                params.push(userId);
                db.prepare(`UPDATE usuarios SET ${updateStr.join(', ')} WHERE id = ?`).run(...params);
            }
        });

        const { timeMin, timeMax } = req.query;
        if (!timeMin || !timeMax) return res.status(400).json({ msg: 'Faltan parámetros timeMin o timeMax' });

        const { google } = require('googleapis');
        const calendar = google.calendar({ version: 'v3', auth: client });

        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: timeMin,
            timeMax: timeMax,
            singleEvents: true,
            orderBy: 'startTime'
        });

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.json(response.data.items || []);

    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ msg: 'Error al consultar eventos', error: error.message });
    }
});

// @route   POST api/google/create-event
// @desc    Crea un evento en el Google Calendar del usuario autenticado
// @access  Private
router.post('/create-event', auth, async (req, res) => {
    try {
        const userId = parseInt(req.usuario.id);
        const user = db.prepare('SELECT googleRefreshToken, googleAccessToken, googleTokenExpiry FROM usuarios WHERE id = ?').get(userId);

        if (!user || (!user.googleRefreshToken && !user.googleAccessToken)) {
            return res.status(400).json({ msg: 'No se ha vinculado Google Calendar', notLinked: true });
        }

        const { title, startDateTime, endDateTime, description, clienteId } = req.body;
        if (!title || !startDateTime || !endDateTime) {
            return res.status(400).json({ msg: 'title, startDateTime y endDateTime son requeridos' });
        }

        const client = new OAuth2Client(
            process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );

        client.setCredentials({
            refresh_token: user.googleRefreshToken,
            access_token: user.googleAccessToken,
            expiry_date: user.googleTokenExpiry
        });

        client.on('tokens', (tokens) => {
            const updateStr = [];
            const params = [];
            if (tokens.refresh_token) { updateStr.push('googleRefreshToken = ?'); params.push(tokens.refresh_token); }
            if (tokens.access_token) { updateStr.push('googleAccessToken = ?'); params.push(tokens.access_token); }
            if (tokens.expiry_date) { updateStr.push('googleTokenExpiry = ?'); params.push(tokens.expiry_date); }
            if (updateStr.length > 0) {
                params.push(userId);
                db.prepare(`UPDATE usuarios SET ${updateStr.join(', ')} WHERE id = ?`).run(...params);
            }
        });

        const { google } = require('googleapis');
        const calendar = google.calendar({ version: 'v3', auth: client });

        const event = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: {
                summary: title,
                description: description || '',
                start: { dateTime: startDateTime, timeZone: 'America/Mexico_City' },
                end: { dateTime: endDateTime, timeZone: 'America/Mexico_City' },
                conferenceData: {
                    createRequest: { requestId: `meet-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } }
                }
            },
            conferenceDataVersion: 1
        });

        // Si hay clienteId, registrar la cita en actividades
        if (clienteId) {
            const cid = parseInt(clienteId);
            const now = new Date().toISOString();
            try {
                db.prepare('INSERT INTO actividades (tipo, vendedor, cliente, fecha, descripcion, resultado, notas) VALUES (?, ?, ?, ?, ?, ?, ?)')
                    .run('cita', userId, cid, new Date(startDateTime).toISOString(), `Próxima reunión agendada: ${title}`, 'pendiente', description || '');
                db.prepare('UPDATE clientes SET ultimaInteraccion = ? WHERE id = ?').run(now, cid);
            } catch (dbErr) {
                console.error('Error registrando actividad:', dbErr);
            }
        }

        res.status(201).json({
            msg: 'Evento creado exitosamente',
            eventId: event.data.id,
            htmlLink: event.data.htmlLink,
            meetLink: event.data.hangoutLink
        });
    } catch (error) {
        console.error('Error al crear evento:', error);
        res.status(500).json({ msg: 'Error al crear evento en Google Calendar', error: error.message });
    }
});

// @route   PATCH api/google/mark-completed/:eventId
// @desc    Marca un evento como completado en Google Calendar
// @access  Private
router.patch('/mark-completed/:eventId', auth, async (req, res) => {
    try {
        const { eventId } = req.params;
        const { resultado, notas, clienteNombre } = req.body;

        if (!resultado) {
            return res.status(400).json({ msg: 'Resultado es requerido' });
        }

        const userId = parseInt(req.usuario.id);
        const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(userId);

        if (!usuario || !usuario.googleAccessToken) {
            console.warn(`⚠️ Usuario ${userId} no tiene googleAccessToken`);
            return res.status(400).json({ msg: 'No hay token de Google Calendar disponible' });
        }

        // Configurar cliente OAuth con tokens del usuario
        oAuth2Client.setCredentials({
            access_token: usuario.googleAccessToken,
            refresh_token: usuario.googleRefreshToken,
            expiry_date: usuario.googleTokenExpiry
        });

        // Obtener el evento actual
        const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

        let event;
        try {
            const getRes = await calendar.events.get({
                calendarId: 'primary',
                eventId: eventId
            });
            event = getRes;
        } catch (getErr) {
            console.error(`❌ Error obteniendo evento ${eventId}:`, getErr.message);
            return res.status(400).json({ msg: 'No se encontró el evento en Google Calendar', eventId });
        }

        // Mapeo de descripciones por resultado
        const descripcionesResultado = {
            no_asistio: 'RESULTADO: ❌ Cliente no asistió',
            no_venta: 'RESULTADO: 😐 Reunión realizada - No le interesó',
            otra_reunion: 'RESULTADO: 🔄 Reunión realizada - Quiere otra reunión',
            cotizacion: 'RESULTADO: 💰 Reunión realizada - Quiere cotización',
            venta: 'RESULTADO: 🎉 ¡VENTA CERRADA!'
        };

        const descripcionResultado = descripcionesResultado[resultado] || `RESULTADO: ${resultado}`;

        // Construir descripción actualizada
        let nuevaDescripcion = event.data.description || '';

        // Si ya tiene un resultado previo, removerlo
        nuevaDescripcion = nuevaDescripcion.replace(/RESULTADO:.*$/m, '').trim();

        // Agregar nuevo resultado
        nuevaDescripcion = `${nuevaDescripcion}\n\n${descripcionResultado}`;

        // Agregar notas si existen
        if (notas) {
            nuevaDescripcion += `\nNotas: ${notas}`;
        }

        // Construir título actualizado
        let nuevoTitulo = event.data.summary || '';

        // Si no tiene checkmark, agregarlo
        if (!nuevoTitulo.includes('✅')) {
            nuevoTitulo = `✅ ${nuevoTitulo}`;
        }

        console.log(`📝 Actualizando evento: ${nuevoTitulo}`);
        console.log(`   Resultado: ${resultado}`);

        // Actualizar evento en Google Calendar
        const updatedEvent = await calendar.events.update({
            calendarId: 'primary',
            eventId: eventId,
            resource: {
                summary: nuevoTitulo,
                description: nuevaDescripcion,
                colorId: '2' // Verde para completado
            }
        });

        console.log(`✅ Evento actualizado exitosamente: ${eventId}`);

        res.json({
            msg: 'Evento actualizado en Google Calendar',
            updated: true,
            eventLink: updatedEvent.data.htmlLink
        });

    } catch (error) {
        console.error('❌ Error al actualizar evento en Google Calendar:', error.message);
        console.error('Stack:', error.stack);
        // No fallar si hay error con Google Calendar, ya se registró en BD
        res.status(500).json({
            msg: 'Advertencia: No se pudo sincronizar con Google Calendar, pero se guardó en la BD',
            error: error.message
        });
    }
});

module.exports = router;

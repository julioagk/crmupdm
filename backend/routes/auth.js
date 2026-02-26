const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { auth } = require('../middleware/auth');

// @route   POST api/auth/login
// @desc    Autenticar usuario y obtener token
// @access  Public
router.post('/login', async (req, res) => {
    try {
        const { usuario, contraseña } = req.body;

        if (!usuario || !contraseña) {
            return res.status(400).json({ mensaje: 'Por favor ingrese usuario y contraseña' });
        }

        const row = await db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario.trim());
        if (!row) {
            return res.status(400).json({ mensaje: 'Credenciales inválidas' });
        }

        if (!row.activo) {
            return res.status(401).json({ mensaje: 'Usuario desactivado. Contacte al administrador' });
        }

        const contraseñaValida = await bcrypt.compare(contraseña, row.contraseña);
        if (!contraseñaValida) {
            return res.status(400).json({ mensaje: 'Credenciales inválidas' });
        }

        // Crear Payload
        const payload = {
            id: row.id,
            rol: row.rol
        };

        // Firmar Token
        jwt.sign(
            payload,
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '7d' },
            (err, token) => {
                if (err) throw err;
                res.json({
                    token,
                    usuario: {
                        id: row.id,
                        usuario: row.usuario,
                        nombre: row.nombre,
                        rol: row.rol,
                        email: row.email,
                        telefono: row.telefono
                    }
                });
            }
        );
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ mensaje: 'Error del servidor' });
    }
});

// @route   GET api/auth/me
// @desc    Obtener usuario autenticado
// @access  Private
router.get('/me', auth, async (req, res) => {
    try {
        const user = await db.prepare('SELECT id, usuario, nombre, rol, email, telefono, activo FROM usuarios WHERE id = ?').get(req.usuario.id);
        res.json(user);
    } catch (error) {
        console.error('Error en auth/me:', error);
        res.status(500).json({ mensaje: 'Error del servidor' });
    }
});

module.exports = router;

/**
 * Autenticación de estudiantes.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const config = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

const router = express.Router();

// Limita los intentos de login para prevenir fuerza bruta
const loginLimiter = rateLimit({
  windowMs: config.security.loginRateLimit.windowMs,
  max: config.security.loginRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados intentos de inicio de sesión. Intente más tarde.' },
});

router.post(
  '/login',
  loginLimiter,
  [
    body('usuario').trim().notEmpty().withMessage('El usuario es obligatorio'),
    body('clave').notEmpty().withMessage('La contraseña es obligatoria'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { usuario, clave } = req.body;

    const [rows] = await pool.execute(
      'SELECT id, dni, nombre, programa, programa_id, semestre_actual, email_corporativo FROM estudiantes WHERE usuario = ? AND clave = ?',
      [usuario, clave]
    );

    if (rows.length > 0) {
      logger.info(`Login exitoso para usuario: ${usuario}`);
      return res.json({ message: 'Login exitoso', data: rows[0] });
    }

    logger.warn(`Intento de login fallido para usuario: ${usuario}`);
    return res.status(401).json({ message: 'Credenciales inválidas' });
  })
);

module.exports = router;

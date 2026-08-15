/**
 * Autenticación de estudiantes.
 *
 * El login verifica la contraseña con bcrypt (migra automáticamente las
 * contraseñas legadas en texto plano al primer acceso exitoso) y devuelve
 * un token JWT junto con los datos del estudiante.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const config = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const { hashPassword, verifyPassword, signToken } = require('../services/auth.service');

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
      'SELECT id, dni, nombre, programa, programa_id, semestre_actual, email_corporativo, clave FROM estudiantes WHERE usuario = ?',
      [usuario]
    );

    if (rows.length === 0) {
      logger.warn(`Intento de login fallido para usuario: ${usuario}`);
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const student = rows[0];

    const { valid, migrated } = await verifyPassword(clave, student.clave);
    if (!valid) {
      logger.warn(`Intento de login fallido para usuario: ${usuario}`);
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // Migra contraseñas legadas (texto plano) a hash bcrypt
    if (migrated) {
      const hash = await hashPassword(clave);
      await pool.execute('UPDATE estudiantes SET clave = ? WHERE id = ?', [hash, student.id]);
      logger.info(`Contraseña migrada a bcrypt para el usuario: ${usuario}`);
    }

    const token = signToken({
      id: student.id,
      dni: student.dni,
      nombre: student.nombre,
      programa: student.programa,
    });

    logger.info(`Login exitoso para usuario: ${usuario}`);
    return res.json({
      message: 'Login exitoso',
      token,
      data: {
        id: student.id,
        dni: student.dni,
        nombre: student.nombre,
        programa: student.programa,
        programa_id: student.programa_id,
        semestre_actual: student.semestre_actual,
        email_corporativo: student.email_corporativo,
      },
    });
  })
);

module.exports = router;

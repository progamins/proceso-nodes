/**
 * Servicio de autenticación: hashing de contraseñas con bcrypt y
 * firma/verificación de tokens JWT.
 *
 * El login admite contraseñas legadas en texto plano: al primer inicio de
 * sesión exitoso se migran automáticamente a un hash bcrypt.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');

const BCRYPT_PREFIX = /^\$2[aby]\$\d{2}\$/;

/** ¿El valor almacenado ya es un hash bcrypt? */
function isBcryptHash(value) {
  return typeof value === 'string' && BCRYPT_PREFIX.test(value);
}

/** Genera un hash bcrypt para una contraseña en texto plano. */
function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, config.auth.bcryptRounds);
}

/**
 * Verifica una contraseña contra el valor almacenado.
 * @returns {Promise<{ valid: boolean, migrated?: boolean }>}
 *   - `valid`: true si la contraseña coincide.
 *   - `migrated`: true si era texto plano, coincidía y conviene guardar el hash.
 */
async function verifyPassword(plainPassword, stored) {
  if (isBcryptHash(stored)) {
    const valid = await bcrypt.compare(plainPassword, stored);
    return { valid };
  }

  // Legado: comparación directa en texto plano
  const valid = plainPassword === stored;
  return { valid, migrated: valid };
}

/** Firma un token JWT con los datos del estudiante autenticado. */
function signToken(payload) {
  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn,
  });
}

/** Verifica un token JWT y devuelve su payload (o lanza un error). */
function verifyToken(token) {
  return jwt.verify(token, config.auth.jwtSecret);
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, isBcryptHash };

/**
 * Middleware de autenticación JWT.
 *
 * Espera un header `Authorization: Bearer <token>` y, si es válido,
 * adjunta el payload del token en `req.user` y continúa. Si falta o
 * es inválido responde 401.
 */
const { verifyToken } = require('../services/auth.service');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';

  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Token de autenticación no proporcionado' });
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
}

module.exports = { requireAuth };

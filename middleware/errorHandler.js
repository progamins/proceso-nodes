/**
 * Middlewares de manejo de errores.
 */
const logger = require('../utils/logger');

/**
 * Middleware 404: responde JSON cuando ninguna ruta coincide.
 */
function notFound(req, res) {
  res.status(404).json({
    message: 'Ruta no encontrada',
    path: req.originalUrl,
  });
}

/**
 * Middleware de errores: registra con Winston y responde JSON.
 * No filtra mensajes de error en desarrollo para facilitar la depuración.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isMulterError = err.name === 'MulterError';
  const status = isMulterError ? 400 : err.status || 500;

  if (status >= 500) {
    logger.error(err);
  }

  res.status(status).json({
    message: err.message || 'Error interno del servidor',
    ...(status >= 500 && process.env.NODE_ENV !== 'production'
      ? { stack: err.stack }
      : {}),
  });
}

module.exports = { notFound, errorHandler };

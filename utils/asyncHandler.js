/**
 * Envuelve un handler asíncrono y reenvía cualquier error
 * al middleware de manejo de errores de Express.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;

/**
 * Logger de la aplicación basado en Winston.
 *
 * En desarrollo escribe en consola; en producción además escribe
 * en archivos dentro de `logs/` (error.log y combined.log).
 */
const winston = require('winston');
const path = require('path');
const fs = require('fs');

const logDir = path.join(__dirname, '..', 'logs');
if (process.env.NODE_ENV === 'production') {
  fs.mkdirSync(logDir, { recursive: true });
}

const transports = [new winston.transports.Console()];

if (process.env.NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      return `${timestamp} [${level.toUpperCase()}] ${stack || message}`;
    })
  ),
  transports,
});

module.exports = logger;

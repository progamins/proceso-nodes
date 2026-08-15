/**
 * Pool de conexiones MySQL/MariaDB.
 *
 * El pool reutiliza conexiones, maneja tiempos de espera y libera
 * automáticamente las conexiones devueltas por los handlers.
 */
const mysql = require('mysql2/promise');
const config = require('./env');
const logger = require('../utils/logger');

const pool = mysql.createPool(config.db);

pool
  .getConnection()
  .then((conn) => {
    logger.info(
      `Conexión a MySQL establecida en ${config.db.host}:${config.db.port}/${config.db.database}`
    );
    conn.release();
  })
  .catch((err) => {
    logger.error('No se pudo conectar a la base de datos:', err.message);
  });

module.exports = pool;

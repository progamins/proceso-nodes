#!/usr/bin/env node
/**
 * Migra las contraseñas de estudiantes almacenadas en texto plano
 * a hashes bcrypt. Es idempotente: ignora los valores que ya son hashes.
 *
 * Uso: npm run migrate:passwords
 */
const pool = require('../config/db');
const logger = require('../utils/logger');
const { hashPassword, isBcryptHash } = require('../services/auth.service');

async function main() {
  const [rows] = await pool.execute('SELECT id, usuario, clave FROM estudiantes');

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.clave || isBcryptHash(row.clave)) {
      skipped++;
      continue;
    }

    const hash = await hashPassword(row.clave);
    await pool.execute('UPDATE estudiantes SET clave = ? WHERE id = ?', [hash, row.id]);
    migrated++;
    logger.info(`Contraseña migrada a bcrypt para: ${row.usuario || `id ${row.id}`}`);
  }

  logger.info(
    `Migración completada: ${migrated} migradas, ${skipped} ya en bcrypt o sin clave (${rows.length} en total)`
  );
  process.exit(0);
}

main().catch((err) => {
  logger.error('Error durante la migración:', err);
  process.exit(1);
});

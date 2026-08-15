/**
 * Horarios por programa de estudios.
 */
const express = require('express');
const axios = require('axios');
const pool = require('../config/db');
const config = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

/**
 * GET /horario/:programaId
 * Devuelve el horario más reciente del programa, verificando que el PDF exista.
 */
router.get(
  '/:programaId',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT
        h.horario_id, h.nombre, h.archivo, h.fecha_creacion,
        pe.nombre_programa AS programa_nombre
      FROM horarios h
      INNER JOIN programas_estudio pe ON h.programa_id = pe.programa_id
      WHERE h.programa_id = ?
      ORDER BY h.fecha_creacion DESC`,
      [req.params.programaId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'No se encontró horario para este programa de estudios',
      });
    }

    const horario = rows[0];
    // `archivo` puede venir con o sin el prefijo `uploads/`; evita duplicarlo
    const archivo = horario.archivo.replace(/^uploads\//, '');
    const horarioUrl = `${config.phpUrl}/uploads/${archivo}`;

    try {
      await axios.head(horarioUrl, { timeout: 5000 });
      res.json({
        message: 'Horario encontrado',
        data: { ...horario, url: horarioUrl },
      });
    } catch {
      res.status(404).json({
        message: 'El archivo PDF no está disponible',
        data: { ...horario, url: horarioUrl },
      });
    }
  })
);

module.exports = router;

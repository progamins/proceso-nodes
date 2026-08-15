/**
 * Justificaciones de inasistencias: creación (con imágenes) y consulta por DNI.
 */
const express = require('express');
const fs = require('fs');
const pool = require('../config/db');
const config = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const { uploadJustificacionImages, TEMP_UPLOADS_DIR } = require('../middleware/upload');
const { uploadImageToPhp } = require('../services/iestp.service');

const router = express.Router();

/**
 * POST /justificacion
 * Crea una justificación con hasta 2 imágenes (multipart: campos de texto + "imagenes").
 */
router.post(
  '/justificacion',
  uploadJustificacionImages.array('imagenes', config.uploads.maxImagesPerJustificacion),
  asyncHandler(async (req, res) => {
    const connection = await pool.getConnection();
    let uploadedFiles = req.files || [];

    try {
      await connection.beginTransaction();

      const fechaInicio = new Date(req.body.fecha_inicio);
      const fechaFin = new Date(req.body.fecha_fin);

      if (Number.isNaN(fechaInicio.getTime()) || Number.isNaN(fechaFin.getTime())) {
        return res.status(400).json({ message: 'Fechas inválidas' });
      }

      if (fechaFin < fechaInicio) {
        return res.status(400).json({
          message: 'La fecha de fin no puede ser anterior a la fecha de inicio',
        });
      }

      const [result] = await connection.execute(
        `INSERT INTO justificaciones (
          dni_estudiante, TipoJustificacionID, MotivoEstudiante,
          Fecha_Inicio, Fecha_Fin, Fecha_Justificacion, Estado
        ) VALUES (?, ?, ?, ?, ?, CURDATE(), 'Pendiente')`,
        [
          req.body.dni_estudiante,
          req.body.tipo_justificacion,
          req.body.motivo_estudiante,
          req.body.fecha_inicio,
          req.body.fecha_fin,
        ]
      );

      const justificacionId = result.insertId;

      // Sube cada imagen al servidor PHP y guarda la referencia en la BD
      for (const file of uploadedFiles) {
        const imageUrl = await uploadImageToPhp(file.path, file.originalname);

        await connection.execute(
          `INSERT INTO jimg (
            JustificacionID, NombreArchivo, RutaArchivo, FechaSubida, TipoArchivo
          ) VALUES (?, ?, ?, NOW(), ?)`,
          [justificacionId, file.originalname, imageUrl, file.mimetype]
        );
      }

      await connection.commit();
      logger.info(`Justificación ${justificacionId} creada para DNI ${req.body.dni_estudiante}`);

      res.status(201).json({
        message: 'Justificación creada exitosamente',
        data: { justificacionId, estado: 'Pendiente' },
      });
    } catch (error) {
      await connection.rollback();
      logger.error('Error creando justificación:', error);
      throw error;
    } finally {
      connection.release();
      // Limpia archivos temporales (éxito o error)
      for (const file of uploadedFiles) {
        fs.unlink(file.path, () => {});
      }
    }
  })
);

/**
 * GET /justificaciones/:dni
 * Historial de justificaciones del estudiante con sus imágenes.
 */
router.get(
  '/justificaciones/:dni',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT
        j.JustificacionID, j.Fecha_Justificacion, j.MotivoEstudiante,
        j.Fecha_Inicio, j.Fecha_Fin, j.Estado,
        tj.Nombre AS TipoJustificacion,
        GROUP_CONCAT(
          JSON_OBJECT(
            'id', i.ImagenID,
            'nombre', i.NombreArchivo,
            'url', i.RutaArchivo,
            'fecha', i.FechaSubida
          )
        ) AS imagenes
      FROM justificaciones j
      INNER JOIN tipos_justificacion tj ON j.TipoJustificacionID = tj.TipoJustificacionID
      LEFT JOIN jimg i ON j.JustificacionID = i.JustificacionID
      WHERE j.dni_estudiante = ?
      GROUP BY j.JustificacionID
      ORDER BY j.Fecha_Justificacion DESC`,
      [req.params.dni]
    );

    const justificaciones = rows.map((row) => ({
      ...row,
      imagenes: row.imagenes ? JSON.parse(`[${row.imagenes}]`) : [],
    }));

    res.json({
      message: 'Justificaciones obtenidas exitosamente',
      data: justificaciones,
    });
  })
);

module.exports = router;

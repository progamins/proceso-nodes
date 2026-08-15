/**
 * Endpoints de estudiantes: datos generales, notas, unidades didácticas,
 * código QR, imagen de perfil y actualización de datos.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const config = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const { PROFILE_IMAGES_DIR, uploadProfileImage } = require('../middleware/upload');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Campos permitidos para actualización por el propio estudiante
const ALLOWED_UPDATE_FIELDS = ['email', 'celular', 'direccion'];

/**
 * GET /estudiante/:dni
 * Datos completos del estudiante + unidades didácticas de su programa.
 */
router.get(
  '/:dni',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT
        e.nombre, e.programa, e.dni, e.email_corporativo, e.email, e.celular,
        e.direccion, e.semestre_actual, e.programa_id,
        q.qr_code_path,
        pa.periodo_id, pa.nombre AS periodo_nombre, pa.fecha_inicio, pa.fecha_fin
      FROM estudiantes e
      LEFT JOIN qr_codes q ON e.dni = q.dni_estudiante
      LEFT JOIN periodos_academicos pa ON pa.estado = 1
        AND CURRENT_TIMESTAMP BETWEEN pa.fecha_inicio AND pa.fecha_fin
      WHERE e.dni = ?`,
      [req.params.dni]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Estudiante no encontrado' });
    }

    const student = rows[0];

    const [unidadesRows] = await pool.execute(
      `SELECT
        ud.unidad_id, ud.nombre_unidad,
        ts.nombre_semestre, ts.descripcion AS semestre_descripcion
      FROM unidades_didacticas ud
      INNER JOIN tipo_semestre ts ON ud.semestre_id = ts.semestre_id
      WHERE ud.programa_id = ?
      ORDER BY ud.unidad_id`,
      [student.programa_id]
    );

    res.json({
      message: 'Datos del estudiante obtenidos',
      data: {
        nombre: student.nombre,
        programa: student.programa,
        dni: student.dni,
        programa_id: student.programa_id,
        semestre_actual: student.semestre_actual,
        correo_institucional: student.email_corporativo || 'No disponible',
        correo_personal: student.email || 'No disponible',
        telefonos: student.celular || 'No disponible',
        direccion: student.direccion || 'No disponible',
        periodo_academico: student.periodo_id
          ? {
              id: student.periodo_id,
              nombre: student.periodo_nombre,
              fecha_inicio: student.fecha_inicio,
              fecha_fin: student.fecha_fin,
            }
          : null,
        unidades_didacticas: unidadesRows,
      },
    });
  })
);

/**
 * GET /estudiante/:dni/notas
 * Notas del estudiante organizadas por unidad didáctica.
 */
router.get(
  '/:dni/notas',
  asyncHandler(async (req, res) => {
    const [estudianteRows] = await pool.execute(
      'SELECT id FROM estudiantes WHERE dni = ?',
      [req.params.dni]
    );

    if (estudianteRows.length === 0) {
      return res.status(404).json({ message: 'Estudiante no encontrado' });
    }

    const estudianteId = estudianteRows[0].id;

    const [notasRows] = await pool.execute(
      `SELECT
        n.id_nota, n.nota_promedio, n.nota_recuperacion, n.nota_final,
        i.indicador, ud.nombre_unidad, ud.unidad_id,
        pe.nombre_programa, pa.nombre AS periodo_nombre,
        pa.fecha_inicio AS periodo_inicio, pa.fecha_fin AS periodo_fin,
        rn.creditos, rn.horas_semanales, d.nombres AS nombre_docente,
        rn.turno, rn.seccion
      FROM notas n
      INNER JOIN indicadores i ON n.id_indicador = i.id_indicador
      INNER JOIN registro_notas rn ON n.id_nota = rn.id_nota
      INNER JOIN unidades_didacticas ud ON rn.id_unidad = ud.unidad_id
      INNER JOIN programas_estudio pe ON rn.id_programa = pe.programa_id
      INNER JOIN periodos_academicos pa ON rn.id_periodo = pa.periodo_id
      INNER JOIN docentes d ON rn.id_docente = d.id_docente
      WHERE n.id_estudiante = ?
      ORDER BY pa.fecha_inicio DESC, ud.nombre_unidad ASC`,
      [estudianteId]
    );

    const notasPorUnidad = notasRows.reduce((acc, nota) => {
      if (!acc[nota.unidad_id]) {
        acc[nota.unidad_id] = {
          unidad_didactica: nota.nombre_unidad,
          programa: nota.nombre_programa,
          periodo: {
            nombre: nota.periodo_nombre,
            fecha_inicio: nota.periodo_inicio,
            fecha_fin: nota.periodo_fin,
          },
          docente: nota.nombre_docente,
          creditos: nota.creditos,
          horas_semanales: nota.horas_semanales,
          turno: nota.turno,
          seccion: nota.seccion,
          indicadores: [],
        };
      }

      acc[nota.unidad_id].indicadores.push({
        nombre: nota.indicador,
        nota_promedio: nota.nota_promedio,
        nota_recuperacion: nota.nota_recuperacion,
        nota_final: nota.nota_final,
      });

      return acc;
    }, {});

    res.json({
      message: 'Notas obtenidas exitosamente',
      data: Object.values(notasPorUnidad),
    });
  })
);

/**
 * GET /estudiante/:dni/unidades-didacticas
 * Unidades didácticas del semestre actual del estudiante.
 */
router.get(
  '/:dni/unidades-didacticas',
  asyncHandler(async (req, res) => {
    const [estudianteRows] = await pool.execute(
      'SELECT programa_id, semestre_actual FROM estudiantes WHERE dni = ?',
      [req.params.dni]
    );

    if (estudianteRows.length === 0) {
      return res.status(404).json({ message: 'Estudiante no encontrado' });
    }

    const { programa_id, semestre_actual } = estudianteRows[0];

    if (!programa_id || !semestre_actual) {
      return res
        .status(400)
        .json({ message: 'El estudiante no tiene programa o semestre asignado' });
    }

    const [unidadesRows] = await pool.execute(
      `SELECT
        ud.unidad_id, ud.nombre_unidad,
        ts.nombre_semestre, ts.descripcion AS semestre_descripcion,
        pe.nombre_programa, pa.nombre AS periodo_nombre,
        pa.fecha_inicio, pa.fecha_fin
      FROM unidades_didacticas ud
      INNER JOIN tipo_semestre ts ON ud.semestre_id = ts.semestre_id
      INNER JOIN programas_estudio pe ON ud.programa_id = pe.programa_id
      INNER JOIN periodos_academicos pa ON ud.periodo_id = pa.periodo_id
      WHERE ud.programa_id = ? AND (ts.semestre_id = ? OR ts.nombre_semestre = ?)
      ORDER BY ud.nombre_unidad ASC`,
      [programa_id, semestre_actual, semestre_actual]
    );

    res.json({
      message: 'Unidades didácticas obtenidas con éxito',
      data: {
        semestre_actual,
        programa: unidadesRows.length > 0 ? unidadesRows[0].nombre_programa : null,
        periodo:
          unidadesRows.length > 0
            ? {
                nombre: unidadesRows[0].periodo_nombre,
                fecha_inicio: unidadesRows[0].fecha_inicio,
                fecha_fin: unidadesRows[0].fecha_fin,
              }
            : null,
        unidades_didacticas: unidadesRows.map((row) => ({
          id: row.unidad_id,
          nombre: row.nombre_unidad,
          semestre: {
            numero: row.nombre_semestre,
            descripcion: row.semestre_descripcion,
          },
        })),
      },
    });
  })
);

/**
 * GET /estudiante/:dni/qr_code
 * URL pública del código QR del estudiante.
 */
router.get(
  '/:dni/qr_code',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      'SELECT qr_code_path FROM qr_codes WHERE dni_estudiante = ?',
      [req.params.dni]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Estudiante no encontrado' });
    }

    const qrCodePath = rows[0].qr_code_path;
    if (!qrCodePath) {
      return res.status(404).json({ message: 'Código QR no encontrado' });
    }

    res.json({
      qr_code_url: `${config.phpUrl}/qr_codes/${path.basename(qrCodePath)}`,
    });
  })
);

/**
 * GET /estudiante/:dni/imagen
 * Imagen de perfil del estudiante (archivo local).
 */
router.get(
  '/:dni/imagen',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      'SELECT imagen_url FROM estudiantes WHERE dni = ?',
      [req.params.dni]
    );

    if (rows.length > 0 && rows[0].imagen_url) {
      const imagePath = path.join(PROFILE_IMAGES_DIR, rows[0].imagen_url);
      if (fs.existsSync(imagePath)) {
        return res.sendFile(imagePath);
      }
      return res.status(404).json({ message: 'Imagen no encontrada' });
    }

    return res.status(404).json({ message: 'Sin imagen de perfil' });
  })
);

/**
 * POST /estudiante/:dni/imagen
 * Actualiza la imagen de perfil del estudiante (multipart, campo "imagen").
 */
router.post(
  '/:dni/imagen',
  requireAuth,
  uploadProfileImage.single('imagen'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No se proporcionó una imagen' });
    }

    await pool.execute('UPDATE estudiantes SET imagen_url = ? WHERE dni = ?', [
      req.file.filename,
      req.params.dni,
    ]);

    res.status(200).json({
      message: 'Imagen de perfil actualizada correctamente',
      url: req.file.filename,
    });
  })
);

/**
 * PUT /estudiante/:dni/update
 * Actualiza un campo permitido del estudiante (email, celular, direccion).
 */
router.put(
  '/:dni/update',
  requireAuth,
  [body('field').notEmpty().withMessage('El campo es obligatorio')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { field, value } = req.body;

    if (!ALLOWED_UPDATE_FIELDS.includes(field)) {
      return res.status(400).json({
        message: `Campo no permitido para actualización: ${field}`,
      });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        `UPDATE estudiantes SET ${field} = ? WHERE dni = ?`,
        [value, req.params.dni]
      );

      const [rows] = await connection.execute(
        'SELECT email AS correo_personal, celular AS telefonos, direccion FROM estudiantes WHERE dni = ?',
        [req.params.dni]
      );

      if (rows.length === 0) {
        throw new Error('Estudiante no encontrado');
      }

      await connection.commit();
      res.json({ message: 'Campo actualizado correctamente', data: rows[0] });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

module.exports = router;

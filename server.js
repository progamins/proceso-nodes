const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs').promises;
const app = express();

// Base URL for PHP server
const PHP_URL = 'https://www.iestpasist.com';

// Create profile images directory if it doesn't exist
const PROFILE_IMAGES_DIR = path.join(__dirname, 'profile_images');
fs.mkdir(PROFILE_IMAGES_DIR, { recursive: true })
  .then(() => console.log('Profile images directory created'))
  .catch(console.error);

// MySQL Connection Pool Configuration
const pool = mysql.createPool({
  host: process.env.DB_HOST || '162.241.61.0',
  user: process.env.DB_USER || 'iestpasi_edwin',
  password: process.env.DB_PASSWORD || 'EDWINrosas774433)',
  database: process.env.DB_DATABASE || 'iestpasi_iestp',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
// Añade este endpoint de prueba en tu servidor
app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT 1 as test');
    res.json({ message: 'Database connection successful', data: rows });
  } catch (err) {
    res.status(500).json({ message: 'Database connection failed', error: err.message });
  }
});
// Multer configuration for profile images
const profileImageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PROFILE_IMAGES_DIR),
  filename: (req, file, cb) => {
    const dni = req.params.dni;
    const fileExt = path.extname(file.originalname);
    cb(null, `${dni}${fileExt}`);
  }
});
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = path.join(__dirname, 'temp_uploads');
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'));
    }
  }
}).array('imagenes', 2);

// Helper function to upload image to PHP server
async function uploadToIESTP(filePath, originalname) {
  try {
    const form = new FormData();
    const fileStream = await fs.readFile(filePath);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = uniqueSuffix + '-' + originalname;
    
    form.append('imagen', fileStream, {
      filename: filename,
      contentType: 'image/jpeg'
    });

    const response = await axios.post('https://iestpasist.com/upload.php', form, {
      headers: {
        ...form.getHeaders(),
      },
    });

    return `https://iestpasist.com/imagenesJ/${filename}`;
  } catch (error) {
    console.error('Error uploading to IESTP:', error);
    throw error;
  }
}

const uploadProfileImage = multer({ 
  storage: profileImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Only image files (jpeg, jpg, png) are allowed'));
  }
});

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'],
  credentials: true
}));

app.use(bodyParser.json());

// Helper function to upload image to PHP server
async function uploadImageToPhp(imageBuffer, originalname) {
  try {
    const formData = new FormData();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = uniqueSuffix + '-' + originalname;
    
    formData.append('imagen', imageBuffer, {
      filename: filename,
      contentType: 'image/jpeg'
    });

    const response = await axios.post(`${PHP_URL}/upload.php`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    return {
      success: true,
      filename: filename,
      url: `${PHP_URL}/imagenesJ/${filename}`
    };
  } catch (error) {
    console.error('Error uploading image:', error);
    throw new Error('Error uploading image to PHP server');
  }
}
// Get estudiante completo
app.get('/estudiante/:dni', async (req, res) => {
  try {
    // Primera consulta para obtener datos del estudiante
    const [rows] = await pool.execute(`
      SELECT 
        e.nombre, 
        e.programa, 
        e.dni, 
        e.email_corporativo, 
        e.email, 
        e.celular, 
        e.direccion,
        e.semestre_actual,
        e.programa_id,
        q.qr_code_path,
        pa.periodo_id,
        pa.nombre as periodo_nombre,
        pa.fecha_inicio,
        pa.fecha_fin
      FROM estudiantes e
      LEFT JOIN qr_codes q ON e.dni = q.dni_estudiante
      LEFT JOIN periodos_academicos pa ON pa.estado = 1 
        AND CURRENT_TIMESTAMP BETWEEN pa.fecha_inicio AND pa.fecha_fin
      WHERE e.dni = ?
    `, [req.params.dni]);

    if (rows.length > 0) {
      const student = rows[0];
      
      // Verificar que tenemos programa_id y semestre_actual
      if (!student.programa_id || !student.semestre_actual) {
        console.log('Falta programa_id o semestre_actual:', {
          programa_id: student.programa_id,
          semestre_actual: student.semestre_actual
        });
      }

      // Consulta modificada para unidades didácticas
      const [unidadesRows] = await pool.execute(`
        SELECT 
          ud.unidad_id,
          ud.nombre_unidad,
          ts.nombre_semestre,
          ts.descripcion as semestre_descripcion
        FROM unidades_didacticas ud
        INNER JOIN tipo_semestre ts ON ud.semestre_id = ts.semestre_id
        WHERE ud.programa_id = ?
        ORDER BY ud.unidad_id
      `, [student.programa_id]);

      console.log('Unidades encontradas:', unidadesRows.length);

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
          periodo_academico: student.periodo_id ? {
            id: student.periodo_id,
            nombre: student.periodo_nombre,
            fecha_inicio: student.fecha_inicio,
            fecha_fin: student.fecha_fin
          } : null,
          unidades_didacticas: unidadesRows
        }
      });
    } else {
      res.status(404).json({ message: 'Estudiante no encontrado' });
    }
  } catch (err) {
    console.error('Error en la consulta SQL:', err);
    res.status(500).json({ message: 'Error en el servidor', error: err.message });
  }
});
// Get student grades
app.get('/estudiante/:dni/notas', async (req, res) => {
  try {
    // Primero obtenemos el ID del estudiante basado en el DNI
    const [estudianteRows] = await pool.execute(
      'SELECT id FROM estudiantes WHERE dni = ?',
      [req.params.dni]
    );

    if (estudianteRows.length === 0) {
      return res.status(404).json({
        message: 'Estudiante no encontrado'
      });
    }

    const estudianteId = estudianteRows[0].id;

    // Obtenemos las notas con toda la información relacionada
    const [notasRows] = await pool.execute(`
      SELECT 
        n.id_nota,
        n.nota_promedio,
        n.nota_recuperacion,
        n.nota_final,
        i.indicador,
        ud.nombre_unidad,
        ud.unidad_id,
        pe.nombre_programa,
        pa.nombre as periodo_nombre,
        pa.fecha_inicio as periodo_inicio,
        pa.fecha_fin as periodo_fin,
        rn.creditos,
        rn.horas_semanales,
        d.nombres as nombre_docente,
        rn.turno,
        rn.seccion
      FROM notas n
      INNER JOIN indicadores i ON n.id_indicador = i.id_indicador
      INNER JOIN registro_notas rn ON n.id_nota = rn.id_nota
      INNER JOIN unidades_didacticas ud ON rn.id_unidad = ud.unidad_id
      INNER JOIN programas_estudio pe ON rn.id_programa = pe.programa_id
      INNER JOIN periodos_academicos pa ON rn.id_periodo = pa.periodo_id
      INNER JOIN docentes d ON rn.id_docente = d.id_docente
      WHERE n.id_estudiante = ?
      ORDER BY pa.fecha_inicio DESC, ud.nombre_unidad ASC
    `, [estudianteId]);

    // Organizamos las notas por unidad didáctica
    const notasPorUnidad = notasRows.reduce((acc, nota) => {
      if (!acc[nota.unidad_id]) {
        acc[nota.unidad_id] = {
          unidad_didactica: nota.nombre_unidad,
          programa: nota.nombre_programa,
          periodo: {
            nombre: nota.periodo_nombre,
            fecha_inicio: nota.periodo_inicio,
            fecha_fin: nota.periodo_fin
          },
          docente: nota.nombre_docente,
          creditos: nota.creditos,
          horas_semanales: nota.horas_semanales,
          turno: nota.turno,
          seccion: nota.seccion,
          indicadores: []
        };
      }

      acc[nota.unidad_id].indicadores.push({
        nombre: nota.indicador,
        nota_promedio: nota.nota_promedio,
        nota_recuperacion: nota.nota_recuperacion,
        nota_final: nota.nota_final
      });

      return acc;
    }, {});

    res.json({
      message: 'Notas obtenidas exitosamente',
      data: Object.values(notasPorUnidad)
    });

  } catch (error) {
    console.error('Error obteniendo notas:', error);
    res.status(500).json({
      message: 'Error al obtener las notas',
      error: error.message
    });
  }
});
// Endpoint para obtener unidades didácticas por semestre del estudiante
app.get('/estudiante/:dni/unidades-didacticas', async (req, res) => {
  try {
    // Primero obtenemos el programa_id y semestre_actual del estudiante
    const [estudianteRows] = await pool.execute(
      'SELECT programa_id, semestre_actual FROM estudiantes WHERE dni = ?',
      [req.params.dni]
    );

    if (estudianteRows.length === 0) {
      return res.status(404).json({
        message: 'Estudiante no encontrado'
      });
    }

    const { programa_id, semestre_actual } = estudianteRows[0];

    if (!programa_id || !semestre_actual) {
      return res.status(400).json({
        message: 'El estudiante no tiene programa o semestre asignado'
      });
    }

    // Obtenemos las unidades didácticas del semestre actual
    const [unidadesRows] = await pool.execute(`
      SELECT 
        ud.unidad_id,
        ud.nombre_unidad,
        ts.nombre_semestre,
        ts.descripcion as semestre_descripcion,
        pe.nombre_programa,
        pa.nombre as periodo_nombre,
        pa.fecha_inicio,
        pa.fecha_fin
      FROM unidades_didacticas ud
      INNER JOIN tipo_semestre ts ON ud.semestre_id = ts.semestre_id
      INNER JOIN programas_estudio pe ON ud.programa_id = pe.programa_id
      INNER JOIN periodos_academicos pa ON ud.periodo_id = pa.periodo_id
      WHERE ud.programa_id = ? 
      AND ts.semestre_id = ?
      ORDER BY ud.nombre_unidad ASC
    `, [programa_id, semestre_actual]);

    // Estructuramos la respuesta
    const response = {
      message: 'Unidades didácticas obtenidas con éxito',
      data: {
        semestre_actual,
        programa: unidadesRows.length > 0 ? unidadesRows[0].nombre_programa : null,
        periodo: unidadesRows.length > 0 ? {
          nombre: unidadesRows[0].periodo_nombre,
          fecha_inicio: unidadesRows[0].fecha_inicio,
          fecha_fin: unidadesRows[0].fecha_fin
        } : null,
        unidades_didacticas: unidadesRows.map(row => ({
          id: row.unidad_id,
          nombre: row.nombre_unidad,
          semestre: {
            numero: row.nombre_semestre,
            descripcion: row.semestre_descripcion
          }
        }))
      }
    };

    res.json(response);

  } catch (error) {
    console.error('Error obteniendo unidades didácticas:', error);
    res.status(500).json({
      message: 'Error al obtener las unidades didácticas',
      error: error.message
    });
  }
});
// Get QR code del estudiante
app.get('/estudiante/:dni/qr_code', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT qr_code_path FROM qr_codes WHERE dni_estudiante = ?',
      [req.params.dni]
    );

    if (rows.length > 0) {
      const qrCodePath = rows[0].qr_code_path;
      if (qrCodePath) {
        const qrCodeUrl = `${PHP_URL}/qr_codes/${path.basename(qrCodePath)}`;
        res.json({ qr_code_url: qrCodeUrl });
      } else {
        res.status(404).json({ message: 'Código QR no encontrado' });
      }
    } else {
      res.status(404).json({ message: 'Estudiante no encontrado' });
    }
  } catch (err) {
    console.error('Error obteniendo QR:', err);
    res.status(500).json({ message: 'Error en el servidor', error: err.message });
  }
});
// Login endpoint
app.post('/login', async (req, res) => {
  const { usuario, clave } = req.body;

  if (!usuario || !clave) {
    return res.status(400).send({ message: 'Username and password are required' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT * FROM estudiantes WHERE usuario = ? AND clave = ?',
      [usuario, clave]
    );

    if (rows.length > 0) {
      res.send({ message: 'Login successful', data: rows[0] });
    } else {
      res.status(401).send({ message: 'Invalid credentials' });
    }
  } catch (err) {
    res.status(500).send({ message: 'Server error', error: err.message });
  }
});

// Get student profile image
app.get('/estudiante/:dni/imagen', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT imagen_url FROM estudiantes WHERE dni = ?',
      [req.params.dni]
    );

    if (rows.length > 0 && rows[0].imagen_url) {
      const imagePath = path.join(PROFILE_IMAGES_DIR, rows[0].imagen_url);
      try {
        await fs.access(imagePath);
        res.sendFile(imagePath);
      } catch {
        res.status(404).json({ message: 'Image not found' });
      }
    } else {
      res.status(404).json({ message: 'No profile image' });
    }
  } catch (error) {
    console.error('Error getting profile image:', error);
    res.status(500).json({ message: 'Error getting profile image' });
  }
});

// Update profile image
app.post('/estudiante/:dni/imagen', uploadProfileImage.single('imagen'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image provided' });
    }

    await pool.execute(
      'UPDATE estudiantes SET imagen_url = ? WHERE dni = ?',
      [req.file.filename, req.params.dni]
    );

    res.status(200).json({ 
      message: 'Profile image updated successfully',
      url: req.file.filename
    });
  } catch (error) {
    console.error('Error uploading profile image:', error);
    res.status(500).json({ message: 'Error uploading profile image' });
  }
});

// Get student schedule
app.get('/horario/:programaId', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        h.horario_id,
        h.nombre,
        h.archivo,
        h.fecha_creacion,
        pe.nombre_programa as programa_nombre
      FROM horarios h
      INNER JOIN programas_estudio pe ON h.programa_id = pe.programa_id
      WHERE h.programa_id = ?
      ORDER BY h.fecha_creacion DESC
    `, [req.params.programaId]);

    if (rows.length > 0) {
      const horario = rows[0];
      const horarioUrl = `${PHP_URL}/uploads/${horario.archivo}`;

      try {
        await axios.head(horarioUrl);
        res.json({
          message: 'Schedule found',
          data: {
            ...horario,
            url: horarioUrl
          }
        });
      } catch (error) {
        res.status(404).json({
          message: 'PDF file not available',
          error: error.message
        });
      }
    } else {
      res.status(404).json({ 
        message: 'No schedule found for this study program'
      });
    }
  } catch (error) {
    console.error('Error getting schedule:', error);
    res.status(500).json({
      message: 'Error getting schedule',
      error: error.message
    });
  }
});

// Update student information
app.put('/estudiante/:dni/update', async (req, res) => {
  const { dni } = req.params;
  const { field, value } = req.body;
  const allowedFields = ['email', 'celular', 'direccion'];

  if (!allowedFields.includes(field)) {
    return res.status(400).json({
      message: `Field not allowed for update: ${field}`
    });
  }

  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        `UPDATE estudiantes SET ${field} = ? WHERE dni = ?`,
        [value, dni]
      );

      const [rows] = await connection.execute(
        'SELECT email as correo_personal, celular as telefonos, direccion FROM estudiantes WHERE dni = ?',
        [dni]
      );

      if (rows.length === 0) {
        throw new Error('Student not found');
      }

      await connection.commit();
      res.json({
        message: 'Field updated successfully',
        data: rows[0]
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error in update:', error);
    res.status(500).json({
      message: 'Error updating field',
      error: error.message
    });
  }
});

// POST endpoint for new justification
app.post('/justificacion', (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('Error en upload:', err);
      return res.status(400).json({
        message: 'Error al subir los archivos',
        error: err.message
      });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Validate dates
      const fechaInicio = new Date(req.body.fecha_inicio);
      const fechaFin = new Date(req.body.fecha_fin);

      if (fechaFin < fechaInicio) {
        throw new Error('La fecha de fin no puede ser anterior a la fecha de inicio');
      }

      // Insert justification record
      const [result] = await connection.execute(
        `INSERT INTO justificaciones (
          dni_estudiante,
          TipoJustificacionID,
          MotivoEstudiante,
          Fecha_Inicio,
          Fecha_Fin,
          Fecha_Justificacion,
          Estado
        ) VALUES (?, ?, ?, ?, ?, CURDATE(), 'Pendiente')`,
        [
          req.body.dni_estudiante,
          req.body.tipo_justificacion,
          req.body.motivo_estudiante,
          req.body.fecha_inicio,
          req.body.fecha_fin
        ]
      );

      const justificacionId = result.insertId;

      // Process and save images
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          try {
            // Upload to IESTP server
            const imageUrl = await uploadToIESTP(file.path, file.originalname);

            // Save image reference in database using lowercase table name
            await connection.execute(
              `INSERT INTO jimg (
                JustificacionID,
                NombreArchivo,
                RutaArchivo,
                FechaSubida,
                TipoArchivo
              ) VALUES (?, ?, ?, NOW(), ?)`,
              [
                justificacionId,
                file.originalname,
                imageUrl,
                file.mimetype
              ]
            );

            // Delete temporary file
            await fs.unlink(file.path);
          } catch (uploadError) {
            console.error('Error processing image:', uploadError);
            throw uploadError;
          }
        }
      }

      await connection.commit();

      res.status(201).json({
        message: 'Justificación creada exitosamente',
        data: {
          justificacionId,
          estado: 'Pendiente'
        }
      });

    } catch (error) {
      await connection.rollback();
      console.error('Error en la transacción:', error);
      res.status(500).json({
        message: 'Error al crear la justificación',
        error: error.message
      });
    } finally {
      connection.release();
      // Clean up any remaining temporary files
      if (req.files) {
        for (const file of req.files) {
          fs.unlink(file.path).catch(console.error);
        }
      }
    }
  });
});

// GET endpoint for student justifications
app.get('/justificaciones/:dni', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        j.JustificacionID,
        j.Fecha_Justificacion,
        j.MotivoEstudiante,
        j.Fecha_Inicio,
        j.Fecha_Fin,
        j.Estado,
        tj.Nombre as TipoJustificacion,
        GROUP_CONCAT(
          JSON_OBJECT(
            'id', i.ImagenID,
            'nombre', i.NombreArchivo,
            'url', i.RutaArchivo,
            'fecha', i.FechaSubida
          )
        ) as imagenes
      FROM justificaciones j
      INNER JOIN tipos_justificacion tj ON j.TipoJustificacionID = tj.TipoJustificacionID
      LEFT JOIN jimg i ON j.JustificacionID = i.JustificacionID
      WHERE j.dni_estudiante = ?
      GROUP BY j.JustificacionID
      ORDER BY j.Fecha_Justificacion DESC
    `, [req.params.dni]);

    const justificaciones = rows.map(row => ({
      ...row,
      imagenes: row.imagenes ? JSON.parse(`[${row.imagenes}]`) : []
    }));

    res.json({
      message: 'Justificaciones obtenidas exitosamente',
      data: justificaciones
    });

  } catch (error) {
    console.error('Error getting justifications:', error);
    res.status(500).json({
      message: 'Error al obtener las justificaciones',
      error: error.message
    });
  }
});
// Start server
const port = 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
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
const PHP_URL = 'https://www.iestpasist.com';

// Create directories if they don't exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PROFILE_IMAGES_DIR = path.join(__dirname, 'profile_images');
const JUSTIFICATION_DOCS_DIR = path.join(__dirname, 'justification_docs');

Promise.all([
  fs.mkdir(PROFILE_IMAGES_DIR, { recursive: true }),
  fs.mkdir(JUSTIFICATION_DOCS_DIR, { recursive: true }),
  fs.mkdir(UPLOADS_DIR, { recursive: true })
]).then(() => console.log('Directories created')).catch(console.error);

// MySQL Connection Pool Configuration
const pool = mysql.createPool({
  host: '162.241.61.0',
  user: 'iestpasi_edwin',
  password: 'EDWINrosas774433)',
  database: 'iestpasi_iestp',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Configure multer for different upload types
const storage = {
  profile: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PROFILE_IMAGES_DIR),
    filename: (req, file, cb) => {
      const dni = req.params.dni;
      const fileExt = path.extname(file.originalname);
      cb(null, `${dni}${fileExt}`);
    }
  }),
  justification: multer.diskStorage({
    destination: (req, file, cb) => cb(null, JUSTIFICATION_DOCS_DIR),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `${uniqueSuffix}-${file.originalname}`);
    }
  })
};

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const mimetype = allowedTypes.test(file.mimetype);
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  
  if (mimetype && extname) return cb(null, true);
  cb(new Error('Invalid file type. Only JPEG, JPG, PNG and PDF files are allowed'));
};

const uploads = {
  profile: multer({ 
    storage: storage.profile,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter
  }),
  justification: multer({ 
    storage: storage.justification,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter
  })
};

// CORS and body parser middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'],
  credentials: true
}));

app.use(bodyParser.json());

// Authentication middleware
const authenticateStudent = async (req, res, next) => {
  const dni = req.params.dni || req.body.dni;
  if (!dni) return res.status(401).json({ message: 'Authentication required' });

  try {
    const [rows] = await pool.execute(
      'SELECT id FROM estudiantes WHERE dni = ?',
      [dni]
    );
    if (rows.length === 0) return res.status(401).json({ message: 'Unauthorized' });
    req.studentId = rows[0].id;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ message: 'Server error during authentication' });
  }
};

// Login endpoint
app.post('/login', async (req, res) => {
  const { usuario, clave } = req.body;

  if (!usuario || !clave) {
    return res.status(400).json({ message: 'Usuario y contraseña son requeridos' });
  }

  try {
    const [rows] = await pool.execute(`
      SELECT e.*, pe.nombre_programa, c.id as carnet_id, qr.qr_code_path
      FROM estudiantes e
      LEFT JOIN programas_estudio pe ON e.programa_id = pe.programa_id
      LEFT JOIN carnet c ON e.dni = c.dni
      LEFT JOIN qr_codes qr ON e.dni = qr.dni_estudiante
      WHERE e.usuario = ? AND e.clave = ?
    `, [usuario.trim(), clave.trim()]);

    if (rows.length > 0) {
      const userData = {
        id: rows[0].id,
        dni: rows[0].dni,
        nombre: rows[0].nombre,
        email: rows[0].email,
        programa: rows[0].nombre_programa,
        carnet_id: rows[0].carnet_id,
        qr_code: rows[0].qr_code_path
      };

      res.json({
        message: 'Inicio de sesión exitoso',
        data: userData
      });
    } else {
      res.status(401).json({ message: 'Credenciales inválidas' });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Error en el servidor', error: err.message });
  }
});

// Student profile endpoints
app.get('/estudiante/:dni/perfil', authenticateStudent, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        e.*,
        pe.nombre_programa,
        c.id as carnet_id,
        qr.qr_code_path,
        (
          SELECT periodo_id 
          FROM periodos_academicos 
          WHERE estado = 1 
          ORDER BY fecha_inicio DESC 
          LIMIT 1
        ) as periodo_actual
      FROM estudiantes e
      LEFT JOIN programas_estudio pe ON e.programa_id = pe.programa_id
      LEFT JOIN carnet c ON e.dni = c.dni
      LEFT JOIN qr_codes qr ON e.dni = qr.dni_estudiante
      WHERE e.dni = ?
    `, [req.params.dni]);

    if (rows.length > 0) {
      const studentData = rows[0];
      res.json({
        message: 'Perfil recuperado exitosamente',
        data: studentData
      });
    } else {
      res.status(404).json({ message: 'Estudiante no encontrado' });
    }
  } catch (error) {
    console.error('Error getting profile:', error);
    res.status(500).json({ message: 'Error recuperando perfil' });
  }
});

app.put('/estudiante/:dni/update', authenticateStudent, async (req, res) => {
  const { field, value } = req.body;
  const allowedFields = ['email', 'celular', 'direccion'];

  if (!allowedFields.includes(field)) {
    return res.status(400).json({ message: 'Campo no permitido para actualización' });
  }

  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        `UPDATE estudiantes SET ${field} = ? WHERE dni = ?`,
        [value, req.params.dni]
      );

      const [rows] = await connection.execute(
        'SELECT email, celular, direccion FROM estudiantes WHERE dni = ?',
        [req.params.dni]
      );

      await connection.commit();
      res.json({
        message: 'Campo actualizado exitosamente',
        data: rows[0]
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ message: 'Error actualizando campo' });
  }
});

// Schedule endpoints
app.get('/horario/:programaId', authenticateStudent, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        h.horario_id,
        h.nombre,
        h.archivo,
        h.fecha_creacion,
        pe.nombre_programa,
        h.semestre
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
          message: 'Horario encontrado',
          data: {
            ...horario,
            url: horarioUrl
          }
        });
      } catch (error) {
        res.status(404).json({ message: 'Archivo PDF no disponible' });
      }
    } else {
      res.status(404).json({ message: 'No se encontró horario para este programa' });
    }
  } catch (error) {
    console.error('Schedule error:', error);
    res.status(500).json({ message: 'Error recuperando horario' });
  }
});

// Justification endpoints
app.post('/justificaciones', authenticateStudent, uploads.justification.array('documentos', 5), async (req, res) => {
  const { dni_estudiante, tipo_justificacion, motivo, fecha_inicio, fecha_fin } = req.body;

  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(`
        INSERT INTO justificaciones 
        (dni_estudiante, TipoJustificacionID, MotivoEstudiante, Fecha_Inicio, Fecha_Fin, Fecha_Justificacion)
        VALUES (?, ?, ?, ?, ?, CURDATE())
      `, [dni_estudiante, tipo_justificacion, motivo, fecha_inicio, fecha_fin]);

      if (req.files && req.files.length > 0) {
        const uploadPromises = req.files.map(file => 
          connection.execute(`
            INSERT INTO jimg (JustificacionID, NombreArchivo, RutaArchivo, FechaSubida)
            VALUES (?, ?, ?, NOW())
          `, [result.insertId, file.originalname, file.filename])
        );

        await Promise.all(uploadPromises);
      }

      await connection.commit();
      res.json({
        message: 'Justificación creada exitosamente',
        data: { justificacionId: result.insertId }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Justification creation error:', error);
    res.status(500).json({ message: 'Error creando justificación' });
  }
});

app.get('/justificaciones/:dni', authenticateStudent, async (req, res) => {
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
        i.NombreArchivo,
        i.RutaArchivo,
        i.FechaSubida
      FROM justificaciones j
      INNER JOIN tipos_justificacion tj ON j.TipoJustificacionID = tj.TipoJustificacionID
      LEFT JOIN jimg i ON j.JustificacionID = i.JustificacionID
      WHERE j.dni_estudiante = ?
      ORDER BY j.Fecha_Justificacion DESC
    `, [req.params.dni]);

    const justificacionesMap = new Map();
    
    rows.forEach(record => {
      if (!justificacionesMap.has(record.JustificacionID)) {
        justificacionesMap.set(record.JustificacionID, {
          justificacionID: record.JustificacionID,
          fecha_justificacion: record.Fecha_Justificacion,
          tipo_justificacion: record.TipoJustificacion,
          motivo_estudiante: record.MotivoEstudiante,
          fecha_inicio: record.Fecha_Inicio,
          fecha_fin: record.Fecha_Fin,
          estado: record.Estado,
          documentos: []
        });
      }
      
      if (record.RutaArchivo) {
        justificacionesMap.get(record.JustificacionID).documentos.push({
          nombre: record.NombreArchivo,
          url: record.RutaArchivo,
          fecha_subida: record.FechaSubida
        });
      }
    });

    res.json({
      message: 'Justificaciones recuperadas exitosamente',
      data: Array.from(justificacionesMap.values())
    });

  } catch (error) {
    console.error('Error getting justifications:', error);
    res.status(500).json({ message: 'Error recuperando justificaciones' });
  }
});

// Academic periods endpoint
app.get('/periodos/:dni', authenticateStudent, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        pa.periodo_id,
        pa.nombre as periodo_nombre,
        pa.fecha_inicio,
        pa.fecha_fin,
        pa.estado,
        ts.nombre_semestre,
        ts.descripcion as semestre_descripcion,
        ud.unidad_id,
        ud.nombre_unidad
      FROM periodos_academicos pa
      CROSS JOIN JSON_TABLE(pa.semestres, '$[*]' COLUMNS (semestre_id INT PATH '$')) js
      INNER JOIN tipo_semestre ts ON js.semestre_id = ts.semestre_id
      INNER JOIN unidades_didacticas ud ON pa.periodo_id = ud.periodo_id
      INNER JOIN estudiantes e ON e.programa_id = ud.programa_id
      WHERE e.dni = ?
      ORDER BY pa.fecha_inicio DESC, ts.semestre_id ASC
    `, [req.params.dni]);

    const periodosMap = new Map();
    
    rows.forEach(row => {
      if (!periodosMap.has(row.periodo_id)) {
        periodosMap.set(row.periodo_id, {
          periodo_id: row.periodo_id,
          nombre: row.periodo_nombre,
          fecha_inicio: row.fecha_inicio,
          fecha_fin: row.fecha_fin,
          estado: row.estado,
          semestres: new Map()
        });
      }

      const periodo = periodosMap.get(row.periodo_id);
      
      if (!periodo.semestres.has(row.nombre_semestre)) {
        periodo.semestres.set(row.nombre_semestre, {
          nombre: row.nombre_semestre,
          descripcion: row.semestre_descripcion,
          unidades: []
        });
      }

      if (row.unidad_id) {
        periodo.semestres.get(row.nombre_semestre).unidades.push({
          id: row.unidad_id,
          nombre: row.nombre_unidad
        });
      }
    });

    // Convert Map to array and format response
    const periodos = Array.from(periodosMap.values()).map(periodo => ({
      ...periodo,
      semestres: Array.from(periodo.semestres.values())
    }));

    res.json({
      message: 'Periodos académicos recuperados exitosamente',
      data: periodos
    });

  } catch (error) {
    console.error('Error getting academic periods:', error);
    res.status(500).json({ message: 'Error recuperando periodos académicos' });
  }
});

// Attendance endpoints
app.get('/asistencias/:dni', authenticateStudent, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        a.id,
        a.fecha_hora,
        ea.estado,
        h.nombre as horario_nombre,
        ud.nombre_unidad
      FROM asistencias a
      INNER JOIN estado_asistencia ea ON a.estado_id = ea.estado_id
      INNER JOIN horarios h ON a.horario_id = h.horario_id
      INNER JOIN unidades_didacticas ud ON h.programa_id = ud.programa_id
      WHERE a.dni_estudiante = ?
      ORDER BY a.fecha_hora DESC
    `, [req.params.dni]);

    res.json({
      message: 'Asistencias recuperadas exitosamente',
      data: rows
    });

  } catch (error) {
    console.error('Error getting attendance:', error);
    res.status(500).json({ message: 'Error recuperando asistencias' });
  }
});

// Payments endpoints
app.get('/pagos/:dni', authenticateStudent, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        p.*,
        tp.nombre as tipo_pago_nombre,
        tp.descripcion as tipo_pago_descripcion
      FROM pagos p
      LEFT JOIN tipos_pago tp ON p.tipo_pago = tp.nombre
      WHERE p.dni_estudiante = ?
      ORDER BY p.fecha DESC
    `, [req.params.dni]);

    res.json({
      message: 'Pagos recuperados exitosamente',
      data: rows
    });

  } catch (error) {
    console.error('Error getting payments:', error);
    res.status(500).json({ message: 'Error recuperando pagos' });
  }
});

app.get('/tipos-pago', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        tipo_id,
        nombre,
        descripcion,
        monto_referencial,
        codigo_tupa
      FROM tipos_pago
      ORDER BY nombre
    `);

    res.json({
      message: 'Tipos de pago recuperados exitosamente',
      data: rows
    });

  } catch (error) {
    console.error('Error getting payment types:', error);
    res.status(500).json({ message: 'Error recuperando tipos de pago' });
  }
});

// Profile image endpoints
app.post('/estudiante/:dni/imagen', authenticateStudent, uploads.profile.single('imagen'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No se proporcionó imagen' });
    }

    await pool.execute(
      'UPDATE estudiantes SET imagen_url = ? WHERE dni = ?',
      [req.file.filename, req.params.dni]
    );

    res.status(200).json({ 
      message: 'Imagen de perfil actualizada exitosamente',
      url: req.file.filename
    });
  } catch (error) {
    console.error('Error uploading profile image:', error);
    res.status(500).json({ message: 'Error subiendo imagen de perfil' });
  }
});

app.get('/estudiante/:dni/imagen', authenticateStudent, async (req, res) => {
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
        res.status(404).json({ message: 'Imagen no encontrada' });
      }
    } else {
      res.status(404).json({ message: 'No hay imagen de perfil' });
    }
  } catch (error) {
    console.error('Error getting profile image:', error);
    res.status(500).json({ message: 'Error recuperando imagen de perfil' });
  }
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
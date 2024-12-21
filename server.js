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
  host: '162.241.61.0',
  user: 'iestpasi_edwin',
  password: 'EDWINrosas774433)',
  database: 'iestpasi_iestp',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
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
app.get('/estudiante/:dni', async (req, res) => {
  try {
    const [studentRows] = await pool.execute(`
      SELECT 
        e.nombre,
        e.programa,
        e.dni,
        e.email as correo_personal,
        e.email_corporativo as correo_institucional,
        e.celular as telefonos,
        e.direccion,
        e.semestre_actual,
        e.programa_id
      FROM estudiantes e
      WHERE e.dni = ?
    `, [req.params.dni]);

    if (studentRows.length === 0) {
      return res.status(404).json({ 
        message: 'Estudiante no encontrado' 
      });
    }

    const student = studentRows[0];

    // Get current academic period
    const [periodRows] = await pool.execute(`
      SELECT 
        periodo_id,
        nombre as periodo_nombre,
        fecha_inicio,
        fecha_fin
      FROM periodos_academicos
      WHERE estado = 1 AND NOW() BETWEEN fecha_inicio AND fecha_fin
      LIMIT 1
    `);

    const periodo = periodRows[0] || null;

    // Get educational units if we have a valid period
    let unidades = [];
    if (periodo) {
      const [unitRows] = await pool.execute(`
        SELECT 
          ud.unidad_id,
          ud.nombre_unidad,
          ts.nombre_semestre,
          ts.descripcion as semestre_descripcion
        FROM unidades_didacticas ud
        INNER JOIN tipo_semestre ts ON ud.semestre_id = ts.semestre_id
        WHERE ud.programa_id = ? 
        AND ud.periodo_id = ?
        AND ud.semestre_id = ?
      `, [student.programa_id, periodo.periodo_id, student.semestre_actual]);

      unidades = unitRows;
    }

    res.json({
      message: 'Datos del estudiante obtenidos',
      data: {
        nombre: student.nombre,
        programa: student.programa,
        dni: student.dni,
        correo_institucional: student.correo_institucional || 'No disponible',
        correo_personal: student.correo_personal || 'No disponible',
        telefonos: student.telefonos || 'No disponible',
        direccion: student.direccion || 'No disponible',
        semestre_actual: student.semestre_actual,
        periodo_academico: periodo ? {
          id: periodo.periodo_id,
          nombre: periodo.periodo_nombre,
          fecha_inicio: periodo.fecha_inicio,
          fecha_fin: periodo.fecha_fin
        } : null,
        unidades_didacticas: unidades
      }
    });

  } catch (error) {
    console.error('Error getting student data:', error);
    res.status(500).json({ 
      message: 'Error al obtener datos del estudiante',
      error: error.message
    });
  }
});

// Get student QR code endpoint
app.get('/estudiante/:dni/qr_code', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT qr_code_path FROM qr_codes WHERE dni_estudiante = ?',
      [req.params.dni]
    );

    if (rows.length > 0 && rows[0].qr_code_path) {
      // Construir la URL completa del QR
      const qrUrl = `${PHP_URL}/qr_codes/${rows[0].qr_code_path}`;
      
      // Verificar que el archivo existe
      try {
        await axios.head(qrUrl);
        res.json({ qr_code_url: qrUrl });
      } catch (error) {
        res.status(404).json({ 
          message: 'Archivo QR no encontrado en el servidor' 
        });
      }
    } else {
      res.status(404).json({ 
        message: 'No se encontró código QR para este estudiante' 
      });
    }
  } catch (error) {
    console.error('Error getting QR code:', error);
    res.status(500).json({ 
      message: 'Error al obtener el código QR', 
      error: error.message 
    });
  }
});
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

// Login endpoint
app.post('/login', async (req, res) => {
  const { usuario, clave } = req.body;

  console.log('Login attempt for user:', usuario);

  if (!usuario || !clave) {
    console.log('Missing credentials');
    return res.status(400).json({ 
      message: 'Usuario y contraseña son requeridos' 
    });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT * FROM estudiantes WHERE usuario = ? AND clave = ?',
      [usuario.trim(), clave.trim()]
    );

    console.log('Query result rows:', rows.length);

    if (rows.length > 0) {
      const userData = {
        dni: rows[0].dni,
        nombre: rows[0].nombre,
        email: rows[0].email
        // Add other necessary user data
      };

      console.log('Login successful for user:', userData.dni);
      
      res.json({
        message: 'Inicio de sesión exitoso',
        data: userData
      });
    } else {
      console.log('Invalid credentials for user:', usuario);
      res.status(401).json({ 
        message: 'Credenciales inválidas' 
      });
    }
  } catch (err) {
    console.error('Database error during login:', err);
    res.status(500).json({ 
      message: 'Error en el servidor', 
      error: err.message 
    });
  }
});
app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT 1 as test');
    res.json({ message: 'Database connection successful', data: rows });
  } catch (err) {
    res.status(500).json({ message: 'Database connection failed', error: err.message });
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

// Get student justifications
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
        i.NombreArchivo,
        i.RutaArchivo,
        i.FechaSubida
      FROM justificaciones j
      INNER JOIN tipos_justificacion tj ON j.TipoJustificacionID = tj.TipoJustificacionID
      LEFT JOIN Jimg i ON j.JustificacionID = i.JustificacionID
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
          imagenes: []
        });
      }
      
      if (record.RutaArchivo) {
        justificacionesMap.get(record.JustificacionID).imagenes.push({
          nombre: record.NombreArchivo,
          url: record.RutaArchivo,
          fecha_subida: record.FechaSubida
        });
      }
    });

    res.json({
      message: 'Justifications retrieved successfully',
      data: Array.from(justificacionesMap.values())
    });

  } catch (error) {
    console.error('Error getting justifications:', error);
    res.status(500).json({
      message: 'Error getting justifications',
      error: error.message
    });
  }
});

// Start server
const port = 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
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

// Constantes para las URLs
const BASE_URL = 'https://www.iestpasist.com';
const UPLOADS_PATH = '/uploads/';
const IMAGES_PATH = '/imagenesJ/';
const QR_PATH = '/qr_codes/';

// Configuración de multer para archivos en memoria
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB límite
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'));
    }
  }
});

// Crear la carpeta para las imágenes de perfil si no existe
const PROFILE_IMAGES_DIR = path.join(__dirname, 'profile_images');
fs.mkdir(PROFILE_IMAGES_DIR, { recursive: true })
  .then(() => console.log('Directorio de imágenes de perfil creado'))
  .catch(console.error);

// Configuración de la base de datos MySQL
const dbConfig = {
  host: '162.241.61.0',
  user: 'iestpasi_edwin',
  password: 'EDWINrosas774433)',
  database: 'iestpasi_iestp',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Crear pool de conexiones
const pool = mysql.createPool(dbConfig);

// Middleware para manejar errores de conexión
const dbMiddleware = async (req, res, next) => {
  try {
    req.db = await pool.getConnection();
    next();
  } catch (err) {
    console.error('Error de conexión a la base de datos:', err);
    res.status(500).json({ message: 'Error de conexión a la base de datos' });
  }
};

// Configuración de multer para imágenes de perfil
const profileImageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, PROFILE_IMAGES_DIR)
  },
  filename: function (req, file, cb) {
    const dni = req.params.dni;
    const fileExt = path.extname(file.originalname);
    cb(null, `${dni}${fileExt}`);
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
    cb(new Error('Solo se permiten archivos de imagen (jpeg, jpg, png)'));
  }
});

// Función para subir imagen al nuevo servidor PHP
async function uploadImageToPhp(imageBuffer, originalname) {
  try {
    const formData = new FormData();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = uniqueSuffix + '-' + originalname;
    
    formData.append('imagen', imageBuffer, {
      filename: filename,
      contentType: 'image/jpeg'
    });

    const response = await axios.post(`${BASE_URL}/upload.php`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    return {
      success: true,
      filename: filename,
      url: `${BASE_URL}${IMAGES_PATH}${filename}`
    };
  } catch (error) {
    console.error('Error al subir imagen:', error);
    throw new Error('Error al subir imagen al servidor PHP');
  }
}
// Configuración CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'],
  credentials: true
}));

app.use(bodyParser.json());

// Endpoints base
app.get('/status', (req, res) => res.send({ message: 'Servidor activo y en funcionamiento' }));
// Endpoint de login
// Endpoint de login
app.post('/login', dbMiddleware, async (req, res) => {
  const { usuario, clave } = req.body;
  const connection = req.db;

  try {
    const [rows] = await connection.execute(
      'SELECT * FROM estudiantes WHERE usuario = ? AND clave = ?',
      [usuario, clave]
    );

    if (rows.length > 0) {
      res.json({ message: 'Inicio de sesión exitoso', data: rows[0] });
    } else {
      res.status(401).json({ message: 'Credenciales incorrectas' });
    }
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ message: 'Error en el servidor', error: error.message });
  } finally {
    connection.release();
  }
});
// Endpoint para obtener horario
app.get('/horario/:programaId', dbMiddleware, async (req, res) => {
  const { programaId } = req.params;
  const connection = req.db;

  try {
    const [rows] = await connection.execute(`
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
    `, [programaId]);

    if (rows.length > 0) {
      const horario = rows[0];
      const horarioUrl = `${BASE_URL}${UPLOADS_PATH}${horario.archivo}`;

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
        res.status(404).json({
          message: 'El archivo PDF no se encuentra disponible',
          error: error.message
        });
      }
    } else {
      res.status(404).json({ 
        message: 'No se encontró horario para este programa de estudio'
      });
    }
  } catch (error) {
    console.error('Error al obtener horario:', error);
    res.status(500).json({
      message: 'Error al obtener el horario',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

// Endpoint para obtener QR del estudiante
app.get('/estudiante/:dni/qr_code', dbMiddleware, async (req, res) => {
  const { dni } = req.params;
  const connection = req.db;

  try {
    const [rows] = await connection.execute(
      'SELECT qr_code_path FROM qr_codes WHERE dni_estudiante = ?',
      [dni]
    );

    if (rows.length > 0 && rows[0].qr_code_path) {
      const qrCodePath = rows[0].qr_code_path;
      const qrCodeUrl = `${BASE_URL}${QR_PATH}${path.basename(qrCodePath)}`;
      res.json({ qr_code_url: qrCodeUrl });
    } else {
      res.status(404).json({ message: 'Código QR no encontrado' });
    }
  } catch (error) {
    console.error('Error al obtener QR:', error);
    res.status(500).json({ message: 'Error en el servidor', error: error.message });
  } finally {
    connection.release();
  }
});

// Endpoint de justificación
app.post('/justificacion', upload.array('imagenes', 2), dbMiddleware, async (req, res) => {
  const { 
    dni_estudiante, 
    tipo_justificacion,
    motivo_estudiante,
    fecha_inicio,
    fecha_fin 
  } = req.body;
  const connection = req.db;

  if (!dni_estudiante || !tipo_justificacion || !motivo_estudiante || 
      !fecha_inicio || !fecha_fin || !req.files || req.files.length === 0) {
    return res.status(400).json({ 
      message: 'Todos los campos son requeridos (DNI, tipo, motivo, fechas e imágenes)' 
    });
  }

  try {
    await connection.beginTransaction();

    // 1. Subir las imágenes
    const uploadedImages = await Promise.all(
      req.files.map(file => 
        uploadImageToPhp(file.buffer, file.originalname)
      )
    );

    // 2. Insertar la justificación
    const [justificacionResult] = await connection.execute(`
      INSERT INTO justificaciones (
        dni_estudiante, 
        Fecha_Justificacion, 
        TipoJustificacionID,
        MotivoEstudiante,
        Fecha_Inicio,
        Fecha_Fin,
        Estado
      ) VALUES (?, ?, ?, ?, ?, ?, 'Pendiente')
    `, [
      dni_estudiante,
      new Date(),
      tipo_justificacion,
      motivo_estudiante,
      new Date(fecha_inicio),
      new Date(fecha_fin)
    ]);

    const justificacionID = justificacionResult.insertId;

    // 3. Insertar referencias de imágenes
    for (const image of uploadedImages) {
      await connection.execute(`
        INSERT INTO Jimg (
          JustificacionID, 
          NombreArchivo, 
          FechaSubida,
          RutaArchivo,
          TipoArchivo
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        justificacionID,
        image.filename,
        new Date(),
        image.url,
        'image/jpeg'
      ]);
    }

    await connection.commit();

    res.status(201).json({
      message: 'Justificación registrada exitosamente',
      data: {
        justificacionID,
        imageUrls: uploadedImages.map(img => img.url),
        fecha: new Date()
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error al registrar justificación:', error);
    res.status(500).json({
      message: 'Error al procesar la justificación',
      error: error.message
    });
  } finally {
    connection.release();
  }
});


// Iniciar servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
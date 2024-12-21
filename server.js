const express = require('express');
const mysql = require('mysql2/promise');
const sql = require('mssql');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs').promises;

const app = express();

// Constants
const PHP_URL = 'https://www.iestpasist.com';
const PROFILE_IMAGES_DIR = path.join(__dirname, 'profile_images');

// Create profile images directory
fs.mkdir(PROFILE_IMAGES_DIR, { recursive: true })
  .then(() => console.log('Profile images directory created'))
  .catch(console.error);

// Database configurations
const mysqlConfig = {
  host: process.env.MYSQL_HOST || '162.241.61.0',
  user: process.env.MYSQL_USER || 'iestpasi_edwin',
  password: process.env.MYSQL_PASSWORD || 'EDWINrosas774433)',
  database: process.env.MYSQL_DATABASE || 'iestpasi_iestp',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};


// Database connections
const mysqlPool = mysql.createPool(mysqlConfig);
sql.connect(mssqlConfig)
  .then(() => console.log('Connected to SQL Server'))
  .catch(err => console.error('Error connecting to SQL Server:', err));

// Multer configuration for profile images
const profileImageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PROFILE_IMAGES_DIR),
  filename: (req, file, cb) => {
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

// Standardized endpoints
app.post('/auth/login', async (req, res) => {
  const { usuario, clave } = req.body;

  if (!usuario || !clave) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    // Try MySQL first
    const [rows] = await mysqlPool.execute(
      'SELECT * FROM estudiantes WHERE usuario = ? AND clave = ?',
      [usuario, clave]
    );

    if (rows.length > 0) {
      return res.json({ message: 'Login successful', data: rows[0] });
    }

    // If not found in MySQL, try MSSQL
    const request = new sql.Request();
    request.input('usuario', sql.NVarChar, usuario);
    request.input('clave', sql.NVarChar, clave);
    const result = await request.query(
      'SELECT * FROM estudiantes WHERE usuario = @usuario AND clave = @clave'
    );

    if (result.recordset.length > 0) {
      return res.json({ message: 'Login successful', data: result.recordset[0] });
    }

    res.status(401).json({ message: 'Invalid credentials' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Profile image endpoints
app.get('/students/:dni/profile-image', async (req, res) => {
  try {
    // Try both databases
    const [mysqlRows] = await mysqlPool.execute(
      'SELECT imagen_url FROM estudiantes WHERE dni = ?',
      [req.params.dni]
    );

    let imageUrl = mysqlRows[0]?.imagen_url;

    if (!imageUrl) {
      const request = new sql.Request();
      request.input('dni', sql.NVarChar, req.params.dni);
      const result = await request.query(
        'SELECT imagen_url FROM estudiantes WHERE dni = @dni'
      );
      imageUrl = result.recordset[0]?.imagen_url;
    }

    if (imageUrl) {
      const imagePath = path.join(PROFILE_IMAGES_DIR, imageUrl);
      try {
        await fs.access(imagePath);
        return res.sendFile(imagePath);
      } catch {
        return res.status(404).json({ message: 'Image file not found' });
      }
    }

    res.status(404).json({ message: 'No profile image found' });
  } catch (error) {
    console.error('Error retrieving profile image:', error);
    res.status(500).json({ message: 'Error retrieving profile image' });
  }
});

app.post('/students/:dni/profile-image', uploadProfileImage.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image provided' });
    }

    // Update in both databases
    try {
      await mysqlPool.execute(
        'UPDATE estudiantes SET imagen_url = ? WHERE dni = ?',
        [req.file.filename, req.params.dni]
      );
    } catch (error) {
      console.error('MySQL update error:', error);
    }

    try {
      const request = new sql.Request();
      request.input('imageUrl', sql.NVarChar, req.file.filename);
      request.input('dni', sql.NVarChar, req.params.dni);
      await request.query(
        'UPDATE estudiantes SET imagen_url = @imageUrl WHERE dni = @dni'
      );
    } catch (error) {
      console.error('MSSQL update error:', error);
    }

    res.status(200).json({
      message: 'Profile image updated successfully',
      url: req.file.filename
    });
  } catch (error) {
    console.error('Error updating profile image:', error);
    res.status(500).json({ message: 'Error updating profile image' });
  }
});

// Schedule endpoint
app.get('/schedules/:programId', async (req, res) => {
  try {
    const [rows] = await mysqlPool.execute(`
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
    `, [req.params.programId]);

    if (rows.length > 0) {
      const schedule = rows[0];
      const scheduleUrl = `${PHP_URL}/uploads/${schedule.archivo}`;

      try {
        await axios.head(scheduleUrl);
        res.json({
          message: 'Schedule found',
          data: {
            ...schedule,
            url: scheduleUrl
          }
        });
      } catch (error) {
        res.status(404).json({
          message: 'Schedule file not available',
          error: error.message
        });
      }
    } else {
      res.status(404).json({ 
        message: 'No schedule found for this study program' 
      });
    }
  } catch (error) {
    console.error('Error retrieving schedule:', error);
    res.status(500).json({
      message: 'Error retrieving schedule',
      error: error.message
    });
  }
});

// Student update endpoint
app.put('/students/:dni', async (req, res) => {
  const { dni } = req.params;
  const { field, value } = req.body;
  const allowedFields = ['email', 'celular', 'direccion'];

  if (!allowedFields.includes(field)) {
    return res.status(400).json({
      message: `Field not allowed for update: ${field}`
    });
  }

  try {
    // Update in both databases
    try {
      await mysqlPool.execute(
        `UPDATE estudiantes SET ${field} = ? WHERE dni = ?`,
        [value, dni]
      );
    } catch (error) {
      console.error('MySQL update error:', error);
    }

    try {
      const request = new sql.Request();
      request.input('value', sql.NVarChar, value);
      request.input('dni', sql.NVarChar, dni);
      await request.query(`
        UPDATE estudiantes 
        SET ${field} = @value 
        WHERE dni = @dni
      `);
    } catch (error) {
      console.error('MSSQL update error:', error);
    }

    // Get updated data
    const [rows] = await mysqlPool.execute(
      'SELECT email as correo_personal, celular as telefonos, direccion FROM estudiantes WHERE dni = ?',
      [dni]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json({
      message: 'Field updated successfully',
      data: rows[0]
    });
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({
      message: 'Error updating field',
      error: error.message
    });
  }
});

// Justification endpoints
app.get('/justifications/:dni', async (req, res) => {
  try {
    const [rows] = await mysqlPool.execute(`
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
          justificationId: record.JustificacionID,
          justificationDate: record.Fecha_Justificacion,
          justificationType: record.TipoJustificacion,
          studentReason: record.MotivoEstudiante,
          startDate: record.Fecha_Inicio,
          endDate: record.Fecha_Fin,
          status: record.Estado,
          images: []
        });
      }
      
      if (record.RutaArchivo) {
        justificacionesMap.get(record.JustificacionID).images.push({
          name: record.NombreArchivo,
          url: record.RutaArchivo,
          uploadDate: record.FechaSubida
        });
      }
    });

    res.json({
      message: 'Justifications retrieved successfully',
      data: Array.from(justificacionesMap.values())
    });
  } catch (error) {
    console.error('Error retrieving justifications:', error);
    res.status(500).json({
      message: 'Error retrieving justifications',
      error: error.message
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
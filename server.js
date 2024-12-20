const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs').promises;
const app = express();


// Crear la carpeta para las imágenes de perfil si no existe
const PROFILE_IMAGES_DIR = path.join(__dirname, 'profile_images');
fs.mkdir(PROFILE_IMAGES_DIR, { recursive: true })
  .then(() => console.log('Directorio de imágenes de perfil creado'))
  .catch(console.error);

// Configuración de multer para imágenes de perfil
const profileImageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, PROFILE_IMAGES_DIR)
  },
  filename: function (req, file, cb) {
    // Usar el DNI como nombre de archivo para mantener única la imagen por usuario
    const dni = req.params.dni;
    const fileExt = path.extname(file.originalname);
    cb(null, `${dni}${fileExt}`);
  }
});

const uploadProfileImage = multer({ 
  storage: profileImageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB límite
  },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Solo se permiten archivos de imagen (jpeg, jpg, png)'));
  }
});

// GET - Obtener imagen de perfil
app.get('/estudiante/:dni/imagen', async (req, res) => {
  try {
    const { dni } = req.params;
    
    // Buscar la imagen en la base de datos
    const query = `
      SELECT imagen_url
      FROM estudiantes
      WHERE dni = @dni
    `;
    
    const request = new sql.Request();
    request.input('dni', sql.NVarChar, dni);
    const result = await request.query(query);

    if (result.recordset.length > 0 && result.recordset[0].imagen_url) {
      const imagePath = path.join(PROFILE_IMAGES_DIR, result.recordset[0].imagen_url);
      
      // Verificar si el archivo existe
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
    console.error('Error al obtener imagen de perfil:', error);
    res.status(500).json({ message: 'Error al obtener la imagen de perfil' });
  }
});

// POST - Subir/Actualizar imagen de perfil
app.post('/estudiante/:dni/imagen', uploadProfileImage.single('imagen'), async (req, res) => {
  try {
    const { dni } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ message: 'No se proporcionó ninguna imagen' });
    }

    // Actualizar la ruta de la imagen en la base de datos
    const query = `
      UPDATE estudiantes
      SET imagen_url = @imageUrl
      WHERE dni = @dni
    `;

    const request = new sql.Request();
    request.input('dni', sql.NVarChar, dni);
    request.input('imageUrl', sql.NVarChar, req.file.filename);
    await request.query(query);

    res.status(200).json({ 
      message: 'Imagen de perfil actualizada correctamente',
      url: req.file.filename
    });
  } catch (error) {
    console.error('Error al subir imagen de perfil:', error);
    res.status(500).json({ message: 'Error al subir la imagen de perfil' });
  }
});

// DELETE - Eliminar imagen de perfil
app.delete('/estudiante/:dni/imagen', async (req, res) => {
  try {
    const { dni } = req.params;

    // Obtener la ruta actual de la imagen
    const selectQuery = `
      SELECT imagen_url
      FROM estudiantes
      WHERE dni = @dni
    `;

    const selectRequest = new sql.Request();
    selectRequest.input('dni', sql.NVarChar, dni);
    const result = await selectRequest.query(selectQuery);

    if (result.recordset.length > 0 && result.recordset[0].imagen_url) {
      const imagePath = path.join(PROFILE_IMAGES_DIR, result.recordset[0].imagen_url);
      
      // Eliminar el archivo
      try {
        await fs.unlink(imagePath);
      } catch (error) {
        console.error('Error al eliminar archivo:', error);
      }

      // Actualizar la base de datos
      const updateQuery = `
        UPDATE estudiantes
        SET imagen_url = NULL
        WHERE dni = @dni
      `;

      const updateRequest = new sql.Request();
      updateRequest.input('dni', sql.NVarChar, dni);
      await updateRequest.query(updateQuery);

      res.json({ message: 'Imagen de perfil eliminada correctamente' });
    } else {
      res.status(404).json({ message: 'No se encontró imagen de perfil' });
    }
  } catch (error) {
    console.error('Error al eliminar imagen de perfil:', error);
    res.status(500).json({ message: 'Error al eliminar la imagen de perfil' });
  }
});

// Configuración CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'],
  credentials: true
}));

app.use(bodyParser.json());

// Configuración de la base de datos
const config = {
  user: 'sa',
  password: 'EDWINROSAS',
  server: 'localhost',
  database: 'aplicativo',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

// Conexión a la base de datos
sql.connect(config)
  .then(() => console.log('Conectado a SQL Server'))
  .catch(err => console.error('Error al conectar a la base de datos:', err));

// URL base de tu servidor PHP con ngrok
const NGROK_URL = 'https://546f-2800-200-f370-11d-18d-b0b7-303f-ac8f.ngrok-free.app';

async function uploadImageToPhp(imageBuffer, originalname) {
  try {
    const formData = new FormData();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = uniqueSuffix + '-' + originalname;
    
    formData.append('imagen', imageBuffer, {
      filename: filename,
      contentType: 'image/jpeg'
    });

    const response = await axios.post(`${NGROK_URL}/pagina1/hola/upload.php`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    return {
      success: true,
      filename: filename,
      url: `${NGROK_URL}/pagina1/hola/imagenesJ/${filename}`
    };
  } catch (error) {
    console.error('Error al subir imagen:', error);
    throw new Error('Error al subir imagen al servidor PHP');
  }
}

// Configuración de multer
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // Límite de 5MB
  }
});

// Endpoints base
app.get('/status', (req, res) => res.send({ message: 'Servidor activo y en funcionamiento' }));

// Endpoint de login
app.post('/login', async (req, res) => {
  const { usuario, clave } = req.body;

  if (!usuario || !clave) {
    return res.status(400).send({ message: 'Usuario y clave son requeridos' });
  }

  try {
    const query = `SELECT * FROM estudiantes WHERE usuario = @usuario AND clave = @clave`;
    const request = new sql.Request();
    request.input('usuario', sql.NVarChar, usuario);
    request.input('clave', sql.NVarChar, clave);
    const result = await request.query(query);

    if (result.recordset.length > 0) {
      const user = result.recordset[0];
      res.send({ message: 'Inicio de sesión exitoso', data: user });
    } else {
      res.status(401).send({ message: 'Credenciales incorrectas' });
    }
  } catch (err) {
    res.status(500).send({ message: 'Error en el servidor', error: err });
  }
});

// Endpoint de justificación mejorado
app.post('/justificacion', upload.array('imagenes', 2), async (req, res) => {
  const { 
    dni_estudiante, 
    tipo_justificacion,
    motivo_estudiante,
    fecha_inicio,
    fecha_fin 
  } = req.body;

  if (!dni_estudiante || !tipo_justificacion || !motivo_estudiante || 
      !fecha_inicio || !fecha_fin || !req.files || req.files.length === 0) {
    return res.status(400).json({ 
      message: 'Todos los campos son requeridos (DNI, tipo, motivo, fechas e imágenes)' 
    });
  }

  try {
    const transaction = new sql.Transaction();
    await transaction.begin();

    try {
      // 1. Subir las imágenes
      const uploadedImages = await Promise.all(
        req.files.map(file => 
          uploadImageToPhp(file.buffer, file.originalname)
        )
      );

      // 2. Insertar la justificación
      const justificacionQuery = `
        INSERT INTO justificaciones (
          dni_estudiante, 
          Fecha_Justificacion, 
          TipoJustificacionID,
          MotivoEstudiante,
          Fecha_Inicio,
          Fecha_Fin,
          Estado
        )
        OUTPUT INSERTED.JustificacionID
        VALUES (
          @dni, 
          @fecha, 
          @tipo,
          @motivo,
          @fecha_inicio,
          @fecha_fin,
          'Pendiente'
        )
      `;

      const justificacionRequest = new sql.Request(transaction);
      justificacionRequest.input('dni', sql.NVarChar, dni_estudiante);
      justificacionRequest.input('fecha', sql.Date, new Date());
      justificacionRequest.input('tipo', sql.Int, tipo_justificacion);
      justificacionRequest.input('motivo', sql.NVarChar, motivo_estudiante);
      justificacionRequest.input('fecha_inicio', sql.Date, new Date(fecha_inicio));
      justificacionRequest.input('fecha_fin', sql.Date, new Date(fecha_fin));

      const justificacionResult = await justificacionRequest.query(justificacionQuery);
      const justificacionID = justificacionResult.recordset[0].JustificacionID;

      // 3. Insertar referencias de imágenes
      for (const image of uploadedImages) {
        const imagenQuery = `
          INSERT INTO Jimg (
            JustificacionID, 
            NombreArchivo, 
            FechaSubida,
            RutaArchivo,
            TipoArchivo
          )
          VALUES (
            @justificacionID, 
            @nombreArchivo, 
            @fecha,
            @rutaArchivo,
            @tipoArchivo
          )
        `;

        const imagenRequest = new sql.Request(transaction);
        imagenRequest.input('justificacionID', sql.Int, justificacionID);
        imagenRequest.input('nombreArchivo', sql.NVarChar, image.filename);
        imagenRequest.input('fecha', sql.DateTime, new Date());
        imagenRequest.input('rutaArchivo', sql.NVarChar, image.url);
        imagenRequest.input('tipoArchivo', sql.NVarChar, 'image/jpeg');

        await imagenRequest.query(imagenQuery);
      }

      await transaction.commit();

      res.status(201).json({
        message: 'Justificación registrada exitosamente',
        data: {
          justificacionID,
          imageUrls: uploadedImages.map(img => img.url),
          fecha: new Date()
        }
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('Error al registrar justificación:', error);
    res.status(500).json({
      message: 'Error al procesar la justificación',
      error: error.message
    });
  }
});
// Constantes para las URLs
const PHP_URL = 'https://546f-2800-200-f370-11d-18d-b0b7-303f-ac8f.ngrok-free.app';
const UPLOADS_PATH = '/pagina1/hola/uploads/';
app.get('/horario/:programaId', async (req, res) => {
  const { programaId } = req.params;

  try {
    console.log('1. Iniciando búsqueda de horario para programa_id:', programaId);

    const query = `
      SELECT 
        h.horario_id,
        h.nombre,
        h.archivo,
        h.fecha_creacion,
        pe.nombre_programa as programa_nombre
      FROM horarios h
      INNER JOIN programas_estudio pe ON h.programa_id = pe.programa_id
      WHERE h.programa_id = @programaId
      ORDER BY h.fecha_creacion DESC;
    `;

    const request = new sql.Request();
    request.input('programaId', sql.Int, programaId);
    
    const result = await request.query(query);

    if (result.recordset.length > 0) {
      const horario = result.recordset[0];
      const horarioUrl = `${PHP_URL}${UPLOADS_PATH}${horario.archivo}`;
      
      console.log('2. Horario encontrado:', horario);
      console.log('3. URL completa del PDF:', horarioUrl);

      // Verificar que el PDF existe
      try {
        const verificacion = await axios.head(horarioUrl);
        console.log('4. Verificación de archivo exitosa:', verificacion.status);
        
        res.json({
          message: 'Horario encontrado',
          data: {
            ...horario,
            url: horarioUrl
          }
        });
      } catch (error) {
        console.error('5. Error al verificar archivo:', error.message);
        res.status(404).json({
          message: 'El archivo PDF no se encuentra disponible',
          error: error.message
        });
      }
    } else {
      console.log('6. No se encontraron registros para el programa_id:', programaId);
      res.status(404).json({ 
        message: 'No se encontró horario para este programa de estudio'
      });
    }
  } catch (error) {
    console.error('7. Error en la consulta:', error);
    res.status(500).json({
      message: 'Error al obtener el horario',
      error: error.message
    });
  }
});
// Backend - server.js update endpoint
app.put('/estudiante/:dni/update', async (req, res) => {
  const { dni } = req.params;
  const { field, value } = req.body;

  // Validate input
  if (!dni || !field) {
    return res.status(400).json({
      message: 'DNI y campo son requeridos'
    });
  }

  // Whitelist of allowed fields to update with descriptive comments
  const allowedFields = [
    'email',           // correo_personal in frontend
    'celular',         // telefonos in frontend
    'direccion'        // direccion in both
  ];

  if (!allowedFields.includes(field)) {
    return res.status(400).json({
      message: `Campo no permitido para actualización: ${field}`
    });
  }

  try {
    const transaction = new sql.Transaction();
    await transaction.begin();

    try {
      const updateQuery = `
        UPDATE estudiantes
        SET ${field} = @value
        WHERE dni = @dni;
        
        SELECT 
          email as correo_personal,
          celular as telefonos,
          direccion
        FROM estudiantes
        WHERE dni = @dni;
      `;

      const request = new sql.Request(transaction);
      request.input('dni', sql.NVarChar, dni);
      request.input('value', sql.NVarChar, value);
      
      const result = await request.query(updateQuery);

      if (result.rowsAffected[0] === 0) {
        throw new Error('No se encontró el estudiante');
      }

      await transaction.commit();

      // Transform the response to match frontend field names
      res.json({
        message: 'Campo actualizado correctamente',
        data: result.recordset[0]
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('Error en la actualización:', error);
    res.status(500).json({
      message: 'Error al actualizar el campo',
      error: error.message
    });
  }
});
// Endpoint para obtener justificaciones por DNI
app.get('/justificaciones/:dni', async (req, res) => {
  const { dni } = req.params;

  try {
    const query = `
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
      WHERE j.dni_estudiante = @dni
      ORDER BY j.Fecha_Justificacion DESC
    `;

    const request = new sql.Request();
    request.input('dni', sql.NVarChar, dni);
    const result = await request.query(query);

    // Agrupar las imágenes por justificación
    const justificacionesMap = new Map();
    
    result.recordset.forEach(record => {
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

    const justificaciones = Array.from(justificacionesMap.values());

    res.json({
      message: 'Justificaciones obtenidas exitosamente',
      data: justificaciones
    });

  } catch (error) {
    console.error('Error al obtener justificaciones:', error);
    res.status(500).json({
      message: 'Error al obtener las justificaciones',
      error: error.message
    });
  }
});

// Endpoint para obtener datos completos del estudiante
app.get('/estudiante/:dni', async (req, res) => {
  const { dni } = req.params;
  try {
    const query = `
      WITH EstudianteInfo AS (
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
        CROSS APPLY (
          SELECT TOP 1 *
          FROM periodos_academicos pa
          WHERE pa.estado = 1
          AND GETDATE() BETWEEN pa.fecha_inicio AND pa.fecha_fin
        ) pa
        WHERE e.dni = @dni
      )
      SELECT 
        ei.*,
        JSON_QUERY((
          SELECT 
            ud.unidad_id,
            ud.nombre_unidad,
            ts.nombre_semestre,
            ts.descripcion as semestre_descripcion
          FROM unidades_didacticas ud
          INNER JOIN tipo_semestre ts ON ud.semestre_id = ts.semestre_id
          WHERE ud.programa_id = ei.programa_id 
          AND ud.periodo_id = ei.periodo_id
          AND ud.semestre_id = ei.semestre_actual
          FOR JSON PATH
        )) as unidades_didacticas
      FROM EstudianteInfo ei;
    `;

    const request = new sql.Request();
    request.input('dni', sql.NVarChar, dni);
    const result = await request.query(query);

    if (result.recordset.length > 0) {
      const student = result.recordset[0];
      const qrCodeUrl = student.qr_code_path
        ? `${NGROK_URL}/pagina1/hola/qr_codes/${path.basename(student.qr_code_path)}`
        : null;

      // Parsear las unidades didácticas del JSON
      const unidadesDidacticas = JSON.parse(student.unidades_didacticas || '[]');

      res.send({
        message: 'Datos del estudiante obtenidos',
        data: {
          // Información básica del estudiante
          nombre: student.nombre,
          programa: student.programa,
          dni: student.dni,
          correo_institucional: student.email_corporativo || 'No disponible',
          correo_personal: student.email || 'No disponible',
          telefonos: student.celular || 'No disponible',
          direccion: student.direccion || 'No disponible',
          qr_code_url: qrCodeUrl || 'No disponible',
          
          // Información académica
          semestre_actual: student.semestre_actual,
          periodo_academico: {
            id: student.periodo_id,
            nombre: student.periodo_nombre,
            fecha_inicio: student.fecha_inicio,
            fecha_fin: student.fecha_fin
          },
          unidades_didacticas: unidadesDidacticas
        }
      });
    } else {
      res.status(404).send({ message: 'Estudiante no encontrado' });
    }
  } catch (err) {
    console.error('Error en la consulta SQL:', err);
    res.status(500).send({ message: 'Error en el servidor', error: err.message });
  }
});
// Endpoint para obtener QR del estudiante
app.get('/estudiante/:dni/qr_code', async (req, res) => {
  const { dni } = req.params;

  try {
    const query = `
      SELECT qr_code_path
      FROM qr_codes
      WHERE dni_estudiante = @dni
    `;
    const request = new sql.Request();
    request.input('dni', sql.NVarChar, dni);
    const result = await request.query(query);

    if (result.recordset.length > 0) {
      const qrCodePath = result.recordset[0].qr_code_path;
      if (qrCodePath) {
        const qrCodeUrl = `${NGROK_URL}/pagina1/hola/qr_codes/${path.basename(qrCodePath)}`;
        res.send({ qr_code_url: qrCodeUrl });
      } else {
        res.status(404).send({ message: 'Código QR no encontrado' });
      }
    } else {
      res.status(404).send({ message: 'Estudiante no encontrado' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: 'Error en el servidor', error: err });
  }
});

// Iniciar servidor
const port = 3000;
app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});